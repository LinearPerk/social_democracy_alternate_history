/*
 * Coalition dissent entry: the live part of the depth column's "Coalition
 * dissent" term entry (the explanation is its record in entries.json). Opened
 * from the dissent block on the Party and State tabs. Under the text it draws
 * where each partner stands (the block's track and sentence), what moved the
 * dissent (the log the state column keeps, newest first) and how to lower it.
 *
 * The thresholds, callers and what lowers the dissent come from the game's
 * scenes through Model.coalitionStrain and Model.COALITION_TERMS, which
 * coalition-strain.test.js and coalition-entry.test.js check against the scene
 * source. The renderer is a pure function of the qualities, exported for Node.
 *
 * Registers its part with entries.js (registerTermLive). Loaded as
 * window.DepthCoalitionEntry in the browser, module.exports in Node.
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
    root.DepthCoalitionEntry = api;
    if (root.DepthColumn) api.install(root, root.DepthColumn);
  }
}(typeof self !== 'undefined' ? self : this, function (Model, View) {
  'use strict';

  var SLUG = 'coalition-dissent';
  var WORDS = { 5: 'five', 6: 'six' };

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function word(n) {
    return WORDS[n] || String(n);
  }

  // Where a partner stands: its name and band word, the track, the sentence.
  function partnerHtml(q, p, opts) {
    var bandWord = p.blocked ? 'no vote' : p.band;
    return '<div class="cde-partner' + (p.blocked ? ' blocked' : '') + ' band-' + p.band + '" data-cd="' + p.key + '">' +
      '<div class="cde-head"><span class="cde-name">' + escapeText(p.label) + '</span>' +
      '<span class="cde-band">' + escapeText(bandWord) + '</span></div>' +
      View.coalitionTrack(p) +
      '<p class="cde-say">' + View.coalitionSentence(q, p, opts) + '</p>' +
      '</div>';
  }

  // Why there is nothing to track, in the game's terms.
  function noPartnerText(q) {
    if (!q.spd_in_government) return 'The SPD is not in government, so no partner can call a vote of no confidence.';
    if (q.in_spd_majority) return 'The SPD governs alone, so no partner can call a vote of no confidence.';
    if (q.in_emergency_government) return 'An emergency government has no partners to call a vote of no confidence.';
    return 'No partner can call a vote of no confidence on this government.';
  }

  function logHtml(q, partners) {
    var keys = partners.map(function (p) { return p.key; });
    var named = partners.length > 1;
    var labels = { coalition_dissent: 'Coalition', kpd_coalition_dissent: 'KPD' };
    var moves = Model.parseCoalitionLog(q.sc_coalition_log).filter(function (m) {
      return keys.indexOf(m.key) >= 0;
    }).reverse();
    if (!moves.length) {
      return '<p class="cde-none">Nothing has moved it yet in this government.</p>';
    }
    return '<ul class="cde-log">' + moves.map(function (m) {
      var year = Math.floor(m.t / 12);
      var rise = m.delta > 0;
      return '<li class="cde-move"><span class="cde-what">' + escapeText(m.cause) + '</span> ' +
        '<span class="cde-when">' + Model.MONTHS[m.t - year * 12] + ' ' + year + '</span> ' +
        '<b class="cde-amt ' + (rise ? 'bad' : 'good') + '">' + (rise ? '+' : '−') + Math.abs(m.delta) + '</b>' +
        (named ? ' <span class="cde-who">' + labels[m.key] + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  // Where the Coalition Affairs card stands, as a closing sentence.
  function cardNow(card) {
    if (card.state === 'ready') return 'On offer now.';
    if (card.state === 'wait') return 'Back in ' + card.months + (card.months === 1 ? ' month.' : ' months.');
    if (/minority/.test(card.reason)) return 'Not available in a minority government.';
    return 'Needs dissent of at least 1.';
  }

  function easeHtml(q, partners) {
    var t = Model.COALITION_TERMS;
    var items = [];
    var bourgeois = partners.filter(function (p) { return p.key === 'coalition_dissent'; })[0];
    var kpd = partners.filter(function (p) { return p.key === 'kpd_coalition_dissent'; })[0];
    if (bourgeois) {
      var resources = bourgeois.remedies.resources
        ? ' Or spend ' + t.cardResources + ' resources to lower it by ' + t.step + '.'
        : ' The card’s resource option is not offered in historical mode.';
      items.push('<b>Coalition Affairs card.</b> Agree to the welfare cuts and dissent falls to 0: welfare falls by ' +
        t.cutsWelfare + ', the budget gains ' + t.cutsBudget + ', Left dissent rises by ' + t.cutsLeftDissent +
        ' and Labor dissent by ' + t.cutsLaborDissent + ', and the SPD loses support among workers and the unemployed.' +
        resources + ' The card needs dissent of at least 1 and returns ' + word(t.cardWaitMonths) +
        ' months after it is played. <i>' + cardNow(bourgeois.remedies.card) + '</i>');
      items.push('<b>Advisors.</b> Braun’s and Müller’s Negotiating with the Coalition action lowers it by ' +
        t.step + ' and improves relations with the partners. Advisor actions wait ' + word(t.advisorWaitMonths) + ' months between uses.');
      items.push('<b>Choices the partners like.</b> Each takes a step off when there is dissent to take: backing the employers ' +
        'in Labor Affairs, raising military funding, the customs union with Austria, ending reparations and, in a Grand ' +
        'Coalition, cutting welfare spending or taxes on the rich.');
      items.push('<b>When the vote is called.</b> It can still be stopped: give up leadership of Prussia (dissent falls to 0), ' +
        'enact a massive austerity plan (to 0), or spend ' + t.voteResources + ' resources to lower it by ' + t.step + '.');
    }
    if (kpd) {
      items.push('<b>KPD dissent:</b> no card or advisor lowers it. When the KPD calls its vote, ' + t.voteResources +
        ' resources lower it by ' + t.step + ', until the KPD has issued its ultimatum.');
    }
    return '<ul class="cde-ease">' + items.map(function (item) { return '<li>' + item + '</li>'; }).join('') + '</ul>';
  }

  // The live part's HTML. opts: symbols ('period' or 'badges'), as the state
  // column draws the caller's badge.
  function renderCoalitionLive(q, opts) {
    var partners = Model.coalitionStrain(q);
    if (!partners.length) {
      return '<div class="cde" data-entry="' + SLUG + '"><p class="cde-none">' + escapeText(noPartnerText(q)) + '</p></div>';
    }
    return '<div class="cde" data-entry="' + SLUG + '">' +
      '<h4 class="dc-sub">Now</h4>' +
      partners.map(function (p) { return partnerHtml(q, p, opts); }).join('') +
      '<h4 class="dc-sub">What moved it</h4>' + logHtml(q, partners) +
      '<h4 class="dc-sub">How to lower it</h4>' + easeHtml(q, partners) +
      '</div>';
  }

  function install(win, column) {
    if (!column.registerTermLive) return;
    column.registerTermLive(SLUG, function () {
      var q = column.ui().dendryEngine.state.qualities;
      var sc = win.StateColumn || {};
      return renderCoalitionLive(q, { symbols: sc.symbols ? sc.symbols() : undefined });
    });
  }

  return {
    SLUG: SLUG,
    renderCoalitionLive: renderCoalitionLive,
    install: install
  };
}));
