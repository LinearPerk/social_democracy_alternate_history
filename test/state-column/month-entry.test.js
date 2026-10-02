'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const Readouts = require('../../out/html/depth-column/readouts.js');

function entry(year, month, headline, summary, extra) {
  return Object.assign(
    { year, month, headline, summary, link_en: null, link_de: null },
    extra
  );
}

const times = [
  entry(1930, 3, 'March headline', 'March summary', { link_en: 'https://en.wikipedia.org/wiki/March' }),
  entry(1930, 4, 'April headline', 'April summary'),
  entry(1930, 4, 'Second April headline', 'Second April summary'),
  entry(1931, 4, 'Later April headline', 'Later April summary')
];

test('the key is the year and the unpadded month', () => {
  assert.equal(Readouts.monthKey(1930, 4), 'month:1930-4');
  assert.equal(Readouts.monthKey('1928', '12'), 'month:1928-12');
});

test('the title is the month and year, from the key\'s id', () => {
  assert.equal(Readouts.monthTitle('1930-4'), 'April 1930');
  assert.equal(Readouts.monthTitle('1933-1'), 'January 1933');
  assert.equal(Readouts.monthTitle('nonsense'), '');
});

test('shows that month\'s records, in the file\'s order, and no other month\'s', () => {
  const html = Readouts.renderMonth('1930-4', true, times);
  assert.match(html, /<div class="dc-times-headline">April headline<\/div>/);
  assert.match(html, /<p class="dc-times-summary">April summary<\/p>/);
  assert.ok(html.indexOf('April headline') < html.indexOf('Second April headline'));
  assert.equal((html.match(/dc-times-entry/g) || []).length, 2);
  assert.doesNotMatch(html, /March headline/);
  assert.doesNotMatch(html, /Later April headline/);
  assert.doesNotMatch(html, /dc-times-none/);
});

test('uses the Die Zeit markup and its links', () => {
  const html = Readouts.renderMonth('1930-3', true, times);
  assert.match(html, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/March" target="_blank" rel="noopener">Wikipedia<\/a>/);
  assert.doesNotMatch(html, /Deutsch/);
});

test('a month with no records shows the lead and one line saying so', () => {
  const html = Readouts.renderMonth('1930-5', true, times);
  assert.match(html, /<p class="dc-lead">The month's news<\/p>/);
  assert.match(html, /<p class="dc-times-none">No dated news this month\.<\/p>/);
  assert.doesNotMatch(html, /dc-times-entry/);
});

test('the lead in historical mode is "The month\'s news"', () => {
  const html = Readouts.renderMonth('1930-4', true, times);
  assert.match(html, /<p class="dc-lead">The month's news<\/p>/);
  assert.doesNotMatch(html, /historically/);
});

test('the lead in normal mode says it is the real timeline', () => {
  const html = Readouts.renderMonth('1930-4', false, times);
  assert.match(html, /<p class="dc-lead">What happened in this month, historically<\/p>/);
  assert.doesNotMatch(html, /The month's news/);
});

test('an id that is not a month draws nothing, so the column steps back', () => {
  assert.equal(Readouts.renderMonth('nonsense', true, times), null);
  assert.equal(Readouts.renderMonth('1930-13', true, times), null);
  assert.equal(Readouts.renderMonth('1930-0', true, times), null);
});

test('text in a record is escaped', () => {
  const html = Readouts.renderMonth('1930-4', true, [entry(1930, 4, 'A <b> & B', 'x < y')]);
  assert.match(html, /A &lt;b> &amp; B/);
  assert.match(html, /x &lt; y/);
});

// The browser glue, against a stub column: the entry registers under "month",
// and follows the date to a new month in place.
function stubColumn(view, qualities) {
  const registered = {};
  const handlers = {};
  const calls = { replace: [], show: [] };
  const column = {
    register() {},
    registerEntryKind(prefix, render, title) { registered[prefix] = { render, title }; },
    on(name, fn) { handlers[name] = fn; },
    ui() { return { dendryEngine: { state: { qualities } } }; },
    view() { return view; },
    show(v) { calls.show.push(v); },
    replace(v) { calls.replace.push(v); }
  };
  return { column, registered, handlers, calls };
}

function install(view, qualities, data) {
  const stub = stubColumn(view, qualities);
  const win = { fetch: () => Promise.resolve({ json: () => Promise.resolve(data) }) };
  Readouts.install(win, stub.column);
  return stub;
}

test('the month kind renders once the file has loaded, and titles itself', async () => {
  const q = { started: 1, year: 1930, month: 4, historical_mode: 0 };
  const { registered } = install({ kind: 'entry', key: 'month:1930-4' }, q, times);
  const kind = registered.month;
  assert.equal(kind.title('1930-4'), 'April 1930');
  assert.equal(kind.render('1930-4'), '');
  await new Promise((r) => setTimeout(r, 0));
  assert.match(kind.render('1930-4'), /What happened in this month, historically/);
  assert.equal(kind.render('bad'), null);
});

test('a loaded file redraws an open month entry without a history step', async () => {
  const q = { started: 1, year: 1930, month: 4 };
  const view = { kind: 'entry', key: 'month:1930-4' };
  const { registered, calls } = install(view, q, times);
  registered.month.render('1930-4');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls.show, [view]);
});

test('a new month moves the open month entry to it in place', () => {
  const q = { started: 1, year: 1930, month: 5 };
  const { handlers, calls } = install({ kind: 'entry', key: 'month:1930-4' }, q, times);
  handlers.content();
  assert.deepEqual(calls.replace, [{ kind: 'entry', key: 'month:1930-5', title: 'May 1930' }]);
});

test('the entry stays put when the month is the same, or another view is open', () => {
  const q = { started: 1, year: 1930, month: 4 };
  let stub = install({ kind: 'entry', key: 'month:1930-4' }, q, times);
  stub.handlers.content();
  assert.equal(stub.calls.replace.length, 0);
  stub = install({ kind: 'entry', key: 'reichstag:seats' }, q, times);
  stub.handlers.content();
  assert.equal(stub.calls.replace.length, 0);
  stub = install({ kind: 'polls', key: null }, q, times);
  stub.handlers.content();
  assert.equal(stub.calls.replace.length, 0);
});
