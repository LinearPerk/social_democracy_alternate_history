/*
 * Defense entries: the depth column's entry for one defense organisation,
 * opened by the state column's Defense tab (data-depth-entry="defense:<id>").
 * Paramilitaries get the balance of the street and a militancy meter; state
 * forces get the loyalty axis; both end with the game's Library text and
 * links out. Registers the 'defense' prefix with entries.js. The renderers
 * are pure functions of the qualities and a context, exported for Node:
 * renderDefenseEntry, renderEntry.
 *
 * The entry's context comes from the state column: the month's baseline (for
 * change arrows) and the symbols setting. Loaded as window.DepthDefenseEntry
 * in the browser, module.exports in Node.
 */
(function (root, factory) {
  'use strict';
  var haveRequire = typeof require === 'function';
  var api = factory(
    root.StateColumnModel || (haveRequire ? require('../state-column/model.js') : null),
    root.StateColumnView || (haveRequire ? require('../state-column/view.js') : null),
    root.DepthReadouts || (haveRequire ? require('./readouts.js') : null)
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DepthDefenseEntry = api;
    if (root.DepthColumn) api.install(root, root.DepthColumn);
  }
}(typeof self !== 'undefined' ? self : this, function (Model, View, Readouts) {
  'use strict';

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function num(v) {
    return Number(v) || 0;
  }

  // ctx: base (the month's starting qualities, for change arrows), symbols
  // ('period' or 'badges'), library(marker) (the game's Library text for a
  // group, as HTML; may be absent).
  function delta(q, ctx, key, spec) {
    return View ? View.delta(q, ctx.base || q, key, spec) : '';
  }

  // A period symbol at entry size, or a plain square in the group's colour.
  // The symbol's wrapper carries the square in data-fallback, for a failed
  // image load (install() swaps it in).
  function entrySymbol(q, org, ctx) {
    var plain = '<span class="dc-esym" style="background:' + org.color + '"></span>';
    if (ctx.symbols === 'period') {
      var sym = Model.forceSymbol(org.id, q.year, q.month);
      if (sym) {
        return '<span class="dc-esym sym" data-fallback="' + escapeAttr(plain) + '">' +
          '<img src="state-column/symbols/' + sym + '" alt=""></span>';
      }
    }
    return plain;
  }

  // The four paramilitaries' shares of their combined strength.
  function streetShares(q) {
    var groups = Model.DEFENSE_ORGS.filter(function (o) { return o.kind === 'paramilitary'; });
    var total = 0;
    groups.forEach(function (o) { total += num(q[o.id + '_strength']); });
    return groups.map(function (o) {
      return { org: o, pct: total > 0 ? num(q[o.id + '_strength']) / total * 100 : 0 };
    });
  }

  // "Balance of the street": every group in one bar, this one at full colour
  // and the rest dimmed, a legend, and this group's share in words.
  function streetSection(q, org) {
    var shares = streetShares(q);
    var segs = shares.map(function (s) {
      var title = s.org.label + ' ' + Math.round(s.pct) + '%';
      return '<span' + (s.org.id === org.id ? '' : ' class="dim"') + ' style="width:' + s.pct + '%;background:' +
        s.org.color + '" title="' + escapeAttr(title) + '"></span>';
    }).join('');
    var legend = shares.map(function (s) {
      return '<span' + (s.org.id === org.id ? ' class="here"' : '') + '><i style="background:' + s.org.color + '"></i>' +
        escapeText(s.org.label) + '</span>';
    }).join('');
    var mine = shares.filter(function (s) { return s.org.id === org.id; })[0];
    return '<div class="dc-sub">Balance of the street</div>' +
      '<div class="dc-stack">' + segs + '</div>' +
      '<div class="dc-legend">' + legend + '</div>' +
      '<p class="dc-share"><strong>' + Math.round(mine ? mine.pct : 0) + '%</strong> of the four groups\' combined strength</p>';
  }

  var MILITANCY_STEPS = 5;

  // Militancy as five steps, lit by band (the seven bands map onto 0 to 5),
  // in the band's severity colour, with the band word and change arrow.
  function militancySection(q, org, ctx) {
    var v = num(q[org.id + '_militancy']);
    var lit = Math.ceil(Model.bandIndex('militancy', v) * MILITANCY_STEPS / 6);
    var colour = 'var(--sc-dis-' + Model.severity('militancy', v) + ')';
    var steps = '';
    for (var i = 1; i <= MILITANCY_STEPS; i++) {
      steps += i <= lit ? '<i class="on" style="background:' + colour + '"></i>' : '<i></i>';
    }
    return '<div class="dc-sub">Militancy</div>' +
      '<div class="dc-meter-row">' +
      '<span class="dc-steps">' + steps + '</span>' +
      '<span class="dc-meter-word" style="color:' + colour + '">' + escapeText(Model.bandWord('militancy', v).toLowerCase()) +
      delta(q, ctx, org.id + '_militancy', { scale: 'militancy', big: 0.1, polarity: org.polarity }) + '</span>' +
      '</div>';
  }

  // The loyalty axis runs 0 to 1 with its centre mark at 0.475, where the
  // game's "divided" band sits: the fill grows from the centre towards the
  // marker, red on the disloyal side and green on the loyal.
  var LOYALTY_CENTER = 0.475;

  function loyaltySection(q, org, ctx) {
    var v = Math.max(0, Math.min(1, num(q[org.id + '_loyalty'])));
    var left = Math.min(v, LOYALTY_CENTER) * 100;
    var width = Math.abs(v - LOYALTY_CENTER) * 100;
    var colour = 'var(--sc-dis-' + Model.severity('loyalty', v) + ')';
    return '<div class="dc-sub">Loyalty</div>' +
      '<div class="dc-axis"><span>disloyal</span><span>divided</span><span>loyal</span></div>' +
      '<div class="dc-meter-row">' +
      '<span class="dc-loyal"><span class="fill ' + (v < LOYALTY_CENTER ? 'dis' : 'loy') + '" style="left:' + left + '%;width:' + width + '%"></span>' +
      '<i class="mid"></i><i class="mark" style="left:' + (v * 100) + '%"></i></span>' +
      '<span class="dc-meter-word" style="color:' + colour + '">' + escapeText(Model.bandWord('loyalty', v).toLowerCase()) +
      delta(q, ctx, org.id + '_loyalty', { scale: 'loyalty', big: 0.1, polarity: 1 }) + '</span>' +
      '</div>';
  }

  // The Library paragraphs about one group. A paragraph opening with a bold
  // lead-in starts a group's text; it runs to the next such paragraph. The
  // Library's Militarization and Loyalty lines repeat the meter above, so
  // they are left out. `nodes` is the scene's content after the engine has
  // filled in its inserts.
  function leadOf(node) {
    var first = node && node.type === 'paragraph' && Array.isArray(node.content) ? node.content[0] : null;
    if (!first || first.type !== 'emphasis-2') return null;
    // The engine hands the bold text over as an array of strings.
    return Array.isArray(first.content) ? first.content.join('') : String(first.content);
  }

  function libraryBlock(nodes, marker) {
    var out = [];
    var inside = false;
    nodes.forEach(function (node) {
      var lead = leadOf(node);
      if (lead !== null) {
        inside = lead.indexOf(marker) === 0;
      }
      if (!inside) return;
      var text = Array.isArray(node.content) && typeof node.content[0] === 'string' ? node.content[0] : '';
      if (/^(Militarization|Loyalty):/.test(text)) return;
      out.push(node);
    });
    return out;
  }

  // Strengths run to many decimals after the game's percentage cuts
  // (sa_strength *= 0.7); the Library rounds them before showing them, and so
  // do we.
  function roundThousands(html) {
    return html.replace(/(\d+\.\d+)( thousand)/g, function (all, n, unit) {
      return Math.round(parseFloat(n)) + unit;
    });
  }

  // The HTML for one entry, or null when there is nothing to show (an
  // unknown id, or an entry that no longer applies this month).
  function renderDefenseEntry(id, q, ctx) {
    var org = Model.defenseOrg(id);
    if (!org) return null;
    if (org.onlyInGov && !q.spd_in_government) return null;
    var body = org.kind === 'paramilitary'
      ? streetSection(q, org) + militancySection(q, org, ctx)
      : loyaltySection(q, org, ctx);
    var lib = org.library && ctx.library ? ctx.library(org.library) : '';
    if (lib) {
      body += '<div class="dc-sub">From the game\'s library</div><div class="dc-library">' + lib + '</div>';
    }
    return '<div class="dc-entry" data-entry="defense:' + org.id + '">' +
      '<div class="dc-ehead">' + entrySymbol(q, org, ctx) +
      '<div><h2 class="dc-ename">' + escapeText(org.name) + '</h2>' +
      (org.de ? '<div class="dc-ede">' + escapeText(org.de) + '</div>' : '') + '</div></div>' +
      body +
      Readouts.links({ link_en: org.wiki_en, link_de: org.wiki_de }) +
      '</div>';
  }

  // "defense:<id>" to its HTML; null for any other key.
  function renderEntry(key, q, ctx) {
    var prefix = 'defense:';
    return String(key).indexOf(prefix) === 0
      ? renderDefenseEntry(key.slice(prefix.length), q, ctx || {})
      : null;
  }

  // The Library's text for one group, as HTML, or '' when there is none. It
  // renders as game.js renders the Library: the scene's content through the
  // engine (inserts filled in) and contentToHTML, without leaving the page.
  function libraryHtml(ui, marker) {
    try {
      var scene = ui.game.scenes['library.paramilitaries'];
      if (!scene) return '';
      var nodes = ui.dendryEngine._makeDisplayContent(scene.content, true);
      var block = libraryBlock(nodes, marker);
      return block.length ? roundThousands(ui.contentToHTML.convert(block)) : '';
    } catch (e) {
      return '';
    }
  }

  // Browser glue: register the 'defense' prefix with entries.js. The entry
  // has its own heading (symbol, name, German name), so the view's title is
  // empty. The context comes from the state column, read at each draw.
  function install(win, column) {
    if (!column.registerEntryKind) return;

    column.registerEntryKind('defense', function (id) {
      var sc = win.StateColumn || {};
      var ui = column.ui();
      return renderDefenseEntry(id, ui.dendryEngine.state.qualities, {
        base: sc.baseline ? sc.baseline() : null,
        symbols: sc.symbols ? sc.symbols() : 'period',
        library: function (marker) { return libraryHtml(ui, marker); }
      });
    }, '');

    // A symbol that fails to load becomes its plain square, as in the state
    // column.
    win.document.addEventListener('error', function (e) {
      var target = e.target;
      if (!target || target.tagName !== 'IMG' || !target.closest) return;
      var wrapper = target.closest('#depth_column [data-fallback]');
      if (wrapper) wrapper.outerHTML = wrapper.getAttribute('data-fallback');
    }, true);
  }

  return {
    renderDefenseEntry: renderDefenseEntry,
    renderEntry: renderEntry,
    libraryBlock: libraryBlock,
    roundThousands: roundThousands,
    install: install
  };
}));
