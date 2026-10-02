'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// The view machine runs here against a small fake DOM: enough to build the
// strip (in the bar over the column) and the body, so history, the cap, stale page depth, the resting-view
// rule, and the entry registry can be exercised without a browser.

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '../../out/html/depth-column', name), 'utf8');
const source = read('depth-column.js');
const entriesSource = read('entries.js');

function fakeElement(tag) {
  const el = {
    tag,
    className: '',
    children: [],
    attrs: {},
    disabled: false,
    innerHTML: '',
    _text: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    hasAttribute(name) { return name in this.attrs; },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) { this.children.push(child); return child; },
    find(predicate, found = []) {
      for (const child of this.children) {
        if (predicate(child)) found.push(child);
        child.find(predicate, found);
      }
      return found;
    }
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text + el.children.map((c) => c.textContent).join(''); },
    set(value) { el._text = value; el.children = []; }
  });
  return el;
}

// options.historical sets the game's mode; options.started shows the sidebar.
function load(options = {}) {
  const qualities = { historical_mode: options.historical ? 1 : 0, started: options.started ? 1 : 0 };
  const column = fakeElement('div');
  // The bar the module puts over the column, as the page's grid would hold it.
  let bar = null;
  column.parentNode = { insertBefore(el, before) { bar = el; assert.equal(before, column); } };
  const events = [];
  const clicks = [];
  const window = {};
  const document = {
    getElementById: (id) => (id === 'depth_column' ? column : id === 'depth-bar' ? bar : null),
    createElement: fakeElement,
    addEventListener(type, fn) { if (type === 'click') clicks.push(fn); },
    dispatchEvent(event) { events.push(event.type); }
  };
  vm.runInNewContext(source, {
    window, document, console,
    CustomEvent: class { constructor(type) { this.type = type; } }
  });
  const dc = window.DepthColumn;
  // The game's ui, as much as install() touches.
  window.dendryModifyUI({ newPage() {}, dendryEngine: { state: { qualities } } });
  return { dc, column, bar, qualities, events, clicks, window, document };
}

const page = (key) => ({ kind: 'page', key, title: 'Page ' + key });
const entry = (key) => ({ kind: 'entry', key, title: 'Entry ' + key });
const library = (key) => ({ kind: 'library', key, title: 'Library ' + key });
const keys = (views) => Array.from(views, (v) => `${v.kind}:${v.key}`);

const buttons = (column) => column.find((el) => el.tag === 'button');
const labels = (column) => buttons(column).map((b) => b.textContent);
const button = (column, label) => buttons(column).find((b) => b.textContent === label);

// ---- History ---------------------------------------------------------------

test('the default view is Polls, with no history', () => {
  const { dc } = load();
  assert.equal(dc.view().kind, 'polls');
  assert.deepEqual(keys(dc.history()), []);
});

test('the default view is Die Zeit in historical mode', () => {
  const { dc } = load({ historical: true });
  dc.home();
  assert.equal(dc.view().kind, 'times');
});

test('show pushes the current view onto the history', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show(entry('b'));
  assert.equal(dc.view().key, 'b');
  assert.deepEqual(keys(dc.history()), ['polls:null', 'entry:a']);
});

test('show of the same view (same kind and key) adds no history', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show(entry('a'));
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('show of the same view still takes the new view object (fresh title)', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show({ kind: 'entry', key: 'a', title: 'Renamed' });
  assert.equal(dc.view().title, 'Renamed');
});

test('back pops the history', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show(entry('b'));
  dc.back();
  assert.equal(dc.view().key, 'a');
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('back with an empty history shows the resting view', () => {
  const { dc } = load();
  dc.back();
  assert.equal(dc.view().kind, 'polls');
  assert.deepEqual(keys(dc.history()), []);
});

test('home shows the resting view and keeps the view it left in the history', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.home();
  assert.equal(dc.view().kind, 'polls');
  assert.deepEqual(keys(dc.history()), ['polls:null', 'entry:a']);
});

test('home on the resting view adds no history', () => {
  const { dc } = load();
  dc.home();
  assert.deepEqual(keys(dc.history()), []);
});

test('a Library section is not the Library home', () => {
  const { dc } = load();
  dc.show(library('library.parties'));
  dc.home();
  assert.equal(dc.view().key, null);
  assert.deepEqual(keys(dc.history()), ['polls:null', 'library:library.parties']);
});

test('the history holds at most 20 views, dropping the oldest', () => {
  const { dc } = load();
  for (let i = 0; i < 30; i++) dc.show(entry(String(i)));
  const history = Array.from(dc.history());
  assert.equal(history.length, 20);
  assert.equal(history[0].key, '9');
  assert.equal(history[19].key, '28');
  assert.equal(dc.view().key, '29');
});

test('a new page drops page views from the history', () => {
  const { dc } = load();
  dc.show(page('p1'));
  dc.show(entry('a'));
  dc.newPage();
  assert.equal(dc.view().key, 'a');
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('a new page moves a column showing page depth back to the previous view', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show(page('p1'));
  dc.newPage();
  assert.equal(dc.view().key, 'a');
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('a new page falls back to the resting view when nothing else is left', () => {
  const { dc } = load();
  dc.show(page('p1'));
  dc.newPage();
  assert.equal(dc.view().kind, 'polls');
  assert.deepEqual(keys(dc.history()), []);
});

test('a new page leaves a non-page view alone', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.newPage();
  assert.equal(dc.view().key, 'a');
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('a new page does not leave the same view twice in a row', () => {
  const { dc } = load();
  dc.show(entry('a'));
  dc.show(page('p1'));
  dc.show(entry('a'));
  dc.newPage();
  assert.equal(dc.view().key, 'a');
  assert.deepEqual(keys(dc.history()), ['polls:null']);
});

test('renderers register by kind, including polls and times', () => {
  const { dc } = load();
  const render = () => 'body';
  for (const kind of ['entry', 'polls', 'times']) {
    dc.register(kind, render);
    assert.equal(dc.renderer(kind), render);
  }
});

test('registering a renderer for an unknown kind throws', () => {
  const { dc } = load();
  assert.throws(() => dc.register('gallery', () => ''), /kind/);
});

// ---- Resting views ---------------------------------------------------------

test('the mode is read when the column draws: a game started as historical rests on Die Zeit', () => {
  const t = load({ started: true });
  t.dc.show(page('p1'));
  t.qualities.historical_mode = 1;
  t.dc.newPage();
  assert.equal(t.dc.view().kind, 'times');
});

test('a pick from the strip clears the history', () => {
  const t = load({ started: true, historical: true });
  t.dc.show(entry('a'));
  t.dc.show(entry('b'));
  t.dc.pick('polls');
  assert.equal(t.dc.view().kind, 'polls');
  assert.deepEqual(keys(t.dc.history()), []);
  t.dc.pick('library');
  assert.equal(t.dc.view().kind, 'library');
  assert.equal(t.dc.view().key, null);
  assert.deepEqual(keys(t.dc.history()), []);
});

test('a picked view survives new pages', () => {
  const t = load({ started: true, historical: true });
  t.dc.pick('polls');
  t.dc.show(page('p1'));
  t.dc.newPage();
  assert.equal(t.dc.view().kind, 'polls');
});

test('Die Zeit gives way to Polls outside historical mode', () => {
  const t = load({ started: true, historical: true });
  t.dc.pick('times');
  t.qualities.historical_mode = 0;
  t.dc.show(entry('a'));
  t.dc.back();
  assert.equal(t.dc.view().kind, 'polls');
});

// ---- The strip -------------------------------------------------------------

test('the strip is Back, Polls, Library in normal mode; Die Zeit joins in historical mode', () => {
  const normal = load({ started: true });
  normal.dc.home();
  assert.deepEqual(labels(normal.bar), ['← Back', 'Polls', 'Library']);
  const historical = load({ started: true, historical: true });
  historical.dc.home();
  assert.deepEqual(labels(historical.bar), ['← Back', 'Polls', 'Die Zeit', 'Library']);
});

test('the current resting view is marked aria-current and disabled; the others are not', () => {
  const t = load({ started: true, historical: true });
  t.dc.home();
  const times = button(t.bar, 'Die Zeit');
  assert.equal(times.getAttribute('aria-current'), 'true');
  assert.equal(times.disabled, true);
  for (const label of ['Polls', 'Library']) {
    assert.equal(button(t.bar, label).getAttribute('aria-current'), null, label);
    assert.equal(button(t.bar, label).disabled, false, label);
  }
});

test('Back is disabled with no history and enabled with some', () => {
  const t = load({ started: true });
  t.dc.home();
  assert.equal(button(t.bar, '← Back').disabled, true);
  t.dc.show(entry('a'));
  assert.equal(button(t.bar, '← Back').disabled, false);
});

test('a page or entry view marks no resting view and names its kind; resting views name none', () => {
  const t = load({ started: true });
  t.dc.show(entry('a'));
  assert.equal(t.bar.find((el) => el.attrs['aria-current']).length, 0);
  const kind = t.column.find((el) => el.className === 'dc-kind');
  assert.deepEqual(kind.map((k) => k.textContent), ['Entry']);
  t.dc.show(page('p1'));
  assert.deepEqual(t.column.find((el) => el.className === 'dc-kind').map((k) => k.textContent), ['Background']);
  t.dc.pick('polls');
  assert.equal(t.column.find((el) => el.className === 'dc-kind').length, 0);
});

test('a resting view with an empty title draws no heading; a titled view draws one', () => {
  const t = load({ started: true });
  t.dc.home();
  assert.equal(t.column.find((el) => el.className === 'dc-title').length, 0);
  t.dc.show(entry('a'));
  assert.deepEqual(t.column.find((el) => el.className === 'dc-title').map((h) => h.textContent), ['Entry a']);
});

test('the strip buttons ask for the view by kind', () => {
  const t = load({ started: true, historical: true });
  t.dc.home();
  assert.deepEqual(
    buttons(t.bar).filter((b) => b.hasAttribute('data-dc-pick')).map((b) => b.getAttribute('data-dc-pick')),
    ['polls', 'times', 'library']
  );
});

// ---- Drawing ---------------------------------------------------------------

test('before a game starts, a resting view leaves the column and its bar empty', () => {
  const t = load({ started: false });
  t.dc.home();
  assert.equal(t.column.children.length, 0);
  assert.equal(t.bar.children.length, 0);
  assert.equal(t.column.hasAttribute('data-view'), false);
});

test('the bar is a column bar, created once before the column', () => {
  const t = load({ started: true });
  assert.equal(t.bar.id, 'depth-bar');
  assert.equal(t.bar.className, 'column-bar');
  t.dc.show(entry('a'));
  assert.equal(t.bar.children.length, 1);
});

test('the strip draws in the bar, not in the column', () => {
  const t = load({ started: true });
  t.dc.home();
  assert.equal(t.bar.find((el) => el.className === 'dc-strip').length, 1);
  assert.equal(t.bar.children[0].className, 'dc-strip');
  assert.equal(buttons(t.column).length, 0);
  assert.ok(buttons(t.bar).length >= 3);
});

test('a page view before a game starts draws its bar with the column', () => {
  const t = load({ started: false });
  t.dc.register('page', () => 'epigraph');
  t.dc.show(page('p1'));
  assert.equal(t.bar.children.length, 1);
});

test('the bar empties when the column does', () => {
  const t = load({ started: false });
  t.dc.register('page', () => 'epigraph');
  t.dc.show(page('p1'));
  t.dc.pick('polls');
  assert.equal(t.column.children.length, 0);
  assert.equal(t.bar.children.length, 0);
});

test('before a game starts, a page view still draws (the title page epigraph)', () => {
  const t = load({ started: false });
  t.dc.register('page', () => 'epigraph');
  t.dc.show(page('p1'));
  assert.equal(t.column.getAttribute('data-view'), 'page');
});

test('during play the column draws its resting view', () => {
  const t = load({ started: true });
  t.dc.register('polls', () => 'polls body');
  t.dc.home();
  assert.equal(t.column.getAttribute('data-view'), 'polls');
  assert.equal(t.column.find((el) => el.className === 'dc-body')[0].innerHTML, 'polls body');
});

test('a renderer that returns null steps the column back', () => {
  const t = load({ started: true });
  t.dc.register('entry', (v) => (v.key === 'gone' ? null : 'here'));
  t.dc.show(entry('a'));
  t.dc.show(entry('gone'));
  assert.equal(t.dc.view().key, 'a');
  assert.deepEqual(keys(t.dc.history()), ['polls:null']);
});

test('a renderer that returns null with nothing behind it falls to the resting view', () => {
  const t = load({ started: true });
  t.dc.register('entry', () => null);
  t.dc.show(entry('gone'));
  assert.equal(t.dc.view().kind, 'polls');
});

test('a change of view tells the document; a redraw of the same view does not', () => {
  const t = load({ started: true });
  t.events.length = 0;
  t.dc.show(entry('a'));
  t.dc.show(entry('a'));
  t.dc.back();
  assert.deepEqual(t.events, ['depthcolumn:view', 'depthcolumn:view']);
});

test('a click on a strip button picks the view; a click on Back goes back', () => {
  const t = load({ started: true });
  t.dc.show(entry('a'));
  const click = (target) => {
    const el = { closest: (selector) => (selector.includes('data-dc-pick') && target.hasAttribute('data-dc-pick') || target.hasAttribute('data-dc-back') ? target : null) };
    for (const fn of t.clicks) fn({ target: el, preventDefault() {} });
  };
  click(button(t.bar, '← Back'));
  assert.equal(t.dc.view().kind, 'polls');
  t.dc.show(entry('b'));
  click(button(t.bar, 'Library'));
  assert.equal(t.dc.view().kind, 'library');
  assert.deepEqual(keys(t.dc.history()), []);
});

// ---- The entry registry ----------------------------------------------------

// entries.js reads window.DepthColumn and draws through it; a stub column
// records what it registers and shows.
function loadEntries() {
  const registered = {};
  const shown = [];
  const clicks = [];
  const DepthColumn = {
    register(kind, fn) { registered[kind] = fn; },
    show(view) { shown.push(view); },
    ui: () => null
  };
  const window = { DepthColumn };
  const document = { addEventListener(type, fn) { clicks.push({ type, fn }); } };
  vm.runInNewContext(entriesSource, { window, document, console, Promise });
  return { DepthColumn, registered, shown, clicks };
}

function click(clicks, target) {
  for (const { type, fn } of clicks) {
    if (type === 'click') fn({ target, preventDefault() {}, stopPropagation() {} });
  }
}

test('a term entry with no text draws nothing in its place', () => {
  const registered = {};
  const DepthColumn = { register(kind, fn) { registered[kind] = fn; }, ui: () => null };
  const document = { addEventListener() {}, createElement: fakeElement };
  vm.runInNewContext(entriesSource, { window: { DepthColumn }, document, console, Promise });
  const body = registered.entry({ kind: 'entry', key: 'no-such-slug' });
  assert.deepEqual(body.children, []);
});

test('entries.js offers a prefix registry and dispatches its entry view on it', () => {
  const t = loadEntries();
  assert.equal(typeof t.DepthColumn.registerEntryKind, 'function');
  t.DepthColumn.registerEntryKind('probe', (id, view) => `<b>${id}:${view.key}</b>`);
  assert.equal(t.registered.entry({ kind: 'entry', key: 'probe:x' }), '<b>x:probe:x</b>');
});

test('a registered renderer may say the entry no longer applies', () => {
  const t = loadEntries();
  t.DepthColumn.registerEntryKind('probe', () => null);
  assert.equal(t.registered.entry({ kind: 'entry', key: 'probe:x' }), null);
});

test('a data-depth-entry click shows an entry view keyed by the attribute', async () => {
  const t = loadEntries();
  t.DepthColumn.registerEntryKind('probe', () => '', 'Probe title');
  const opener = { getAttribute: () => 'probe:x', textContent: 'ignored' };
  const target = { closest: (selector) => (selector === '[data-depth-entry]' ? opener : null) };
  click(t.clicks, target);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(t.shown)), [{ kind: 'entry', key: 'probe:x', title: 'Probe title' }]);
});

test('an entry kind with no title takes the opener\'s own text; a title of "" stays empty', async () => {
  const t = loadEntries();
  t.DepthColumn.registerEntryKind('plain', () => '');
  t.DepthColumn.registerEntryKind('own', () => '', '');
  const at = (key) => ({
    closest: (selector) => (selector === '[data-depth-entry]' ? { getAttribute: () => key, textContent: '  Row text ' } : null)
  });
  click(t.clicks, at('plain:a'));
  click(t.clicks, at('own:a'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(t.shown.map((v) => v.title), ['Row text', '']);
});
