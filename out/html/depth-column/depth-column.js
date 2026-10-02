/*
 * Depth column: the machine behind #depth_column. It shows one view at a
 * time under a control strip (Back, then the resting views as text buttons)
 * and keeps a history so Back works. The strip lives in a bar of its own,
 * #depth-bar, the column's sibling just above it, where layout.css sets it on
 * the row of column bars; it draws when the column does. It knows nothing about page depth, the
 * Library's contents, polls, or entries: those register a renderer for their
 * kind and call show(). The module stays self-contained (no dependence on the
 * state column).
 *
 * A view is {kind, key, title}. Two views are the same view when kind and
 * key match. A title of '' draws no heading (the body carries its own).
 *
 * Resting views are the ones the strip offers: Polls, Die Zeit (historical
 * mode only), and the Library home. During play the column rests on Die Zeit
 * in historical mode and on Polls otherwise; page depth and entries take the
 * column for a while and Back returns to the resting view. A pick from the
 * strip clears the history.
 *
 * Extension points, on window.DepthColumn:
 *   register(kind, fn)  fn(view) returns the view's body, a Node or an HTML
 *                       string, or null when the view no longer applies (the
 *                       column then steps back). One renderer per kind; a
 *                       later register replaces the earlier one.
 *   show(view), replace(view), back(), home(), pick(kind)
 *   on('newPage' | 'content', fn)
 *                       run after a new page begins, and after a scene's text
 *                       has landed in #content. Page depth collects here and
 *                       calls show().
 *   ui()                the dendryUI instance, for renderers that need the
 *                       engine.
 *
 * When the open view changes, the document gets a 'depthcolumn:view' event,
 * so other columns can mark what is open without this module knowing them.
 */
(function () {
  'use strict';

  var KINDS = ['page', 'entry', 'library', 'polls', 'times'];
  var KIND_LABELS = {page: 'Background', entry: 'Entry', library: 'Library'};
  // The strip's resting-view buttons, in order.
  var PICKS = [
    {kind: 'polls', label: 'Polls'},
    {kind: 'times', label: 'Die Zeit'},
    {kind: 'library', label: 'Library'}
  ];
  var HISTORY_CAP = 20;
  var VIEW_EVENT = 'depthcolumn:view';

  var ui = null;
  var col = null;
  var bar = null;
  var view = restingDefault();
  var history = [];
  var drawn = false;
  var guard = 0;
  var renderers = {};
  var listeners = {newPage: [], content: []};

  // The game's qualities, or {} before the engine has a state.
  function qualities() {
    try {
      return ui.dendryEngine.state.qualities || {};
    } catch (err) {
      return {};
    }
  }

  function historical() {
    return !!qualities().historical_mode;
  }

  function libraryHome() {
    // No title: the strip's current button already says "Library".
    return {kind: 'library', key: null, title: ''};
  }

  // What the column rests on when the player has picked nothing. `auto` marks
  // it as the mode's choice, so a later look at the mode (the game starts
  // after the column was first built) replaces it.
  function restingDefault() {
    return {kind: historical() ? 'times' : 'polls', key: null, title: '', auto: true};
  }

  function pickedView(kind) {
    return kind === 'library' ? libraryHome() : {kind: kind, key: null, title: ''};
  }

  function isResting(v) {
    return v.kind === 'polls' || v.kind === 'times' || (v.kind === 'library' && !v.key);
  }

  function sameView(a, b) {
    return a.kind === b.kind && a.key === b.key;
  }

  // ---- Views ---------------------------------------------------------------

  function setView(next) {
    var changed = !sameView(view, next);
    view = next;
    if (changed && document.dispatchEvent && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent(VIEW_EVENT));
    }
  }

  function show(next) {
    if (!sameView(view, next)) {
      history.push(view);
      if (history.length > HISTORY_CAP) history.shift();
    }
    setView(next);
    render();
  }

  // Swaps the open view for another without a history step, for a view that
  // follows the game (the month entry moving to the new month).
  function replace(next) {
    setView(next);
    render();
  }

  function back() {
    setView(history.pop() || restingDefault());
    render();
  }

  // The resting view for the mode, keeping the history so Back returns.
  function home() {
    show(restingDefault());
  }

  // A pick from the strip: a resting view with nothing behind it.
  function pick(kind) {
    history = [];
    setView(pickedView(kind));
    render();
  }

  // A page's depth belongs to that page, so nothing of it outlives the page.
  // Dropping page views can leave a view twice in a row (entry, page, same
  // entry); those collapse so Back doesn't step to where the player is.
  function newPage() {
    var before = view;
    history = history.filter(function (v) { return v.kind !== 'page'; });
    if (view.kind === 'page') setView(history.pop() || restingDefault());
    history = history.filter(function (v, i) {
      var next = i + 1 < history.length ? history[i + 1] : view;
      return !sameView(v, next);
    });
    emit('newPage');
    if (view !== before) render();
    else sync();
  }

  // ---- Drawing -------------------------------------------------------------

  // With a game under way (`started` is set when the player begins) the
  // column always draws, at every width. Before that it stays empty, so
  // layout.css's :empty rules give it no space in the two-column tier and no
  // panel on the title page; a page's own depth (the title page's epigraph)
  // or a view with history behind it still draws.
  function shouldDraw() {
    return !isResting(view) || history.length > 0 || !!qualities().started;
  }

  function sync() {
    if (shouldDraw() !== drawn) render();
  }

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function button(label, attribute, value, disabled) {
    var el = element('button', '', label);
    el.type = 'button';
    el.setAttribute(attribute, value);
    el.disabled = disabled;
    return el;
  }

  function titleOf(v) {
    return v.title !== undefined ? v.title : KIND_LABELS[v.kind] || '';
  }

  // The body, or null when the renderer says the view no longer applies.
  function bodyOf(v) {
    var body = element('div', 'dc-body');
    var draw = renderers[v.kind];
    if (!draw) return body;
    try {
      var content = draw(v);
      if (content === null) return null;
      if (typeof content === 'string') body.innerHTML = content;
      else if (content) body.appendChild(content);
    } catch (err) {
      console.error('depth column', err);
    }
    return body;
  }

  // A view that outlived its mode gives way to the mode's resting view: the
  // default is re-read (the game may have started or changed mode since it
  // was chosen), and Die Zeit only exists in historical mode.
  function settle() {
    if (view.auto || (view.kind === 'times' && !historical())) view = restingDefault();
  }

  function strip() {
    var el = element('div', 'dc-strip');
    el.appendChild(button('← Back', 'data-dc-back', '', history.length === 0));
    PICKS.forEach(function (item) {
      if (item.kind === 'times' && !historical()) return;
      var current = isResting(view) && view.kind === item.kind;
      var b = button(item.label, 'data-dc-pick', item.kind, current);
      if (current) b.setAttribute('aria-current', 'true');
      el.appendChild(b);
    });
    return el;
  }

  function render() {
    if (!col) return;
    settle();
    drawn = shouldDraw();
    col.textContent = '';
    bar.textContent = '';
    if (!drawn) {
      col.removeAttribute('data-view');
      return;
    }
    var body = bodyOf(view);
    if (body === null) {
      // The view no longer applies (the interior police entry once the SPD
      // has left office): step back to what was under it.
      if (guard < HISTORY_CAP + 2) {
        guard += 1;
        try {
          back();
        } finally {
          guard -= 1;
        }
      }
      return;
    }
    col.setAttribute('data-view', view.kind);
    bar.appendChild(strip());
    // The strip's current button already names a resting view; the others
    // say what kind of view they are.
    if (!isResting(view)) col.appendChild(element('div', 'dc-kind', KIND_LABELS[view.kind]));
    var title = titleOf(view);
    if (title) col.appendChild(element('h3', 'dc-title', title));
    col.appendChild(body);
  }

  // Resting views and entries show numbers that move each month, so they
  // redraw when new text lands or the sidebar refreshes. Page depth and
  // Library sections have their own redraw (page-depth.js, library.js).
  function refreshLive() {
    if (isResting(view) || view.kind === 'entry') render();
  }

  // ---- Hooks ---------------------------------------------------------------

  function emit(name) {
    listeners[name].forEach(function (fn) {
      try {
        fn();
      } catch (err) {
        console.error('depth column', err);
      }
    });
  }

  function on(name, fn) {
    if (!listeners[name]) throw new Error('unknown event: ' + name);
    listeners[name].push(fn);
  }

  function register(kind, fn) {
    if (KINDS.indexOf(kind) < 0) throw new Error('unknown view kind: ' + kind);
    renderers[kind] = fn;
  }

  // Delegated on the document because the strip is rebuilt on every render.
  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('[data-dc-back],[data-dc-pick]') : null;
    if (!target) return;
    e.preventDefault();
    if (target.hasAttribute('data-dc-back')) back();
    else pick(target.getAttribute('data-dc-pick'));
  });

  // ---- Install -------------------------------------------------------------

  function install(instance) {
    ui = instance;
    col = document.getElementById('depth_column');
    bar = document.getElementById('depth-bar');
    if (!bar) {
      bar = element('div', 'column-bar');
      bar.id = 'depth-bar';
      col.parentNode.insertBefore(bar, col);
    }

    // A new page begins: the previous page's depth is stale.
    var originalNewPage = ui.newPage;
    ui.newPage = function () {
      try {
        newPage();
      } catch (err) {
        console.error('depth column', err);
      }
      return originalNewPage.apply(this, arguments);
    };

    // A scene's text has landed; upstream's handler (the sidebar) runs first,
    // so the qualities it reads are current when we read them.
    var originalDisplay = window.onDisplayContent;
    window.onDisplayContent = function () {
      if (originalDisplay) originalDisplay.apply(this, arguments);
      try {
        emit('content');
        refreshLive();
        sync();
      } catch (err) {
        console.error('depth column', err);
      }
    };

    // Any refresh of the sidebar (a setting changed, qualities set from
    // outside) can change what a resting view or entry shows.
    var originalUpdate = window.updateSidebar;
    if (originalUpdate) {
      window.updateSidebar = function () {
        var result = originalUpdate.apply(this, arguments);
        try {
          refreshLive();
        } catch (err) {
          console.error('depth column', err);
        }
        return result;
      };
    }
    render();
  }

  var modify = window.dendryModifyUI;
  window.dendryModifyUI = function (instance) {
    var result = modify ? modify(instance) : undefined;
    install(instance);
    return result;
  };

  window.DepthColumn = {
    show: show,
    replace: replace,
    back: back,
    home: home,
    pick: pick,
    newPage: newPage,
    on: on,
    register: register,
    renderer: function (kind) { return renderers[kind]; },
    view: function () { return view; },
    history: function () { return history.slice(); },
    ui: function () { return ui; }
  };
}());
