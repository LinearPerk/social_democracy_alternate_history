/*
 * Back-out: gives every card one graceful way out, in one look and one place.
 * The way out is a choice the content already has: upstream's
 * "Return card to hand" (@easy_discard), or "Return to main" (@root) on an
 * advisor card. After the ui draws a page's choices, this finds that choice,
 * moves it last, marks it with .dc-backout (styled in back-out.css), and
 * relabels it. Content keeps its ordinary choice line.
 *
 * Moving the li is safe: the engine's click handlers read each link's
 * data-choice index, not its position. In-fiction declines ("Do not enact
 * any policies for now") are ordinary choices and stay where they are.
 *
 * Loads after depth-column.js and wraps window.dendryModifyUI the same way,
 * so it gets the ui instance without editing that module.
 */
(function () {
  'use strict';

  var CARD_LABEL = '\u21A9 Return card to hand';
  var ADVISOR_LABEL = '\u21A9 Put it back';

  // Choice ids are scene ids, which are dotted when a scene is nested.
  function endsWith(id, name) {
    return new RegExp('(^|\.)' + name + '$').test(id || '');
  }

  function isCardBackout(choice) {
    return endsWith(choice.id, 'easy_discard');
  }

  // An advisor card's "Return to main" costs nothing, so it plays the same role.
  function isAdvisorBackout(choice, scene) {
    return !!scene && !!scene.isPinnedCard && endsWith(choice.id, 'root');
  }

  // choices and lis line up by index: the ui builds one li per choice.
  function markBackout(ui, choices) {
    var ul = ui.$content && ui.$content.find('ul.choices').last()[0];
    if (!ul || !choices) return;
    var scene = ui.dendryEngine.getCurrentScene();
    for (var i = 0; i < choices.length && i < ul.children.length; i++) {
      var choice = choices[i];
      if (!choice.canChoose) continue;
      var advisor = isAdvisorBackout(choice, scene);
      if (!advisor && !isCardBackout(choice)) continue;
      var li = ul.children[i];
      var link = li.querySelector('a');
      if (!link) continue;
      link.textContent = advisor ? ADVISOR_LABEL : CARD_LABEL;
      li.classList.add('dc-backout');
      ul.appendChild(li);
      return;
    }
  }

  function install(ui) {
    var displayChoices = ui.displayChoices;
    ui.displayChoices = function (choices) {
      var result = displayChoices.apply(this, arguments);
      try {
        markBackout(this, choices);
      } catch (err) {
        console.error('back-out', err);
      }
      return result;
    };
  }

  var modify = window.dendryModifyUI;
  window.dendryModifyUI = function (instance) {
    var result = modify ? modify(instance) : undefined;
    install(instance);
    return result;
  };
}());
