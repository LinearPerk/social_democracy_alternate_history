/*
 * Readouts: the depth column's two resting views. Polls (support by
 * demographic group, or the Republic's support in historical mode) and Die
 * Zeit (the month's dated news, the default in historical mode). Registers
 * the 'polls' and 'times' kinds with depth-column.js, and the 'month' entry
 * (one month's news, opened from the date bar; key "month:<year>-<month>")
 * with entries.js. Each view is one pure function of the game's qualities,
 * exported for Node: renderPolls, renderTimes, renderMonth. The group bar
 * (pollGroupBar, with POLL_GROUPS and pollParties) is exported for the
 * election entry, which draws the same bars from an election's record.
 * Loaded as window.DepthReadouts in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  var haveRequire = typeof require === 'function';
  var api = factory(
    root.StateColumnModel || (haveRequire ? require('../state-column/model.js') : null)
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DepthReadouts = api;
    if (root.DepthColumn) api.install(root, root.DepthColumn);
  }
}(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  var TIMES_URL = 'state-column/the-times.json';

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function num(v) {
    return Number(v) || 0;
  }

  // Out-links open in a new tab so the game stays put. Either link may be
  // null in the data file; leave it out then. Entries reuse this for their
  // own Wikipedia links.
  function links(entry) {
    var html = '';
    if (entry.link_en) {
      html += '<a href="' + escapeAttr(entry.link_en) + '" target="_blank" rel="noopener">Wikipedia</a>';
    }
    if (entry.link_de) {
      html += '<a href="' + escapeAttr(entry.link_de) + '" target="_blank" rel="noopener">Deutsch</a>';
    }
    return html ? '<div class="dc-times-links">' + html + '</div>' : '';
  }

  // A month's records (the file holds the whole run 1928-1933, so this is
  // what keeps the other months out), as the news items Die Zeit and the
  // month entry both draw: the headline, summary and links of each in the
  // file's order, or one muted line when the month has none.
  function monthItems(times, year, month) {
    var entries = times.filter(function (e) {
      return num(e.year) === year && num(e.month) === month;
    });
    if (entries.length === 0) return '<p class="dc-times-none">No dated news this month.</p>';
    return entries.map(function (e) {
      return '<div class="dc-times-entry">' +
        '<div class="dc-times-headline">' + escapeText(e.headline) + '</div>' +
        '<p class="dc-times-summary">' + escapeText(e.summary) + '</p>' +
        links(e) +
        '</div>';
    }).join('');
  }

  function monthLabel(year, month) {
    var monthName = Model.MONTHS[month - 1] || '';
    return (monthName ? monthName + ' ' : '') + year;
  }

  // The Die Zeit page for the current month: Fraktur masthead, dateline,
  // then the month's entries.
  function renderTimes(q, times) {
    var month = num(q.month);
    var year = num(q.year);
    return '<div class="dc-times">' +
      '<div class="dc-times-mast">Die Zeit</div>' +
      '<div class="dc-times-dateline">' + escapeText(monthLabel(year, month)) + '</div>' +
      monthItems(times, year, month) +
      '</div>';
  }

  // ---- The month entry -------------------------------------------------------

  // The key's id is "<year>-<month>", the month unpadded ("1930-4").
  function monthKey(year, month) {
    return 'month:' + num(year) + '-' + num(month);
  }

  // {year, month} from an id, or null when it isn't one.
  function parseMonth(id) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(String(id));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return {year: Number(m[1]), month: Number(m[2])};
  }

  function monthTitle(id) {
    var at = parseMonth(id);
    return at ? monthLabel(at.year, at.month) : '';
  }

  // One month's news, opened from the date bar. Historical mode has Die Zeit
  // as its own timeline, so the lead is plain; in normal mode the game's
  // events differ from history, and the lead says these are the real ones.
  // The title above (the month and year) comes from the view.
  function renderMonth(id, historical, times) {
    var at = parseMonth(id);
    if (!at) return null;
    var lead = historical ? "The month's news" : 'What happened in this month, historically';
    return '<div class="dc-month" data-entry="month:' + id + '">' +
      '<p class="dc-lead">' + lead + '</p>' +
      monthItems(times, at.year, at.month) +
      '</div>';
  }

  var POLL_GROUPS = [
    ['workers', 'Workers'],
    ['new_middle', 'New middle class'],
    ['old_middle', 'Old middle class'],
    ['rural', 'Rural'],
    ['unemployed', 'Unemployed'],
    ['catholics', 'Catholics']
  ];

  // Parties counted in a demographic bar: every seated party except BVP
  // (the game stores no BVP split per group) and, before it forms, SAPD.
  function pollParties(q) {
    return Model.PARTIES.filter(function (p) {
      if (p.id === 'bvp') {
        return false;
      }
      if (p.id === 'sapd') {
        return !!q.sapd_formed;
      }
      return true;
    });
  }

  // One group's stacked bar, normalised to a 100% total: the
  // <group>_<party>_display quality when the game has computed it, else the
  // raw <group>_<party> quality (the game fills _display only in some
  // scenes).
  function pollGroupBar(q, group, label) {
    var raw = [];
    var total = 0;
    pollParties(q).forEach(function (p) {
      var displayKey = group + '_' + p.id + '_display';
      var v = typeof q[displayKey] === 'number' ? q[displayKey] : num(q[group + '_' + p.id]);
      if (v > 0) {
        raw.push({ party: p, value: v });
        total += v;
      }
    });
    var segs = raw.map(function (s) {
      var pct = total > 0 ? s.value / total * 100 : 0;
      var title = Model.partyLabel(q, s.party.id) + ' ' + Math.round(pct) + '%';
      return '<span style="width:' + pct + '%;background:' + s.party.color + '" title="' + escapeAttr(title) + '"></span>';
    }).join('');
    return '<div class="dc-sub">' + escapeText(label) + '</div>' +
      '<div class="dc-stack">' + segs + '</div>';
  }

  // The game gives pro_republic no band words (it never shows the number),
  // so these are ours: five even bands over its 0-100 range.
  var REPUBLIC_BANDS = ['very low', 'low', 'moderate', 'high', 'very high'];

  function republicBand(v) {
    var i = Math.min(REPUBLIC_BANDS.length - 1, Math.floor(Math.max(0, v) / 20));
    return REPUBLIC_BANDS[i];
  }

  // Historical mode has no election polling to break down, so the view is
  // one meter: the Republic's standing, with its band word.
  function renderPolls(q) {
    if (q.historical_mode) {
      var v = Math.max(0, Math.min(100, num(q.pro_republic)));
      return '<div class="dc-polls">' +
        '<div class="dc-sub">Support for the Republic</div>' +
        '<div class="dc-meter-row">' +
        '<span class="dc-meter"><span class="fill" style="width:' + v + '%"></span></span>' +
        '<span class="dc-meter-word">' + republicBand(v) + '</span>' +
        '</div></div>';
    }
    var html = '<div class="dc-polls"><div class="dc-sub">By group</div>';
    POLL_GROUPS.forEach(function (g) {
      html += pollGroupBar(q, g[0], g[1]);
    });
    return html + '<div class="dc-note">The seat chart\'s Polls toggle shows the projected Reichstag.</div></div>';
  }

  // Browser glue: register both views with the column. The Times file is
  // fetched once, and only once a historical game shows Die Zeit. A failed
  // fetch leaves the body empty rather than showing a wrong "no news" line;
  // the strip still offers Polls.
  function install(win, column) {
    var times = null;
    var requested = false;

    function qualities() {
      var engine = column.ui().dendryEngine;
      return (engine.state && engine.state.qualities) || {};
    }

    function ensureTimes() {
      if (requested) return;
      requested = true;
      try {
        win.fetch(TIMES_URL)
          .then(function (res) { return res.json(); })
          .then(function (data) {
            times = data;
            // Same view again: redraws without adding history.
            var open = column.view();
            if (open.kind === 'times' || (open.kind === 'entry' && /^month:/.test(open.key))) column.show(open);
          })
          .catch(function () {});
      } catch (e) {
        // fetch unavailable; same fallback.
      }
    }

    column.register('polls', function () {
      return renderPolls(qualities());
    });

    column.register('times', function () {
      ensureTimes();
      return times ? renderTimes(qualities(), times) : '';
    });

    // The date bar's entry (key "month:<year>-<month>"). Like Die Zeit, it is
    // empty until the file has loaded.
    if (column.registerEntryKind) {
      column.registerEntryKind('month', function (id) {
        if (!parseMonth(id)) return null;
        ensureTimes();
        return times ? renderMonth(id, !!qualities().historical_mode, times) : '';
      }, monthTitle);

      // A new month begins while the entry is open: it follows the date bar
      // to the new month in place, so Back doesn't lead through old months.
      column.on('content', function () {
        var open = column.view();
        var q = qualities();
        if (open.kind !== 'entry' || !/^month:/.test(open.key) || !q.started) return;
        var key = monthKey(q.year, q.month);
        if (open.key !== key && column.replace) {
          column.replace({kind: 'entry', key: key, title: monthTitle(key.slice(6))});
        }
      });
    }
  }

  return {
    renderPolls: renderPolls,
    renderTimes: renderTimes,
    renderMonth: renderMonth,
    POLL_GROUPS: POLL_GROUPS,
    pollParties: pollParties,
    pollGroupBar: pollGroupBar,
    monthKey: monthKey,
    monthTitle: monthTitle,
    links: links,
    install: install
  };
}));
