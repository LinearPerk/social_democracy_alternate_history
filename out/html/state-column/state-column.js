/*
 * State column: DOM glue. Replaces window.updateSidebar (game.js) so that,
 * once the game has started, the sidebar draws the state column instead of
 * the status.scene.dry text.
 */
(function () {
  'use strict';

  var Model = window.StateColumnModel;
  var View = window.StateColumnView;

  var STORAGE_KEY = 'sd-state-column';
  var DEFAULT_SETTINGS = {tab: 'party', chart: 'seats', symbols: 'period'};

  function defaults() {
    return {
      tab: DEFAULT_SETTINGS.tab,
      chart: DEFAULT_SETTINGS.chart,
      symbols: DEFAULT_SETTINGS.symbols
    };
  }

  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var parsed = JSON.parse(raw);
      var merged = defaults();
      for (var key in merged) {
        if (parsed && parsed[key] !== undefined) merged[key] = parsed[key];
      }
      return merged;
    } catch (e) {
      return defaults();
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // localStorage unavailable (private browsing, quota, etc.); the
      // setting just won't survive a reload.
    }
  }

  var settings = loadSettings();

  // Change feedback: qualities as they stood when the current month began
  // (baseline) and as they stood after the previous render (last), so
  // panels can mark what changed and flash only the change just made. None
  // of it is stored; a reload or a loaded save starts fresh.
  var baseline = null; // {year, month, values}
  var lastValues = null;
  // Qualities as they stood when each tab was last open (tab key to
  // values): a shut tab's dot shows what changed since. Starts over each
  // month, with the baseline.
  var seen = {};
  // A flash lasts FLASH_MS. Renders come in bursts, and each one replaces
  // the column's markup (which restarts the animation), so for that long
  // after a change the rows keep comparing against the values from before
  // it: {values, at}.
  var FLASH_MS = 600;
  var flashHold = null;
  // The engine's qualities object last drawn: a loaded save brings a new one.
  var lastQualities = null;
  // The coalition dissents as last drawn ({coalition_dissent,
  // kpd_coalition_dissent}), so a move shows up as a difference and the log of
  // what moved them (sc_coalition_log) can name the page it happened on.
  var lastDissents = null;

  // Copies plain values only (numbers, strings, booleans), skipping arrays
  // and objects (economic_records, timers, classes, parties, factions, …),
  // which change feedback never reads by key.
  function snapshotQualities(q) {
    var out = {};
    for (var key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) continue;
      var t = typeof q[key];
      if (t === 'number' || t === 'string' || t === 'boolean') {
        out[key] = q[key];
      }
    }
    return out;
  }

  // The title of the card or event the player is on, for the coalition log.
  // A scene inside a card ("labor_rights.eight_hour_day") answers with the
  // card's own title, the name the player knows it by. Empty when the engine
  // has no scene to name.
  function sceneCause() {
    var ui = window.dendryUI;
    var engine = ui && ui.dendryEngine;
    var id = engine && engine.state && engine.state.sceneId;
    if (!id || !ui.game || !ui.game.scenes) return '';
    var scene = ui.game.scenes[String(id).split('.')[0]] || ui.game.scenes[id];
    var title = scene && scene.title;
    if (title && typeof title !== 'string') {
      // A title with [+ quality +] inserts is a content object, which the
      // engine renders like any other scene text.
      try {
        var box = document.createElement('div');
        box.innerHTML = ui.contentToHTML.convertLine(engine._makeDisplayContent(title, true));
        title = box.textContent;
      } catch (e) {
        title = '';
      }
    }
    return String(title || '').trim();
  }

  // The original text-sidebar renderer: still used before the game starts
  // (it hides the sidebar).
  var origUpdateSidebar = window.updateSidebar;

  function dateLineEl() {
    var el = document.getElementById('date-line');
    if (!el) {
      el = document.createElement('div');
      el.id = 'date-line';
      el.className = 'column-bar';
      var content = document.getElementById('content');
      content.parentNode.insertBefore(el, content);
    }
    return el;
  }

  function updateDateLine(q) {
    var el = dateLineEl();
    if (!q.started) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    var month = Number(q.month) || 1;
    var monthName = Model.MONTHS[month - 1] || '';
    // The text is a button, for keyboard users, and opens the depth column's
    // month entry through entries.js (data-depth-entry). It fills the bar, so
    // a click anywhere on the bar opens it. Redrawn in place: a focused
    // button keeps its focus from one render to the next.
    var button = el.firstElementChild;
    if (!button || button.tagName !== 'BUTTON') {
      el.textContent = '';
      button = document.createElement('button');
      button.type = 'button';
      button.title = 'This month in history';
      el.appendChild(button);
    }
    button.setAttribute('data-depth-entry', 'month:' + (Number(q.year) || 0) + '-' + month);
    var label = (monthName ? monthName + ' ' : '') + q.year;
    if (button.textContent !== label) button.textContent = label;
  }

  // The state column's title bar, a sibling before the column's wrapper so
  // the grid can put it in the row of bars. It carries the chart's title and
  // the Seats/Polls toggle, and is empty and hidden while the sidebar is.
  function stateBarEl() {
    var el = document.getElementById('state-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'state-bar';
      el.className = 'column-bar';
      var anchor = document.getElementById('tools_wrapper') || document.getElementById('stats_sidebar');
      anchor.parentNode.insertBefore(el, anchor);
    }
    return el;
  }

  function updateStateBar(q, opts) {
    var el = stateBarEl();
    if (!q.started) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    // Redrawing replaces the toggle's buttons; keep a keyboard user's place.
    var focused = document.activeElement;
    var inBar = focused && el.contains(focused);
    var source = inBar ? focused.getAttribute('data-sc-chart-source') : null;
    var title = inBar && focused.hasAttribute('data-sc-bar-open');
    el.innerHTML = View.stateBar(q, opts);
    var again = source ? el.querySelector('[data-sc-chart-source="' + source + '"]')
      : title ? el.querySelector('[data-sc-bar-open]') : null;
    if (again) again.focus();
  }

  // "Party symbols" block, appended once to the Options overlay.
  var symbolsSettingAdded = false;

  function updateSymbolsButtons() {
    var buttons = document.querySelectorAll('[data-sc-symbols]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-sc-symbols') === settings.symbols;
      buttons[i].classList.toggle('on', on);
    }
  }

  function ensureSymbolsSetting() {
    if (symbolsSettingAdded) return;
    var options = document.querySelector('#options .overlay_top');
    if (!options) return;
    var block = document.createElement('div');
    block.className = 'sc-symbols-setting';
    block.innerHTML = '<h3>Party symbols</h3>' +
      '<p class="sc-symbols-buttons">' +
      '<button type="button" class="sc-symbols-btn" data-sc-symbols="period">Period symbols</button>' +
      '<button type="button" class="sc-symbols-btn" data-sc-symbols="badges">Badges only</button>' +
      '</p>';
    options.appendChild(block);
    symbolsSettingAdded = true;
    updateSymbolsButtons();
  }

  // A symbol image that fails to load is replaced by its plain badge.
  // The view puts that badge's markup in data-fallback, so this needs no
  // model or party lookups of its own.
  document.addEventListener('error', function (e) {
    var target = e.target;
    if (!target || target.tagName !== 'IMG' || !target.closest) return;
    if (!target.closest('#state-column')) return;
    var wrapper = target.closest('[data-fallback]');
    if (!wrapper) return;
    var fallback = wrapper.getAttribute('data-fallback');
    if (fallback === null) return;
    wrapper.outerHTML = fallback;
  }, true);

  // Without a depth column (its script failed to load) the chart click keeps
  // its old action, upstream's Library.
  function openReichstagEntry() {
    if (window.DepthColumn) window.DepthColumn.show({kind: 'entry', key: 'reichstag:seats', title: 'Reichstag'});
    else window.showStats();
  }

  function openEntryKey() {
    var view = window.DepthColumn ? window.DepthColumn.view() : null;
    return view && view.kind === 'entry' ? view.key : null;
  }

  // The entry the last render marked, so a change of view that leaves it
  // alone (Polls to Library) doesn't redraw the column.
  var markedEntry = null;

  // The parties the depth column's Reichstag entry has lit on the seat chart
  // (ids from the model), or null. Not stored: like the entry's pick, it
  // ends with the page.
  var highlighted = null;

  // Lights those parties' dots and dims the rest, with the coalition's seat
  // total in the chart's centre; null, an empty list or unknown ids clear it.
  function highlightParties(ids) {
    var next = View.highlightIds(ids);
    if (JSON.stringify(next) === JSON.stringify(highlighted)) return;
    highlighted = next;
    if (window.dendryUI && window.dendryUI.dendryEngine.state.qualities.started) render();
  }

  // The party whose entry is open in the depth column ("party:ddp"), as a
  // one-party highlight, or null. Derived from the open view on every draw
  // rather than stored, so Back, another view or a new page ends it with no
  // step of its own, and a coalition picked in the Reichstag entry (which can
  // only be open while no party entry is) never has to know about it.
  function focusedParty(entryKey) {
    if (!entryKey || entryKey.indexOf('party:') !== 0) return null;
    return View.highlightIds([entryKey.slice('party:'.length)]);
  }

  // The box holds one height whichever tab is open: the open tab's body gets
  // a minimum height of the tallest of the three tabs' bodies, so the shorter
  // ones carry blank room at their foot and the tab bar and rows stay put.
  // The other tabs are drawn into a measurer inside the column (its rules
  // match through #state-column) that is taken out again in the same task,
  // before anything can paint, focus or handle an event; it has no ids and
  // no flash or current marks (View.bodyMarkups). Heights are cached by
  // markup and column width, so an unchanged tab isn't measured again.
  var heightCache = {};
  var lastFit = null; // {q, base, opts}: what a resize or a font load refits

  function measureBodies(column, body) {
    return function (markups) {
      var box = document.createElement('div');
      box.className = 'sc-measure';
      box.setAttribute('aria-hidden', 'true');
      box.style.width = body.getBoundingClientRect().width + 'px';
      box.innerHTML = markups.map(function (markup) {
        return '<div class="sc-body">' + markup + '</div>';
      }).join('');
      column.appendChild(box);
      var heights = [];
      for (var i = 0; i < box.children.length; i++) {
        heights.push(box.children[i].getBoundingClientRect().height);
      }
      column.removeChild(box);
      return heights;
    };
  }

  // The size of the coalition dissent blocks on Party and State, as the last
  // fit chose it ({party, state}, see View.pickDetail); the next render draws
  // with it, and a fit that chooses otherwise draws the column again.
  var detail = null;

  // The column, its open tab's body and a measure for them, as drawn now
  // (drawColumn replaces them all), with the body's minimum off.
  function fitParts(q) {
    var column = document.getElementById('state-column');
    var body = column && column.querySelector(':scope > .sc-body');
    if (!body) return null;
    body.style.minHeight = '';
    var width = Math.round(body.getBoundingClientRect().width * 100) / 100;
    return {
      body: body,
      scope: width + (q.spd_in_government ? 'g' : ''),
      measure: measureBodies(column, body)
    };
  }

  function fitBody(q, base, opts) {
    lastFit = {q: q, base: base, opts: opts};
    var parts = fitParts(q);
    if (!parts) return;
    // The blocks take the richest size that keeps their tab no taller than
    // Defense. A different size than the column was drawn with draws it again.
    var picked = View.pickDetail(q, base, opts, function (markups) {
      return View.bodyHeights(markups, parts.scope, heightCache, parts.measure);
    });
    if (!detail || picked.party !== detail.party || picked.state !== detail.state) {
      detail = picked;
      opts.detail = picked;
      drawColumn(q, base, opts);
      parts = fitParts(q);
    }
    var tallest = View.tallestBody(View.bodyMarkups(q, base, opts), parts.scope, heightCache, parts.measure);
    parts.body.style.minHeight = tallest + 'px';
  }

  // Heights measured before the Jost fonts arrived are wrong, and a new
  // window width changes the column's. Fit again once the page has settled.
  function refit() {
    if (!lastFit || !window.dendryUI) return;
    if (!window.dendryUI.dendryEngine.state.qualities.started) return;
    fitBody(lastFit.q, lastFit.base, lastFit.opts);
  }

  var refitFrame = 0;
  window.addEventListener('resize', function () {
    window.cancelAnimationFrame(refitFrame);
    refitFrame = window.requestAnimationFrame(refit);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      heightCache = {};
      refit();
    });
  }

  // Draws the column into #qualities. Redrawing replaces the buttons, so a
  // keyboard user who just pressed one would lose their place: the same
  // button is found again afterwards.
  function drawColumn(q, base, opts) {
    var qualitiesEl = document.getElementById('qualities');
    var focused = document.activeElement;
    var focusSelector = null;
    if (focused && qualitiesEl.contains(focused)) {
      var entry = focused.getAttribute('data-depth-entry');
      var tab = focused.getAttribute('data-sc-tab');
      if (entry) {
        // Two blocks open the same entry; the focused one is told apart by its dissent.
        var cd = focused.getAttribute('data-cd');
        focusSelector = '[data-depth-entry="' + entry + '"]' + (cd ? '[data-cd="' + cd + '"]' : '');
      } else if (tab) focusSelector = '[data-sc-tab="' + tab + '"]';
    }
    qualitiesEl.innerHTML = View.render(q, base, opts);
    var again = focusSelector ? qualitiesEl.querySelector(focusSelector) : null;
    if (again) again.focus();
  }

  function render() {
    var q = window.dendryUI.dendryEngine.state.qualities;
    var sidebar = document.getElementById('stats_sidebar');

    ensureSymbolsSetting();
    updateDateLine(q);

    if (!q.started) {
      updateStateBar(q);
      baseline = null;
      lastValues = null;
      seen = {};
      flashHold = null;
      lastQualities = null;
      lastDissents = null;
      detail = null;
      lastFit = null;
      if (sidebar) sidebar.classList.remove('sc-on');
      origUpdateSidebar();
      return;
    }

    // The month's economic figures go into the game's own qualities, so the
    // State tab's chart saves and loads with the game.
    var history = Model.recordHistory(q.sc_history, q);
    if (history !== q.sc_history) q.sc_history = history;

    // A loaded save (or a new game) is a different qualities object, and a
    // different game state: nothing carries over from the one before.
    if (q !== lastQualities) {
      lastQualities = q;
      baseline = null;
      lastValues = null;
      seen = {};
      flashHold = null;
      lastDissents = null;
      detail = null;
    }

    // What moved the coalition dissents goes into the game's own qualities
    // too, so the dissent block's "Last" line and the entry's list save and
    // load with the game.
    var dissents = {
      coalition_dissent: Number(q.coalition_dissent) || 0,
      kpd_coalition_dissent: Number(q.kpd_coalition_dissent) || 0
    };
    var coalitionLog = Model.recordCoalitionLog(q.sc_coalition_log, lastDissents, q, sceneCause());
    if (coalitionLog !== q.sc_coalition_log) q.sc_coalition_log = coalitionLog;
    lastDissents = dissents;

    if (!baseline || baseline.year !== q.year || baseline.month !== q.month) {
      baseline = { year: q.year, month: q.month, values: snapshotQualities(q) };
      seen = {};
    }

    // The values the open tab's rows compare against to flash (null on a
    // page's first render and after a tab switch, so nothing flashes then).
    var now = Date.now();
    if (flashHold && now - flashHold.at >= FLASH_MS) flashHold = null;
    var flashFrom = flashHold ? flashHold.values : lastValues;

    if (sidebar) {
      sidebar.classList.remove('sidebar-hidden');
      sidebar.classList.add('sc-on');
    }
    var openKey = openEntryKey();
    var focus = highlighted ? null : focusedParty(openKey);
    var opts = {
      tab: settings.tab,
      chart: settings.chart,
      symbols: settings.symbols,
      highlight: highlighted || focus,
      // A lone party's name stands in the centre where a coalition's label
      // would be.
      highlightName: focus ? Model.partyLabel(q, focus[0]) : undefined,
      last: flashFrom,
      seen: seen,
      // The depth column's open entry (e.g. "defense:sa"), so its row can
      // be marked. Null when the depth column isn't loaded or shows no entry.
      openEntry: markedEntry = openKey,
      detail: detail
    };
    if (document.getElementById('qualities')) {
      drawColumn(q, baseline.values, opts);
      fitBody(q, baseline.values, opts);
    }
    updateStateBar(q, opts);
    var current = snapshotQualities(q);
    if (!flashHold && lastValues && changed(lastValues, current)) flashHold = { values: lastValues, at: now };
    lastValues = current;
    // The open tab has been looked at: its dot, if it had one, is spent.
    seen[View.tabKey(settings.tab)] = current;
  }

  // Whether any value differs between two snapshots.
  function changed(a, b) {
    for (var key in b) {
      if (Object.prototype.hasOwnProperty.call(b, key) && a[key] !== b[key]) return true;
    }
    return false;
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var tabButton = target.closest('[data-sc-tab]');
    if (tabButton) {
      settings.tab = tabButton.getAttribute('data-sc-tab');
      saveSettings();
      // A switch is not a change: the new tab's rows don't flash.
      lastValues = null;
      flashHold = null;
      render();
      return;
    }

    var symbolsButton = target.closest('[data-sc-symbols]');
    if (symbolsButton) {
      settings.symbols = symbolsButton.getAttribute('data-sc-symbols');
      saveSettings();
      updateSymbolsButtons();
      // Through window.updateSidebar, so the depth column's open entry
      // redraws its symbol too.
      window.updateSidebar();
      return;
    }

    var chartSource = target.closest('[data-sc-chart-source]');
    if (chartSource) {
      settings.chart = chartSource.getAttribute('data-sc-chart-source');
      saveSettings();
      render();
      return;
    }

    // The bar over the column opens the Reichstag entry, like the chart
    // below it. Its title is a button for the keyboard; the rest of the bar
    // answers a click too. The toggle, including the gap between its two
    // buttons, is not part of it.
    if (target.closest('#state-bar') && !target.closest('[data-sc-chart-toggle]')) {
      openReichstagEntry();
      return;
    }

    // A depth-column opener inside the chart (the position word in the
    // government line) belongs to entries.js, so the innermost click wins:
    // it never reaches the chart branch below.
    if (target.closest('[data-depth-term], [data-depth-entry]')) {
      return;
    }

    // Clicking the chart area outside the toggle opens the Reichstag entry
    // in the depth column; its "Charts and statistics" link is the old
    // click's showStats().
    var chartArea = target.closest('[data-sc-chart]');
    if (chartArea) {
      openReichstagEntry();
      return;
    }
  }, true);

  window.updateSidebar = render;

  // The depth column tells the document when its open view changes, so the
  // row of the open entry is marked (and unmarked on Back) at once.
  document.addEventListener('depthcolumn:view', function () {
    if (window.dendryUI && window.dendryUI.dendryEngine.state.qualities.started && openEntryKey() !== markedEntry) render();
  });

  // What the depth column needs from this module to draw an entry the way
  // the state column would: the symbols setting and the month's baseline.
  window.StateColumn = {
    symbols: function () { return settings.symbols; },
    chart: function () { return settings.chart; },
    highlightParties: highlightParties,
    // What the chart has lit: the Reichstag entry's pick, else the open
    // party entry's party.
    highlighted: function () {
      var lit = highlighted || focusedParty(openEntryKey());
      return lit ? lit.slice() : null;
    },
    baseline: function () { return baseline ? baseline.values : null; }
  };
}());
