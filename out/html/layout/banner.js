/*
 * Banner: upstream's page header (title, author, and the Library, Save/Load
 * and Options links) in two states. Full is upstream's banner as laid out by
 * layout.css. Slim is a one-line strip (the `slim` class on the same
 * header element) that hands its height to the columns. Before a game starts
 * the banner stays full. Once it has started, the banner goes slim on each
 * new page. A click on the title (a button) expands it and pushes the grid
 * down; the next page, a scroll, or a second click collapses it again. The
 * state is not saved, and nothing here reacts to hover.
 *
 * The banner's height sets where the columns start, and the panels' minimum
 * heights depend on that (layout.css: the panels end with the state column),
 * so this module also publishes three CSS variables on the root element:
 * --columns-top, the page offset of the row the three columns sit in,
 * --decision-h, the decision panel's height, and --state-h, the state
 * column's box height (the dashboard, which sets the panels' height during
 * play). They follow the banner through its animation, and any other change
 * of any (a window resize, a new page, a tab switch, a font loading).
 *
 * Extension point, on window.Banner: expand(), collapse(), isSlim().
 */
(function () {
  'use strict';

  var DURATION = 200;
  // How far the page may scroll after an expand before the banner collapses.
  var SCROLL_SLOP = 12;
  // Scrolling the engine causes itself while the expand settles (scroll
  // anchoring) must not count as the player's scroll.
  var SETTLE = DURATION + 100;

  var header = null;
  var button = null;
  var slim = false;
  // A new page has begun and its content hasn't landed yet.
  var fresh = false;
  // The banner has gone slim for the game under way; a later expand is the
  // player's, and stays until the next page.
  var engaged = false;
  var baseline = null;
  var settleTimer = 0;
  var animation = null;

  function started() {
    try {
      return !!window.dendryUI.dendryEngine.state.qualities.started;
    } catch (err) {
      return false;
    }
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Height and vertical margins: what the grid below moves with.
  function snapshot() {
    var style = window.getComputedStyle(header);
    return {
      height: header.getBoundingClientRect().height,
      top: parseFloat(style.marginTop) || 0,
      bottom: parseFloat(style.marginBottom) || 0
    };
  }

  function px(box) {
    return {
      height: box.height + 'px',
      marginTop: box.top + 'px',
      marginBottom: box.bottom + 'px'
    };
  }

  function stopAnimation() {
    if (animation) animation.cancel();
    animation = null;
    header.classList.remove('banner-moving');
  }

  // The class has already changed, so the layout is at its end state; this
  // animates from the old box to it. The header's height is part of the
  // grid's first row, so the columns below move with it.
  function animate(from) {
    var to = snapshot();
    if (reducedMotion() || !header.animate) return;
    if (from.height === to.height && from.top === to.top && from.bottom === to.bottom) return;
    header.classList.add('banner-moving');
    var run = header.animate([px(from), px(to)], {duration: DURATION, easing: 'ease'});
    animation = run;
    var done = function () {
      if (animation === run) {
        animation = null;
        header.classList.remove('banner-moving');
      }
    };
    run.onfinish = function () {
      done();
      publish();
    };
    run.oncancel = done;
    follow(run);
  }

  var columnsTop = null;
  var decisionHeight = null;
  var stateHeight = null;
  var frame = 0;
  var settleFrame = 0;

  // The panels' minimum heights follow from these measurements.
  function publish() {
    var content = document.getElementById('content');
    if (!content) return;
    var box = content.getBoundingClientRect();
    var top = Math.round((box.top + window.pageYOffset) * 100) / 100;
    var height = Math.round(box.height * 100) / 100;
    var root = document.documentElement;
    if (top !== columnsTop) {
      columnsTop = top;
      root.style.setProperty('--columns-top', top + 'px');
    }
    if (height !== decisionHeight) {
      decisionHeight = height;
      root.style.setProperty('--decision-h', height + 'px');
    }
    // The sidebar's own box: its content's height up to the cap, which
    // itself moves with the banner. Before a game it is hidden (0).
    var sidebar = document.getElementById('stats_sidebar');
    var state = sidebar ? Math.round(sidebar.getBoundingClientRect().height * 100) / 100 : 0;
    if (state !== stateHeight) {
      stateHeight = state;
      root.style.setProperty('--state-h', state + 'px');
    }
  }

  // While the banner animates, its height changes on every frame without
  // any element resizing on its own, so the columns' top is read each frame.
  function follow(run) {
    window.cancelAnimationFrame(frame);
    var step = function () {
      publish();
      if (animation === run) frame = window.requestAnimationFrame(step);
    };
    step();
  }

  function watchColumns() {
    publish();
    window.addEventListener('resize', publish);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(publish);
    if (window.ResizeObserver) {
      var observer = new window.ResizeObserver(publish);
      ['header', '#date-line', '#content', '#mid_panel', '#stats_sidebar'].forEach(function (selector) {
        var el = document.querySelector(selector);
        if (el) observer.observe(el);
      });
    }
    // A page that lands is cleared and refilled in one task, so the observer
    // can see the same size before and after and stay quiet while a read in
    // between caught the cleared box. Reading again once the change is done
    // keeps the variables true.
    if (window.MutationObserver) {
      var settle = new window.MutationObserver(function () {
        window.cancelAnimationFrame(settleFrame);
        settleFrame = window.requestAnimationFrame(publish);
      });
      ['#content', '#stats_sidebar'].forEach(function (selector) {
        var el = document.querySelector(selector);
        if (el) settle.observe(el, {childList: true, subtree: true, characterData: true});
      });
    }
  }

  function label() {
    var on = started();
    button.disabled = !on;
    if (on) {
      button.setAttribute('aria-expanded', slim ? 'false' : 'true');
      button.title = slim ? 'Show the full banner' : 'Hide the subtitle';
    } else {
      button.removeAttribute('aria-expanded');
      button.removeAttribute('title');
    }
  }

  function setSlim(want) {
    window.clearTimeout(settleTimer);
    baseline = null;
    if (want === slim) {
      label();
      return;
    }
    stopAnimation();
    var from = snapshot();
    slim = want;
    header.classList.toggle('slim', slim);
    label();
    animate(from);
    // The scroll position to measure the player's scrolling from is taken
    // once the expand has settled.
    if (!slim) {
      settleTimer = window.setTimeout(function () {
        baseline = window.pageYOffset;
      }, SETTLE);
    }
  }

  function expand() {
    if (started()) setSlim(false);
  }

  function collapse() {
    if (started()) setSlim(true);
  }

  function onClick() {
    if (!started()) return;
    setSlim(!slim);
  }

  function onScroll() {
    if (slim || baseline === null || !started()) return;
    if (Math.abs(window.pageYOffset - baseline) > SCROLL_SLOP) setSlim(true);
  }

  // A new page begins; its text lands in a moment ('content'), and only then
  // are the qualities (`started` among them) current.
  function onNewPage() {
    fresh = true;
  }

  function onContent() {
    // The first page can land before the document's ready handlers have run.
    install();
    publish();
    if (!button) return;
    if (!started()) {
      engaged = false;
      fresh = false;
      setSlim(false);
      return;
    }
    if (fresh || !engaged) setSlim(true);
    engaged = true;
    fresh = false;
  }

  function install() {
    header = document.querySelector('header');
    var title = document.getElementById('game-title');
    if (!header || !title || button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'banner-toggle';
    button.textContent = title.textContent.trim();
    title.textContent = '';
    title.appendChild(button);
    button.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, {passive: true});
    label();
  }

  function ready() {
    install();
    watchColumns();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  if (window.DepthColumn) {
    window.DepthColumn.on('newPage', onNewPage);
    window.DepthColumn.on('content', onContent);
  }

  window.Banner = {
    expand: expand,
    collapse: collapse,
    isSlim: function () { return slim; }
  };
}());
