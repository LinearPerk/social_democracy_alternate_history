/*
 * Title page: the centre panel of the title scene, set as a newspaper
 * masthead. The scene's own heading is hidden (the banner above the columns
 * carries the title already) and a picture stands in its place, in the same
 * photo block as the portraits beside it (Carousel.frame), with its credit
 * under it. A pair of lozenges separates the picture from the scene's note, and the
 * menu (Start game, Election simulation, Credits) is ruled like a newspaper
 * list (title-page.css). Nothing is changed in the scene's own markup beyond
 * a class on #content and the two blocks added; the page is rebuilt from the
 * engine on every page, so nothing needs undoing on the way out.
 *
 * It applies where the carousels do: the three-column tier (1300px and up),
 * on the title scene only, before a game has started. A narrower window keeps
 * upstream's look with the heading shown. If the picture has no credit row or
 * fails to load, the page goes back to the heading rather than show a bare
 * image or a hole.
 *
 * Extension point, on window.TitlePage: active() (whether the masthead is
 * showing).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  if (!doc) return;

  var WIDE = '(min-width: 1300px)';
  // The fleuron: two lozenges (their spacing is title-page.css's).
  var FLEURON = '◆◆';

  var credits = null;
  var failed = false;
  var shown = false;

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function started() {
    try {
      return !!root.dendryUI.dendryEngine.state.qualities.started;
    } catch (err) {
      return false;
    }
  }

  // The title scene is root.start_menu_2 (start_menu runs into it).
  function onTitle() {
    try {
      return String(root.dendryUI.dendryEngine.state.sceneId).indexOf('root.start_menu') === 0;
    } catch (err) {
      return false;
    }
  }

  function wide() {
    return !root.matchMedia || root.matchMedia(WIDE).matches;
  }

  function credit(record) {
    var line = root.Carousel.creditLine(record, false);
    var node = el('div', 'cr-credit');
    root.Carousel.paintCredit(doc, node, line);
    return node;
  }

  function remove() {
    var content = doc.getElementById('content');
    if (!content) return;
    content.classList.remove('tp-title');
    Array.prototype.slice.call(content.querySelectorAll('.tp-hero, .tp-fleuron')).forEach(function (node) {
      node.parentNode.removeChild(node);
    });
    shown = false;
  }

  function apply() {
    var content = doc.getElementById('content');
    if (!content || !root.Carousel || !root.Carousel.frame) return;
    if (!wide() || started() || !onTitle() || failed || !credits) {
      if (shown) remove();
      return;
    }
    if (shown && content.querySelector('.tp-hero')) {
      // The engine clears #content's classes whenever a scene is shown
      // (setStyle), and coming back from the election simulation shows two
      // scenes on one page: the picture survives the second, the class
      // doesn't, and the picture would draw unstyled at its full size.
      content.classList.add('tp-title');
      return;
    }
    var record = credits[root.Carousel.titlePicture];
    var heading = content.querySelector('h1');
    if (!record || !record.source || !heading) return;

    var hero = el('div', 'tp-hero');
    hero.style.setProperty('--cr-ar', String(record.width / record.height));
    var picture = el('div', 'tp-picture');
    var img = el('img', 'cr-img');
    img.alt = record.title;
    img.onerror = function () {
      failed = true;
      remove();
    };
    img.src = root.Carousel.titlePicture;
    picture.appendChild(root.Carousel.frame(img));
    var cap = el('div', 'tp-cap');
    cap.appendChild(el('div', 'cr-name', record.title));
    cap.appendChild(credit(record));
    hero.appendChild(picture);
    hero.appendChild(cap);
    var fleuron = el('div', 'tp-fleuron', FLEURON);
    fleuron.setAttribute('aria-hidden', 'true');

    content.classList.add('tp-title');
    content.insertBefore(hero, heading.nextSibling);
    content.insertBefore(fleuron, hero.nextSibling);
    shown = true;
  }

  function init() {
    if (root.DepthColumn) {
      // A new page wipes #content; the class on it would outlive that.
      root.DepthColumn.on('newPage', remove);
      root.DepthColumn.on('content', apply);
    }
    if (root.matchMedia) {
      var query = root.matchMedia(WIDE);
      if (query.addEventListener) query.addEventListener('change', apply);
    }
    if (root.fetch) {
      root.fetch('layout/credits.json').then(function (response) {
        return response.ok ? response.json() : null;
      }).then(function (data) {
        credits = data;
        apply();
      }).catch(function () {});
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  root.TitlePage = {
    active: function () { return shown; }
  };
}(window));
