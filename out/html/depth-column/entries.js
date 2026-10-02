/*
 * Entries: the depth column's Entry view. A click on a party name in the
 * state column's ledger, or on any [data-depth-term] span, opens an entry.
 *
 * Party entry: that party's paragraph and its "Current relations" line,
 * taken from the Library's `parties` section rendered fresh (so the relation
 * word is current). The Library view itself is not involved.
 *
 * Term entry: the slug's record in entries.json,
 *   {"<slug>": {"title", "html", "library": "<section id>"}}.
 * Empty html shows nothing in its place (the title, live part and links
 * still show); a slug with no record uses the span's own text as its title.
 * A term whose entry shows the game's state registers
 * a live part (registerTermLive), drawn under the text each time it opens.
 *
 * Advisor entry: a click on an advisor's name in the hire menu (a
 * [data-depth-advisor="<card id>"] span in the choice's title) shows that
 * advisor card's summary as an italic lead, then the author's hire-menu bio
 * (the choice's hidden .hire-bio span, read at the click), then the card's
 * "Further reading" from links.json (keyed by the card's scene id). A choice
 * with no .hire-bio falls back to the card's own bio. The click stops here:
 * the engine would otherwise treat it as choosing the advisor.
 *
 * Every entry with a Library pointer ends with "In the Library: <section>",
 * which opens that Library section in the column.
 *
 * Any element with data-depth-entry="<prefix>:<id>" opens the entry with that
 * key, so other modules can offer entries of their own: they register a
 * prefix with DepthColumn.registerEntryKind(prefix, render, title). Party and
 * advisor entries register the same way; a key with no registered prefix is a
 * term slug.
 *
 * Needs DepthColumn (depth-column.js). An entry view's key is the slug,
 * "party:<id>" for a party, "advisor:<card id>" for an advisor, or
 * "<prefix>:<id>" for a registered kind.
 */
(function () {
  'use strict';

  var DC = window.DepthColumn;
  if (!DC) return;

  var ENTRIES_URL = 'depth-column/entries.json';
  var PARTIES_SECTION = 'parties';
  var LINKS_URL = 'depth-column/links.json';
  var PARTY_PREFIX = 'party:';
  var ADVISOR_PREFIX = 'advisor:';
  // The Library labels a party by its abbreviation in bold; the ledger's ids
  // are the lower-cased abbreviations, except this one.
  var PARTY_LABELS = {other: 'other parties'};

  // Entry kinds by key prefix. render(id, view) returns the body (a Node or
  // an HTML string), or null when the entry no longer applies. title is the
  // view's heading, a string or a function of the id; '' means the body
  // draws its own. Without one the heading is the opener's own text.
  var kinds = {};

  function registerEntryKind(prefix, render, title) {
    kinds[prefix] = {render: render, title: title};
  }

  // A live part under a term's text, drawn fresh each time the entry is: for
  // a term whose entry shows the game's state. fn() returns a Node or an HTML
  // string. The text and the Library footer stay the record's.
  var termLive = {};

  function registerTermLive(slug, fn) {
    termLive[slug] = fn;
  }

  function kindOf(key) {
    var at = String(key).indexOf(':');
    return at > 0 ? kinds[key.slice(0, at)] || null : null;
  }

  function titleFor(key, fallback) {
    var kind = kindOf(key);
    if (!kind || kind.title === undefined) return fallback;
    var title = typeof kind.title === 'function' ? kind.title(key.slice(key.indexOf(':') + 1)) : kind.title;
    return title == null ? fallback : title;
  }

  // A party's heading in the ledger's form, "Deutschnationale Volkspartei
  // (German National People's Party)", so the entry reads the same wherever
  // it is opened. Null when the party is unknown, which leaves the opener's
  // own text.
  function partyTitle(id) {
    var Model = window.StateColumnModel;
    var ui = DC.ui();
    var state = ui && ui.dendryEngine && ui.dendryEngine.state;
    var party = Model && Model.PARTIES.filter(function (p) { return p.id === id; })[0];
    if (!party) return null;
    return Model.partyGerman((state && state.qualities) || {}, id) + ' (' + party.en + ')';
  }

  // Loaded once. A failed load (a file:// page, say) leaves the records
  // empty, so term entries fall back to the span's text.
  var records = {};
  var links = {};
  // Hire-menu bios by card id, read from the choice when its name is clicked,
  // so the entry still draws when the menu is gone (Back to it later).
  var hireBios = {};
  function loadJSON(url) {
    return typeof fetch === 'function'
      ? fetch(url)
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; })
      : Promise.resolve({});
  }
  var loaded = Promise.all([
    loadJSON(ENTRIES_URL).then(function (data) { records = data || {}; }),
    loadJSON(LINKS_URL).then(function (data) { links = data || {}; })
  ]);

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ---- The Library, for the footer and the party text ----------------------

  // The menu's own wording for a section, read from the game so it can't
  // drift from the Library's menu.
  function libraryLabel(section) {
    var ui = DC.ui();
    var menu = ui && ui.game && ui.game.scenes['library.menu'];
    var options = (menu && menu.options) || [];
    for (var i = 0; i < options.length; i++) {
      if (options[i].id === '@library.' + section) return options[i].title;
    }
    return section === PARTIES_SECTION ? 'Parties' : section;
  }

  function librarySectionHTML(section) {
    var ui = DC.ui();
    var scene = ui && ui.game.scenes['library.' + section];
    if (!scene) return '';
    var content = ui.dendryEngine._makeDisplayContent(scene.content, true);
    return ui.contentToHTML.convert(content);
  }

  function footer(section) {
    var foot = element('p', 'dc-entry-foot', 'In the Library: ');
    var link = element('a', '', libraryLabel(section));
    link.href = '#';
    link.setAttribute('data-dc-entry-library', section);
    foot.appendChild(link);
    return foot;
  }

  // ---- Party entries -------------------------------------------------------

  function labelText(p) {
    var strong = p.querySelector('strong');
    return strong ? strong.textContent.trim().toLowerCase() : '';
  }

  // The paragraph that opens with the party's label in bold, else one that
  // carries it in bold (BVP sits inside the Center Party's paragraph), else
  // one that starts with it as plain text (the SAPD's).
  function findParty(paragraphs, id) {
    var label = PARTY_LABELS[id] || id.toLowerCase();
    var i;
    for (i = 0; i < paragraphs.length; i++) {
      var first = paragraphs[i].firstChild;
      if (first && first.nodeName === 'STRONG' && labelText(paragraphs[i]) === label) return i;
    }
    for (i = 0; i < paragraphs.length; i++) {
      var bolds = paragraphs[i].querySelectorAll('strong');
      for (var j = 0; j < bolds.length; j++) {
        if (bolds[j].textContent.trim().toLowerCase() === label) return i;
      }
    }
    for (i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].textContent.toLowerCase().indexOf(label) === 0) return i;
    }
    return -1;
  }

  function partyNodes(html, id) {
    var template = document.createElement('template');
    template.innerHTML = html;
    var paragraphs = Array.prototype.slice.call(template.content.children);
    var at = findParty(paragraphs, id);
    if (at < 0) return [];
    var nodes = [paragraphs[at]];
    // "Current relations" follows its party's paragraph, past any empty
    // paragraph a false conditional leaves behind.
    var next = paragraphs[at + 1];
    if (next && !next.textContent.trim()) next = paragraphs[at + 2];
    if (next && /^Current relations/.test(next.textContent)) nodes.push(next);
    return nodes;
  }

  function partyBody(id) {
    var body = element('div');
    var nodes = partyNodes(librarySectionHTML(PARTIES_SECTION), id);
    nodes.forEach(function (node) { body.appendChild(node); });
    body.appendChild(footer(PARTIES_SECTION));
    return body;
  }

  // ---- Term entries --------------------------------------------------------

  function termBody(slug) {
    var body = element('div');
    var record = records[slug] || {};
    if (record.html) {
      // A class so a test can tell the written text from the live part.
      var text = element('div', 'dc-entry-text');
      text.innerHTML = record.html;
      body.appendChild(text);
    }
    if (termLive[slug]) {
      var live = termLive[slug]();
      if (typeof live === 'string') {
        var holder = element('div');
        holder.innerHTML = live;
        body.appendChild(holder);
      } else if (live) {
        body.appendChild(live);
      }
    }
    if (record.library) body.appendChild(footer(record.library));
    return body;
  }

  // ---- Advisor entries -----------------------------------------------------

  // The card scene's text as the engine shows it, so a bio with a conditional
  // ("Braun is / was ...") reads for the game's current state.
  function advisorSceneHTML(id) {
    var ui = DC.ui();
    var scene = ui && ui.game.scenes[id];
    if (!scene) return '';
    var content = ui.dendryEngine._makeDisplayContent(scene.content, true);
    return ui.contentToHTML.convert(content);
  }

  function readingList(found) {
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
    return list;
  }

  // The card's summary, then the author's hire-menu bio if the clicked choice
  // had one, else the card's own bio (the paragraph(s) marked as depth). The
  // card's choices and other prose stay out.
  function advisorBody(id) {
    var body = element('div');
    var template = document.createElement('template');
    template.innerHTML = advisorSceneHTML(id);
    var summary = template.content.querySelector('span.depth-summary');
    var bios = [];
    Array.prototype.forEach.call(template.content.querySelectorAll('span.depth'), function (span) {
      var p = span.closest('p');
      if (p && bios.indexOf(p) < 0) bios.push(p);
    });
    if (summary) body.appendChild(element('p', 'dc-lead', summary.textContent.trim()));
    if (hireBios[id]) {
      body.appendChild(element('p', '', hireBios[id]));
    } else {
      bios.forEach(function (p) { body.appendChild(p); });
    }
    var found = links[id] || [];
    if (found.length) {
      body.appendChild(element('h4', 'dc-sub', 'Further reading'));
      body.appendChild(readingList(found));
    }
    return body;
  }

  registerEntryKind('party', function (id) { return partyBody(id); }, partyTitle);
  registerEntryKind('advisor', function (id) { return advisorBody(id); });

  DC.register('entry', function (view) {
    var key = String(view.key);
    var kind = kindOf(key);
    return kind ? kind.render(key.slice(key.indexOf(':') + 1), view) : termBody(key);
  });
  DC.registerEntryKind = registerEntryKind;
  DC.registerTermLive = registerTermLive;
  DC.entryTitle = titleFor;

  // ---- Clicks --------------------------------------------------------------

  // An advisor's name sits inside a hire choice, and the engine delegates
  // clicks on the whole choice (its jQuery handlers on #content). A capturing
  // listener on the document runs before them, so stopping the event here
  // keeps the click from choosing.
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var name = e.target.closest('[data-depth-advisor]');
    if (!name) return;
    e.preventDefault();
    e.stopPropagation();
    var id = name.getAttribute('data-depth-advisor');
    var title = name.textContent.trim();
    var choice = name.closest('li');
    var bio = choice && choice.querySelector('.hire-bio');
    if (bio && bio.textContent.trim()) hireBios[id] = bio.textContent.trim();
    else delete hireBios[id];
    loaded.then(function () {
      DC.show({kind: 'entry', key: ADVISOR_PREFIX + id, title: title});
    });
  }, true);

  // Delegated on the document: the ledger and the tab panels re-render
  // without any hook of ours firing.
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    var link = e.target.closest('[data-dc-entry-library]');
    if (link) {
      e.preventDefault();
      var section = link.getAttribute('data-dc-entry-library');
      DC.show({kind: 'library', key: 'library.' + section, title: libraryLabel(section)});
      return;
    }

    var name = e.target.closest('[data-sc-party] .nm');
    if (name) {
      var id = name.closest('[data-sc-party]').getAttribute('data-sc-party');
      // The row's title attribute holds the full name.
      var title = name.getAttribute('title') || name.textContent.trim();
      loaded.then(function () {
        DC.show({kind: 'entry', key: PARTY_PREFIX + id, title: title});
      });
      return;
    }

    // data-depth-entry="<prefix>:<id>", on a row in another column.
    var opener = e.target.closest('[data-depth-entry]');
    if (opener) {
      var key = opener.getAttribute('data-depth-entry');
      var heading = titleFor(key, opener.textContent.trim());
      loaded.then(function () {
        // A term's record names its entry; a block that opens one carries
        // more text than a title.
        var named = !kindOf(key) && records[key] && records[key].title;
        DC.show({kind: 'entry', key: key, title: named || heading});
      });
      return;
    }

    var term = e.target.closest('[data-depth-term]');
    if (term) {
      var slug = term.getAttribute('data-depth-term');
      var text = term.textContent.trim();
      loaded.then(function () {
        DC.show({kind: 'entry', key: slug, title: (records[slug] && records[slug].title) || text});
      });
    }
  });
}());
