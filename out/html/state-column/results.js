/*
 * Result rows: one readout block for a vote, drawn the same wherever a
 * vote is read out (the results page, the depth column, event pages).
 * Pure functions: builders return row lists, html() returns a string.
 * Loaded as window.ResultRows in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./model.js'), require('./view.js'));
  } else {
    root.ResultRows = factory(root.StateColumnModel, root.StateColumnView);
  }
}(typeof self !== 'undefined' ? self : this, function (Model, View) {
  'use strict';

  var partyById = {};
  Model.PARTIES.forEach(function (p) { partyById[p.id] = p; });

  function isNumber(v) {
    return typeof v === 'number' && !isNaN(v);
  }

  function numberOrNull(v) {
    return isNumber(v) ? v : null;
  }

  // A share with at most one decimal and no trailing zero.
  function fmt(n) {
    return String(Math.round(n * 10) / 10);
  }

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  // The last election's shares, split as the game's charts split Z and BVP.
  // Null for every party when the game has no old_ values (a first
  // election), so the block shows no ghost tick and no change.
  function previousShares(q) {
    var prev = {};
    var z = q.old_z_r;
    Model.PARTIES.forEach(function (p) {
      prev[p.id] = numberOrNull(q['old_' + p.id + '_r']);
    });
    if (isNumber(z)) {
      prev.bvp = Math.min(3, z);
      prev.z = z - prev.bvp;
    } else {
      prev.bvp = null;
      prev.z = null;
    }
    if (!q.sapd_formed) {
      prev.sapd = null;
    }
    return prev;
  }

  // The seats the last election's shares won, over the house before this
  // election (the month before its date). Null when the game has no old_
  // values, a first election, so nothing shows a gain or a loss.
  function previousSeats(q) {
    var prev = previousShares(q);
    var shares = {};
    var total = 0;
    Model.PARTIES.forEach(function (p) {
      shares[p.id] = prev[p.id] || 0;
      total += shares[p.id];
    });
    if (!total) {
      return null;
    }
    var year = q.month > 1 ? q.year : q.year - 1;
    var house = Model.houseAt(year, q.month > 1 ? q.month - 1 : 12);
    return { house: house, seats: Model.allocateSeats(shares, house) };
  }

  // This election's seats beside the previous ones, for every party.
  function seatCounts(q) {
    var house = Model.houseAt(q.year, q.month);
    return {
      house: house,
      seats: Model.allocateSeats(Model.seatShares(q, 'seats'), house),
      before: previousSeats(q)
    };
  }

  // One row per party that took votes, in the ledger's left-to-right order.
  // Seats come from the allocation the dashboard uses, so the two agree.
  function reichstag(q) {
    var shares = Model.seatShares(q, 'seats');
    var counts = seatCounts(q);
    var seats = counts.seats;
    var prev = previousShares(q);
    var rows = [];
    Model.PARTIES.forEach(function (p) {
      var share = shares[p.id];
      if (!share) {
        return;
      }
      var before = prev[p.id];
      rows.push({
        id: p.id,
        label: Model.partyLabel(q, p.id),
        share: share,
        prev: before,
        change: before === null ? null : share - before,
        seats: seats[p.id],
        prevSeats: counts.before ? counts.before.seats[p.id] : null,
        seatChange: counts.before ? seats[p.id] - counts.before.seats[p.id] : null
      });
    });
    return rows;
  }

  // Seats gained and lost by every party, a party that dropped out of the
  // house included (it has no row but did lose seats), so the changes add up
  // to the change in the house. Sorted from the largest gain to the largest
  // loss, parties with no change last. Null for a first election.
  function seatMovement(q) {
    var counts = seatCounts(q);
    if (!counts.before) {
      return null;
    }
    var items = [];
    Model.PARTIES.forEach(function (p, index) {
      var now = counts.seats[p.id];
      var then = counts.before.seats[p.id];
      if (!now && !then) {
        return;
      }
      items.push({ id: p.id, label: Model.partyLabel(q, p.id), seats: now, prevSeats: then,
        change: now - then, order: index });
    });
    items.sort(function (a, b) {
      if ((a.change === 0) !== (b.change === 0)) {
        return a.change === 0 ? 1 : -1;
      }
      return (b.change - a.change) || (a.order - b.order);
    });
    return { house: counts.house, prevHouse: counts.before.house, items: items };
  }

  // One party's seats and their change since the last election (null for a
  // first one). Zero seats for a party the election left out of the house.
  function partySeats(q, id) {
    var counts = seatCounts(q);
    var now = counts.seats[id] || 0;
    return { seats: now, change: counts.before ? now - (counts.before.seats[id] || 0) : null };
  }

  // Hand-built rows for votes that aren't party lists (candidates, a
  // referendum). Fills what the caller leaves out.
  function rows(list) {
    return (list || []).map(function (r) {
      var id = r.id && partyById[r.id] ? r.id : null;
      var share = numberOrNull(r.share) || 0;
      var prev = numberOrNull(r.prev);
      return {
        id: id,
        label: r.label !== undefined ? r.label : (id ? Model.partyLabel({}, id) : ''),
        share: share,
        prev: prev,
        change: prev === null ? null : share - prev,
        seats: numberOrNull(r.seats),
        note: r.note || '',
        player: !!r.player,
        color: r.color || '',
        tag: r.tag || ''
      };
    });
  }

  // Presidential votes. The scenes keep each candidate's share in a quality
  // (rounded to a tenth already); these read them back as rows. A row is the
  // candidate's, badged with the party that backs him, and is the player's
  // when the SPD backs him. The majority word goes on a first-round winner
  // only: a second round is a plurality.

  // 1932: the four names the scene prints, in its order. Hindenburg has no
  // party of his own, so no id (no badge, no entry to open).
  function president1932(q) {
    var first = (q.election_round || 0) <= 1;
    var braun = !!q.braun_campaign;
    var thalmann = !!q.spd_support_thalmann;
    var list = [
      { label: 'Hindenburg', share: q.hindenburg_votes, majority: q.hindenburg_majority,
        player: !braun && !thalmann },
      { id: 'nsdap', label: q.nsdap_candidate || 'Hitler', share: q.hitler_votes,
        majority: q.hitler_majority }
    ];
    if (!q.kpd_support_braun) {
      list.push({ id: 'kpd', label: 'Thälmann', share: q.thalmann_votes,
        majority: q.thalmann_majority, player: thalmann });
    }
    if (braun) {
      list.push({ id: 'spd', label: 'Braun', share: q.braun_votes,
        majority: q.braun_majority, player: true });
    }
    return rows(list.map(function (r) {
      r.tag = first && r.majority ? 'majority' : '';
      return r;
    }));
  }

  // 1934: every name the scene may print, in its order. The quality keys
  // drop diacritics (the scene normalises them), so the labels put them
  // back. `party` is who the candidate stands for; an independent has none.
  // The SPD may back anyone, so the player's row comes from spd_candidate.
  var CANDIDATES_1934 = [
    { key: 'Hitler', party: 'nsdap' },
    { key: 'Goring', label: 'Göring', party: 'nsdap' },
    { key: 'Seldte', party: 'dnvp' },
    { key: 'Thalmann', label: 'Thälmann', party: 'kpd' },
    { key: 'Munzenberg', label: 'Münzenberg', party: 'kpd' },
    { key: 'Adenauer', party: 'z' },
    { key: 'Gessler', party: 'ddp' },
    { key: 'Eckener' },
    { key: 'Braun', party: 'spd' },
    { key: 'Schumacher', party: 'spd' },
    { key: 'Juchacz', party: 'spd' },
    { key: 'Einstein' },
    { key: 'Ossietzky' },
    { key: 'Mann' }
  ];

  function president1934(q) {
    var first = (q.round || 0) <= 1;
    var backed = typeof q.spd_candidate === 'string'
      ? q.spd_candidate.normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
    var list = [];
    CANDIDATES_1934.forEach(function (c) {
      // _running is reset every round; _votes is not, so it can be stale.
      if (!q[c.key + '_running']) {
        return;
      }
      list.push({
        id: c.party,
        label: c.label || c.key,
        share: q[c.key + '_votes'],
        player: c.key === backed,
        tag: first && q.has_majority && q.winner === c.key ? 'majority' : ''
      });
    });
    return rows(list);
  }

  // The dashboard's arrows: one up or down arrow, the change in points.
  function change(value) {
    if (!isNumber(value) || value === 0) {
      return '—';
    }
    return (value > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(value));
  }

  // Full scale for the bars: the next ten above the largest share (or
  // previous share, so a ghost tick is never off the end).
  function defaultMax(list) {
    var top = 0;
    list.forEach(function (r) {
      top = Math.max(top, r.share || 0, isNumber(r.prev) ? r.prev : 0);
    });
    return (Math.floor(top / 10) + 1) * 10;
  }

  function pct(value, max) {
    return fmt(Math.max(0, Math.min(100, value / max * 100)));
  }

  // The seat change, with the arrow the dashboard uses. The class carries
  // the direction; the player's row colours it (good for the SPD to gain).
  function seatChangeCell(r) {
    var n = r.seatChange;
    var dir = !isNumber(n) ? '' : (n > 0 ? ' up' : (n < 0 ? ' down' : ' same'));
    return '<span class="rr-chg' + dir + '">' + (isNumber(n) ? change(n) : '') + '</span>';
  }

  // The vote cell's title: the share and its change in points.
  function shareTitle(r, unit) {
    if (!isNumber(r.change)) {
      return '';
    }
    var moved = r.change === 0 ? 'no change' :
      (r.change > 0 ? 'up ' : 'down ') + fmt(Math.abs(r.change)) + (Math.abs(r.change) === 1 ? ' point' : ' points');
    return ' title="' + fmt(r.share) + unit + ', ' + moved + '"';
  }

  // The last cell: the change in points, or (change: false) only a tag such
  // as "majority" for the rows that carry one, the cell staying for the grid.
  function tail(r, opts) {
    if (r.tag) {
      return '<span class="rr-chg rr-tag">' + escapeText(r.tag) + '</span>';
    }
    return '<span class="rr-chg">' + (opts.change === false ? '' : change(r.change)) + '</span>';
  }

  function row(r, opts, max) {
    var party = r.id ? partyById[r.id] : null;
    var player = r.player || r.id === 'spd';
    var color = r.color || (party ? party.color : 'var(--sc-rel-neutral)');
    var lead =
      '<span class="rr-badge">' +
      (party && opts.q ? View.badge(opts.q, r.id, 'small', { symbols: opts.symbols }) : '') +
      '</span>' +
      '<span class="rr-name">' + escapeText(r.label) + '</span>';
    var bar =
      '<span class="rr-bar">' +
      '<span class="rr-fill" style="width:' + pct(r.share, max) + '%;background:' + color + '"></span>' +
      (isNumber(r.prev) ? '<span class="rr-ghost" style="left:' + pct(r.prev, max) + '%"></span>' : '') +
      (isNumber(opts.mark) ? '<span class="rr-mark" style="left:' + pct(opts.mark, max) + '%"></span>' : '') +
      '</span>';
    var unit = opts.unit || '';
    var inner;
    if (opts.seats) {
      // Seats first: the count and its change are what the eye lands on, and
      // the vote steps back to the end of the row.
      inner = lead +
        '<span class="rr-seats">' + (isNumber(r.seats) ? r.seats : '') + '</span>' +
        seatChangeCell(r) + bar +
        '<span class="rr-share"' + shareTitle(r, unit) + '>' + fmt(r.share) + unit + '</span>';
    } else {
      inner = lead + bar +
        '<span class="rr-share">' + fmt(r.share) + unit + '</span>' + tail(r, opts);
    }
    var cls = 'rr-row' + (player ? ' player' : '');
    var title = r.note ? ' title="' + escapeText(r.note).replace(/"/g, '&quot;') + '"' : '';
    if (party) {
      return '<button type="button" class="' + cls + '" data-depth-entry="party:' + r.id + '"' + title + '>' + inner + '</button>';
    }
    return '<div class="' + cls + '"' + title + '>' + inner + '</div>';
  }

  // The block. opts: q (for badges), symbols ('period' draws the logos),
  // size ('compact' for the text column, 'full' for the depth column),
  // unit ('%' by default), seats (the seat-first layout of a Reichstag vote:
  // seats, seat change, bar, share), max (bar scale),
  // mark (a threshold, such as 50 for a majority, ticked on every bar),
  // change (false for a vote with nothing to compare: no change column,
  // though a row's tag still shows in that cell).
  function html(list, opts) {
    opts = opts || {};
    if (!list || !list.length) {
      return '';
    }
    var o = {
      q: opts.q,
      symbols: opts.symbols,
      unit: opts.unit === undefined ? '%' : opts.unit,
      seats: !!opts.seats,
      mark: opts.mark,
      change: opts.change
    };
    var max = isNumber(opts.max) && opts.max > 0 ? opts.max : defaultMax(list);
    var head = o.seats ?
      '<div class="rr-head"><span class="rr-badge"></span><span class="rr-name"></span>' +
      '<span class="rr-seats">Seats</span><span class="rr-chg">Change</span>' +
      '<span class="rr-bar"></span><span class="rr-share">Vote</span></div>' :
      '<div class="rr-head"><span class="rr-badge"></span><span class="rr-name"></span>' +
      '<span class="rr-bar">Share</span><span class="rr-share"></span>' +
      '<span class="rr-chg">' + (o.change === false ? '' : 'Change (pts)') + '</span></div>';
    return '<div class="rr ' + (opts.size === 'full' ? 'full' : 'compact') + (o.seats ? ' with-seats' : '') +
      (list.some(function (r) { return !r.id; }) ? ' wide-names' : '') + '">' +
      head + list.map(function (r) { return row(r, o, max); }).join('') + '</div>';
  }

  return {
    reichstag: reichstag,
    seatMovement: seatMovement,
    partySeats: partySeats,
    president1932: president1932,
    president1934: president1934,
    rows: rows,
    html: html
  };
}));
