/*
 * Reichstag entry: the depth column's entry for the seat chart, opened by a
 * click on the chart in the state column (key "reichstag:seats"). It lists
 * the game's five named governments with their members, their seats against
 * the majority, and whether they clear it. Picking one lights its parties on
 * the chart (window.StateColumn.highlightParties) and shows below the list
 * what the game checks before that government can form. It ends with a link
 * to the game's Library charts, which the chart click used to open.
 *
 * The definitions come from the game's election scene (source/scenes/events/
 * election_1928.scene.dry: the coalition sums, each government's card). The
 * game counts vote shares against 50; the entry counts seats against the
 * house's majority, the numbers the chart and ledger show. The renderers are
 * pure functions of the qualities, exported for Node: coalitions,
 * requirements, renderReichstagEntry.
 *
 * Registers the 'reichstag' prefix with entries.js. Loaded as
 * window.DepthReichstagEntry in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  var haveRequire = typeof require === 'function';
  var api = factory(
    root.StateColumnModel || (haveRequire ? require('../state-column/model.js') : null),
    root.StateColumnView || (haveRequire ? require('../state-column/view.js') : null)
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DepthReichstagEntry = api;
    if (root.DepthColumn) api.install(root, root.DepthColumn);
  }
}(typeof self !== 'undefined' ? self : this, function (Model, View) {
  'use strict';

  var KEY = 'reichstag:seats';

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function num(v) {
    return Number(v) || 0;
  }

  // The five named governments, in the order the entry lists them. `name`
  // matches Model.GOVERNMENTS, so the one the SPD sits in is found by name.
  // Popular Front leaves BVP out: the game subtracts its 3 seats from Z's
  // sum (Q.popular_front_coalition, election_1928.scene.dry line 110), as it
  // does for the Weimar Coalition; the Grand Coalition keeps BVP.
  var COALITIONS = [
    { id: 'weimar', name: 'Weimar Coalition', parties: ['spd', 'ddp', 'z'] },
    { id: 'grand', name: 'Grand Coalition', parties: ['spd', 'ddp', 'z', 'bvp', 'dvp'] },
    { id: 'popular', name: 'Popular Front', parties: ['spd', 'kpd', 'sapd', 'z', 'ddp'] },
    { id: 'left', name: 'Left Front', parties: ['spd', 'kpd', 'sapd'] },
    { id: 'spd', name: 'SPD majority', parties: ['spd'] }
  ];

  function coalitionById(id) {
    for (var i = 0; i < COALITIONS.length; i++) {
      if (COALITIONS[i].id === id) return COALITIONS[i];
    }
    return null;
  }

  // The SAPD counts once it has split off (the game's card subtitles add it
  // "if sapd_formed"). The Weimar Coalition also counts its seats as
  // toleration while KPD relations are at 30 or more (line 119).
  function membersOf(c, q) {
    var out = c.parties.filter(function (id) {
      return id !== 'sapd' || !!q.sapd_formed;
    });
    if (c.id === 'weimar' && q.sapd_formed && num(q.kpd_relation) >= 30) out.push('sapd');
    // In seating order, as the chart and ledger have them.
    return Model.PARTIES.map(function (p) { return p.id; }).filter(function (id) { return out.indexOf(id) >= 0; });
  }

  // One row per named government: members, combined seats, the majority
  // line, whether it clears it, and whether the SPD sits in it now. counts
  // and house are the chart's (View.seatCounts), so a Polls chart gives
  // polling seats.
  function coalitions(q, counts, house) {
    var majority = Model.majority(house);
    var gov = Model.government(q);
    return COALITIONS.map(function (c) {
      var members = membersOf(c, q);
      var seats = members.reduce(function (sum, id) { return sum + (counts[id] || 0); }, 0);
      return {
        id: c.id,
        name: c.name,
        parties: members,
        seats: seats,
        majority: majority,
        clears: seats >= majority,
        current: !!gov && gov.name === c.name
      };
    });
  }

  // ---- What the game checks -------------------------------------------------

  // Relation thresholds read in the ledger's words as well as the number.
  function atLeast(label, threshold) {
    return label + ' relations at least ' + threshold + ' (' + Model.bandWord('relationships', threshold) + ')';
  }

  function rel(q, key) {
    return num(q[key]);
  }

  // Who leads the talks for a Grand Coalition (election_1928.scene.dry line
  // 958): the SPD when it is the largest party at the first election or holds
  // 30% or more, or under President Braun; otherwise the Center.
  function centreLeads(q) {
    if (q.president === 'Braun') return false;
    var n = num(q.n_elections);
    // The game sets largest_party at each election; before the first, the
    // shares say.
    var spdLargest = q.largest_party ? q.largest_party === 'SPD'
      : num(q.spd_r) >= num(q.kpd_r) && num(q.spd_r) >= num(q.nsdap_r);
    return (n > 1 && num(q.spd_r) < 30) || (n <= 1 && !spdLargest);
  }

  // The lines under a picked government: {text, met}, met being true (met),
  // false (unmet) or null (a note). Each cites the card that sets it in
  // source/scenes/events/election_1928.scene.dry.
  function requirements(id, q, row) {
    var list = [];
    var majority = { text: 'A majority of the seats: ' + row.seats + ' of ' + row.majority, met: row.clears };
    var ddp = Model.partyLabel(q, 'ddp');
    var conciliators = q.kpd_party_leader === 'Conciliators';
    var joos = q.z_party_leader === 'Joos';
    var kpdWilling = num(q.communist_coalition) >= 3;

    if (id === 'weimar') {
      // Card @weimar_coalition, view-if line 928; the sum, lines 102 and 119.
      list.push(majority);
      if (q.sapd_formed) {
        list.push({ text: 'SAPD seats count as toleration while KPD relations stay at 30 or more (' +
          Model.bandWord('relationships', 30) + ')', met: rel(q, 'kpd_relation') >= 30 });
      }
      list.push({ text: 'No relations minimum: the game checks only the majority', met: null });
    } else if (id === 'grand') {
      // Card @grand_coalition, lines 955 and 958; @grand_coalition_z_lead, 964.
      list.push(majority);
      list.push({ text: 'The Grand Coalition has not already broken down', met: !q.grand_coalition_failed });
      if (centreLeads(q)) {
        list.push({ text: 'The Center would lead: ' + atLeast('DVP', 30) + ', or the DVP refuses', met: rel(q, 'dvp_relation') >= 30 });
      } else {
        list.push({ text: 'The SPD would lead; DVP relations under 20 cost leverage', met: null });
      }
    } else if (id === 'popular') {
      // Card @popular_front_coalition, view-if line 340, choose-if line 341.
      list.push(majority);
      if (joos && conciliators) {
        list.push({ text: atLeast('KPD', 30) + ' and ' + atLeast('Z', 30) + ' (Joos and the Conciliators lead)',
          met: rel(q, 'kpd_relation') >= 30 && rel(q, 'z_relation') >= 30 });
      } else {
        list.push({ text: atLeast('KPD', conciliators ? 45 : 65), met: rel(q, 'kpd_relation') >= (conciliators ? 45 : 65) });
        var zNeed = joos ? 45 : (conciliators ? 55 : 65);
        list.push({ text: atLeast('Z', zNeed), met: rel(q, 'z_relation') >= zNeed });
        list.push({ text: atLeast(ddp, 50), met: rel(q, 'ddp_relation') >= 50 });
        list.push({ text: 'The KPD willing to join a government', met: kpdWilling });
        // @popular_front_resources, _democracy, _braun (lines 360 to 376).
        list.push({ text: 'And one of: 4 resources; KPD relations at least 60 with a willing KPD, or Conciliator leadership; President Braun\'s pressure',
          met: num(q.resources) >= 4 || (rel(q, 'kpd_relation') >= 60 && kpdWilling) || conciliators || q.president === 'Braun' });
      }
    } else if (id === 'left') {
      // Card @left_coalition, view-if line 459, choose-if line 460.
      list.push(majority);
      var need = conciliators ? 40 : 50;
      list.push({ text: atLeast('KPD', need), met: rel(q, 'kpd_relation') >= need });
      list.push({ text: 'The KPD willing to join a government', met: kpdWilling });
      // @left_coalition_resources, _relations, @thalmann_chancellor (lines 485 to 509).
      list.push({ text: 'And one of: 3 resources; KPD relations at least 60, or Conciliator leadership; Thälmann as chancellor, which needs President Braun',
        met: num(q.resources) >= 3 || rel(q, 'kpd_relation') >= 60 || conciliators });
    } else if (id === 'spd') {
      // Card @spd_majority, view-if line 739.
      list.push({ text: 'The SPD alone holds a majority: ' + row.seats + ' of ' + row.majority, met: row.clears });
      list.push({ text: 'No partners to negotiate with', met: null });
    }
    return list;
  }

  // ---- HTML ----------------------------------------------------------------

  function swatch(id) {
    var party = null;
    Model.PARTIES.forEach(function (p) { if (p.id === id) party = p; });
    return '<i class="rs-sw" style="background:' + (party ? party.color : '#a0a0a0') + '"></i>';
  }

  function memberList(q, ids) {
    return ids.map(function (id) {
      return '<span class="rs-mem">' + swatch(id) + escapeText(Model.partyLabel(q, id)) + '</span>';
    }).join('');
  }

  function rowHtml(q, row, picked) {
    var on = picked === row.id;
    var mark = row.clears ? '✓' : '✗';
    return '<button type="button" class="rs-row' + (on ? ' on' : '') + (row.current ? ' current' : '') +
      '" data-rs-coalition="' + row.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="rs-name">' + escapeText(row.name) +
      (row.current ? '<small class="rs-cur">current</small>' : '') + '</span>' +
      '<span class="rs-total ' + (row.clears ? 'ok' : 'no') + '" title="' +
      escapeAttr(row.seats + ' seats, ' + row.majority + ' needed') + '">' +
      row.seats + ' / ' + row.majority + ' <b>' + mark + '</b></span>' +
      '<span class="rs-members">' + memberList(q, row.parties) + '</span>' +
      '</button>';
  }

  // One partner's relation: the ledger's bar and word. BVP follows the Center
  // party's relation, as in the ledger.
  function partnerHtml(q, id) {
    var r = View.partnerRelation(q, id);
    if (!r) return '';
    return '<div class="rs-partner">' +
      '<span class="rs-pn">' + swatch(id) + escapeText(Model.partyLabel(q, id)) + '</span>' +
      '<span class="rs-rel"' + (id === 'bvp' ? ' title="Follows the Center Party"' : '') + '>' +
      View.relationBar(r.value, r.word) + '</span>' +
      '<span class="rs-word">' + escapeText(r.word) + '</span>' +
      '</div>';
  }

  function previewHtml(q, rows, picked) {
    var row = null;
    rows.forEach(function (r) { if (r.id === picked) row = r; });
    if (!row) return '<p class="rs-hint">Pick a coalition to preview it.</p>';
    var partners = row.parties.map(function (id) { return partnerHtml(q, id); }).join('');
    var reqs = requirements(row.id, q, row).map(function (r) {
      var mark = r.met === null ? '·' : (r.met ? '✓' : '✗');
      var cls = r.met === null ? 'note' : (r.met ? 'ok' : 'no');
      return '<li class="' + cls + '"><b>' + mark + '</b><span>' + escapeText(r.text) + '</span></li>';
    }).join('');
    return '<div class="rs-preview" data-rs-preview="' + row.id + '">' +
      '<div class="dc-sub">' + escapeText(row.name) + ': relations</div>' +
      (partners ? '<div class="rs-partners">' + partners + '</div>' : '<p class="rs-hint">The SPD governs alone.</p>') +
      '<div class="dc-sub">To form it</div>' +
      '<ul class="rs-req">' + reqs + '</ul>' +
      '</div>';
  }

  // Under the list, once this game has held an election: the way back to its
  // result (the election entry, election-entry.js).
  function lastElectionHtml(q) {
    if (!Array.isArray(q.election_records) || !q.election_records.length) return '';
    return '<p class="rs-last"><button type="button" class="rs-lastlink" data-depth-entry="election:latest">' +
      'Last election <span class="dc-arrow">→</span></button></p>';
  }

  // The entry's HTML. ctx: chart ('seats' or 'polls', the chart's current
  // source), picked (a coalition id or null).
  function renderReichstagEntry(q, ctx) {
    ctx = ctx || {};
    var sc = View.seatCounts(q, { chart: ctx.chart });
    var rows = coalitions(q, sc.counts, sc.house);
    var picked = coalitionById(ctx.picked) ? ctx.picked : null;
    var polls = sc.showToggle && ctx.chart === 'polls';
    return '<div class="dc-entry rs-entry" data-entry="' + KEY + '">' +
      '<p class="rs-house">' + sc.house + ' seats, ' + Model.majority(sc.house) + ' for a majority' +
      (polls ? ', by the polls' : '') + '</p>' +
      '<div class="rs-list">' + rows.map(function (r) { return rowHtml(q, r, picked); }).join('') + '</div>' +
      lastElectionHtml(q) +
      previewHtml(q, rows, picked) +
      '<p class="dc-entry-foot"><a href="#" data-rs-charts>Charts and statistics</a></p>' +
      '</div>';
  }

  // ---- Browser glue ----------------------------------------------------------

  function install(win, column) {
    if (!column.registerEntryKind) return;
    var doc = win.document;
    var picked = null;

    function state() {
      var sc = win.StateColumn || {};
      var q = column.ui().dendryEngine.state.qualities;
      return { q: q, chart: sc.chart ? sc.chart() : 'seats', sc: sc };
    }

    function open() {
      var v = column.view();
      return v.kind === 'entry' && v.key === KEY;
    }

    // Ends the pick and the chart's highlight.
    function clear() {
      if (picked === null) return;
      picked = null;
      if (win.StateColumn && win.StateColumn.highlightParties) win.StateColumn.highlightParties(null);
    }

    column.registerEntryKind('reichstag', function (id) {
      if (id !== 'seats') return null;
      var s = state();
      return renderReichstagEntry(s.q, { chart: s.chart, picked: picked });
    }, 'Reichstag');

    doc.addEventListener('click', function (e) {
      if (!e.target.closest) return;

      var link = e.target.closest('[data-rs-charts]');
      if (link) {
        e.preventDefault();
        win.showStats();
        return;
      }

      var row = e.target.closest('[data-rs-coalition]');
      if (!row) return;
      var id = row.getAttribute('data-rs-coalition');
      var s = state();
      var sc = View.seatCounts(s.q, { chart: s.chart });
      var found = coalitions(s.q, sc.counts, sc.house).filter(function (r) { return r.id === id; })[0];
      if (!found) return;
      picked = picked === id ? null : id;
      if (s.sc.highlightParties) s.sc.highlightParties(picked ? found.parties : null);
      // Same view, so no history entry: the column just redraws.
      column.show(column.view());
    });

    // Back, another entry or a strip pick ends the pick; so does a new page.
    doc.addEventListener('depthcolumn:view', function () {
      if (!open()) clear();
    });
    column.on('newPage', clear);
  }

  return {
    KEY: KEY,
    COALITIONS: COALITIONS,
    coalitions: coalitions,
    requirements: requirements,
    renderReichstagEntry: renderReichstagEntry,
    install: install
  };
}));
