'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const Readouts = require('../../out/html/depth-column/readouts.js');

const start1928 = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'start1928.json'), 'utf8')
);
const q = Object.assign({}, start1928, { historical_mode: 1, year: 1928, month: 1 });

function entry(year, month, headline, summary, extra) {
  return Object.assign(
    { year, month, headline, summary, link_en: null, link_de: null },
    extra
  );
}

test('shows the masthead and a "<Month> <Year>" dateline', () => {
  const html = Readouts.renderTimes(q, []);
  assert.match(html, /<div class="dc-times-mast">Die Zeit<\/div>/);
  assert.match(html, /<div class="dc-times-dateline">January 1928<\/div>/);
});

test('shows only entries for the current year and month, never later ones', () => {
  const times = [
    entry(1928, 1, 'January headline', 'January summary'),
    entry(1928, 2, 'February headline', 'February summary'),
    entry(1929, 1, 'Next year headline', 'Next year summary')
  ];
  const html = Readouts.renderTimes(q, times);
  assert.match(html, /<div class="dc-times-headline">January headline<\/div>/);
  assert.match(html, /<p class="dc-times-summary">January summary<\/p>/);
  assert.doesNotMatch(html, /February headline/);
  assert.doesNotMatch(html, /Next year headline/);
  assert.doesNotMatch(html, /dc-times-none/);
});

test('a month with no entries shows the masthead and one muted line', () => {
  const html = Readouts.renderTimes(q, [entry(1928, 2, 'February headline', 'x')]);
  assert.match(html, /Die Zeit/);
  assert.match(html, /<p class="dc-times-none">No dated news this month\.<\/p>/);
  assert.doesNotMatch(html, /dc-times-entry/);
});

test('links open in a new tab; a null link is left out', () => {
  const times = [
    entry(1928, 1, 'Both', 'Has both', {
      link_en: 'https://en.wikipedia.org/wiki/Test',
      link_de: 'https://de.wikipedia.org/wiki/Test'
    }),
    entry(1928, 1, 'One', 'Has one', { link_en: 'https://en.wikipedia.org/wiki/Only' })
  ];
  const html = Readouts.renderTimes(q, times);
  assert.match(html, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Test" target="_blank" rel="noopener">Wikipedia<\/a>/);
  assert.match(html, /<a href="https:\/\/de\.wikipedia\.org\/wiki\/Test" target="_blank" rel="noopener">Deutsch<\/a>/);
  assert.equal((html.match(/>Deutsch</g) || []).length, 1);
  assert.equal((html.match(/dc-times-links/g) || []).length, 2);
});

test('escapes headline, summary, and link href', () => {
  const times = [
    entry(1928, 1, 'A & B <script>', 'C & D', { link_en: 'https://en.wikipedia.org/wiki/A"B' })
  ];
  const html = Readouts.renderTimes(q, times);
  assert.match(html, /A &amp; B &lt;script>/);
  assert.match(html, /C &amp; D/);
  assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/A&quot;B"/);
});

test('the shipped data file has entries for January 1928', () => {
  const times = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../out/html/state-column/the-times.json'), 'utf8')
  );
  assert.match(Readouts.renderTimes(q, times), /dc-times-entry/);
});
