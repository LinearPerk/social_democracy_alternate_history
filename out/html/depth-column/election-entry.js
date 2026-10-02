/*
 * Election entry: the depth column's view of an election's result (key
 * "election:latest"). It leads with the player's seats and their change, draws
 * the seat chart large, then the seats each party gained and lost, the result
 * rows beneath (the same block the results page uses, seats first), and a note
 * on how votes become seats. A click on a party's row or on its seats opens
 * that party's entry; Back returns here. Hovering or focusing a row lights
 * that party's seats and dims the rest.
 *
 * It takes the column when the results page arrives, once, and Back returns
 * to what it replaced. It stays reachable afterwards from the Reichstag
 * entry's "Last election" link. Between elections it shows the result as it
 * stood, read from the last item of election_records (the game pushes one
 * per election: a date and each party's share), with the change taken from
 * the old_<party>_r values that election left. It does not follow the polls.
 *
 * Under the rows come two more sections. "Coalitions" draws the Reichstag entry's
 * named governments as bars of their members' seats against the majority
 * line; a click on one lights its members on the large chart. "By group"
 * draws the Polls view's stacked bar for each of the six groups from the
 * record's group shares, and under it the largest gain and loss since the
 * election before (left out when that record has no group shares, as in a
 * first election or a save from before they were kept).
 *
 * The body is a list of sections (sections()). The renderers are pure
 * functions of the qualities, exported for Node: title, resultQualities,
 * coalitionRows, movement, sections, renderElectionEntry.
 * A first election, or a save with no old_ values, has no gains and losses
 * and a lead line without a change.
 *
 * Registers the 'election' prefix with entries.js. Loaded as
 * window.DepthElectionEntry in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  var haveRequire = typeof require === 'function';
  var api = factory(
    root.StateColumnModel || (haveRequire ? require('../state-column/model.js') : null),
    root.StateColumnView || (haveRequire ? require('../state-column/view.js') : null),
    root.ResultRows || (haveRequire ? require('../state-column/results.js') : null),
    root.DepthReichstagEntry || (haveRequire ? require('./reichstag-entry.js') : null),
    root.DepthReadouts || (haveRequire ? require('./readouts.js') : null)
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DepthElectionEntry = api;
    if (root.DepthColumn) api.install(root, root.DepthColumn);
  }
}(typeof self !== 'undefined' ? self : this, function (Model, View, ResultRows, Reichstag, Readouts) {
  'use strict';

  var KEY = 'election:latest';
  // The scene that shows the result, as the engine reports it.
  var RESULT_SCENE = 'election_1928.post_election_1928';
  // The seats fade in party by party, left to right, over about this long
  // (see election-entry.css); a redraw inside the window carries on from
  // where the fade had got to instead of starting over.
  var FADE_MS = 700;

  // ---- The record ---------------------------------------------------------

  function records(q) {
    return Array.isArray(q.election_records) ? q.election_records : [];
  }

  function lastRecord(q) {
    var list = records(q);
    return list.length ? list[list.length - 1] : null;
  }

  // The record's date as {year, month}. The game stores a Date, which a save
  // turns into text; both read the same here. Null when it can't be read.
  function whenOf(record) {
    var d = new Date(record.date);
    if (isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  function title(q) {
    var record = lastRecord(q);
    var when = record && whenOf(record);
    return when ? 'Reichstag election, ' + Model.MONTHS[when.month - 1] + ' ' + when.year : 'Reichstag election';
  }

  // The qualities as that election left them: its shares as the _r values and
  // its date as the year and month (so the house, list numbers and symbols
  // are that year's), over everything else the game holds now. old_<party>_r
  // stay as they are, since only an election writes them. The SAPD counts if
  // the record gave it votes, whether or not it has formed since. Null when
  // no election has been held.
  function resultQualities(q) {
    var record = lastRecord(q);
    if (!record) return null;
    var out = Object.assign({}, q);
    Model.PARTIES.forEach(function (p) {
      if (typeof record[p.id] === 'number') out[p.id + '_r'] = record[p.id];
    });
    if (record.sapd > 0) out.sapd_formed = 1;
    var when = whenOf(record);
    if (when) {
      out.year = when.year;
      out.month = when.month;
    }
    return out;
  }

  // ---- HTML ---------------------------------------------------------------

  var ALL_PARTIES = Model.PARTIES.map(function (p) { return p.id; });

  // The dashboard's drawing at the column's width. No government exists yet
  // when the result arrives, so every party counts as marked and none dims.
  function seatsOf(rq) {
    var house = Model.houseAt(rq.year, rq.month);
    return { house: house, counts: Model.allocateSeats(Model.seatShares(rq, 'seats'), house) };
  }

  // picked: a coalition row, whose members the drawing lights.
  function hemicycleHtml(rq, picked) {
    var sc = seatsOf(rq);
    return '<div class="el-hemi" data-el-house="' + sc.house + '" role="img" aria-label="' +
      sc.house + ' seats, ' + Model.majority(sc.house) + ' for a majority">' +
      View.hemicycle(rq, sc.counts, sc.house, ALL_PARTIES, picked && picked.parties) + '</div>';
  }

  function rowsHtml(rq, symbols) {
    return ResultRows.html(ResultRows.reichstag(rq), { q: rq, symbols: symbols, size: 'full', seats: true });
  }

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function partyColor(id) {
    var found = Model.PARTIES.filter(function (p) { return p.id === id; })[0];
    return found ? found.color : '#a0a0a0';
  }

  // ---- Seats gained and lost ----------------------------------------------

  function seatsWord(n) {
    return n + (n === 1 ? ' seat' : ' seats');
  }

  // The player's party, its seats and what they changed by, in the good or
  // bad colour when they moved.
  function leadHtml(rq, symbols) {
    var mine = ResultRows.partySeats(rq, 'spd');
    var cls = mine.change > 0 ? ' good' : (mine.change < 0 ? ' bad' : ' same');
    var text = escapeText(Model.partyLabel(rq, 'spd')) + ' · ' + seatsWord(mine.seats);
    if (mine.change !== null) {
      text += ' · ' + (mine.change > 0 ? '▲ ' + mine.change : (mine.change < 0 ? '▼ ' + -mine.change : '—'));
    }
    return '<div class="el-lead' + (mine.change === null ? ' same' : cls) + '">' +
      '<span class="el-lead-badge">' + View.badge(rq, 'spd', 'big', { symbols: symbols }) + '</span>' +
      '<span class="el-lead-text">' + text + '</span></div>';
  }

  function signed(n) {
    return n > 0 ? '+' + n : (n < 0 ? '−' + -n : '0');
  }

  // One diverging bar from the centre line: gains to the right, losses to the
  // left, the largest change filling half the track. The number sits at the
  // bar's end, in the margin the track leaves on each side.
  function gainRowHtml(item, top) {
    var width = top ? Math.round(Math.abs(item.change) / top * 500) / 10 : 0;
    var reach = 50 + width;
    var bar = '';
    var num;
    if (item.change > 0) {
      bar = '<span class="el-gl-fill up" style="left:50%;width:' + width + '%;background:' + partyColor(item.id) + '"></span>';
      num = 'left:calc(' + reach + '% + 3px)';
    } else if (item.change < 0) {
      bar = '<span class="el-gl-fill down" style="right:50%;width:' + width + '%;background:' + partyColor(item.id) + '"></span>';
      num = 'right:calc(' + reach + '% + 3px)';
    } else {
      num = 'left:calc(50% + 3px)';
    }
    return '<button type="button" class="el-gl-row" data-depth-entry="party:' + item.id + '"' +
      ' title="' + escapeAttr(item.label + ': ' + item.prevSeats + ' to ' + item.seats + ' seats') + '">' +
      '<span class="el-gl-name">' + escapeText(item.label) + '</span>' +
      '<span class="el-gl-track"><i class="el-gl-axis"></i>' + bar +
      '<span class="el-gl-num" style="' + num + '">' + signed(item.change) + '</span></span></button>';
  }

  // Empty when there is no previous result to compare with.
  function gainsHtml(rq) {
    var move = ResultRows.seatMovement(rq);
    if (!move) return '';
    var top = Math.max.apply(null, move.items.map(function (i) { return Math.abs(i.change); }).concat(0));
    return '<div class="el-gl"><div class="dc-sub">Gains and losses</div>' +
      move.items.map(function (i) { return gainRowHtml(i, top); }).join('') + '</div>';
  }

  // ---- Coalitions ---------------------------------------------------------

  // The Reichstag entry's governments counted on the result's seats: the
  // ones with a majority first, then the larger first (ties keep the
  // Reichstag entry's order).
  function coalitionRows(rq) {
    var sc = seatsOf(rq);
    return Reichstag.coalitions(rq, sc.counts, sc.house).map(function (r, i) {
      r.order = i;
      return r;
    }).sort(function (a, b) {
      return (b.clears - a.clears) || (b.seats - a.seats) || (a.order - b.order);
    });
  }

  // One bar: the members' seats stacked in party colours on the house's
  // scale, so the bars compare, with a tick where the majority falls.
  function coalitionHtml(rq, row, sc, picked) {
    var on = !!picked && picked.id === row.id;
    var segs = row.parties.map(function (id) {
      var n = sc.counts[id] || 0;
      return n ? '<span class="el-co-seg" style="width:' + (n / sc.house * 100) + '%;background:' + partyColor(id) +
        '" title="' + escapeAttr(Model.partyLabel(rq, id) + ': ' + n + ' seats') + '"></span>' : '';
    }).join('');
    var word = row.clears ? 'majority' : 'short by ' + (row.majority - row.seats);
    return '<button type="button" class="el-co' + (row.clears ? ' ok' : '') + (on ? ' on' : '') +
      '" data-el-coalition="' + row.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="el-co-head"><span class="el-co-name">' + escapeText(row.name) + '</span>' +
      '<span class="el-co-total"><b>' + row.seats + '</b> <span class="el-co-word">' + word + '</span></span></span>' +
      '<span class="el-co-bar">' + segs +
      '<i class="el-co-tick" style="left:' + (row.majority / sc.house * 100) + '%"></i></span>' +
      '</button>';
  }

  function coalitionsHtml(rq, picked) {
    var sc = seatsOf(rq);
    return '<div class="el-coalitions"><div class="dc-sub">Coalitions</div>' +
      coalitionRows(rq).map(function (r) { return coalitionHtml(rq, r, sc, picked); }).join('') +
      '</div>';
  }

  // ---- By group -----------------------------------------------------------

  function groupsOfRecord(record) {
    return record && record.groups && typeof record.groups === 'object' ? record.groups : null;
  }

  // The qualities a group's bar reads: the record's shares laid over the
  // game's own as the _display numbers the Polls bar prefers. A record
  // without group shares leaves the game's current ones.
  function groupQualities(rq, record) {
    var groups = groupsOfRecord(record);
    if (!groups) return rq;
    var out = Object.assign({}, rq);
    Readouts.POLL_GROUPS.forEach(function (g) {
      var shares = groups[g[0]] || {};
      Readouts.pollParties(rq).forEach(function (p) {
        out[g[0] + '_' + p.id + '_display'] = Number(shares[p.id]) || 0;
      });
    });
    return out;
  }

  // A group's largest gain and largest loss since the election before, in
  // points of that group's vote, rounded; a move under a point counts as
  // none. Null when either record lacks group shares.
  function movement(q, group) {
    var list = records(q);
    var now = list.length ? groupsOfRecord(list[list.length - 1]) : null;
    var before = list.length > 1 ? groupsOfRecord(list[list.length - 2]) : null;
    if (!now || !before) return null;
    var gain = null;
    var loss = null;
    Readouts.pollParties(resultQualities(q)).forEach(function (p) {
      var delta = (Number((now[group] || {})[p.id]) || 0) - (Number((before[group] || {})[p.id]) || 0);
      if (Math.abs(delta) < 1) return;
      if (delta > 0 && (!gain || delta > gain.delta)) gain = { id: p.id, delta: delta };
      if (delta < 0 && (!loss || delta < loss.delta)) loss = { id: p.id, delta: delta };
    });
    function point(m) {
      return m && { id: m.id, points: Math.round(Math.abs(m.delta)) };
    }
    return { gain: point(gain), loss: point(loss) };
  }

  function moveHtml(rq, move) {
    if (!move) return '';
    var parts = [];
    if (move.gain) parts.push('<span class="el-up">' + escapeText(Model.partyLabel(rq, move.gain.id)) + ' ▲ ' + move.gain.points + '</span>');
    if (move.loss) parts.push('<span class="el-down">' + escapeText(Model.partyLabel(rq, move.loss.id)) + ' ▼ ' + move.loss.points + '</span>');
    return '<div class="el-move">' + (parts.length ? parts.join(' · ') : 'no change') + '</div>';
  }

  function groupsHtml(q, rq) {
    var gq = groupQualities(rq, lastRecord(q));
    return '<div class="el-groups"><div class="dc-sub">By group</div>' +
      Readouts.POLL_GROUPS.map(function (g) {
        return '<div class="el-group">' + Readouts.pollGroupBar(gq, g[0], g[1]) + moveHtml(rq, movement(q, g[0])) + '</div>';
      }).join('') + '</div>';
  }

  function noteHtml() {
    return '<p class="el-note">Seats follow votes: one for every 60,000.</p>';
  }

  // The body's parts in order, each an HTML string; empty before the first
  // election. ctx.picked is a coalition id whose members the chart lights.
  function sections(q, ctx) {
    ctx = ctx || {};
    var rq = resultQualities(q);
    if (!rq) return [];
    var picked = coalitionRows(rq).filter(function (r) { return r.id === ctx.picked; })[0] || null;
    return [leadHtml(rq, ctx.symbols), hemicycleHtml(rq, picked), gainsHtml(rq), rowsHtml(rq, ctx.symbols),
      coalitionsHtml(rq, picked), groupsHtml(q, rq)].filter(Boolean);
  }

  // The entry's HTML. ctx: symbols ('period' draws the party logos), elapsed
  // (ms since the result arrived, while the seats are still fading in),
  // picked (a coalition id).
  function renderElectionEntry(q, ctx) {
    ctx = ctx || {};
    var list = sections(q, ctx);
    var entering = typeof ctx.elapsed === 'number' && ctx.elapsed < FADE_MS;
    var body = list.length
      ? list.join('') + noteHtml()
      : '<p>No Reichstag election has been held in this game yet.</p>';
    return '<div class="dc-entry el-entry' + (entering ? ' el-enter' : '') + '" data-entry="' + KEY + '"' +
      (entering ? ' style="--el-elapsed:' + Math.round(ctx.elapsed) + 'ms"' : '') + '>' + body + '</div>';
  }

  // ---- Browser glue -------------------------------------------------------

  function install(win, column) {
    if (!column.registerEntryKind) return;
    var doc = win.document;
    var claimed = false;   // this page has already opened the view
    var claimedAt = 0;
    var picked = null;     // the coalition whose members the chart lights

    function qualities() {
      return column.ui().dendryEngine.state.qualities;
    }

    function symbols() {
      return win.StateColumn && win.StateColumn.symbols ? win.StateColumn.symbols() : undefined;
    }

    column.registerEntryKind('election', function (id) {
      if (id !== 'latest') return null;
      var elapsed = claimedAt ? Date.now() - claimedAt : undefined;
      return renderElectionEntry(qualities(), { symbols: symbols(), elapsed: elapsed, picked: picked });
    }, function () {
      return title(qualities());
    });

    // The result has landed: take the column. Registered after page depth, so
    // if that claimed the page too, this view is the one left showing.
    column.on('newPage', function () {
      claimed = false;
      claimedAt = 0;
      picked = null;
    });
    column.on('content', function () {
      if (claimed) return;
      var engine = column.ui().dendryEngine;
      if (!engine.state || engine.state.sceneId !== RESULT_SCENE) return;
      claimed = true;
      claimedAt = Date.now();
      column.show({ kind: 'entry', key: KEY, title: title(qualities()) });
    });

    // ---- Parties: a click opens the entry; hover or focus lights the seats

    function open() {
      var v = column.view();
      return v.kind === 'entry' && v.key === KEY;
    }

    // The party a row or a seat group names, or null.
    function partyOf(target) {
      if (!open() || !target || !target.closest) return null;
      var row = target.closest('.el-entry .rr-row[data-depth-entry], .el-entry .el-gl-row[data-depth-entry]');
      if (row) return row.getAttribute('data-depth-entry').replace(/^party:/, '');
      var seats = target.closest('.el-entry [data-sc-seats]');
      return seats ? seats.getAttribute('data-sc-seats') : null;
    }

    // Lights some parties' seats and dims the rest, or clears the light. Done
    // on the drawing in place (View.hemicycle's own classes and centre), so
    // the element under the pointer is never replaced. The centre reads the
    // party, or "coalition" for several, as the dashboard's chart does.
    function lightParties(ids) {
      var box = doc.querySelector('#depth_column .el-hemi');
      if (!box) return;
      var svg = box.querySelector('.sc-hemi');
      var on = ids && ids.length ? ids : null;
      var seatCount = 0;
      Array.prototype.forEach.call(svg.querySelectorAll('.sc-party-seats'), function (g) {
        var lit = !!on && on.indexOf(g.getAttribute('data-sc-seats')) >= 0;
        g.classList.toggle('lit', lit);
        g.classList.toggle('dim', !!on && !lit);
        if (lit) seatCount += g.querySelectorAll('circle').length;
      });
      svg.classList.toggle('sc-lit', !!on);
      var label = svg.querySelector('.sc-houselbl:not(.sc-majlbl)');
      var number = svg.querySelector('.sc-housenum');
      if (label) label.textContent = on ? (on.length > 1 ? 'coalition' : Model.partyLabel(qualities(), on[0])) : 'seats';
      if (number) number.textContent = on ? seatCount : box.getAttribute('data-el-house');
    }

    function pickedRow() {
      if (!picked) return null;
      return coalitionRows(resultQualities(qualities())).filter(function (r) { return r.id === picked; })[0] || null;
    }

    // One party's light (a row or seats under the pointer); with none, the
    // picked coalition's if there is one, else no light.
    function light(id) {
      if (id) return lightParties([id]);
      var row = pickedRow();
      lightParties(row && row.parties);
    }

    doc.addEventListener('mouseover', function (e) {
      if (open()) light(partyOf(e.target));
    });
    doc.addEventListener('mouseout', function (e) {
      if (open() && !e.relatedTarget) light(null);
    });
    doc.addEventListener('focusin', function (e) {
      if (open()) light(partyOf(e.target));
    });
    doc.addEventListener('focusout', function () {
      if (open()) light(null);
    });

    // A click on a coalition's bar picks it; a second click lets go. The view
    // redraws with the pick (as the Reichstag entry does), in the same history
    // step.
    doc.addEventListener('click', function (e) {
      if (!open() || !e.target.closest) return;
      var bar = e.target.closest('.el-entry [data-el-coalition]');
      if (!bar) return;
      var id = bar.getAttribute('data-el-coalition');
      picked = picked === id ? null : id;
      column.show(column.view());
    });

    // Seats are not rows, so entries.js never sees a click on them: this opens
    // the party's entry, headed as entries.js heads it for a row. Captured, so
    // the click stops here.
    doc.addEventListener('click', function (e) {
      if (!open() || !e.target.closest) return;
      var seats = e.target.closest('.el-entry [data-sc-seats]');
      if (!seats) return;
      var key = 'party:' + seats.getAttribute('data-sc-seats');
      e.preventDefault();
      e.stopPropagation();
      light(null);
      column.show({ kind: 'entry', key: key, title: column.entryTitle(key, '') });
    }, true);

    // Leaving the view ends the pick.
    doc.addEventListener('depthcolumn:view', function () {
      if (!open()) picked = null;
    });
  }

  return {
    KEY: KEY,
    RESULT_SCENE: RESULT_SCENE,
    title: title,
    resultQualities: resultQualities,
    coalitionRows: coalitionRows,
    movement: movement,
    sections: sections,
    renderElectionEntry: renderElectionEntry,
    install: install
  };
}));
