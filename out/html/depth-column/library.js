/*
 * Library in the depth column: the Library's home (its intro and menu) and
 * its text sections, drawn from the game's own library scenes so the column
 * and upstream's Library page never disagree. Registers the 'library' view
 * kind with depth-column.js; no scene text lives here.
 *
 * Two sections, figures and public opinion, draw charts from onDisplay code
 * into #content. They can't render in the column, so their menu entries keep
 * upstream's route (the Library replaces play) and say so.
 */
(function () {
  'use strict';

  var DC = window.DepthColumn;
  if (!DC) return;

  var IN_MAIN_COLUMN = {'library.figures': true, 'library.public_opinion': true};
  var WIDE_QUERY = '(min-width: 1300px)';

  // ---- Scene content -------------------------------------------------------

  function scene(id) {
    var ui = DC.ui();
    return ui && ui.game.scenes[id];
  }

  // The same steps game.js takes for the sidebar: arrival effects first, so
  // values the section reads are current, then the scene's text.
  function sectionHTML(id) {
    var ui = DC.ui();
    var sc = scene(id);
    if (!sc) return '';
    var engine = ui.dendryEngine;
    if (sc.onArrival) engine._runActions(sc.onArrival);
    var html = sc.content
      ? ui.contentToHTML.convert(engine._makeDisplayContent(sc.content, true))
      : '';
    // Upstream's go-to: the current-government page continues into the
    // cabinet when the SPD is in office.
    if (id === 'library.curr_gov' && engine.state.qualities.spd_in_government) {
      html += sectionHTML('library.cabinet');
    }
    return html;
  }

  // The Library scene's own text, less its heading (the column's title says
  // "Library" already).
  function introHTML() {
    var ui = DC.ui();
    var sc = scene('library');
    if (!sc || !sc.content) return '';
    var body = [].concat(sc.content).filter(function (block) {
      return block.type !== 'heading';
    });
    return ui.contentToHTML.convert(ui.dendryEngine._makeDisplayContent(body, true));
  }

  // [{key, title}] from upstream's menu scene, less its exit option.
  function libraryMenu() {
    var menu = scene('library.menu');
    return ((menu && menu.options) || [])
      .filter(function (option) { return option.id.indexOf('@library.') === 0; })
      .map(function (option) { return {key: option.id.slice(1), title: option.title}; });
  }

  function titleOf(key) {
    var found = libraryMenu().filter(function (item) { return item.key === key; })[0];
    return found ? found.title : 'Library';
  }

  function libraryView(key) {
    return {kind: 'library', key: key, title: titleOf(key)};
  }

  // ---- Rendering -----------------------------------------------------------

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function link(key, label) {
    var a = element('a', '', label);
    a.href = '#';
    a.setAttribute('data-dc-lib', key);
    return a;
  }

  function home() {
    var box = element('div');
    box.innerHTML = introHTML();
    var list = element('ul', 'dc-menu');
    libraryMenu().forEach(function (item) {
      var li = element('li');
      li.appendChild(link(item.key, item.title));
      if (IN_MAIN_COLUMN[item.key]) li.appendChild(element('span', 'dc-note', ' (opens in the main column)'));
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  function render(view) {
    if (!view.key) return home();
    if (IN_MAIN_COLUMN[view.key]) {
      // Reached by a route other than the menu; hand it to the main column.
      var p = element('p');
      p.appendChild(link(view.key, view.title || 'Open this section'));
      p.appendChild(element('span', 'dc-note', ' (opens in the main column)'));
      return p;
    }
    var box = element('div', 'dc-section');
    box.innerHTML = sectionHTML(view.key);
    return box;
  }

  DC.register('library', render);

  // ---- Behaviour -----------------------------------------------------------

  // Delegated on the document because the column is rebuilt on every render.
  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('[data-dc-lib]') : null;
    if (!target) return;
    e.preventDefault();
    var key = target.getAttribute('data-dc-lib');
    if (IN_MAIN_COLUMN[key]) DC.ui().dendryEngine.goToScene(key);
    else DC.show(libraryView(key));
  });

  // A section left open goes stale as the game moves on (seat counts,
  // relations), so it redraws when a new page's text lands. show() with the
  // same view redraws without adding history.
  DC.on('content', function () {
    var view = DC.view();
    if (view.kind === 'library' && view.key) DC.show(view);
  });

  // Where the column sits beside play: the three-column tier with a game
  // under way. Below that it sits under the decision column, out of sight of
  // the header, so the header's link keeps upstream's route there.
  function columnBesidePlay() {
    var sidebar = document.getElementById('stats_sidebar');
    var started = !!sidebar && !sidebar.classList.contains('sidebar-hidden');
    return !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches && started;
  }

  // The header's Library link. With the column beside play it opens the
  // column's home and play carries on; from inside upstream's Library page,
  // or anywhere the column isn't beside play, upstream's toggle still applies.
  var showStats = window.showStats;
  window.showStats = function () {
    var ui = DC.ui();
    var inUpstreamLibrary = !!ui && String(ui.dendryEngine.state.sceneId).indexOf('library') === 0;
    if (ui && columnBesidePlay() && !inUpstreamLibrary) DC.show({kind: 'library', key: null, title: ''});
    else if (showStats) showStats.apply(this, arguments);
  };
}());
