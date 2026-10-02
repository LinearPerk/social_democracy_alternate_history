'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const DefenseEntry = require('../../out/html/depth-column/defense-entry.js');
const Model = require('../../out/html/state-column/model.js');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8')
  );
}

const start1928 = loadFixture('start1928');
const crisis1930 = loadFixture('crisis1930');
const crisis1930_prev = loadFixture('crisis1930_prev');
const gov1932 = loadFixture('gov1932');

const entry = (id, q, ctx) => DefenseEntry.renderEntry('defense:' + id, q, ctx || { base: q, symbols: 'badges' });

test('an unknown kind or id renders nothing', () => {
  assert.equal(DefenseEntry.renderEntry('nope:sa', crisis1930), null);
  assert.equal(DefenseEntry.renderEntry('defense:nobody', crisis1930), null);
  assert.equal(DefenseEntry.renderEntry('malformed', crisis1930), null);
});

test('the heading is the name, with the German full name under it', () => {
  const html = entry('sa', crisis1930);
  assert.match(html, /<h2 class="dc-ename">SA<\/h2><div class="dc-ede">Sturmabteilung<\/div>/);
  assert.match(entry('sh', crisis1930), /Der Stahlhelm, Bund der Frontsoldaten/);
  // The Reichswehr's German name is its own; no line repeats it.
  assert.doesNotMatch(entry('reichswehr', crisis1930), /dc-ede/);
});

test('the symbol is 48px art in period mode and a plain square otherwise', () => {
  const period = entry('sa', crisis1930, { symbols: 'period' });
  assert.match(period, /<span class="dc-esym sym" data-fallback="[^"]*"><img src="state-column\/symbols\/SA-Logo\.svg"/);
  const badges = entry('sa', crisis1930, { symbols: 'badges' });
  assert.match(badges, /<span class="dc-esym" style="background:#964B00"><\/span>/);
  assert.doesNotMatch(badges, /<img/);
});

// ---- paramilitaries --------------------------------------------------------

test('a paramilitary entry shows the balance strip, its share in words, and militancy; no loyalty axis', () => {
  const html = entry('sa', crisis1930);
  assert.match(html, /Balance of the street/);
  assert.match(html, /<div class="dc-sub">Militancy<\/div>/);
  assert.doesNotMatch(html, /Loyalty|dc-axis/);
  // crisis1930 strengths 2200 / 150 / 500 / 100: SA is 100 of 2950.
  assert.match(html, /<strong>3%<\/strong> of the four groups' combined strength/);
});

test('the balance strip holds all four groups, this one highlighted, summing to 100%', () => {
  const html = entry('sh', crisis1930);
  const strip = html.match(/<div class="dc-stack">(.*?)<\/div>/s)[1];
  const widths = [...strip.matchAll(/width:([\d.]+)%/g)].map((m) => parseFloat(m[1]));
  assert.equal(widths.length, 4);
  assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.1);
  assert.equal((strip.match(/class="dim"/g) || []).length, 3);
  assert.match(html, /<span class="here"><i style="background:#3F7BC1"><\/i>Stahlhelm<\/span>/);
});

test('militancy is five steps lit by band, in the band colour, with its word', () => {
  const steps = (q, id) => {
    const html = entry(id, q);
    const lit = (html.match(/<i class="on"/g) || []).length;
    const total = (html.match(/<span class="dc-steps">(.*?)<\/span>/s)[1].match(/<i/g) || []).length;
    return { html, lit, total };
  };
  // Same rule the old pips used: ceil(bandIndex * 5 / 6).
  const sa = steps(crisis1930, 'sa'); // 0.9, "High", index 5
  assert.equal(sa.total, 5);
  assert.equal(sa.lit, 5);
  assert.match(sa.html, /dc-meter-word" style="color:var\(--sc-dis-high\)">high/);
  const rb = steps(start1928, 'rb'); // 0.01, "Nonexistent", index 0
  assert.equal(rb.lit, 0);
  assert.match(rb.html, />nonexistent</);
  const mid = steps(Object.assign({}, crisis1930, { sa_militancy: 0.5 }), 'sa'); // "Medium", index 4
  assert.equal(mid.lit, 4);
});

test('militancy carries the change arrow when it moved this month', () => {
  const q = Object.assign({}, crisis1930, { sa_militancy: 0.95 });
  const moved = DefenseEntry.renderEntry('defense:sa', q, { base: crisis1930, symbols: 'badges' });
  assert.match(moved, /dc-meter-word[^>]*>high<span class="sc-delta bad/);
  const still = DefenseEntry.renderEntry('defense:sa', crisis1930, { base: crisis1930, symbols: 'badges' });
  assert.doesNotMatch(still, /sc-delta/);
});

test('a missing baseline draws no arrows and does not throw', () => {
  assert.doesNotThrow(() => DefenseEntry.renderEntry('defense:sa', crisis1930, { symbols: 'badges' }));
  assert.doesNotMatch(DefenseEntry.renderEntry('defense:sa', crisis1930, {}), /sc-delta/);
});

// ---- state forces ----------------------------------------------------------

test('a state-force entry shows the loyalty axis with marker and word; no street strip or militancy', () => {
  const html = entry('reichswehr', crisis1930);
  assert.match(html, /<div class="dc-sub">Loyalty<\/div>/);
  assert.match(html, /<div class="dc-axis"><span>disloyal<\/span><span>divided<\/span><span>loyal<\/span><\/div>/);
  assert.doesNotMatch(html, /Balance of the street|Militancy|dc-stack/);
  // 0.24: marker at 24%, red fill from there up to the 47.5% centre.
  assert.match(html, /<i class="mark" style="left:24%">/);
  assert.match(html, /class="fill dis" style="left:24%;width:23\.5%"/);
  assert.match(html, /dc-meter-word" style="color:var\(--sc-dis-high\)">generally disloyal/);
});

test('the loyalty fill turns green above the centre', () => {
  const html = entry('prussian_police', crisis1930); // 0.6
  assert.match(html, /class="fill loy" style="left:47\.5%;width:12\.5/);
  assert.match(html, />mostly loyal</);
});

test('the interior police entry exists only while the SPD is in government', () => {
  assert.equal(entry('interior_police', crisis1930), null);
  assert.match(entry('interior_police', gov1932), /Reich police/);
});

// ---- library text and links ------------------------------------------------

test('library text appears under its heading only when the game has some', () => {
  const asked = [];
  const ctx = {
    symbols: 'badges',
    library: (marker) => { asked.push(marker); return marker === 'Sturmabteilung' ? '<p>Nazi group.</p>' : ''; }
  };
  const sa = DefenseEntry.renderEntry('defense:sa', crisis1930, ctx);
  assert.match(sa, /<div class="dc-sub">From the game's library<\/div><div class="dc-library"><p>Nazi group\.<\/p><\/div>/);
  const rb = DefenseEntry.renderEntry('defense:rb', crisis1930, ctx);
  assert.doesNotMatch(rb, /library/);
  // The interior police have no Library text, so the game is not even asked.
  DefenseEntry.renderEntry('defense:interior_police', gov1932, ctx);
  assert.deepEqual(asked, ['Sturmabteilung', 'Reichsbanner']);
});

// The engine gives a bold lead-in's text as an array of strings (game.json has a plain string).
const para = (lead, text, asArray = true) => ({
  type: 'paragraph',
  content: [{ type: 'emphasis-2', content: asArray ? [lead] : lead }, text]
});
const plain = (text) => ({ type: 'paragraph', content: [text] });

test('libraryBlock takes a group\'s paragraphs up to the next bold lead-in', () => {
  const nodes = [
    para('Paramilitary groups:', ''),
    para('Reichsbanner Schwarz-Rot-Gold', ': About the Reichsbanner.'),
    plain('Strength: 2000 thousand'),
    plain('Militarization: Low'),
    para('Sturmabteilung (SA)', ': The Nazi group.'),
    plain('Strength: 100 thousand'),
    plain('Militarization: High'),
    para('Official military/paramilitary groups:', ''),
    para('Reichswehr', ': 100 thousand troops.', false),
    plain('Loyalty: divided')
  ];
  const texts = (marker) => DefenseEntry.libraryBlock(nodes, marker).map((n) => n.content[n.content.length - 1]);
  assert.deepEqual(texts('Reichsbanner'), [': About the Reichsbanner.', 'Strength: 2000 thousand']);
  assert.deepEqual(texts('Sturmabteilung'), [': The Nazi group.', 'Strength: 100 thousand']);
  assert.deepEqual(texts('Reichswehr'), [': 100 thousand troops.']);
  assert.deepEqual(texts('Nobody'), []);
});

test('roundThousands rounds long decimals and leaves whole numbers alone', () => {
  assert.equal(DefenseEntry.roundThousands('<p>Strength: 91.2999999 thousand</p>'), '<p>Strength: 91 thousand</p>');
  assert.equal(DefenseEntry.roundThousands('<p>100 thousand troops.</p>'), '<p>100 thousand troops.</p>');
});

test('every organisation with a link has both, as new-tab links; the others have neither', () => {
  Model.DEFENSE_ORGS.forEach((org) => {
    const html = DefenseEntry.renderEntry('defense:' + org.id, gov1932, { symbols: 'badges' });
    assert.ok(html, org.id);
    if (org.wiki_en || org.wiki_de) {
      assert.ok(org.wiki_en && org.wiki_de, org.id + ': both or neither');
      assert.ok(html.includes('<a href="' + org.wiki_en + '" target="_blank" rel="noopener">Wikipedia</a>'), org.id);
      assert.ok(html.includes('<a href="' + org.wiki_de + '" target="_blank" rel="noopener">Deutsch</a>'), org.id);
    } else {
      assert.doesNotMatch(html, /<a href/, org.id);
    }
  });
  assert.doesNotMatch(entry('interior_police', gov1932), /<a href/);
});
