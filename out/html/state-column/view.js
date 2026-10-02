/*
 * State column view: pure functions returning HTML strings. Loaded as
 * window.StateColumnView in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    root.StateColumnView = factory(root.StateColumnModel);
  }
}(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  var partyById = {};
  Model.PARTIES.forEach(function (p) { partyById[p.id] = p; });

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  // The neutral badge: a square in the party colour with its list number
  // (or a middle dot when it has none). Dark text for light backgrounds.
  function plainBadge(party, list, sizeClass, title) {
    var textColor = party.lightBg ? '#222' : '#fff';
    return '<span class="sc-badge' + sizeClass + '" title="' + title + '"' +
      ' style="background:' + party.color + ';color:' + textColor + '">' +
      (list ? list : '·') + '</span>';
  }

  // A party's badge: its period symbol when opts.symbols is 'period' and one
  // exists for the in-game date, otherwise the neutral colour-and-number
  // badge. size is 'small' (16px, the default) or 'big' (26px). The symbol
  // markup carries a data-fallback attribute holding the plain badge, so
  // state-column.js can swap it in if the image fails to load, with no
  // model lookups of its own.
  function badge(q, id, size, opts) {
    opts = opts || {};
    var party = partyById[id];
    if (!party) {
      return '';
    }
    var sizeClass = size === 'big' ? ' big' : '';
    var list = Model.listNumber(id, q.year, q.month);
    var title = Model.partyGerman(q, id) + ' (' + party.en + ')' + (list ? ' · Liste ' + list : '');
    var plain = plainBadge(party, list, sizeClass, title);
    if (opts.symbols === 'period') {
      var sym = Model.symbolFile(id, q.year, q.month);
      if (sym) {
        return '<span class="sc-badge sc-sym' + sizeClass + '" title="' + title + '"' +
          ' data-fallback="' + escapeAttr(plain) + '">' +
          '<img src="state-column/symbols/' + sym + '" alt="">' +
          '</span>';
      }
    }
    return plain;
  }

  // Tab key, default label. Order is the tab bar's left-to-right order.
  var TABS = [
    ['party', 'Party'],
    ['defense', 'Defense'],
    ['state', 'State']
  ];

  // The qualities each tab shows, as a function of the game's state (a row
  // that isn't drawn, like the budget in opposition, isn't listed). A change in one of these since the
  // month began (or since the player last had the tab open) puts a dot on
  // the tab while it is shut. Keep each list in step with what its tab
  // renders: a test reads the qualities the tab's markup asks for and holds
  // them against the list.
  var TAB_QUALITIES = {
    // Party resources and each faction's strength and dissent. (The party's
    // overall dissent, dissent_percent, isn't drawn on the tab.)
    party: function (q) {
      var keys = ['resources'];
      SPD_FACTIONS.forEach(function (f) {
        if (f.id === 'neorevisionist' && !(q.neorevisionism > 0)) {
          return;
        }
        keys.push(f.id + '_strength', f.id + '_dissent');
      });
      return keys.concat(coalitionKeys(q));
    },
    // Each organisation's size, and its militancy (the paramilitaries) or
    // loyalty (the state forces).
    defense: function (q) {
      var keys = [];
      defenseOrgsShown(q).forEach(function (o) {
        keys.push(o.id + '_strength', o.id + '_' + (o.kind === 'paramilitary' ? 'militancy' : 'loyalty'));
      });
      return keys;
    },
    // The economic readout and the coalition dissents.
    state: function (q) {
      var keys = ['inflation', 'economic_growth', 'unemployed'];
      if (q.spd_in_government) {
        keys.push('budget');
      }
      return keys.concat(coalitionKeys(q));
    }
  };

  // Tab panels register themselves here, keyed by tab key (party, defense,
  // state). Polls used to be a tab; it lives in the depth column now.
  // TAB_RENDERERS fills a tab's body and TAB_LABELS overrides its button
  // label. Empty here; the tab sections below fill them in.
  var TAB_RENDERERS = {};
  var TAB_LABELS = {};

  // Dispatches to the registered renderer for tab, or '' when none is
  // registered yet.
  function renderTab(tab, q, base, opts) {
    var fn = TAB_RENDERERS[tab];
    return typeof fn === 'function' ? fn(q, base, opts) : '';
  }

  function num(v) {
    return (typeof v === 'number' && !isNaN(v)) ? v : parseFloat(v) || 0;
  }

  // The keys whose value in q differs from ref (a snapshot of qualities).
  function changedKeys(keys, q, ref) {
    return keys.filter(function (k) { return num(q[k]) !== num(ref[k]); });
  }

  // Row feedback for the open tab: the class that runs a short background
  // flash when a quality the row shows changed between the previous render
  // and this one (opts.last is that render's qualities; it's null on a
  // page's first render, after a tab switch and after a load, so nothing
  // flashes then).
  function flash(q, opts, keys) {
    return opts && opts.last && changedKeys(keys, q, opts.last).length ? ' sc-flash' : '';
  }

  // Change marker for one quality, comparing q[key] against the month's
  // baseline (base[key]). spec = {scale, big, polarity}: scale is an
  // optional band name (Model.BANDS) used to detect a crossed band; big is
  // the absolute change that counts as large; polarity is 1 (up is good),
  // -1 (up is bad) or 0 (neutral). last, when given, is the previous
  // render's qualities, used to pulse only the change just made.
  function delta(q, base, key, spec, last) {
    spec = spec || {};
    var a = num(base[key]);
    var b = num(q[key]);
    if (a === b) {
      return '';
    }
    var up = b > a;
    var change = Math.abs(b - a);
    var large = typeof spec.big === 'number' && change >= spec.big;
    var scale = spec.scale;
    var crossed = !!scale && Model.bandIndex(scale, a) !== Model.bandIndex(scale, b);
    var polarity = spec.polarity || 0;
    var direction = polarity === 0 ? 'neutral' : (((up ? 1 : -1) * polarity > 0) ? 'good' : 'bad');
    var pulsed = !!last && num(last[key]) !== b;
    var arrow = (up ? '▲' : '▼') + (large ? (up ? '▲' : '▼') : '');
    var title = 'Changed this month' +
      (crossed ? ': ' + Model.bandWord(scale, a) + ' → ' + Model.bandWord(scale, b) : '');
    var cls = 'sc-delta ' + direction + (crossed ? ' cross' : '') + (pulsed ? ' pulse' : '');
    return '<span class="' + cls + '" title="' + title + '">' + arrow + '</span>';
  }

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  // Seat positions for a hemicycle of `house` seats: rows chosen so seat
  // spacing along the outer row matches the spacing between rows (inner
  // radius 0.42), each row given seats in proportion to its radius, then
  // every seat ordered left to right (ties inner-first).
  var SC_INNER = 0.42;

  function hemicycleLayout(house) {
    var bestRows = 2;
    var bestDiff = Infinity;
    for (var r = 2; r < 30; r++) {
      var sum = 0;
      for (var i = 0; i < r; i++) {
        sum += SC_INNER + i * (1 - SC_INNER) / (r - 1);
      }
      var diff = Math.abs(Math.PI * sum / house - (1 - SC_INNER) / (r - 1));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestRows = r;
      }
    }
    var rows = bestRows;
    var radii = [];
    var radiiSum = 0;
    for (var j = 0; j < rows; j++) {
      var radius = SC_INNER + j * (1 - SC_INNER) / (rows - 1);
      radii.push(radius);
      radiiSum += radius;
    }
    var perRow = radii.map(function (radius) {
      return Math.round(house * radius / radiiSum);
    });
    var assigned = perRow.reduce(function (a, b) { return a + b; }, 0);
    perRow[rows - 1] += house - assigned;
    var seats = [];
    radii.forEach(function (radius, ri) {
      var n = perRow[ri];
      for (var k = 0; k < n; k++) {
        var angle = n === 1 ? Math.PI / 2 : Math.PI * (1 - k / (n - 1));
        seats.push({ angle: angle, radius: radius });
      }
    });
    seats.sort(function (a, b) {
      if (b.angle !== a.angle) {
        return b.angle - a.angle;
      }
      return a.radius - b.radius;
    });
    return { seats: seats, rows: rows };
  }

  // The drawing is seven eighths of the column wide (.sc-hemi in the CSS sets
  // the width), so the chart stands an eighth shorter. The viewBox shrinks with
  // it, so a unit is still about one pixel and the centre label keeps its type.
  var SC_HEMI_W = 262.5;
  var SC_HEMI_H = SC_HEMI_W / 2 + 6;
  var SC_HEMI_CX = SC_HEMI_W / 2;
  var SC_HEMI_CY = SC_HEMI_W / 2;
  var SC_HEMI_SCALE = SC_HEMI_W / 2 - 4;

  // The party ids a highlight names, or null for none: only known parties,
  // once each. An empty list, or anything that isn't a list, clears it.
  function highlightIds(ids) {
    if (!Array.isArray(ids)) {
      return null;
    }
    var out = [];
    ids.forEach(function (id) {
      if (partyById[id] && out.indexOf(id) < 0) {
        out.push(id);
      }
    });
    return out.length ? out : null;
  }

  // Each party's dots sit in one group (data-sc-seats), so a highlight is a
  // class on the group: "lit" for the parties named, "dim" for the rest, and
  // the centre reads their seats against the majority (under `name`, for a
  // single party's focus, or "coalition"). Without a highlight
  // the government's parties are marked instead, by dimming the other dots
  // one by one. `bare` leaves the majority line out of the centre: the
  // dashboard's government line already gives the figure.
  function hemicycle(q, counts, house, marked, highlight, name, bare) {
    var layout = hemicycleLayout(house);
    var dot = Math.max(1, SC_INNER * SC_HEMI_SCALE * (1 - SC_INNER) / (layout.rows - 1));
    var lit = highlightIds(highlight);
    var litSeats = 0;
    var svg = '';
    var idx = 0;
    Model.PARTIES.forEach(function (p) {
      var n = counts[p.id] || 0;
      var dim = marked.indexOf(p.id) < 0;
      var title = escapeText(Model.partyLabel(q, p.id)) + ': ' + n + ' seats';
      var circles = '';
      for (var i = 0; i < n; i++, idx++) {
        var seat = layout.seats[idx];
        var x = (SC_HEMI_CX + SC_HEMI_SCALE * seat.radius * Math.cos(seat.angle)).toFixed(1);
        var y = (SC_HEMI_CY - SC_HEMI_SCALE * seat.radius * Math.sin(seat.angle)).toFixed(1);
        circles += '<circle cx="' + x + '" cy="' + y + '" r="' + dot.toFixed(2) + '" fill="' + p.color + '"' +
          (!lit && dim ? ' opacity="0.28"' : '') + '><title>' + title + '</title></circle>';
      }
      var state = '';
      if (lit) {
        var on = lit.indexOf(p.id) >= 0;
        state = on ? ' lit' : ' dim';
        litSeats += on ? n : 0;
      }
      svg += '<g class="sc-party-seats' + state + '" data-sc-seats="' + p.id + '">' + circles + '</g>';
    });
    svg += '<line x1="' + SC_HEMI_CX + '" y1="' + (SC_HEMI_CY - SC_HEMI_SCALE * 1.02) + '" x2="' + SC_HEMI_CX +
      '" y2="' + (SC_HEMI_CY - SC_HEMI_SCALE * SC_INNER * 0.9) + '" class="sc-majline"/>';
    // Three lines stacked in the hollow centre: label, total, majority. The
    // last line's box reaches about 4 units under its baseline, so the stack
    // sits 4 units above the arc's baseline: that leaves more than 6 units
    // between the box and the drawing's bottom edge. The top line stays clear
    // of the majority line's lower end. A bare centre has the first two lines
    // only, moved down into the room the third leaves.
    var drop = bare ? 10 : 0;
    svg += '<text x="' + SC_HEMI_CX + '" y="' + (SC_HEMI_CY - 40 + drop) + '" class="sc-houselbl">' + (lit ? escapeText(name || 'coalition') : 'seats') + '</text>';
    svg += '<text x="' + SC_HEMI_CX + '" y="' + (SC_HEMI_CY - 18 + drop) + '" class="sc-housenum">' + (lit ? litSeats : house) + '</text>';
    if (!bare) {
      svg += '<text x="' + SC_HEMI_CX + '" y="' + (SC_HEMI_CY - 4) + '" class="sc-houselbl sc-majlbl">' +
        Model.majority(house) + ' for majority</text>';
    }
    return '<svg class="sc-hemi' + (lit ? ' sc-lit' : '') + '" viewBox="0 0 ' + SC_HEMI_W + ' ' + SC_HEMI_H + '" width="100%">' + svg + '</svg>';
  }

  function chartToggle(current) {
    var cur = current === 'polls' ? 'polls' : 'seats';
    return '<div class="sc-seg small" data-sc-chart-toggle>' +
      '<button type="button" class="' + (cur === 'seats' ? 'on' : '') + '" data-sc-chart-source="seats">Seats</button>' +
      '<button type="button" class="' + (cur === 'polls' ? 'on' : '') + '" data-sc-chart-source="polls">Polls</button>' +
      '</div>';
  }

  // The party matching chancellor_party, case-insensitively, to a party id
  // or abbreviation (the game writes "Z" for the Zentrum). null when
  // nothing matches, so no badge is shown.
  function chancellorPartyId(cp) {
    if (!cp) {
      return null;
    }
    var lower = String(cp).toLowerCase();
    for (var i = 0; i < Model.PARTIES.length; i++) {
      var p = Model.PARTIES[i];
      if (p.id.toLowerCase() === lower || p.abbr.toLowerCase() === lower) {
        return p.id;
      }
    }
    return null;
  }

  function govBar(q, counts, house, opts) {
    var gov = Model.government(q);
    var marked = Model.markedParties(q);
    var maj = Model.majority(house);
    var markedSeats = marked.reduce(function (sum, id) { return sum + (counts[id] || 0); }, 0);
    var pos = Model.spdPosition(q);
    var chancellor = q.chancellor ? String(q.chancellor) : '';
    // The cabinet part after the position word: the coalition when one
    // governs, otherwise the chancellor's cabinet. A bare "Government" (no
    // named coalition) adds nothing. namesChancellor is true when that part
    // carries the chancellor's name, which is where his party badge goes.
    var cabinet = '';
    var namesChancellor = false;
    if (pos === 'Government' && gov) {
      cabinet = gov.name === 'Government' ? '' : gov.name;
    } else if (pos === 'Caretaker') {
      namesChancellor = !gov && !!chancellor;
      cabinet = gov ? gov.name : (chancellor ? chancellor + ' cabinet' : '');
    } else if (chancellor) {
      namesChancellor = true;
      cabinet = chancellor + ' cabinet';
    }
    var partyId = chancellorPartyId(q.chancellor_party);
    var chBadge = partyId ? badge(q, partyId, 'small', opts) : '';
    var ok = markedSeats >= maj;
    var fraction = markedSeats + ' / ' + maj + (gov ? (ok ? ' ✓' : ' short') : '');
    var fractionClass = gov ? (ok ? ' class="ok"' : ' class="short"') : '';
    return '<div class="sc-govbar">' +
      '<div class="sc-govlbl"><b><span class="pos">' + term(pos.toLowerCase(), pos) + '</span>' +
      (cabinet ? '<span class="cab"> · ' + (namesChancellor ? chBadge : '') + escapeText(cabinet) + '</span>' : '') + '</b>' +
      '<span' + fractionClass + '>' + fraction + '</span></div>' +
      officials(q, namesChancellor, chBadge) +
      '</div>';
  }

  // The line under the government bar: the chancellor with his
  // party's badge when the line above doesn't already name him (a coalition
  // label names no one), then the president, then the election countdown at
  // the right end.
  function officials(q, namesChancellor, chBadge) {
    var parts = [];
    var chars = 0;
    if (!namesChancellor && q.chancellor) {
      parts.push('<span title="Chancellor">Reichskanzler ' + chBadge + '<b>' + escapeText(q.chancellor) + '</b></span>');
      chars += ('Reichskanzler ' + q.chancellor).length;
    }
    if (q.president) {
      parts.push('<span title="President">Reichspräsident <b>' + escapeText(q.president) + '</b></span>');
      chars += ('Reichspräsident ' + q.president).length + (parts.length > 1 ? 3 : 0);
    }
    var cd = countdown(q, parts.length ? chars : 0);
    if (!parts.length && !cd) {
      return '';
    }
    return '<div class="sc-officials">' +
      (parts.length ? '<span class="who">' + parts.join('<span class="sep"> · </span>') + '</span>' : '') +
      cd + '</div>';
  }

  // Pixel estimates for what shares the officials line at 21rem (the column is
  // about 320px wide): 13px names run about 5.9px a character, the 12px
  // countdown about 4.9 (5.1 in its short form), with a gap between. Measured
  // in the browser; the CSS lets the countdown wrap to its own line if an
  // estimate is ever low.
  var OFFICIALS_LINE_PX = 318;
  var OFFICIALS_GAP_PX = 10;
  var OFFICIALS_CHAR_PX = 5.9;
  var COUNTDOWN_CHAR_PX = 4.9;
  var COUNTDOWN_SHORT_CHAR_PX = 5.1;

  // "Election in 4 months · May 1928", at the right end of the officials
  // line. When the names leave too little room it shortens to "Election ·
  // May 1928" with the months in a title. When even that won't fit (the line
  // that names a chancellor too) it takes a line of its own, in full.
  // whoChars is the length of the names beside it, 0 when there are none.
  function countdown(q, whoChars) {
    var months = Model.monthsUntil(q);
    if (months === null) {
      return '';
    }
    var label = months === 1 ? '1 month' : months + ' months';
    var monthName = Model.MONTHS[(Number(q.next_election_month) || 1) - 1] || '';
    var when = monthName + ' ' + q.next_election_year;
    var room = OFFICIALS_LINE_PX - OFFICIALS_GAP_PX - whoChars * OFFICIALS_CHAR_PX;
    var fullChars = ('Election in ' + label + ' · ' + when).length;
    var shortChars = ('Election · ' + when).length;
    if (whoChars && fullChars * COUNTDOWN_CHAR_PX > room) {
      if (shortChars * COUNTDOWN_SHORT_CHAR_PX <= room) {
        return '<span class="sc-countdown" title="Election in ' + label + '">Election<small> · ' + when + '</small></span>';
      }
      return '<span class="sc-countdown own">Election in <b>' + label + '</b><small> · ' + when + '</small></span>';
    }
    return '<span class="sc-countdown">Election in <b>' + label + '</b><small> · ' + when + '</small></span>';
  }

  // *_votes qualities don't exist until post_event first runs at the end
  // of month one, so polls shares are all 0 for a fresh game. Treat that
  // like historical mode: seats only, no toggle, until polls exist.
  function pollsAvailable(q) {
    var shares = Model.seatShares(q, 'polls');
    var total = 0;
    for (var id in shares) {
      if (Object.prototype.hasOwnProperty.call(shares, id)) {
        total += shares[id];
      }
    }
    return total > 0;
  }

  // The seat source and counts the chart and the ledger must agree on:
  // seats, unless the toggle is set to polls and poll data exists, and
  // never polls in historical mode.
  function seatCounts(q, opts) {
    opts = opts || {};
    var showToggle = !q.historical_mode && pollsAvailable(q);
    var source = (showToggle && opts.chart === 'polls') ? 'polls' : 'seats';
    var house = Model.houseAt(q.year, q.month);
    var counts = Model.allocateSeats(Model.seatShares(q, source), house);
    return { house: house, counts: counts, showToggle: showToggle };
  }

  // The state column's title bar (#state-bar, outside the column, drawn by
  // state-column.js): the chart's title, with the Seats/Polls toggle when
  // there is more than one source to show. The title is a button that opens
  // the Reichstag entry (state-column.js handles the click).
  function stateBar(q, opts) {
    opts = opts || {};
    var toggle = seatCounts(q, opts).showToggle ? chartToggle(opts.chart) : '';
    return '<button type="button" class="sc-bar-title" data-sc-bar-open title="Coalitions and the majority">Reichstag</button>' + toggle;
  }

  // Fills .sc-chart: hemicycle and government bar (which carries the
  // officials line and the election countdown). The title and the
  // Seats/Polls toggle are in the bar over the column.
  function chart(q, base, opts) {
    opts = opts || {};
    var sc = seatCounts(q, opts);
    var marked = Model.markedParties(q);
    return '<div data-sc-chart>' +
      hemicycle(q, sc.counts, sc.house, marked, opts.highlight, opts.highlightName, true) +
      govBar(q, sc.counts, sc.house, opts) +
      '</div>';
  }

  // Every party but the player's shows a relations track. Most read their
  // own <id>_relation quality; BVP shares Z's (the game stores them
  // together). DNVP and NSDAP never negotiate, so their track stays empty
  // beside "hostile". Andere (and SAPD before it splits off) have no single
  // party to negotiate with.
  var LEDGER_RELATION_QUALITY = { kpd: 'kpd_relation', z: 'z_relation', bvp: 'z_relation', ddp: 'ddp_relation', dvp: 'dvp_relation' };
  var LEDGER_HOSTILE_PARTIES = ['dnvp', 'nsdap'];

  // The relation the ledger shows for a party: its value and band word, or
  // null when the party has no relations track of its own to show (the SPD,
  // the parties that never negotiate, Andere, SAPD).
  function partnerRelation(q, id) {
    var key = LEDGER_RELATION_QUALITY[id];
    if (!key) {
      return null;
    }
    var v = num(q[key]);
    return { value: v, word: Model.bandWord('relationships', v) };
  }

  // The fill colour says how the relationship stands (cold to warm), not
  // whose it is: the band word picks a --sc-rel-* custom property. An empty
  // track (width 0) shows no colour, so it takes none.
  function relationBar(v, bandWord) {
    var pct = Math.max(0, Math.min(100, v));
    var colour = bandWord ? ';background:var(--sc-rel-' + bandWord.replace(/ /g, '-') + ')' : '';
    return '<span class="fill" style="width:' + pct + '%' + colour + '"></span>' +
      '<span class="tick"></span>';
  }

  // One .sc-ledger row: colour stripe, badge, name, seats with its delta,
  // relations (track and word, or the "Player" pill on the player's row), and
  // the government star.
  function ledgerRow(q, base, opts, id, seats, marked, gov) {
    var party = partyById[id];
    var bold = marked.indexOf(id) >= 0;
    var starred = !!gov && gov.parties.indexOf(id) >= 0;
    var seatsDelta = id === 'bvp' ? '' : delta(q, base, id + '_r', { big: 3, polarity: 0 });
    var relCells;
    var track = function (v, cls, title, band) {
      return '<span class="rl' + cls + '"' + (title ? ' title="' + escapeAttr(title) + '"' : '') + '>' +
        relationBar(v, band) + '</span>';
    };
    if (id === 'spd') {
      relCells = '<span class="rl merged"><span class="sc-you">Player</span></span>';
    } else if (LEDGER_RELATION_QUALITY[id]) {
      var key = LEDGER_RELATION_QUALITY[id];
      var v = num(q[key]);
      var word = Model.bandWord('relationships', v);
      // BVP has no quality of its own, so no delta of its own either.
      var tip = Model.partyLabel(q, id) + ': ' + word;
      relCells = track(v, '', id === 'bvp' ? tip + ' (follows the Center Party)' : tip, word) +
        '<span class="wd">' + escapeText(word) +
        (id === 'bvp' ? '' : delta(q, base, key, { scale: 'relationships', big: 10, polarity: 1 })) + '</span>';
    } else if (LEDGER_HOSTILE_PARTIES.indexOf(id) >= 0) {
      relCells = track(0, '', '') + '<span class="wd"><span class="sc-refuse">hostile</span></span>';
    } else {
      relCells = track(0, ' none', 'No single party to negotiate with') +
        '<span class="wd" title="No single party to negotiate with">—</span>';
    }
    var title = escapeAttr(Model.partyGerman(q, id) + ' (' + party.en + ')');
    return '<div class="sc-ledger' + (bold ? ' gov' : '') + (id === 'spd' ? ' player' : '') + '" data-sc-party="' + id + '"' +
      (opts.openEntry === 'party:' + id ? ' aria-current="true"' : '') + '>' +
      '<span class="stripe" style="background:' + party.color + '"></span>' +
      badge(q, id, 'small', opts) +
      '<span class="nm" title="' + title + '">' + escapeText(Model.partyLabel(q, id)) + '</span>' +
      '<span class="st">' + seats + seatsDelta + '</span>' +
      relCells +
      '<span class="gv"' + (starred ? ' title="In the government"' : '') + '>' + (starred ? '★' : '') + '</span>' +
      '</div>';
  }

  // Fills .sc-ledger-box: one row per seated party, in seating order
  // (Model.PARTIES), using the same seat counts as the chart. The columns
  // carry no header: a symbol, a name, a seat count, a relations track and
  // the government star explain themselves.
  function ledger(q, base, opts) {
    opts = opts || {};
    var sc = seatCounts(q, opts);
    var marked = Model.markedParties(q);
    var gov = Model.government(q);
    var rows = '';
    Model.PARTIES.forEach(function (p) {
      var seats = sc.counts[p.id] || 0;
      if (!seats) {
        return;
      }
      rows += ledgerRow(q, base, opts, p.id, seats, marked, gov);
    });
    return rows;
  }

  // Marks a label the depth column explains: entries.js opens the entry
  // whose slug the span carries, and entries.css styles it.
  function term(slug, text) {
    return '<span data-depth-term="' + slug + '">' + escapeText(text) + '</span>';
  }

  // A one-word sub-heading inside a tab panel. depthSlug, when given, wraps
  // the text in a depth-term span.
  function sub(text, depthSlug) {
    return '<div class="sc-sub">' +
      (depthSlug ? term(depthSlug, text) : escapeText(text)) + '</div>';
  }

  // A muted aside inside a tab panel (e.g. "will not work with us").
  function note(text) {
    return '<div class="sc-note">' + escapeText(text) + '</div>';
  }

  // A small colour square, for a legend entry beside a row label.
  function swatch(color) {
    return '<i class="sc-sw" style="background:' + color + '"></i>';
  }

  // max pips in a row; the first n are lit ("on"). Pip number mark
  // (1-based), when truthy and in range, is outlined ("mark"). kind selects
  // a CSS variant (dissent, mil, danger). title, when given, is the row's
  // hover text.
  function pips(n, max, kind, mark, title) {
    var s = '';
    for (var i = 1; i <= max; i++) {
      var cls = [];
      if (i <= n) {
        cls.push('on');
      }
      if (mark && i === mark) {
        cls.push('mark');
      }
      s += cls.length ? '<i class="' + cls.join(' ') + '"></i>' : '<i></i>';
    }
    return '<span class="sc-pips' + (kind ? ' ' + kind : '') + '"' +
      (title ? ' title="' + escapeAttr(title) + '"' : '') + '>' + s + '</span>';
  }

  // A stacked bar: one <span> per segment ({width, color, title, text}),
  // width as a percentage of the stack's full width. cls adds a modifier
  // (e.g. thin).
  function stack(segments, cls) {
    var segs = (segments || []).map(function (seg) {
      var title = seg.title ? ' title="' + escapeAttr(seg.title) + '"' : '';
      var text = seg.text ? escapeText(seg.text) : '';
      return '<span style="width:' + seg.width + '%;background:' + seg.color + '"' + title + '>' + text + '</span>';
    }).join('');
    return '<div class="sc-stack' + (cls ? ' ' + cls : '') + '">' + segs + '</div>';
  }

  // A filled bar for v out of max, with tick marks at each value in marks.
  function bar(v, max, color, marks) {
    var w = Math.max(0, Math.min(1, num(v) / num(max))) * 100;
    var ticks = (marks || []).map(function (x) {
      return '<i class="sc-tick" style="left:' + (x / max * 100) + '%"></i>';
    }).join('');
    return '<span class="sc-bar"><span class="fill" style="width:' + w + '%;background:' + color + '"></span>' + ticks + '</span>';
  }

  /* SPD tab */
  function spdTokens(n) {
    var max = Math.max(5, n);
    var s = '';
    for (var i = 0; i < max; i++) {
      s += '<i' + (i < n ? ' class="on"' : '') + '></i>';
    }
    return '<span class="sc-tokens">' + s + '</span>';
  }

  function spdResourcesRow(q, base, opts) {
    var n = num(q.resources);
    return '<div class="sc-row' + flash(q, opts, ['resources']) + '">' +
      '<span class="lbl sc-sub">' + term('party-resources', 'Party resources') + '</span>' +
      spdTokens(n) +
      '<span class="val">' + n + delta(q, base, 'resources', { big: 2, polarity: 1 }) + '</span>' +
      '</div>';
  }

  /* Coalition dissent */

  // The dissent block, on the Party and State tabs while a partner can call a
  // vote of no confidence (Model.coalitionStrain: none in opposition, in an
  // SPD majority or in an emergency government). One block per partner, each
  // a button that opens the Coalition dissent entry. It says what the track
  // counts (steps toward the vote), who calls the vote, what moved it last and
  // what eases it. The segments are the steps to the vote, so a full track
  // means the same thing in every government.
  //
  // The dashboard's box is as tall as its tallest tab, and the Defense tab
  // already fills the room under the fold in government. So a block is drawn
  // in the richest of three sizes that keeps its tab no taller than Defense
  // (pickDetail, with the page measuring): 'full' (the row, the sentence and
  // the two notes), 'brief' (the row and the sentence) or 'line' (the row).
  // The row holds the label, the track and the band word, so the track and the
  // band always show. opts.detail = {party, state} names the size per tab;
  // without it every tab draws 'full'.
  var DETAILS = ['full', 'brief', 'line'];

  function detailFor(opts, tab) {
    var d = opts && opts.detail && opts.detail[tab];
    return DETAILS.indexOf(d) >= 0 ? d : 'full';
  }

  // The dissents the tabs watch, for the change dots and the row flash.
  function coalitionKeys(q) {
    return Model.coalitionStrain(q).map(function (p) { return p.key; });
  }

  // As many segments as steps to the vote, the last one labelled; the first
  // `value` of them filled.
  function coalitionTrack(p) {
    var segs = '';
    for (var i = 1; i <= p.threshold; i++) {
      var cls = [];
      if (i <= p.value) {
        cls.push('on');
      }
      if (i === p.threshold) {
        cls.push('vote');
      }
      segs += '<i' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + (i === p.threshold ? 'vote' : '') + '</i>';
    }
    return '<span class="cd-track" role="img" aria-label="' + Math.min(Math.max(p.value, 0), p.threshold) +
      ' of ' + p.threshold + ' steps to a vote of no confidence">' + segs + '</span>';
  }

  // The sentence, with the caller's badge before its name.
  function coalitionSentence(q, p, opts) {
    if (!p.sentenceParts) {
      return escapeText(p.sentence);
    }
    return escapeText(p.sentenceParts.before) + badge(q, p.callerId, 'small', opts) +
      escapeText(p.callerLabel) + escapeText(p.sentenceParts.after);
  }

  // "To ease it:" the Coalition Affairs card's state, and its resource option
  // while the card is ready. Nothing to say for the KPD (no card touches its
  // dissent) or at no dissent.
  function coalitionEase(p) {
    var card = p.remedies.card;
    if (!card || p.value < 1) {
      return '';
    }
    var text = 'Coalition Affairs card: ';
    if (card.state === 'ready') {
      text += 'ready';
      var res = p.remedies.resources;
      if (res) {
        text += ' \u00b7 ' + res.cost + ' resources lower it by ' + res.lowersBy +
          (res.affordable ? '' : ' (you have ' + res.have + ')');
      }
    } else if (card.state === 'wait') {
      text += 'in ' + card.months + (card.months === 1 ? ' month' : ' months');
    } else {
      text += 'not available ' + card.reason;
    }
    return text;
  }

  function coalitionBlock(q, base, opts, p, log, detail) {
    var last = detail === 'full' ? Model.lastCoalitionMove(log, p.key) : null;
    var ease = detail === 'full' ? coalitionEase(p) : '';
    var band = p.blocked ? 'no vote' : p.band;
    var cls = 'sc-cd band-' + p.band + (p.blocked ? ' blocked' : '') + flash(q, opts, [p.key]);
    var steps = Math.min(Math.max(p.value, 0), p.threshold) + ' of ' + p.threshold + ' steps to a vote of no confidence';
    return '<button type="button" class="' + cls + '" data-depth-entry="coalition-dissent" data-cd="' + p.key + '"' +
      ' title="' + escapeAttr(p.label + ': ' + steps + '. ' + p.sentence + ' Open for what moves it.') + '">' +
      '<span class="cd-row"><span class="cd-name">' + escapeText(p.label) + '</span>' +
      coalitionTrack(p) +
      '<span class="cd-band">' + escapeText(band) + delta(q, base, p.key, { big: 2, polarity: -1 }) + '</span></span>' +
      (detail === 'line' ? '' : '<span class="cd-say">' + coalitionSentence(q, p, opts) + '</span>') +
      (last ? '<span class="cd-note">Last: ' + escapeText(Model.coalitionMoveText(last)) + '</span>' : '') +
      (ease ? '<span class="cd-note">To ease it: ' + escapeText(ease) + '</span>' : '') +
      '</button>';
  }

  // The blocks closing a tab, in the size opts.detail gives it.
  function coalitionBlocks(q, base, opts, tab) {
    var partners = Model.coalitionStrain(q);
    if (!partners.length) {
      return '';
    }
    var log = Model.parseCoalitionLog(q.sc_coalition_log);
    var detail = detailFor(opts, tab);
    return '<div class="sc-coalition">' + partners.map(function (p) {
      return coalitionBlock(q, base, opts, p, log, detail);
    }).join('') + '</div>';
  }

  // The richest size of the block for each of Party and State that keeps the
  // tab no taller than Defense, the tab that sets the box's height in
  // government. heightsOf(markups) is the page's measuring: the heights, in
  // order, of tab bodies drawn from those markups. With no partners there is
  // no block to size.
  function pickDetail(q, base, opts, heightsOf) {
    var picked = { party: 'full', state: 'full' };
    if (!Model.coalitionStrain(q).length) {
      return picked;
    }
    // Drawn for measuring, as bodyMarkups draws: no flash, no open-entry mark.
    function plainOpts(level, tab) {
      var plain = {};
      for (var key in (opts || {})) plain[key] = opts[key];
      plain.last = null;
      plain.openEntry = null;
      plain.detail = {};
      plain.detail[tab] = level;
      return plain;
    }
    var jobs = [];
    ['party', 'state'].forEach(function (tab) {
      DETAILS.forEach(function (level) {
        jobs.push({ tab: tab, level: level, markup: renderTab(tab, q, base, plainOpts(level, tab)).replace(/\sid="[^"]*"/g, '') });
      });
    });
    var defense = renderTab('defense', q, base, plainOpts('full', 'party')).replace(/\sid="[^"]*"/g, '');
    var heights = heightsOf([defense].concat(jobs.map(function (j) { return j.markup; })));
    var ceiling = heights[0];
    ['party', 'state'].forEach(function (tab) {
      picked[tab] = 'line';
      for (var i = jobs.length - 1; i >= 0; i--) {
        if (jobs[i].tab === tab && heights[i + 1] <= ceiling + 0.5) {
          picked[tab] = jobs[i].level;
        }
      }
    });
    return picked;
  }

  /* end coalition dissent */

  var SPD_FACTIONS = [
    { id: 'left', name: 'Left', abbr: 'L', color: '#7a1010' },
    { id: 'center', name: 'Center', abbr: 'C', color: '#b3261e' },
    { id: 'labor', name: 'Labor', abbr: 'Lb', color: '#d9542b' },
    { id: 'reformist', name: 'Reformists', short: 'Reform.', abbr: 'R', color: '#e8897a' },
    { id: 'neorevisionist', name: 'Neorevisionists', short: 'Neorev.', abbr: 'N', color: '#6d3a8c' }
  ];

  // What the game does with these values (post_event.scene.dry): each
  // faction has a strength (its share of the party, renormalised to 100
  // every month) and a dissent (0-99). Two bars per faction say all a
  // player needs at a glance: how big it is and how angry.
  //
  // Strength scale: 0 to 50. Half the party is already a dominant share, so
  // a longer scale would leave every bar short.
  //
  // Dissent scale: 0 to 60, the level (>= 60) at which a faction breaks away
  // (left_split, unions_declare_independence, the leaders-resign events). A
  // faction over 30 already triggers party_disunity, so the track carries a
  // tick there. The fill's colour is the dissent band word (--sc-dis-*).
  var STRENGTH_MAX = 50;
  var DISSENT_MAX = 60;
  var DISSENT_DISUNITY = 30;

  function scalePct(v, max) {
    return Math.max(0, Math.min(1, v / max)) * 100;
  }

  // The factions shown this month (neorevisionists once the movement exists),
  // with the words the title and the fill colour read.
  function factionData(q) {
    var out = [];
    SPD_FACTIONS.forEach(function (f) {
      if (f.id === 'neorevisionist' && !(q.neorevisionism > 0)) {
        return;
      }
      var strength = num(q[f.id + '_strength']);
      var dissent = num(q[f.id + '_dissent']);
      var sWord = Model.bandWord('strength', strength);
      var dWord = Model.bandWord('dissent', dissent);
      out.push({
        f: f,
        strength: strength,
        dissent: dissent,
        strengthWord: sWord,
        dissentWord: dWord,
        title: f.name + ': ' + sWord + ' strength, ' + dWord + ' dissent'
      });
    });
    return out;
  }

  // A track with its fill, then the change arrow in its own fixed cell so
  // every track is the same width whether or not a faction moved.
  function factionBar(fillPct, fillColour, tick, deltaHtml) {
    return '<span class="fbar"><span class="trk">' +
      '<span class="fill" style="width:' + fillPct + '%;background:' + fillColour + '"></span>' +
      (tick ? '<span class="tick" style="left:' + scalePct(DISSENT_DISUNITY, DISSENT_MAX) + '%" title="Disunity above ' + DISSENT_DISUNITY + '"></span>' : '') +
      '</span><span class="fd">' + deltaHtml + '</span></span>';
  }

  // One row per faction: swatch and name, strength bar (faction colour),
  // dissent bar (band colour, tick where party_disunity can fire).
  function spdFactions(q, base, opts) {
    var rows = factionData(q).map(function (d) {
      return '<div class="sc-frow' + flash(q, opts, [d.f.id + '_strength', d.f.id + '_dissent']) + '" title="' + escapeAttr(d.title) + '">' +
        '<span class="lbl">' + swatch(d.f.color) + escapeText(d.f.name) + '</span>' +
        factionBar(scalePct(d.strength, STRENGTH_MAX), d.f.color, false,
          delta(q, base, d.f.id + '_strength', { scale: 'strength', big: 5, polarity: 0 })) +
        factionBar(scalePct(d.dissent, DISSENT_MAX), 'var(--sc-dis-' + d.dissentWord.replace(/ /g, '-') + ')', true,
          delta(q, base, d.f.id + '_dissent', { scale: 'dissent', big: 10, polarity: -1 })) +
        '</div>';
    }).join('');
    // The table's header row, in the panel's small-caps style: it names the
    // factions (and hooks their depth entry) and both bar columns.
    var head = '<div class="sc-frow head sc-sub"><span class="lbl">' + term('factions', 'Faction') + '</span>' +
      '<span class="fbar">Strength</span><span class="fbar">Dissent</span></div>';
    return '<div class="sc-frows">' + head + rows + '</div>';
  }

  function spdTab(q, base, opts) {
    return spdResourcesRow(q, base, opts) +
      spdFactions(q, base, opts) +
      coalitionBlocks(q, base, opts, 'party');
  }

  TAB_RENDERERS.party = spdTab;
  /* end SPD tab */

  /* Defense tab */

  // The tab is a compact index: one button row per organisation, each opening
  // its entry in the depth column (data-depth-entry="defense:<id>"). The
  // balance of the street, militancy meter and loyalty axis live in the entry
  // (depth-column.js). Organisations come from Model.DEFENSE_ORGS.
  var PARAMILITARIES = Model.DEFENSE_ORGS.filter(function (o) { return o.kind === 'paramilitary'; });
  var STATE_FORCES = Model.DEFENSE_ORGS.filter(function (o) { return o.kind === 'state'; });

  // A force's period symbol (opts.symbols === 'period' and one exists for
  // the date) or a colour swatch. The symbol's wrapper carries
  // data-fallback holding the swatch, so state-column.js can swap it in on
  // a failed image load with no model lookups of its own (same mechanism
  // as badge() above).
  function forceIcon(q, id, color, opts) {
    opts = opts || {};
    var plain = swatch(color);
    if (opts.symbols === 'period') {
      var sym = Model.forceSymbol(id, q.year, q.month);
      if (sym) {
        return '<span class="sc-fsym" data-fallback="' + escapeAttr(plain) + '">' +
          '<img src="state-column/symbols/' + sym + '" alt="">' +
          '</span>';
      }
    }
    return plain;
  }

  // The number sits inside the fill, against its right end, when the fill
  // is at least half the track, and just after the fill otherwise. The track
  // runs the row's width, so either way the number has room: half a track is
  // well over a hundred pixels, and a number is about forty.
  var LABEL_INSIDE_FROM = 0.5;

  // The size bar: a track, a fill whose length is Model.sizeFraction of the
  // largest organisation shown, coloured by the row's band (the same severity
  // token as the band word), and the member count with its change arrow.
  // The arrow tracks strength, the number it sits on, not the band. It is
  // always a single arrow: the label has no room for a double one.
  function sizeBar(q, base, org, strength, max, sev) {
    var frac = Model.sizeFraction(strength, max);
    var pct = Math.round(frac * 1000) / 10;
    var key = org.id + '_strength';
    var arrow = delta(q, base, key, { polarity: org.polarity || 0 });
    var text = Model.formatMembers(strength);
    var inside = frac >= LABEL_INSIDE_FROM;
    var label = '<span class="sz-n' + (inside ? ' in' : '') + '"' +
      (inside ? ' style="right:calc(' + (100 - pct) + '% + 3px)"' : ' style="left:calc(' + pct + '% + 3px)"') + '>' +
      escapeText(text) + arrow + '</span>';
    return '<span class="sz" title="' + Math.round(strength) + ' thousand members">' +
      '<span class="sz-f" style="width:' + pct + '%;background:var(--sc-dis-' + sev + ')"></span>' +
      label + '</span>';
  }

  // One row, two lines: symbol, name, status word and chevron on the first,
  // the size bar with its number under the name on the second (the symbol
  // cell spans both). The open entry's row carries aria-current. `max` is the
  // largest strength on the list, which the bars scale against.
  function defenseRow(q, base, opts, org, max) {
    var scale = org.kind === 'paramilitary' ? 'militancy' : 'loyalty';
    var key = org.id + '_' + scale;
    var v = num(q[key]);
    var sev = Model.severity(scale, v);
    var word = Model.bandWord(scale, v).toLowerCase();
    var entryKey = 'defense:' + org.id;
    var title = org.de || org.name;
    return '<button type="button" class="sc-drow' + flash(q, opts, [org.id + '_strength', key]) + '" data-depth-entry="' + entryKey + '"' +
      (opts.openEntry === entryKey ? ' aria-current="true"' : '') + '>' +
      '<span class="ico">' + forceIcon(q, org.id, org.color, opts) + '</span>' +
      '<span class="nm" title="' + escapeAttr(title) + '">' + escapeText(org.label) + '</span>' +
      '<span class="st" style="color:var(--sc-dis-' + sev + ')">' + escapeText(word) + '</span>' +
      '<span class="chev" aria-hidden="true">›</span>' +
      sizeBar(q, base, org, num(q[org.id + '_strength']), max, sev) +
      '</button>';
  }

  function group(text) {
    return '<div class="sc-sub sc-dgroup">' + escapeText(text) + '</div>';
  }

  // The organisations the tab lists: the paramilitaries, then the state
  // forces (the Reich police only while the SPD governs).
  function defenseOrgsShown(q) {
    return PARAMILITARIES.concat(STATE_FORCES.filter(function (o) {
      return !o.onlyInGov || q.spd_in_government;
    }));
  }

  function defenseTab(q, base, opts) {
    opts = opts || {};
    var street = PARAMILITARIES;
    var state = defenseOrgsShown(q).filter(function (o) { return o.kind === 'state'; });
    // One scale for the whole list, so a bar in either group compares with
    // every other.
    var max = 0;
    street.concat(state).forEach(function (o) {
      max = Math.max(max, num(q[o.id + '_strength']));
    });
    function rows(list) {
      return list.map(function (o) { return defenseRow(q, base, opts, o, max); }).join('');
    }
    return group('Paramilitaries') + rows(street) + group('State forces') + rows(state);
  }

  TAB_RENDERERS.defense = defenseTab;

  /* end Defense tab */

  /* State tab */

  // A figure with its unit, one decimal, and a true minus sign. The game's
  // status page writes these with toFixed(1) and a percent sign.
  function fmtFigure(v, unit) {
    var s = num(v).toFixed(1);
    if (/^-0\.0$/.test(s)) {
      s = '0.0';
    }
    return s.replace('-', '−') + (unit || '');
  }

  // One readout row: label, value with its change marker. The values are
  // numbers, not bands (economic figures aren't banded in the game).
  function figureRow(label, valueText, deltaHtml, title, flashClass) {
    return '<div class="sc-row sc-fig' + (flashClass || '') + '"' + (title ? ' title="' + escapeAttr(title) + '"' : '') + '>' +
      '<span class="lbl">' + escapeText(label) + '</span>' +
      '<span class="val"><b>' + escapeText(valueText) + '</b>' + deltaHtml + '</span>' +
      '</div>';
  }

  // The economic readout, as the game's status page shows it: inflation and
  // growth and unemployment always (the game tracks all three from the first
  // month), and the budget while the SPD governs (status.scene.dry shows it
  // only then).
  function economyRows(q, base, opts) {
    var rows = figureRow('Inflation', fmtFigure(q.inflation, '%'),
      delta(q, base, 'inflation', { big: 1, polarity: 0 }), '', flash(q, opts, ['inflation']));
    rows += figureRow('Growth', fmtFigure(q.economic_growth, '%'),
      delta(q, base, 'economic_growth', { big: 1, polarity: 1 }), '', flash(q, opts, ['economic_growth']));
    rows += figureRow('Unemployment', fmtFigure(q.unemployed, '%'),
      delta(q, base, 'unemployed', { big: 1, polarity: -1 }), '', flash(q, opts, ['unemployed']));
    if (q.spd_in_government) {
      // post_event.scene.dry: a budget at or below zero adds inflation.
      rows += figureRow('Budget', String(num(q.budget)).replace('-', '−'),
        delta(q, base, 'budget', { big: 2, polarity: 1 }),
        'Government budget. At zero or below, deficit spending pushes inflation up.', flash(q, opts, ['budget']));
    }
    return rows;
  }

  // The chart's drawing box, in viewBox units (the SVG scales to the column's
  // width, about 320px, so it stands about 100px tall). Room on the left for
  // the y labels and along the bottom for the months.
  var EC_W = 300;
  var EC_H = 94;
  var EC_LEFT = 28;
  var EC_RIGHT = 6;
  var EC_TOP = 7;
  var EC_BOTTOM = 15;

  // The three lines: history field, class (its colour token), and legend name.
  var EC_SERIES = [
    { field: 'inflation', cls: 'infl', name: 'Inflation' },
    { field: 'growth', cls: 'growth', name: 'Growth' },
    { field: 'unemployed', cls: 'unemp', name: 'Unemployment' }
  ];

  function ecTick(v) {
    return (v < 0 ? '\u2212' : '') + Math.abs(v) + '%';
  }

  function shortMonth(p) {
    return Model.MONTHS[p.month - 1].slice(0, 3) + ' \u2019' + String(p.year).slice(-2);
  }

  // The legend: a short line in each series' colour and its name, centred in
  // the axis label row. Widths are estimates (8.5px type runs about 4.4 units
  // a character); the row has room for all three between the month labels.
  function legendKey(series) {
    var swatchW = 9;
    var gapIn = 3;
    var gapOut = 9;
    var widths = series.map(function (s) { return swatchW + gapIn + s.name.length * 4.4; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gapOut * (series.length - 1);
    var x = (EC_W + EC_LEFT - EC_RIGHT) / 2 - total / 2;
    var y = EC_H - 3;
    var out = '';
    series.forEach(function (s, i) {
      out += '<line class="sc-ln ' + s.cls + '" x1="' + f1(x) + '" x2="' + f1(x + swatchW) + '" y1="' + (y - 3) + '" y2="' + (y - 3) + '"/>' +
        '<text class="sc-ax sc-key" x="' + f1(x + swatchW + gapIn) + '" y="' + y + '">' + s.name + '</text>';
      x += widths[i] + gapOut;
    });
    return '<g class="sc-legend">' + out + '</g>';
  }

  function f1(n) {
    return (Math.round(n * 10) / 10).toString();
  }

  // A line chart of inflation, growth and unemployment over the months
  // played, as an inline SVG: a pure function of the history (a list from
  // Model.parseHistory). All three lines draw from the first month. One
  // shared y axis with a zero line (growth can go negative); months are
  // placed by date, so a skipped month leaves a gap. With one, two or three
  // months on record the points themselves are drawn; from four on, a dot
  // marks each line's latest value. Empty history draws nothing.
  function historyChart(history) {
    if (!history || !history.length) {
      return '';
    }
    var series = EC_SERIES;
    var lo = 0;
    var hi = 0;
    history.forEach(function (p) {
      series.forEach(function (s) {
        lo = Math.min(lo, p[s.field]);
        hi = Math.max(hi, p[s.field]);
      });
    });
    var bottom = Math.floor(lo);
    var top = Math.ceil(hi);
    if (top === bottom) {
      top = bottom + 1;
    }
    var plotL = EC_LEFT;
    var plotR = EC_W - EC_RIGHT;
    var plotT = EC_TOP;
    var plotB = EC_H - EC_BOTTOM;
    function py(v) {
      return plotB - (v - bottom) / (top - bottom) * (plotB - plotT);
    }
    var t0 = Model.timeIndex(history[0].year, history[0].month);
    var t1 = Model.timeIndex(history[history.length - 1].year, history[history.length - 1].month);
    function px(p) {
      if (t1 === t0) {
        return (plotL + plotR) / 2;
      }
      return plotL + (Model.timeIndex(p.year, p.month) - t0) / (t1 - t0) * (plotR - plotL);
    }
    function f(n) {
      return (Math.round(n * 10) / 10).toString();
    }

    var svg = '';
    // Grid: the top and bottom of the axis faint, the zero line firm.
    var ticks = [top, 0];
    if (bottom < 0) {
      ticks.push(bottom);
    }
    ticks.forEach(function (v) {
      // A label too close to the zero label to read is left off; its line stays.
      var crowded = v !== 0 && Math.abs(py(v) - py(0)) < 9;
      svg += '<line class="' + (v === 0 ? 'sc-zero' : 'sc-grid') + '" x1="' + plotL + '" x2="' + plotR +
        '" y1="' + f(py(v)) + '" y2="' + f(py(v)) + '"/>' +
        (crowded ? '' : '<text class="sc-ax" x="' + (plotL - 3) + '" y="' + f(py(v) + 3) + '" text-anchor="end">' + ecTick(v) + '</text>');
    });

    // The x axis: a faint line at each January, and the first and last month
    // named at the ends. The legend takes the middle of the label row.
    var first = history[0];
    var last = history[history.length - 1];
    history.forEach(function (p, i) {
      if (p.month === 1 && i > 0) {
        svg += '<line class="sc-yr" x1="' + f(px(p)) + '" x2="' + f(px(p)) + '" y1="' + plotT + '" y2="' + plotB + '"/>';
      }
    });
    svg += '<text class="sc-ax" x="' + plotL + '" y="' + (EC_H - 3) + '" text-anchor="start">' + shortMonth(first) + '</text>';
    if (history.length > 1) {
      svg += '<text class="sc-ax" x="' + plotR + '" y="' + (EC_H - 3) + '" text-anchor="end">' + shortMonth(last) + '</text>';
    }
    svg += legendKey(series);

    var all = history.length <= 3;
    series.forEach(function (s) {
      var d = history.map(function (p, i) {
        return (i ? 'L' : 'M') + f(px(p)) + ' ' + f(py(p[s.field]));
      }).join('');
      if (history.length > 1) {
        svg += '<path class="sc-ln ' + s.cls + '" d="' + d + '"/>';
      }
      history.forEach(function (p, i) {
        if (all || i === history.length - 1) {
          svg += '<circle class="sc-dt ' + s.cls + '" cx="' + f(px(p)) + '" cy="' + f(py(p[s.field])) + '" r="2">' +
            '<title>' + s.name + ' ' + fmtFigure(p[s.field], '%') + ', ' + shortMonth(p) + '</title></circle>';
        }
      });
    });
    return '<svg class="sc-econ-svg" viewBox="0 0 ' + EC_W + ' ' + EC_H + '" width="100%" role="img" ' +
      'aria-label="Inflation, growth and unemployment by month, ' + shortMonth(first) + ' to ' + shortMonth(last) + '">' +
      svg + '</svg>';
  }

  function stateTab(q, base, opts) {
    var history = Model.parseHistory(q.sc_history);
    return '<div class="sc-figs">' + economyRows(q, base, opts) + '</div>' +
      (history.length ? '<div class="sc-econ-chart">' + historyChart(history) + '</div>' : '') +
      coalitionBlocks(q, base, opts, 'state');
  }

  TAB_RENDERERS.state = stateTab;

  /* end State tab */

  // A saved tab that no longer exists (Polls moved to the depth column) falls
  // back to Party.
  function tabKey(tab) {
    return TABS.some(function (entry) { return entry[0] === tab; }) ? tab : 'party';
  }

  // How many of a tab's figures changed: against the snapshot taken when the
  // player last had the tab open (opts.seen[tab]) or, failing that, the
  // month's baseline.
  function tabChanges(tab, q, base, opts) {
    var ref = (opts && opts.seen && opts.seen[tab]) || base;
    return changedKeys(TAB_QUALITIES[tab](q), q, ref).length;
  }

  // A one-line, three-segment toggle: the labels and nothing else. A shut tab
  // whose figures changed carries a small dot after its label.
  function renderTabBar(activeTab, q, base, opts) {
    var html = '';
    TABS.forEach(function (entry) {
      var key = entry[0];
      var defaultLabel = entry[1];
      var labelFn = TAB_LABELS[key];
      var label = typeof labelFn === 'function' ? escapeText(labelFn(q, opts)) : defaultLabel;
      var changes = key === activeTab ? 0 : tabChanges(key, q, base, opts);
      var note = changes + (changes === 1 ? ' figure' : ' figures') + ' changed';
      var dot = changes ? '<i class="sc-dot" role="img" aria-label="' + note + '" title="' + note + '"></i>' : '';
      var cls = 'sc-tab' + (key === activeTab ? ' on' : '');
      html += '<button type="button" class="' + cls + '" data-sc-tab="' + key + '">' + label + dot + '</button>';
    });
    return '<div class="sc-tabs">' + html + '</div>';
  }

  // Every tab's body markup as the column would draw it, for measuring how
  // tall each is (the box takes the tallest, so it never changes height on a
  // tab switch). Drawn for measuring only: no flash classes, no marked open
  // entry, and no ids, so a copy beside the live column duplicates nothing
  // and nothing in it is ever the "current" row.
  function bodyMarkups(q, base, opts) {
    var plain = {};
    for (var key in (opts || {})) plain[key] = opts[key];
    plain.last = null;
    plain.openEntry = null;
    return TABS.map(function (entry) {
      return renderTab(entry[0], q, base, plain).replace(/\sid="[^"]*"/g, '');
    });
  }

  // The markups' heights, and the tallest of them. `measure` takes the markups not
  // yet in `cache` and returns their heights in order; `scope` is whatever
  // else the heights depend on (the column's width), so a markup measured
  // under one scope is not reused under another. The cache is kept small: a
  // long game draws a new State tab every month.
  var HEIGHT_CACHE_LIMIT = 48;

  function bodyHeights(markups, scope, cache, measure) {
    var keys = markups.map(function (markup) { return scope + '\n' + markup; });
    var missing = [];
    var missingKeys = [];
    function collect(wanted) {
      missing = [];
      missingKeys = [];
      keys.forEach(function (key, i) {
        if (!wanted(key) && missingKeys.indexOf(key) < 0) {
          missing.push(markups[i]);
          missingKeys.push(key);
        }
      });
    }
    collect(function (key) { return Object.prototype.hasOwnProperty.call(cache, key); });
    if (missing.length) {
      if (Object.keys(cache).length + missing.length > HEIGHT_CACHE_LIMIT) {
        // Emptied, so the markups that were cached a moment ago are measured again.
        Object.keys(cache).forEach(function (key) { delete cache[key]; });
        collect(function () { return false; });
      }
      var heights = measure(missing);
      missingKeys.forEach(function (key, i) { cache[key] = heights[i]; });
    }
    return keys.map(function (key) { return cache[key]; });
  }

  function tallestBody(markups, scope, cache, measure) {
    return Math.max.apply(null, bodyHeights(markups, scope, cache, measure));
  }

  function render(q, base, opts) {
    opts = opts || {};
    var tab = tabKey(opts.tab);
    // In government the column carries more above the tabs, so the room the
    // tabs keep above them (--sc-lead) is smaller there.
    return '<div id="state-column"' + (q.spd_in_government ? ' class="sc-gov"' : '') + '>' +
      '<div class="sc-chart">' + chart(q, base, opts) + '</div>' +
      '<div class="sc-ledger-box">' + ledger(q, base, opts) + '</div>' +
      renderTabBar(tab, q, base, opts) +
      '<div class="sc-body">' + renderTab(tab, q, base, opts) + '</div>' +
      '</div>';
  }

  return {
    render: render,
    renderTab: renderTab,
    bodyMarkups: bodyMarkups,
    tallestBody: tallestBody,
    bodyHeights: bodyHeights,
    seatCounts: seatCounts,
    relationBar: relationBar,
    partnerRelation: partnerRelation,
    highlightIds: highlightIds,
    hemicycle: hemicycle,
    delta: delta,
    badge: badge,
    chart: chart,
    stateBar: stateBar,
    chartToggle: chartToggle,
    historyChart: historyChart,
    ledger: ledger,
    sub: sub,
    note: note,
    swatch: swatch,
    pips: pips,
    coalitionBlocks: coalitionBlocks,
    pickDetail: pickDetail,
    coalitionTrack: coalitionTrack,
    coalitionSentence: coalitionSentence,
    coalitionEase: coalitionEase,
    stack: stack,
    bar: bar,
    tabKey: tabKey,
    tabChanges: tabChanges,
    TABS: TABS,
    TAB_QUALITIES: TAB_QUALITIES,
    TAB_RENDERERS: TAB_RENDERERS,
    TAB_LABELS: TAB_LABELS
  };
}));
