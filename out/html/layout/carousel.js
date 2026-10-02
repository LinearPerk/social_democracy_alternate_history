/*
 * Carousel: before a game starts, the two side panels beside the title page
 * (and the Start page) show the game's own art. The left panel is a wall of
 * the landscape card images (street scenes, the Reichstag, the banks),
 * stacked as many as its height holds (two on a laptop, three on a large
 * monitor), each with its own caption and credit. The right takes one
 * advisor portrait at a time in a newspaper photo block, captioned with the
 * person's name and faction. Every picture carries a credit line (title,
 * artist, licence and a link to the source page) read from credits.json,
 * which test/tools/build-credits.mjs builds from the asset set's source
 * table. An image with no row in credits.json is not shown.
 *
 * The panels stand in for the empty state and depth panels (layout.css hides
 * those while a carousel is up). They exist only at the three-column tier
 * (1300px and up), where those panels show; a narrower window builds none and
 * requests no images. They are removed, with their timers, when the game
 * starts: a new game, or a save loaded from the title page.
 *
 * Behaviour: auto-advance every 8 s (the right panel 4 s out of step with
 * the left). On the wall each tick replaces one picture, the oldest, so the
 * wall is never blank; the buttons and arrow keys move the whole wall on or
 * back, and the row of dots (one per picture) lights those showing and
 * starts the wall at the one clicked. Paused while the pointer is over a
 * panel or focus is inside it. prefers-reduced-motion turns off the
 * auto-advance and the crossfade. Only the pictures showing and the next one
 * are requested. If an image fails to load (the public build doesn't ship art
 * yet) that picture is dropped, and a panel with none left removes itself.
 *
 * Version two takes media from the period library (assets/period-1914-1939/)
 * once its shipping rules are settled; the slide lists are the place to add
 * it.
 *
 * Extension point, on window.Carousel: active() (how many panels and timers
 * are live; 0 once the game has started), frame(img) (the photo block, which
 * title-page.js borrows), titlePicture (the file that page shows, kept off
 * the wall), and the pure list builders (landscapeSlides,
 * portraitSlides, peopleFromScenes, creditLine) that the unit test drives.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Carousel = api;
}(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  var INTERVAL = 8000;
  var STAGGER = 4000;
  var FADE = 180;
  // Room, in px, a rule between two stacked pictures takes with its air.
  var RULE_SPACE = 12;
  var PORTRAITS = 'img/portraits/';
  // The title page's own picture (title-page.js); the wall leaves it out so
  // the two never show the same photograph side by side.
  var TITLE_PICTURE = 'img/reichstag_2.jpg';

  // Advisor faction as the recruit menu groups them (the same grouping the
  // decision column uses); the label is what the state column calls it.
  var FACTIONS = {
    left: 'Left',
    center: 'Center',
    labor: 'Labor',
    reformist: 'Reformist',
    neorev: 'Neorevisionist',
    nonfactional: 'Non-factional'
  };

  var SOURCES = [
    [/(^|\.)commons\.wikimedia\.org$/, 'Wikimedia Commons'],
    [/(^|\.)wikipedia\.org$/, 'Wikipedia'],
    [/(^|\.)flickr\.com$/, 'Flickr'],
    [/(^|\.)fes\.de$/, 'Friedrich-Ebert-Stiftung']
  ];

  // Pure pieces

  function sourceName(url) {
    var host = '';
    try {
      host = new URL(url).hostname;
    } catch (err) {
      return 'Source';
    }
    for (var i = 0; i < SOURCES.length; i += 1) {
      if (SOURCES[i][0].test(host)) return SOURCES[i][1];
    }
    return host.replace(/^www\./, '');
  }

  // The credit as data: the text before the link, and the link. A portrait's
  // credit leads with the picture's own title when it has one; a landscape
  // slide's title is already its caption. The licence is also kept apart
  // (with its URL, when the source gave one) so the painter can link its name
  // to the licence text.
  function creditLine(record, withTitle) {
    var parts = [];
    if (withTitle && record.title) parts.push(record.title);
    if (record.artist) parts.push(record.artist);
    var lead = parts.join(' · ');
    if (record.license) parts.push(record.license);
    return {
      text: parts.join(' · '),
      lead: lead,
      license: record.license || '',
      licenseUrl: record.licenseUrl || '',
      href: record.source,
      label: sourceName(record.source)
    };
  }

  function outLink(document, href, label) {
    var a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // Draws a credit line into a node: the lead text, the licence (a link to
  // its text when there is one) and the link to the source page. Both links
  // read the same, so the licence is as easy to follow as the source.
  function paintCredit(document, node, line) {
    node.textContent = '';
    if (line.lead) node.appendChild(document.createTextNode(line.lead + ' · '));
    if (line.license) {
      if (line.licenseUrl) node.appendChild(outLink(document, line.licenseUrl, line.license));
      else node.appendChild(document.createTextNode(line.license));
      node.appendChild(document.createTextNode(' · '));
    }
    node.appendChild(outLink(document, line.href, line.label));
  }

  function isPortrait(file) {
    return file.indexOf(PORTRAITS) === 0;
  }

  // Landscape card images that have a source row and a title.
  function landscapeSlides(credits) {
    return Object.keys(credits || {}).filter(function (file) {
      var r = credits[file];
      return !isPortrait(file) && r.width > r.height && r.title && r.source;
    }).sort().map(function (file) {
      var r = credits[file];
      return {file: file, caption: r.title, note: '', ratio: r.width / r.height, credit: creditLine(r, false)};
    });
  }

  // Advisors (and their card image and faction) from the game's scenes.
  // Returns [{file, name, faction}] in scene order; people the recruit menu
  // doesn't group get no faction.
  function peopleFromScenes(scenes) {
    var people = [];
    Object.keys(scenes || {}).forEach(function (id) {
      var scene = scenes[id];
      if (id.indexOf('.') >= 0 || !scene || !scene.cardImage || !isPortrait(scene.cardImage)) return;
      if ((scene.tags || []).indexOf('advisor') < 0 || typeof scene.title !== 'string') return;
      var faction = '';
      var menu = scenes['shuffle_leadership.add_' + id];
      ((menu && menu.tags) || []).forEach(function (tag) {
        var key = tag.replace(/_advisor$/, '');
        if (tag !== key && FACTIONS[key]) faction = FACTIONS[key];
      });
      people.push({file: scene.cardImage, name: scene.title, faction: faction});
    });
    return people;
  }

  // Portraits of those people that have a source row.
  function portraitSlides(credits, people) {
    var slides = [];
    (people || []).forEach(function (p) {
      var r = credits && credits[p.file];
      if (!r || !r.source) return;
      slides.push({file: p.file, caption: p.name, note: p.faction, ratio: r.width / r.height, credit: creditLine(r, true)});
    });
    return slides;
  }

  // Panels (browser only)

  var doc = root.document;
  var panels = [];
  var credits = null;
  var built = false;
  var stopped = false;
  var lastChange = 0;
  var observer = null;
  var WIDE = '(min-width: 1300px)';

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // One panel. A stack panel (the landscapes) shows as many pictures, one
  // above another, as its height holds; each tick the oldest of them gives
  // way to the next in the list. A single panel (the portraits) shows one,
  // in a frame. Either way the buttons, the dots and the arrow keys move the
  // whole set on at once.
  function makePanel(id, label, slides, firstDelay, stack) {
    var timers = [];
    var fades = [];
    var head = Math.floor(Math.random() * slides.length);
    var paused = false;
    var dead = false;
    var preloaded = {};
    var dots = [];
    var slots = [];
    var oldest = 0;
    var watcher = null;

    var panel = el('aside', 'cr-panel ' + (stack ? 'cr-stack' : 'cr-single'));
    panel.id = id;
    panel.tabIndex = 0;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-roledescription', 'carousel');
    panel.setAttribute('aria-label', label);

    var inner = el('div', 'cr-inner');
    var wall = el('div', 'cr-wall');
    var prev = el('button', 'cr-step cr-prev', '‹');
    var next = el('button', 'cr-step cr-next', '›');
    [prev, next].forEach(function (b) { b.type = 'button'; });
    prev.setAttribute('aria-label', stack ? 'Previous pictures' : 'Previous slide');
    next.setAttribute('aria-label', stack ? 'Next pictures' : 'Next slide');
    var dotRow = el('div', 'cr-dots');

    inner.appendChild(wall);
    if (stack) {
      // The stack's buttons sit beside the dots, clear of the pictures.
      var foot = el('div', 'cr-foot');
      foot.appendChild(prev);
      foot.appendChild(dotRow);
      foot.appendChild(next);
      inner.appendChild(foot);
    } else {
      inner.appendChild(dotRow);
    }
    panel.appendChild(inner);

    function later(fn, ms) {
      var handle = root.setTimeout(function () {
        timers.splice(timers.indexOf(handle), 1);
        fn();
      }, ms);
      timers.push(handle);
      return handle;
    }

    function clearTimers() {
      timers.forEach(function (h) { root.clearTimeout(h); });
      timers = [];
    }

    function wrap(i) {
      return ((i % slides.length) + slides.length) % slides.length;
    }

    // A slot: a picture with its caption under it.
    function makeSlot() {
      var slot = el('div', 'cr-slot');
      var stage = el('div', 'cr-stage');
      var img = el('img', 'cr-img');
      img.alt = '';
      if (stack) {
        stage.appendChild(img);
      } else {
        stage.appendChild(frame(img));
        stage.appendChild(prev);
        stage.appendChild(next);
      }
      var cap = el('div', 'cr-cap');
      var name = el('div', 'cr-name');
      var credit = el('div', 'cr-credit');
      cap.appendChild(name);
      cap.appendChild(credit);
      slot.appendChild(stage);
      slot.appendChild(cap);
      return {el: slot, stage: stage, img: img, name: name, credit: credit, slide: null};
    }

    function drop(file) {
      var at = -1;
      slides.forEach(function (s, i) { if (s.file === file) at = i; });
      if (at < 0) return;
      slides.splice(at, 1);
      if (at < head) head -= 1;
      if (!slides.length) {
        destroy();
        return;
      }
      head = wrap(head);
      buildDots();
      // Whatever slot held it takes the next picture not already up.
      slots.forEach(function (slot) {
        if (slot.slide && slot.slide.file === file) fill(slot, takeNext(), true);
      });
      if (slots.length > slides.length) layout();
    }

    function preload(slide) {
      if (!slide || preloaded[slide.file]) return;
      preloaded[slide.file] = true;
      var probe = new root.Image();
      probe.onerror = function () { drop(slide.file); };
      probe.src = slide.file;
    }

    function buildDots() {
      dotRow.textContent = '';
      dots = slides.map(function (slide, i) {
        var dot = el('button', 'cr-dot');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Picture ' + (i + 1) + ' of ' + slides.length);
        dot.addEventListener('click', function () { showFrom(i); });
        dotRow.appendChild(dot);
        return dot;
      });
      markDots();
    }

    // The row is the progress through the set: the pictures now up are lit.
    function markDots() {
      var up = {};
      slots.forEach(function (slot) { if (slot.slide) up[slot.slide.file] = true; });
      var first = true;
      dots.forEach(function (dot, i) {
        var on = !!up[slides[i].file];
        dot.classList.toggle('on', on);
        dot.tabIndex = on && first ? 0 : -1;
        if (on) first = false;
        if (on) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function paintCaption(slot, slide) {
      slot.name.textContent = '';
      slot.name.appendChild(doc.createTextNode(slide.caption));
      if (slide.note) slot.name.appendChild(el('span', 'cr-note', ' · ' + slide.note));
      paintCredit(doc, slot.credit, slide.credit);
    }

    // Puts a slide in a slot, with a crossfade unless it is the first.
    function fill(slot, slide, instant) {
      var img = slot.img;
      slot.slide = slide;
      paintCaption(slot, slide);
      var swap = function () {
        if (slot.slide !== slide) return;
        // The frame takes the new picture's shape as it is swapped in.
        slot.stage.style.setProperty('--cr-ar', String(slide.ratio || 1.5));
        img.onload = function () { img.classList.remove('cr-out'); };
        img.onerror = function () { drop(slide.file); };
        img.src = slide.file;
        img.alt = slide.caption;
      };
      if (instant || reducedMotion() || !img.getAttribute('src')) {
        img.classList.remove('cr-out');
        swap();
      } else {
        img.classList.add('cr-out');
        // Apart from the tick timer, which a change restarts.
        fades.push(root.setTimeout(swap, FADE));
      }
      preload(slide);
      preload(slides[head]);
      markDots();
    }

    // The next picture in the list that is not already up.
    function takeNext() {
      for (var tries = 0; tries < slides.length; tries += 1) {
        var slide = slides[head];
        head = wrap(head + 1);
        if (!slots.some(function (s) { return s.slide === slide; })) return slide;
      }
      return slides[wrap(head - 1)];
    }

    // Shows a whole set of pictures from slide `at` on, every slot at once.
    function showFrom(at) {
      if (dead || !slots.length) return;
      lastChange = Date.now();
      head = wrap(at);
      slots.forEach(function (slot) { slot.slide = null; });
      slots.forEach(function (slot) {
        var slide = slides[head];
        head = wrap(head + 1);
        fill(slot, slide, false);
      });
      oldest = 0;
      schedule(INTERVAL);
    }

    function step(direction) {
      // The next set starts where the list was up to; the previous one ends
      // where the pictures now up begin.
      showFrom(direction > 0 ? head : head - 2 * slots.length);
    }

    // One tick: the oldest slot takes the next picture.
    function advance() {
      if (dead || !slots.length) return;
      lastChange = Date.now();
      if (slots.length >= slides.length) {
        step(1);
        return;
      }
      var slot = slots[oldest];
      oldest = (oldest + 1) % slots.length;
      fill(slot, takeNext(), false);
      schedule(INTERVAL);
    }

    // How many pictures the wall holds: as many as fit at their natural
    // shape with their captions, at least one. The slot's height comes from
    // the stylesheet, read off a slot in the wall.
    function fit() {
      if (!stack) return 1;
      var box = wall.getBoundingClientRect();
      if (!box.height) return slots.length;
      var probe = slots.length ? slots[0] : makeSlot();
      if (!slots.length) wall.appendChild(probe.el);
      var each = probe.el.getBoundingClientRect().height;
      if (!slots.length) wall.removeChild(probe.el);
      if (!each) return slots.length;
      return Math.max(1, Math.min(slides.length, Math.floor(box.height / (each + RULE_SPACE))));
    }

    function layout() {
      if (dead) return;
      var count = fit();
      if (!count || count === slots.length) return;
      var first = slots.length ? slots[0].slide : slides[head];
      var at = Math.max(0, slides.indexOf(first));
      wall.textContent = '';
      slots = [];
      for (var k = 0; k < count; k += 1) {
        if (k > 0) wall.appendChild(el('div', 'cr-rule'));
        var slot = makeSlot();
        slots.push(slot);
        wall.appendChild(slot.el);
      }
      head = wrap(at);
      slots.forEach(function (slot) {
        fill(slot, slides[head], true);
        head = wrap(head + 1);
      });
      oldest = 0;
      schedule(firstDelay);
    }

    function schedule(ms) {
      clearTimers();
      if (dead || paused || reducedMotion() || slides.length < 2) return;
      later(function () {
        // A pointer or focus the events missed still holds the panel.
        if (panel.matches(':hover') || panel.contains(doc.activeElement)) {
          schedule(1000);
          return;
        }
        // The two panels never change together.
        if (Date.now() - lastChange < 1000) {
          schedule(1000);
          return;
        }
        advance();
      }, ms);
    }

    function pause() {
      paused = true;
      clearTimers();
    }

    function resume() {
      if (panel.matches(':hover') || panel.contains(doc.activeElement)) return;
      paused = false;
      schedule(INTERVAL);
    }

    panel.addEventListener('mouseenter', pause);
    panel.addEventListener('mouseleave', resume);
    panel.addEventListener('focusin', pause);
    panel.addEventListener('focusout', function () { root.setTimeout(resume, 0); });
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else return;
      event.preventDefault();
    });

    function destroy() {
      dead = true;
      clearTimers();
      fades.forEach(function (h) { root.clearTimeout(h); });
      if (watcher) watcher.disconnect();
      slots.forEach(function (slot) {
        slot.img.onload = null;
        slot.img.onerror = null;
      });
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      var at = panels.indexOf(handle);
      if (at >= 0) panels.splice(at, 1);
    }

    var handle = {
      el: panel,
      destroy: destroy,
      live: function () { return 1 + timers.length; }
    };

    buildDots();
    // The panel is not in the page yet. The observer's first report, once it
    // lands, is the first look at its height; later ones follow the window.
    if (root.ResizeObserver) {
      watcher = new root.ResizeObserver(layout);
      watcher.observe(wall);
    }
    return handle;
  }

  // The period photo block: a heavy rule, a gap, a hairline, the picture,
  // and a square stud at each corner of the heavy rule. Its width is set in
  // carousel.css from the picture's shape (--cr-ar) and the room its stage
  // allows. Used here for the portraits and by title-page.js for its picture.
  function frame(img) {
    var outer = el('div', 'cr-frame');
    var matte = el('div', 'cr-matte');
    matte.appendChild(img);
    outer.appendChild(matte);
    ['tl', 'tr', 'bl', 'br'].forEach(function (corner) {
      var stud = el('span', 'cr-corner cr-corner-' + corner);
      stud.setAttribute('aria-hidden', 'true');
      outer.appendChild(stud);
    });
    return outer;
  }

  function started() {
    try {
      return !!root.dendryUI.dendryEngine.state.qualities.started;
    } catch (err) {
      return false;
    }
  }

  function scenes() {
    try {
      return root.dendryUI.game.scenes;
    } catch (err) {
      return null;
    }
  }

  // Takes the carousels down for good: the game has begun.
  function stop() {
    stopped = true;
    panels.slice().forEach(function (p) { p.destroy(); });
    panels = [];
    if (observer) observer.disconnect();
    observer = null;
  }

  function check() {
    if (stopped) return;
    if (started()) stop();
  }

  function build() {
    if (built || stopped || !credits || !doc) return;
    if (root.matchMedia && !root.matchMedia(WIDE).matches) return;
    var game = scenes();
    var mid = doc.getElementById('mid_panel');
    var state = doc.getElementById('tools_wrapper');
    var depth = doc.getElementById('depth_column');
    if (!game || !mid || !state || !depth || started()) return;
    built = true;

    var left = landscapeSlides(credits).filter(function (s) { return s.file !== TITLE_PICTURE; });
    var right = portraitSlides(credits, peopleFromScenes(game));
    if (left.length) {
      var a = makePanel('carousel-state', 'Images from the period', left, INTERVAL, true);
      mid.insertBefore(a.el, state);
      panels.push(a);
    }
    if (right.length) {
      var b = makePanel('carousel-depth', 'Advisors', right, STAGGER, false);
      depth.parentNode.insertBefore(b.el, depth.nextSibling);
      panels.push(b);
    }
  }

  function init() {
    // Anything that starts a game reaches one of these: the page's text
    // landing, or the sidebar leaving its hidden state.
    if (root.DepthColumn) {
      root.DepthColumn.on('content', function () {
        check();
        build();
      });
    }
    var sidebar = doc.getElementById('stats_sidebar');
    if (sidebar && root.MutationObserver) {
      observer = new root.MutationObserver(check);
      observer.observe(sidebar, {attributes: true, attributeFilter: ['class']});
    }
    // A window widened past the tier builds them then.
    if (root.matchMedia) {
      var wide = root.matchMedia(WIDE);
      if (wide.addEventListener) wide.addEventListener('change', build);
    }
    if (root.fetch) {
      root.fetch('layout/credits.json').then(function (response) {
        return response.ok ? response.json() : null;
      }).then(function (data) {
        credits = data;
        build();
      }).catch(function () {});
    }
  }

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    sourceName: sourceName,
    creditLine: creditLine,
    paintCredit: paintCredit,
    landscapeSlides: landscapeSlides,
    peopleFromScenes: peopleFromScenes,
    portraitSlides: portraitSlides,
    frame: frame,
    titlePicture: TITLE_PICTURE,
    active: function () {
      return panels.reduce(function (n, p) { return n + p.live(); }, 0);
    }
  };
}));
