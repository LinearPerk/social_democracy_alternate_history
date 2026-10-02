/*
 * Page depth: the depth column's view of the current page's own long-form
 * text. The author marks a paragraph in its scene,
 *   {!<span class="depth">!}...{!</span>!}
 * and this file moves that paragraph (whole, not rewritten) out of
 * the decision column into the column. A summary paragraph marked
 *   {!<span class="depth-summary">!}...{!</span>!}
 * stays behind with a "Background →" link that reopens the view. The title
 * page's blockquotes count as depth too and label the link "Epigraph →".
 *
 * A page can display several scenes (go-to chains) before its choices, so
 * depth accumulates per page and resets when the next page begins.
 * Further-reading links come from links.json, keyed by scene id: {"<id>": [{text, href}]}.
 *
 * Built on window.DepthColumn (depth-column.js), which must load first.
 */
(function () {
  'use strict';

  var dc = window.DepthColumn;
  if (!dc) return;

  var LINKS_URL = 'depth-column/links.json';
  var TITLE_PAGE = 'Before the game begins';
  // Same threshold as the three-column tier in layout.css.
  var WIDE_QUERY = '(min-width: 1300px)';

  var links = {};   // links.json, once loaded
  var page = null;  // depth collected from the current page, or null
  var pages = 0;    // counts pages that carried depth, for view keys

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ---- Scene facts ---------------------------------------------------------

  function scene(id) {
    var game = dc.ui() && dc.ui().game;
    return (game && game.scenes && game.scenes[id]) || {};
  }

  function isCard(sc) {
    return !!(sc.isCard || sc.isPinnedCard);
  }

  // The page's heading, else its scene's title. The title page's scene is
  // called "Root Scene" for the engine's sake, not the player's.
  function titleFor(sceneId) {
    var h1 = document.querySelector('#content h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    var title = titleText(scene(sceneId).title);
    return title && !/^Root\b/.test(title) ? title : TITLE_PAGE;
  }

  // A title with [+ quality +] inserts compiles to a content object, not a
  // string ("Chancellor [+ chancellor +] replaced by…"); the engine renders
  // it like any other scene text.
  function titleText(title) {
    if (!title || typeof title === 'string') return title;
    try {
      var ui = dc.ui();
      var box = element('div');
      box.innerHTML = ui.contentToHTML.convertLine(ui.dendryEngine._makeDisplayContent(title, true));
      return box.textContent.trim();
    } catch (err) {
      return '';
    }
  }

  function currentSceneId() {
    var engine = dc.ui() && dc.ui().dendryEngine;
    return engine && engine.state ? engine.state.sceneId : null;
  }

  // ---- Collecting ----------------------------------------------------------

  function makeLink(label) {
    var a = element('a', 'dc-link');
    a.href = '#';
    a.setAttribute('data-dc-page', '');
    a.appendChild(document.createTextNode(label + ' '));
    // Jost draws the arrow; the game's serif has none and shows a stray glyph.
    a.appendChild(element('span', 'dc-arrow', '→'));
    return a;
  }

  function linkLabel() {
    return page.nodes.every(function (n) { return n.tagName === 'BLOCKQUOTE'; })
      ? 'Epigraph' : 'Background';
  }

  // The view's title is left out when it only repeats the page's own heading
  // in the decision column (a card's name): the kind label alone then says
  // what the column holds. A title the page doesn't show (the title page's
  // "Before the game begins", a scene's name) stays.
  function viewTitle() {
    var h1 = document.querySelector('#content h1');
    var own = h1 ? h1.textContent.trim() : '';
    return own && own === page.title ? '' : page.title;
  }

  function pageView() {
    return {kind: 'page', key: page.key, title: viewTitle()};
  }

  // The link exists to open the page's depth. While the column shows that
  // page it has nothing to do, and layout.css's wide tier (where the column
  // sits beside the text) hides it; it comes back when the player opens
  // something else, and in the tiers where the column is out of sight.
  function markLink() {
    if (!page || !page.link) return;
    var v = dc.view();
    page.link.classList.toggle('dc-open', v.kind === 'page' && v.key === page.key);
  }

  // Moves this scene's marked nodes out of #content. The first one becomes the
  // link's place; the rest just go. Returns whether anything moved.
  function collect() {
    var content = document.getElementById('content');
    if (!content) return false;
    var marked = content.querySelectorAll('span.depth, blockquote');
    var nodes = [];
    for (var i = 0; i < marked.length; i++) {
      var node = marked[i].tagName === 'BLOCKQUOTE' ? marked[i] : marked[i].closest('p');
      // A node inside one already taken (nested blockquotes) moves with it.
      if (node && nodes.indexOf(node) < 0 && !nodes.some(function (n) { return n.contains(node); })) {
        nodes.push(node);
      }
    }
    if (!nodes.length) return false;

    var sceneId = currentSceneId();
    if (!page) page = {key: 'page' + (++pages), nodes: [], scenes: [], link: null};
    if (sceneId && page.scenes.indexOf(sceneId) < 0) page.scenes.push(sceneId);
    // A card's subtitle is its one-line description. Sub-scenes reuse the
    // field for their choice lines ("-2 resources"), so only a card's own
    // scene supplies one.
    if (!page.subtitle && isCard(scene(sceneId))) page.subtitle = scene(sceneId).subtitle || '';

    var summary = content.querySelector('span.depth-summary');
    var summaryP = summary && summary.closest('p');
    nodes.forEach(function (node, i) {
      page.nodes.push(node);
      if (page.link) {
        node.parentNode.removeChild(node);
      } else if (summaryP) {
        page.link = makeLink(linkLabel());
        summaryP.classList.add('dc-summary');
        summaryP.appendChild(document.createTextNode(' '));
        summaryP.appendChild(page.link);
        node.parentNode.removeChild(node);
      } else if (i === 0) {
        var line = element('p', 'dc-linkline');
        page.link = makeLink(linkLabel());
        line.appendChild(page.link);
        node.parentNode.replaceChild(line, node);
      } else {
        node.parentNode.removeChild(node);
      }
    });
    return true;
  }

  function onContent() {
    var moved = collect();
    if (!page) return;
    // A later scene in a go-to chain can bring the heading.
    var title = titleFor(page.scenes[0]);
    if (!moved && title === page.title) return;
    page.title = title;
    var text = linkLabel();
    var label = page.link && page.link.firstChild;
    if (label) label.nodeValue = text + ' ';
    dc.show(pageView());
    markLink();
  }

  // ---- The view ------------------------------------------------------------

  // Further-reading links for every scene the page displayed, without repeats.
  function furtherReading() {
    var seen = {};
    var found = [];
    page.scenes.forEach(function (id) {
      (links[id] || []).forEach(function (l) {
        if (seen[l.href]) return;
        seen[l.href] = true;
        found.push(l);
      });
    });
    return found;
  }

  function drawPage(view) {
    // Page views die with their page (depth-column.js drops them), so this
    // only guards a view that outlived it.
    if (!page || page.key !== view.key) return '';
    var body = document.createDocumentFragment();
    if (page.subtitle) body.appendChild(element('p', 'dc-lead', page.subtitle));
    page.nodes.forEach(function (node) { body.appendChild(node); });

    var found = furtherReading();
    if (found.length) {
      body.appendChild(element('h4', 'dc-sub', 'Further reading'));
      var list = element('ul', 'dc-links');
      found.forEach(function (l) {
        var item = element('li');
        var a = element('a', '', l.text);
        a.href = l.href;
        a.target = '_blank';
        a.rel = 'noopener';
        item.appendChild(a);
        item.appendChild(document.createTextNode(' '));
        var mark = element('span', 'dc-ext', '↗');
        mark.setAttribute('aria-hidden', 'true');
        item.appendChild(mark);
        list.appendChild(item);
      });
      body.appendChild(list);
    }
    return body;
  }

  // ---- Wiring --------------------------------------------------------------

  // Delegated on the document: the link sits in #content, which the engine
  // rewrites on every page.
  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('[data-dc-page]') : null;
    if (!target || !page) return;
    e.preventDefault();
    dc.show(pageView());
    // Where the column sits below the text, the click would otherwise seem to
    // do nothing. Beside it (three columns) the column is already in view.
    var wide = window.matchMedia && window.matchMedia(WIDE_QUERY).matches;
    var col = document.getElementById('depth_column');
    if (!wide && col && col.scrollIntoView) col.scrollIntoView({behavior: 'smooth', block: 'start'});
  });

  document.addEventListener('depthcolumn:view', markLink);
  dc.register('page', drawPage);
  dc.on('newPage', function () { page = null; });
  dc.on('content', onContent);

  // The list is small and static; a failed load leaves pages without links.
  if (window.fetch) {
    fetch(LINKS_URL).then(function (r) { return r.json(); }).then(function (data) {
      links = data || {};
      // A page view already drawn didn't have the links yet.
      var v = dc.view();
      if (page && v.kind === 'page' && v.key === page.key) dc.show(v);
    }).catch(function (err) {
      console.error('depth column links', err);
    });
  }
}());
