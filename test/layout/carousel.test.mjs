'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { plain, record, shorten } from '../tools/build-credits.mjs';

// The carousel's slide lists (out/html/layout/carousel.js) are built from
// credits.json and the game's scenes; these tests run them on the shipped
// credits and on small fake scenes. The panels themselves (timers, keys,
// removal when the game starts) are in checks/carousel.mjs.

const here = dirname(fileURLToPath(import.meta.url));
const Carousel = createRequire(import.meta.url)('../../out/html/layout/carousel.js');
const credits = JSON.parse(readFileSync(join(here, '../../out/html/layout/credits.json'), 'utf8'));

function assertSlide(slide) {
  assert.match(slide.file, /^img\/.+\.(jpg|png)$/, 'a file');
  assert.ok(slide.caption && slide.caption.trim(), `${slide.file}: a caption`);
  assert.ok(slide.credit.label, `${slide.file}: a source name`);
  assert.match(slide.credit.href, /^https:\/\//, `${slide.file}: a source page`);
  assert.ok(slide.credit.text, `${slide.file}: a credit line`);
}

test('landscape slides: each has a file, a caption and a credit', () => {
  const slides = Carousel.landscapeSlides(credits);
  assert.ok(slides.length >= 8, `${slides.length} slides`);
  slides.forEach(assertSlide);
  for (const slide of slides) {
    assert.ok(!slide.file.startsWith('img/portraits/'), slide.file);
    const r = credits[slide.file];
    assert.ok(r.width > r.height, `${slide.file} is landscape`);
  }
});

test('landscape slides leave out tall images and untitled ones', () => {
  const src = 'https://commons.wikimedia.org/wiki/File:A.jpg';
  const few = {
    'img/a.jpg': { title: 'A', artist: 'X', license: 'CC0', source: src, width: 800, height: 500 },
    'img/tall.jpg': { title: 'T', artist: 'X', license: 'CC0', source: src, width: 500, height: 800 },
    'img/untitled.jpg': { title: '', artist: 'X', license: 'CC0', source: src, width: 800, height: 500 },
  };
  assert.deepEqual(Carousel.landscapeSlides(few).map((s) => s.file), ['img/a.jpg']);
});

test("slides carry their pictures' shapes, which the frames are sized from", () => {
  const people = Object.keys(credits).filter((f) => f.startsWith('img/portraits/')).map((file) => ({ file, name: 'N', faction: '' }));
  for (const slide of [...Carousel.landscapeSlides(credits), ...Carousel.portraitSlides(credits, people)]) {
    const r = credits[slide.file];
    assert.ok(Math.abs(slide.ratio - r.width / r.height) < 1e-9, slide.file);
  }
});

test("the title page's own picture is a titled landscape with a credit row", () => {
  const file = Carousel.titlePicture;
  const r = credits[file];
  assert.ok(r && r.source && r.title && r.width > r.height, file);
});

const scenes = {
  baade: { title: 'Fritz Baade', tags: ['advisor', 'reformist'], cardImage: 'img/portraits/BaadeFritz.jpg' },
  'shuffle_leadership.add_baade': { title: ['x'], tags: ['nonfactional_advisor'] },
  hilferding: { title: 'Rudolf Hilferding', tags: ['advisor', 'centrist'], cardImage: 'img/portraits/HilferdingRudolf.jpg' },
  'shuffle_leadership.add_hilferding': { title: ['x'], tags: ['center_advisor'] },
  nocredit: { title: 'No Source', tags: ['advisor'], cardImage: 'img/portraits/NoSource.jpg' },
  cabinet: { title: 'Cabinet', tags: ['advisor'], cardImage: 'img/muller_cabinet.jpg' },
  judiciary: { title: 'Judiciary Reform', tags: ['govt_affairs', 'cabinet'], cardImage: 'img/portraits/Judge.jpg' },
};

test('people come from the advisor scenes, with the recruit menu faction', () => {
  assert.deepEqual(Carousel.peopleFromScenes(scenes), [
    { file: 'img/portraits/BaadeFritz.jpg', name: 'Fritz Baade', faction: 'Non-factional' },
    { file: 'img/portraits/HilferdingRudolf.jpg', name: 'Rudolf Hilferding', faction: 'Center' },
    { file: 'img/portraits/NoSource.jpg', name: 'No Source', faction: '' },
  ]);
});

test('portrait slides: name, faction and credit; a portrait with no source row is left out', () => {
  const slides = Carousel.portraitSlides(credits, Carousel.peopleFromScenes(scenes));
  assert.deepEqual(slides.map((s) => s.caption), ['Fritz Baade', 'Rudolf Hilferding']);
  assert.deepEqual(slides.map((s) => s.note), ['Non-factional', 'Center']);
  slides.forEach(assertSlide);
});

test('every portrait in the credits makes a slide when a scene names it', () => {
  const people = Object.keys(credits)
    .filter((file) => file.startsWith('img/portraits/'))
    .map((file) => ({ file, name: file, faction: '' }));
  const slides = Carousel.portraitSlides(credits, people);
  assert.equal(slides.length, people.length);
  slides.forEach(assertSlide);
});

test('credit line: a landscape credit leaves the title to the caption', () => {
  const r = { title: 'T', artist: 'A', license: 'L', source: 'https://commons.wikimedia.org/wiki/File:T.jpg' };
  assert.deepEqual(Carousel.creditLine(r, false), {
    text: 'A \u00b7 L', lead: 'A', license: 'L', licenseUrl: '', href: r.source, label: 'Wikimedia Commons',
  });
  assert.equal(Carousel.creditLine(r, true).text, 'T \u00b7 A \u00b7 L');
  assert.equal(Carousel.creditLine(r, true).lead, 'T \u00b7 A');
  assert.equal(Carousel.creditLine({ title: '', artist: '', license: 'L', source: r.source }, true).text, 'L');
});

// A stand-in for the page's document, enough to draw a credit and read it back.
function fakeDocument() {
  const make = (tag) => ({
    tag, children: [], text: '',
    appendChild(child) { this.children.push(child); return child; },
    set textContent(value) { this.text = value; if (value === '') this.children = []; },
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); },
  });
  return { createElement: make, createTextNode: (text) => ({ tag: '#text', textContent: text }) };
}

test('paintCredit: the licence links to its text when the record has a URL', () => {
  const document = fakeDocument();
  const node = document.createElement('div');
  const base = { title: 'T', artist: 'A', license: 'CC BY 3.0', source: 'https://commons.wikimedia.org/wiki/File:T.jpg' };
  Carousel.paintCredit(document, node, Carousel.creditLine({ ...base, licenseUrl: 'https://creativecommons.org/licenses/by/3.0' }, false));
  const links = node.children.filter((c) => c.tag === 'a');
  assert.deepEqual(links.map((a) => [a.textContent, a.href]), [
    ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0'],
    ['Wikimedia Commons', base.source],
  ]);
  for (const a of links) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }
  assert.equal(node.textContent, 'A · CC BY 3.0 · Wikimedia Commons');
});

test('paintCredit: a licence with no URL stays plain text', () => {
  const document = fakeDocument();
  const node = document.createElement('div');
  Carousel.paintCredit(document, node, Carousel.creditLine({ title: '', artist: 'A', license: 'Public domain', source: 'https://de.wikipedia.org/wiki/Datei:X.jpg' }, false));
  assert.deepEqual(node.children.filter((c) => c.tag === 'a').map((a) => a.textContent), ['Wikipedia']);
  assert.equal(node.textContent, 'A · Public domain · Wikipedia');
});

test('source names', () => {
  assert.equal(Carousel.sourceName('https://de.wikipedia.org/wiki/Datei:X.jpg'), 'Wikipedia');
  assert.equal(Carousel.sourceName('https://www.flickr.com/photos/a/1/'), 'Flickr');
  assert.equal(Carousel.sourceName('https://library.fes.de/arbeit/x.html'), 'Friedrich-Ebert-Stiftung');
  assert.equal(Carousel.sourceName('https://example.org/x'), 'example.org');
  assert.equal(Carousel.sourceName('nonsense'), 'Source');
});

test('credits.json holds only titles, artists, licences, source pages and sizes', () => {
  for (const [file, r] of Object.entries(credits)) {
    const keys = Object.keys(r).filter((k) => k !== 'licenseUrl').sort();
    assert.deepEqual(keys, ['artist', 'height', 'license', 'source', 'title', 'width'], file);
    if ('licenseUrl' in r) assert.match(r.licenseUrl, /^https?:\/\/creativecommons\.org\//, `${file}: a licence URL`);
    assert.match(r.source, /^https:\/\//, file);
    assert.ok(r.license, `${file}: a licence`);
    for (const text of [r.title, r.artist, r.license]) {
      assert.ok(!/[<>]|&[a-z#0-9]+;/i.test(text), `${file}: HTML left in "${text}"`);
    }
  }
  // Nothing from the machine that built it: no drive or file paths, no
  // hidden folders.
  assert.ok(!/[a-z]:\\|file:\/\/|\/\.[a-z]/i.test(JSON.stringify(credits)));
});

test('build-credits: plain() strips Commons HTML', () => {
  assert.equal(plain('<div class="fn value">\nAnonymous</div>'), 'Anonymous');
  assert.equal(
    plain('Unknown author<span style="display: none;">Unknown author</span>'),
    'Unknown author'
  );
  assert.equal(
    plain('<div class="fn"><b>Berlin, Reichstag</b> <abbr title="x"><span><img src="a.png"></span></abbr></div>'),
    'Berlin, Reichstag'
  );
  assert.equal(plain('A &amp; B &#39;c&#39; &quot;d&quot; &#x41;<br>line'), 'A & B \'c\' "d" A line');
  assert.equal(plain(undefined), '');
});

test('build-credits: record() drops a title that only repeats the file name', () => {
  const meta = {
    ObjectName: { value: 'BaadeFritz' },
    Artist: { value: '<a href="x">unbekannt</a>' },
    LicenseShortName: { value: 'PD-\u00a7-134' },
  };
  const row = { path: 'originals/image/BaadeFritz.jpg', source_page: 'https://de.wikipedia.org/wiki/Datei:BaadeFritz.jpg' };
  assert.deepEqual(record(row, meta, 'BaadeFritz.jpg'), {
    title: '', artist: 'Unknown author', license: 'Public domain', source: row.source_page,
  });
  const named = { ...meta, ObjectName: { value: 'Berlin, Blutmai' } };
  assert.equal(record({ ...row, path: 'originals/image/Berlin,_Blutmai.jpg' }, named, 'x.jpg').title, 'Berlin, Blutmai');
});

// A record as the generator reads it: the table row and the Commons fields.
const bundesarchiv = (artist) => ({
  row: {
    path: 'originals/image/Bundesarchiv_Bild_102-13744,_Berlin,_Reichstag,_Verfassungsfeier.jpg',
    source_page: 'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_102-13744,_Berlin,_Reichstag,_Verfassungsfeier.jpg',
  },
  meta: {
    ObjectName: { value: 'Berlin, Reichstag, Verfassungsfeier' },
    Artist: { value: artist },
    Credit: { value: 'This image was provided to Wikimedia Commons by the German Federal Archive' },
    LicenseShortName: { value: 'CC BY-SA 3.0 de' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/3.0/de/deed.en' },
  },
});

test('build-credits: a title drops the archive prefix that the credit line carries', () => {
  const titled = (title, page) => {
    const one = bundesarchiv('Willi Ruge');
    if (page) one.row.source_page = page;
    one.meta.ObjectName = { value: title };
    return record(one.row, one.meta, 'x.jpg').title;
  };
  assert.equal(titled('Bundesarchiv Bild 183-R99203, Berlin, Wahlplakat'), 'Berlin, Wahlplakat');
  assert.equal(
    titled('Bundesarchiv B 145 Bild-P046278, Berlin, Blutmai',
      'https://commons.wikimedia.org/wiki/File:Bundesarchiv_B_145_Bild-P046278,_Berlin,_Blutmai.jpg'),
    'Berlin, Blutmai');
  assert.equal(titled('Berlin, Blutmai'), 'Berlin, Blutmai');
  // Only an archive credit drops it.
  const other = record({ path: 'o/x.jpg', source_page: 'https://commons.wikimedia.org/wiki/File:X.jpg' },
    { ObjectName: { value: 'Bundesarchiv Bild 183-R99203, Berlin' } }, 'x.jpg');
  assert.equal(other.title, 'Bundesarchiv Bild 183-R99203, Berlin');
});

test('build-credits: a Bundesarchiv picture is credited by archive and number', () => {
  const known = bundesarchiv('<a href="x">Georg Pahl</a>');
  assert.equal(record(known.row, known.meta, 'x.jpg').artist, 'Bundesarchiv, Bild 102-13744 / Georg Pahl');
  for (const unknown of ['Unknown author', 'unbekannt', 'Unknown', '']) {
    const one = bundesarchiv(unknown);
    assert.equal(record(one.row, one.meta, 'x.jpg').artist, 'Bundesarchiv, Bild 102-13744', `"${unknown}"`);
  }
  const press = bundesarchiv('Willi Ruge');
  press.row.source_page = 'https://commons.wikimedia.org/wiki/File:Bundesarchiv_B_145_Bild-P046278,_Berlin,_Blutmai.jpg';
  assert.equal(record(press.row, press.meta, 'x.jpg').artist, 'Bundesarchiv, B 145 Bild-P046278 / Willi Ruge');
});

test('build-credits: unknown is spelled one way', () => {
  const row = { path: 'originals/image/A.jpg', source_page: 'https://commons.wikimedia.org/wiki/File:A.jpg' };
  for (const said of ['unknown', 'Unknown', 'unbekannt', 'Unknown author']) {
    assert.equal(record(row, { Artist: { value: said } }, 'a.jpg').artist, 'Unknown author', said);
  }
});

test("build-credits: Levi's credit is the collection, not 'unknown'", () => {
  const row = { path: 'originals/image/Paul_Levi_-_Schwadron.jpg', source_page: 'https://commons.wikimedia.org/wiki/File:Paul_Levi_-_Schwadron.jpg' };
  const meta = {
    ObjectName: { value: 'Paul Levi - Schwadron' },
    Artist: { value: 'unknown' },
    Credit: { value: 'National Library of Israel, Schwadron collection' },
    LicenseShortName: { value: 'CC BY 3.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' },
  };
  const made = record(row, meta, 'LeviPaul.jpg');
  assert.equal(made.artist, 'National Library of Israel, Schwadron collection');
  assert.equal(made.licenseUrl, 'https://creativecommons.org/licenses/by/3.0');
});

test('build-credits: a foundation file is credited by the signature it requires', () => {
  const row = { path: 'originals/image/KAS-Wiederaufbau-Bild-35026-1.jpg', source_page: 'https://commons.wikimedia.org/wiki/File:KAS-Wiederaufbau-Bild-35026-1.jpg' };
  const meta = {
    Artist: { value: 'CDU' },
    ImageDescription: { value: 'Helft aufbauen!<br><b>Lizenz</b>:<br>KAS/ACDP 10-043 : 20 CC-BY-SA 3.0 DE' },
    LicenseShortName: { value: 'CC BY-SA 3.0 de' },
  };
  assert.equal(record(row, meta, 'weimar_coalition_2.jpg').artist, 'KAS/ACDP 10-043 : 20');
});

test('build-credits: the Fusslkopp credit and the two title slips', () => {
  const row = { path: 'originals/image/x.svg', source_page: 'https://commons.wikimedia.org/wiki/File:x.svg' };
  const meta = { ObjectName: { value: 'Rudolf Wissel' }, Artist: { value: 'Fusslkopp SVG-version made by Warddr (talk)' } };
  assert.equal(record(row, meta, 'iron_front.png').artist, 'Fusslkopp (SVG version: Warddr)');
  assert.equal(record(row, {}, 'LeipartTheodor.jpg').artist, 'Archiv der sozialen Demokratie (AdsD)');
  assert.equal(record(row, meta, 'WissellRudolf.jpg').title, 'Rudolf Wissell');
  assert.equal(record(row, { ObjectName: { value: 'Vorwaerts nr 1' } }, 'Vorwaerts_nr_1.png').title, 'Vorwärts Nr. 1');
  assert.equal(record(row, { ObjectName: { value: 'Other slip' } }, 'other.png').title, 'Other slip');
});

test('build-credits: licence names a player can read', () => {
  const row = { path: 'originals/image/A.jpg', source_page: 'https://de.wikipedia.org/wiki/Datei:A.jpg' };
  for (const raw of ['PD-§-134', 'Bild-PD-alt', 'Public Domain', 'Public domain']) {
    assert.equal(record(row, { LicenseShortName: { value: raw } }, 'a.jpg').license, 'Public domain', raw);
  }
  assert.equal(record(row, { LicenseShortName: { value: 'CC BY-SA 4.0' } }, 'a.jpg').license, 'CC BY-SA 4.0');
});

test('build-credits: licenseUrl is written only when the source has one', () => {
  const row = { path: 'originals/image/A.jpg', source_page: 'https://de.wikipedia.org/wiki/Datei:A.jpg' };
  assert.ok(!('licenseUrl' in record(row, { LicenseShortName: { value: 'PD-§-134' } }, 'a.jpg')));
  const withUrl = record(row, { LicenseShortName: { value: 'CC BY 3.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' } }, 'a.jpg');
  assert.equal(withUrl.licenseUrl, 'https://creativecommons.org/licenses/by/3.0');
});

test('credits.json: the shipped records carry the fixes', () => {
  assert.equal(credits['img/reichstag_2.jpg'].artist, 'Bundesarchiv, Bild 102-13744');
  assert.equal(credits['img/bankrun.jpg'].artist, 'Bundesarchiv, Bild 102-12023 / Georg Pahl');
  assert.equal(credits['img/portraits/LeviPaul.jpg'].artist, 'National Library of Israel, Schwadron collection');
  assert.equal(credits['img/portraits/BaadeFritz.jpg'].license, 'Public domain');
  assert.equal(credits['img/portraits/WissellRudolf.jpg'].title, 'Rudolf Wissell');
  for (const [file, r] of Object.entries(credits)) {
    assert.ok(!/^unknown$|^unbekannt$/i.test(r.artist) || r.artist === 'Unknown author', `${file}: ${r.artist}`);
    assert.ok(!/^PD-|^Bild-PD|Public Domain/.test(r.license), `${file}: ${r.license}`);
    if (/Bundesarchiv/.test(r.source)) assert.match(r.artist, /^Bundesarchiv, /, file);
  }
});

test('build-credits: shorten() cuts on a word', () => {
  assert.equal(shorten('short', 10), 'short');
  assert.equal(shorten('one two three four', 12), 'one two\u2026');
});
