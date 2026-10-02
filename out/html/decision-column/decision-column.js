/*
 * Decision column: the monthly hub's treatment. The engine (dendrynexus
 * ui/browser.js) draws the Decks, Hand and Advisors rows as plain markup;
 * this file relabels and decorates that markup in place, and leaves the
 * engine's own click handling alone. Layout and look live in
 * decision-column.css.
 *
 * Decoration runs from a MutationObserver on #content because the engine
 * re-renders the hand in place when a card is drawn or played, replacing
 * the cards without touching the heading above them.
 *
 * Choice tables: a scene named in decision-column/choice-tables.json has its
 * choice list drawn as a table (choiceTable below). Loaded in node, this file
 * exports the pure table model and renderer for the unit tests.
 *
 * Result placeholders: a scene writes <div data-results="name"> around a
 * plain-text fallback, and the decoration pass fills it with the result
 * rows (state-column/results.js) that the name stands for (resultsHtml).
 */
(function () {
  'use strict';

  // The engine's default heading strings are how-to sentences. These hooks
  // (read when a heading is first drawn) give it plain section names; the
  // how-to moves to each heading's title. The Advisors heading takes its
  // text from the pinnedCardsDescription quality (main.scene.dry), which the
  // engine prefers over a window value, so decorate() below relabels it.
  if (typeof window !== 'undefined') {
    window.deckDescription = 'Decks';
    window.handDescription = 'Hand';
  }

  var HINTS = {
    decks: 'Click a deck to draw a card.',
    hand: 'Click a card to play it.',
    advisors: 'Click an advisor to play their card. Each advisor can act once every 6 months.'
  };

  // Faction colours as in the state column's factions graphic (view.js
  // SPD_FACTIONS, which isn't exported, so they are repeated here).
  var FACTIONS = {
    left: { label: 'Left', color: '#7a1010' },
    center: { label: 'Center', color: '#b3261e' },
    labor: { label: 'Labor', color: '#d9542b' },
    reformist: { label: 'Reformist', color: '#e8897a' },
    neorev: { label: 'Neorevisionist', color: '#6d3a8c' },
    nonfactional: { label: 'Non-factional', color: '#8a8a8a' }
  };

  // Advisor card id -> faction. Taken from the <faction>_advisor tags in
  // source/scenes/party_affairs/shuffle_leadership.scene.dry (@add_*), the
  // grouping the game uses when it raises a faction's dissent after an
  // advisor leaves. The advisor cards' own tags disagree for Pfulf,
  // Aufhauser, Baade and Mierendorff; the recruit menu wins. The Cabinet and
  // Shuffle Leadership cards are absent on purpose: they are not people.
  var ADVISOR_FACTION = {
    hilferding: 'center', wels: 'center', muller: 'center', breitscheid: 'center',
    severing: 'reformist', braun: 'reformist', juchacz: 'reformist', pfulf: 'reformist',
    levi: 'left', sender: 'left', rosenfeld: 'left', seydewitz: 'left', siemsen: 'left',
    leipart: 'labor', aufhauser: 'labor', wissell: 'labor', woytinsky: 'labor',
    mierendorff: 'neorev', schumacher: 'neorev', leber: 'neorev',
    baade: 'nonfactional', hirschfeld: 'nonfactional', radbruch: 'nonfactional',
    stampfer: 'nonfactional'
  };

  var GOVT_DECK = 'main.govt';

  function engine() {
    return window.dendryUI && window.dendryUI.dendryEngine;
  }

  function quality(name) {
    var e = engine();
    return e && e.state && e.state.qualities ? e.state.qualities[name] : undefined;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Headings

  // Sets a heading's label (and optional status chip), touching the DOM
  // only when something changed: decorate() runs on every mutation,
  // including its own.
  function setHeading(p, label, hint, chip) {
    var labelEl = p.querySelector('.dc-label');
    var chipEl = p.querySelector('.dc-chip');
    var chipText = chip ? chip.text : '';
    if (labelEl && labelEl.textContent === label && p.title === hint &&
        (chipEl ? chipEl.textContent : '') === chipText &&
        (!chipEl || chipEl.classList.contains('dc-chip-ready') === !!chip.ready)) {
      return;
    }
    p.textContent = '';
    p.title = hint;
    p.appendChild(el('span', 'dc-label', label));
    if (chipText) {
      p.appendChild(el('span', 'dc-chip' + (chip.ready ? ' dc-chip-ready' : ''), chipText));
    }
  }

  // The status text is the pinnedCardsDescription quality, read from the
  // paragraph the engine drew (and remembered, since decorating replaces
  // it). Anything else in it (an older save's longer sentence, or the
  // fallback in game.js) is dropped rather than shown as a chip.
  function advisorStatus(p) {
    var raw = p.getAttribute('data-dc-status');
    if (raw === null) {
      raw = p.querySelector('.dc-label') ? '' : p.textContent;
      p.setAttribute('data-dc-status', raw);
    }
    if (raw === 'Action ready') return { text: raw, ready: true };
    if (raw.indexOf('Next action in ') === 0) return { text: raw, ready: false };
    return null;
  }

  function decorateHeadings(content) {
    var deckHeading = content.querySelector('p.deck-description');
    if (deckHeading) setHeading(deckHeading, 'Decks', HINTS.decks);

    var handHeading = content.querySelector('p.hand-description');
    if (handHeading) {
      var slots = content.querySelectorAll('ul.hand li.card-in-hand');
      var filled = content.querySelectorAll('ul.hand li.card-in-hand a.card');
      setHeading(handHeading, 'Hand · ' + filled.length + ' of ' + slots.length, HINTS.hand);
    }

    var advisorHeading = content.querySelector('p.pinned-text-description');
    if (advisorHeading) {
      setHeading(advisorHeading, 'Advisors', HINTS.advisors, advisorStatus(advisorHeading));
    }
  }

  // Decks

  function govtDeckInfo() {
    var game = window.dendryUI && window.dendryUI.game;
    var scene = game && game.scenes && game.scenes[GOVT_DECK];
    return {
      title: (scene && scene.title) || 'Government Affairs',
      image: scene && scene.cardImage
    };
  }

  function unavailableNote(deckId) {
    if (deckId === GOVT_DECK && !quality('spd_in_government')) return 'Not in government';
    return 'No cards available';
  }

  function addNote(li, text) {
    if (li.querySelector('.dc-note')) return;
    li.appendChild(el('span', 'dc-note', text));
  }

  // An unavailable deck is greyed and inert. The engine draws it with a
  // class only, so its link stays focusable unless told not to; the CSS
  // takes away its pointer events.
  function markUnavailable(li) {
    var link = li.querySelector('a.card');
    var id = link ? link.getAttribute('card-id') : '';
    li.setAttribute('aria-disabled', 'true');
    if (link) {
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
    }
    addNote(li, unavailableNote(id));
  }

  // The Government Affairs deck exists only from June 1928, so before that
  // it is missing from the row. A stand-in shows it greyed. It is not an
  // engine choice: no link and no card-id, so the engine's click handler on
  // 'ul.decks li a' can't reach it.
  function addGovtPlaceholder(decks) {
    var info = govtDeckInfo();
    var li = el('li', 'deck unavailable-card dc-placeholder');
    li.setAttribute('aria-disabled', 'true');
    var ghost = el('div', 'dc-ghost');
    if (info.image) {
      var img = el('img', 'card-img');
      img.src = info.image;
      img.alt = '';
      ghost.appendChild(img);
    }
    li.appendChild(ghost);
    li.appendChild(el('span', 'card-caption', info.title));
    addNote(li, unavailableNote(GOVT_DECK));
    decks.appendChild(li);
  }

  function decorateDecks(content) {
    var decks = content.querySelector('ul.decks');
    if (!decks) return;
    Array.prototype.forEach.call(decks.querySelectorAll('li.deck.unavailable-card'), function (li) {
      if (!li.classList.contains('dc-placeholder')) markUnavailable(li);
    });
    var hasGovt = decks.querySelector('a.card[card-id="' + GOVT_DECK + '"]') ||
      decks.querySelector('li.dc-placeholder');
    if (!hasGovt) addGovtPlaceholder(decks);
    // The note follows spd_in_government, which can change under a
    // placeholder already drawn (a loaded save, or a test).
    var note = decks.querySelector('li.dc-placeholder .dc-note');
    if (note && note.textContent !== unavailableNote(GOVT_DECK)) {
      note.textContent = unavailableNote(GOVT_DECK);
    }
  }

  // Hand

  function decorateHand(content) {
    Array.prototype.forEach.call(content.querySelectorAll('ul.hand div.blank-card'), function (slot) {
      if (!slot.firstChild) slot.appendChild(el('span', 'dc-empty', 'Draw from a deck'));
    });
  }

  // Advisors

  function decorateAdvisors(content) {
    Array.prototype.forEach.call(content.querySelectorAll('ul.pinned-cards li.pinned-card'), function (li) {
      if (li.querySelector('.dc-bar')) return;
      var link = li.querySelector('a.card');
      var faction = link && FACTIONS[ADVISOR_FACTION[link.getAttribute('card-id')]];
      if (!faction) return;
      li.style.setProperty('--dc-faction', faction.color);
      link.appendChild(el('span', 'dc-bar'));
      li.appendChild(el('span', 'dc-faction', faction.label));
    });
  }

  // Choice tables

  var TABLES_URL = 'decision-column/choice-tables.json';
  var tableSpecs = null;   // choice-tables.json, once loaded

  // A cell is a string, a list of lines (the first is the figure, the rest
  // fine print) or {lines, title}, a cell with a hover title for detail that
  // would crowd the row.
  function normalizeCell(value) {
    var title = '';
    if (value && !Array.isArray(value) && typeof value === 'object') {
      title = value.title ? String(value.title) : '';
      value = value.lines;
    }
    if (value === undefined || value === null) value = [];
    return { lines: (Array.isArray(value) ? value : [value]).map(String), title: title };
  }

  // The table as data, from one scene's spec and its choices (each
  // {id, title, subtitle, canChoose}). Rows follow the engine's order; a
  // choice the spec doesn't know becomes a row of its label alone. A row's
  // "summary" is one line in words; its "detail" is the figures, for a hover
  // title. With detail columns the summary column stands in for them below
  // the three-column tier (the stylesheet swaps them); a spec that names no
  // columns is summary-only, and the summary shows at every width.
  function tableModel(spec, choices) {
    var columns = (spec.columns || []).map(function (c) {
      return { key: c.key, label: c.label };
    });
    var known = spec.rows || {};
    var rows = choices.map(function (choice, index) {
      var def = Object.prototype.hasOwnProperty.call(known, choice.id) ? known[choice.id] : null;
      var row = {
        index: index,
        id: choice.id,
        title: choice.title,
        subtitle: choice.subtitle || '',
        available: choice.canChoose !== false,
        known: !!def,
        span: null,
        cells: [],
        summary: '',
        detail: ''
      };
      if (def) {
        row.summary = def.summary || '';
        row.detail = def.detail || '';
        if (def.span) {
          row.span = def.span;
        } else {
          row.cells = columns.map(function (c) { return normalizeCell((def.cells || {})[c.key]); });
        }
      }
      return row;
    });
    var notes = [];
    (spec.notes || []).forEach(function (note) {
      choices.forEach(function (choice) {
        if (choice.id === note.choice && (choice.subtitle || '').indexOf(note.subtitleHas) >= 0) {
          notes.push({ title: choice.title, text: note.subtitleHas });
        }
      });
    });
    return {
      firstLabel: spec.firstLabel || '',
      summaryLabel: spec.summaryLabel || '',
      columns: columns,
      summaryOnly: columns.length === 0,
      rows: rows,
      notes: notes
    };
  }

  // The table as DOM. `links` maps a row's index to the engine's own <a> for
  // that choice, which moves into the row's first cell so the engine's click
  // handler (delegated on 'ul.choices li a') still reaches it. A row with no
  // link is an unavailable choice and shows its label as plain text.
  function renderChoiceTable(doc, model, links) {
    function make(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function addLines(td, lines) {
      lines.forEach(function (line, i) {
        td.appendChild(make('span', i === 0 ? 'ct-main' : 'ct-detail', line));
      });
    }
    var width = model.columns.length;
    var table = make('table', 'choice-table rule-double' + (model.summaryOnly ? ' ct-summary-only' : ''));
    var summaryClass = model.summaryOnly ? 'ct-summary' : 'ct-narrow';
    var head = make('tr');
    head.appendChild(make('th', 'ct-mode', model.firstLabel));
    model.columns.forEach(function (c) { head.appendChild(make('th', 'ct-wide', c.label)); });
    head.appendChild(make('th', summaryClass, model.summaryLabel));
    table.appendChild(make('thead')).appendChild(head);
    var body = table.appendChild(make('tbody'));
    model.rows.forEach(function (row) {
      var tr = make('tr');
      tr.setAttribute('data-choice-id', row.id);
      if (row.detail) tr.title = row.detail;
      if (!row.available) tr.className = 'ct-unavailable';
      var first = make('td', 'ct-mode');
      var link = links[row.index];
      if (link) first.appendChild(link);
      else first.appendChild(make('span', 'ct-main', row.title));
      tr.appendChild(first);
      if (!row.known) {
        first.setAttribute('colspan', String(width + 2));
        if (row.subtitle) first.appendChild(make('div', 'ct-detail', row.subtitle));
      } else {
        if (row.span) {
          var merged = make('td', 'ct-wide ct-merged', row.span);
          merged.setAttribute('colspan', String(width));
          tr.appendChild(merged);
        } else {
          row.cells.forEach(function (cell) {
            var td = make('td', 'ct-wide');
            if (cell.title) td.title = cell.title;
            addLines(td, cell.lines);
            tr.appendChild(td);
          });
        }
        tr.appendChild(make('td', summaryClass, row.summary));
      }
      body.appendChild(tr);
    });
    var holder = make('li', 'choice-table-holder');
    holder.appendChild(table);
    model.notes.forEach(function (note) {
      var p = make('p', 'ct-note');
      p.appendChild(make('span', 'ct-note-title', note.title));
      p.appendChild(doc.createTextNode(' ' + note.text));
      holder.appendChild(p);
    });
    return holder;
  }

  // The engine draws each choice as an li holding its link (an unavailable
  // one holds text) and an optional .subtitle div. `ids` is the engine's
  // getCurrentChoices(), in the same order as the lis.
  function readChoices(ul, ids) {
    var out = [];
    var links = {};
    Array.prototype.forEach.call(ul.children, function (li, i) {
      var link = li.querySelector('a');
      var sub = li.querySelector('.subtitle');
      var title;
      if (link) {
        title = link.textContent;
      } else {
        var copy = li.cloneNode(true);
        var copySub = copy.querySelector('.subtitle');
        if (copySub) copy.removeChild(copySub);
        title = copy.textContent;
      }
      out.push({
        id: ids[i] && ids[i].id,
        title: title.trim(),
        subtitle: sub ? sub.textContent.trim() : '',
        canChoose: !!link
      });
      if (link) links[i] = link;
    });
    return { choices: out, links: links };
  }

  // A click on a row but not on its link presses the link; a click anywhere
  // else in the holder (head, note, gaps) does nothing. Left alone, the
  // engine's handler on the holder li would press the list's first link.
  function onHolderClick(e) {
    if (e.target.closest('a')) return;
    e.preventDefault();
    e.stopPropagation();
    var tr = e.target.closest('tr[data-choice-id]');
    var link = tr && tr.querySelector('a');
    if (link) link.click();
  }

  // Draws the current scene's choice list as a table when specs names the
  // scene. The table sits inside the engine's ul.choices (in one li), so the
  // engine clears it with the list. Returns the table, or null when the
  // scene has no spec or its list is already a table.
  function choiceTable(sceneId, specs, content) {
    var spec = specs && specs[sceneId];
    var root = content || document.getElementById('content');
    if (!spec || !root) return null;
    var lists = root.querySelectorAll('ul.choices');
    var ul = lists[lists.length - 1];
    if (!ul || ul.classList.contains('has-choice-table')) return null;
    var e = engine();
    var ids = (e && e.getCurrentChoices && e.getCurrentChoices()) || [];
    var read = readChoices(ul, ids);
    var holder = renderChoiceTable(document, tableModel(spec, read.choices), read.links);
    holder.addEventListener('click', onHolderClick);
    ul.classList.add('has-choice-table');
    ul.textContent = '';
    ul.appendChild(holder);
    return holder.querySelector('table');
  }

  function decorateChoiceTable(content) {
    var e = engine();
    var sceneId = e && e.state && e.state.sceneId;
    if (tableSpecs && sceneId) choiceTable(sceneId, tableSpecs, content);
  }

  // A failed load leaves the plain choice list.
  function loadChoiceTables() {
    if (!window.fetch) return;
    fetch(TABLES_URL).then(function (r) { return r.json(); }).then(function (data) {
      tableSpecs = data;
      decorate();
    }).catch(function (err) {
      console.error('choice tables', err);
    });
  }

  // Result placeholders

  // Name -> builder, each (ResultRows, qualities, symbols) -> html. A new
  // vote readout adds its name here and nowhere else.
  var RESULT_BUILDERS = {
    reichstag: function (R, q, symbols) {
      return R.html(R.reichstag(q), { q: q, symbols: symbols, size: 'compact', seats: true });
    },
    'president-round1': function (R, q, symbols) {
      return presidentRows(R, R.president1932(q), q, symbols, true);
    },
    'president-round2': function (R, q, symbols) {
      return presidentRows(R, R.president1932(q), q, symbols, false);
    },
    'president-1934-round1': function (R, q, symbols) {
      return presidentRows(R, R.president1934(q), q, symbols, true);
    },
    'president-1934-round2': function (R, q, symbols) {
      return presidentRows(R, R.president1934(q), q, symbols, false);
    }
  };

  // A presidential vote: bars on a 0-100 scale so the 50 tick of a first
  // round sits mid-bar, and no change column (there is no last vote to
  // compare). A second round is a plurality, so it has no tick.
  function presidentRows(R, list, q, symbols, firstRound) {
    return R.html(list, {
      q: q, symbols: symbols, size: 'compact', max: 100, change: false,
      mark: firstRound ? 50 : undefined
    });
  }

  // The rows for a placeholder's name, or null when there is nothing to
  // draw (an unknown name, a build without ResultRows, a builder that fails
  // on odd qualities). The caller then leaves the scene's fallback text, so
  // the page never shows an empty hole.
  function resultsHtml(name, R, q, symbols) {
    if (!R || !Object.prototype.hasOwnProperty.call(RESULT_BUILDERS, name)) return null;
    try {
      return RESULT_BUILDERS[name](R, q, symbols) || null;
    } catch (err) {
      console.error('result rows', name, err);
      return null;
    }
  }

  // Fills each placeholder once; the mark keeps the observer's next pass
  // (which our own write triggers) from redrawing it.
  function decorateResults(content) {
    var holes = content.querySelectorAll('[data-results]:not([data-results-filled])');
    if (!holes.length) return;
    var e = engine();
    var q = e && e.state && e.state.qualities;
    var symbols = window.StateColumn && window.StateColumn.symbols();
    Array.prototype.forEach.call(holes, function (hole) {
      var html = resultsHtml(hole.getAttribute('data-results'), window.ResultRows, q, symbols);
      hole.setAttribute('data-results-filled', html === null ? 'fallback' : 'rows');
      if (html !== null) hole.innerHTML = html;
    });
  }

  function decorate() {
    var content = document.getElementById('content');
    if (!content) return;
    decorateHeadings(content);
    decorateDecks(content);
    decorateHand(content);
    decorateAdvisors(content);
    decorateChoiceTable(content);
    decorateResults(content);
  }

  var api = {
    tableModel: tableModel,
    renderChoiceTable: renderChoiceTable,
    choiceTable: choiceTable,
    resultsHtml: resultsHtml,
    RESULT_BUILDERS: RESULT_BUILDERS
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  window.DecisionColumn = api;

  function start() {
    var content = document.getElementById('content');
    if (!content) return;
    new MutationObserver(decorate).observe(content, { childList: true, subtree: true });
    decorate();
    loadChoiceTables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
