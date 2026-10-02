// Builds out/html/layout/credits.json: one record per shipped game image
// that has a known source, for the title-page carousel's captions.
//
// Run by hand when the asset set changes:
//
//   node test/tools/build-credits.mjs [assets-dir]
//
// The assets directory holds the files the repo lacks (files/img/...), the
// originals.tsv table (game file to source page) and originals-metadata.json
// (the Commons fields). It defaults to an assets directory beside the
// repository, found by looking up the tree. A game file with no source row
// gets no record, so the carousel leaves it out.
//
// Commons serves its fields as HTML. This strips the tags (and the hidden
// duplicates the templates add), decodes entities and collapses whitespace.
// Only titles, artists, licences (with the licence's URL where the source
// gives one), the source page URL and the image's size are written.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const OUT = join(root, 'out', 'html', 'layout', 'credits.json');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function plain(html) {
  if (typeof html !== 'string') return '';
  let text = html;
  // Hidden duplicates (Commons repeats a name in a display:none span).
  text = text.replace(/<(span|div|abbr)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '');
  // The archive's tooltip icon after a title.
  text = text.replace(/<abbr\b[\s\S]*?<\/abbr>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
  text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : whole;
  });
  return text.replace(/\s+/g, ' ').trim();
}

// Artist fields that Commons fills with prose rather than a name. Keyed by
// the game file; each value is what the caption should say.
const ARTIST_FIXES = {
  'braun.jpg': 'Fritz Gottfried Kirchbach',
  'mann_der_arbeit.jpg': 'Artist not credited (verse by Georg Herwegh)',
  'panzerkreuzer.jpg': 'Heinrich Hoffmann Collection, U.S. National Archives',
  'SchumacherKurt.jpg': 'US Army photographers',
  'iron_front.png': 'Fusslkopp (SVG version: Warddr)',
  // The library's page names no photographer and credits its own archive.
  'LeipartTheodor.jpg': 'Archiv der sozialen Demokratie (AdsD)',
};

// Files whose Credit field names the collection that holds the picture and
// whose Artist field says nothing, so the collection is the credit. Other
// files' Credit fields are prose or URLs and stay out of the line.
const CREDIT_AS_ARTIST = new Set(['LeviPaul.jpg']);

// Source titles with a slip in them, keyed by game file.
const TITLE_FIXES = {
  'WissellRudolf.jpg': 'Rudolf Wissell',
  'Vorwaerts_nr_1.png': 'Vorwärts Nr. 1',
};

// The sources name some licences by their wiki template, which means
// nothing to a player.
const LICENSE_NAMES = {
  'PD-§-134': 'Public domain',
  'Bild-PD-alt': 'Public domain',
  'Public Domain': 'Public domain',
};

// Past this length a credit stops being a line.
const MAX_ARTIST = 90;

export function shorten(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/[\s,;(]+\S*$/, '') + '…';
}

function imageSize(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no size found in ' + file);
}

function field(meta, name) {
  const entry = meta && meta[name];
  return entry && typeof entry.value === 'string' ? plain(entry.value) : '';
}

const UNKNOWN = /^(unknown|unbekannt)( author)?$/i;

// The Bundesarchiv asks to be credited by name and picture number
// ("Bundesarchiv, Bild 102-13744 / photographer"). The number is in the
// file's name on the source page.
function archiveCredit(page) {
  const name = decodeURIComponent(page.split('/').pop()).replace(/^(File|Datei):/, '');
  const found = /^Bundesarchiv_(.+?),/.exec(name);
  return found ? 'Bundesarchiv, ' + found[1].replace(/_/g, ' ') : '';
}

// Konrad-Adenauer-Stiftung files carry the credit they require in the
// description ("KAS/ACDP 10-043 : 20 CC-BY-SA 3.0 DE"); the Artist field
// only says CDU.
function foundationCredit(meta) {
  const found = /KAS\/ACDP [\w-]+ : \d+/.exec(field(meta, 'ImageDescription'));
  return found ? found[0] : '';
}

// "Bundesarchiv Bild 183-R99203, " or "Bundesarchiv B 145 Bild-P046278, ".
const ARCHIVE_TITLE_PREFIX = /^Bundesarchiv (?:B \d+ )?Bild[ -][\w-]+,\s*/;

const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// A one-word title that only repeats the original's file name (BaadeFritz)
// says nothing, so it is dropped and the caption reads from the artist and
// licence. A longer title that matches the file name is still a title.
export function record(row, meta, gameFile) {
  const page = row.source_page || '';
  const stem = row.path.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  let title = field(meta, 'ObjectName');
  if (!/\s/.test(title) && squash(title) === squash(stem)) title = '';
  if (TITLE_FIXES[gameFile]) title = TITLE_FIXES[gameFile];
  let artist = ARTIST_FIXES[gameFile] || field(meta, 'Artist') || plain((meta && meta.artist) || '');
  artist = artist.replace(/^Template:/, '');
  if (UNKNOWN.test(artist)) artist = 'Unknown author';
  const archive = archiveCredit(page);
  const holder = field(meta, 'Credit');
  if (archive) {
    // The credit line carries the archive's name and number, so a title
    // that opens with them says them twice.
    title = title.replace(ARCHIVE_TITLE_PREFIX, '');
    artist = artist === 'Unknown author' || !artist ? archive : archive + ' / ' + artist;
  } else if (artist === 'CDU' && foundationCredit(meta)) {
    artist = foundationCredit(meta);
  } else if (CREDIT_AS_ARTIST.has(gameFile) && holder) {
    artist = holder;
  }
  let license = (field(meta, 'LicenseShortName') || plain((meta && meta.license) || ''))
    .replace(/\s*\(per game credits\)/i, '');
  license = LICENSE_NAMES[license] || license;
  const out = { title, artist: shorten(artist, MAX_ARTIST), license };
  const licenseUrl = field(meta, 'LicenseUrl');
  if (licenseUrl) out.licenseUrl = licenseUrl;
  out.source = page;
  return out;
}

function parseTsv(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const keys = head.split('\t');
  return lines.map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(keys.map((key, i) => [key, cells[i] || '']));
  });
}

// The assets sit in a directory beside the repository; a git worktree may
// sit a level or two below that, so look up the tree.
function findAssets() {
  for (let dir = root, i = 0; i < 4; i += 1, dir = dirname(dir)) {
    const candidate = join(dir, 'assets', 'social_democracy_alternate_history');
    if (existsSync(join(candidate, 'originals.tsv'))) return candidate;
  }
  throw new Error('assets directory not found; pass it as the first argument');
}

function main() {
  const assets = resolve(process.argv[2] || findAssets());
  const rows = parseTsv(readFileSync(join(assets, 'originals.tsv'), 'utf8'));
  const metadata = JSON.parse(readFileSync(join(assets, 'originals-metadata.json'), 'utf8'));
  // The source table is written by hand and sometimes differs from the
  // shipped name in case (Windows doesn't notice; a web server does), so
  // files are matched ignoring case and recorded under their real names.
  const shipped = {};
  for (const dir of ['', 'portraits/']) {
    for (const entry of readdirSync(join(assets, 'files', 'img', dir), { withFileTypes: true })) {
      if (entry.isFile()) shipped[(dir + entry.name).toLowerCase()] = dir + entry.name;
    }
  }

  const out = {};
  for (const row of rows) {
    if (!row.game_files || !row.source_page) continue;
    for (const name of row.game_files.split(',')) {
      const real = shipped[name.toLowerCase()] || shipped['portraits/' + name.toLowerCase()];
      if (!real) continue;
      const [width, height] = imageSize(join(assets, 'files', 'img', real));
      out['img/' + real] = { ...record(row, metadata[row.path], name), width, height };
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`${Object.keys(sorted).length} records -> ${OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
