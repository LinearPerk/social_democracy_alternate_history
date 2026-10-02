/*
 * Header music controls: a play/pause button, a skip button and a mute
 * toggle at the left of the header's links, in the full banner and the slim
 * strip alike. They duplicate what upstream's Options overlay offers (minus
 * the volume slider) so the player can reach the music without opening it.
 *
 * The buttons call upstream's own functions (togglePausePlay, shuffle,
 * setVolume, enableAudio), so the game's state changes in one place. Each of
 * those functions, and updateAudio (which names the track), is wrapped here
 * to redraw the header afterwards and to copy the state into the Options
 * overlay, whose own markup only updates itself when its own buttons are
 * clicked.
 *
 * The group is absent until the game has a track, and while music is turned
 * off in Options only the mute toggle shows, reading as "off"; a click turns
 * music on again. Mute is volume 0, so the track keeps its place; unmuting
 * restores the last volume the player had set.
 *
 * Extension point, on window.HeaderMusic: refresh().
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var group = null;
  var playButton = null;
  var skipButton = null;
  var muteButton = null;
  var icons = {};
  var watched = null;
  // The volume to restore on unmute (0 to 1).
  var lastVolume = 1;

  function ui() {
    return window.dendryUI || null;
  }

  function audio() {
    var u = ui();
    return (u && u.currentAudio) || null;
  }

  function disabled() {
    var u = ui();
    return !!(u && u.disable_audio);
  }

  function muted() {
    var u = ui();
    return !!u && u.volume === 0;
  }

  function trackName() {
    var el = document.getElementById('currently_playing');
    return el ? el.textContent.trim() : '';
  }

  // Upstream's own icons are cloned, not redrawn, so the two sets match.
  function cloneIcon(selector) {
    var svg = document.querySelector(selector);
    return svg ? svg.cloneNode(true) : document.createElementNS(NS, 'svg');
  }

  // The two states of the mute toggle, on the same 16px grid as upstream's
  // Bootstrap icons: a speaker with sound waves, and one with a cross.
  function speaker(crossed) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    var body = document.createElementNS(NS, 'path');
    body.setAttribute('d', 'M1.5 5.5h2.4l3.4-2.9a.4.4 0 0 1 .7.3v10.2a.4.4 0 0 1-.7.3L3.9 10.5H1.5z');
    svg.appendChild(body);
    var mark = document.createElementNS(NS, 'path');
    mark.setAttribute('fill', 'none');
    mark.setAttribute('stroke', 'currentColor');
    mark.setAttribute('stroke-width', '1.3');
    mark.setAttribute('stroke-linecap', 'round');
    mark.setAttribute('d', crossed
      ? 'M10.5 5.8l3.6 4.4M14.1 5.8l-3.6 4.4'
      : 'M10.3 5.7a3.3 3.3 0 0 1 0 4.6M12.2 3.9a5.9 5.9 0 0 1 0 8.2');
    svg.appendChild(mark);
    return svg;
  }

  function makeButton(id, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.setAttribute('aria-label', label);
    return button;
  }

  function setIcon(button, svg) {
    if (button.firstChild === svg) return;
    while (button.firstChild) button.removeChild(button.firstChild);
    button.appendChild(svg);
  }

  // Copies the audio state into the Options overlay's own controls.
  function syncOptions() {
    var a = audio();
    var u = ui();
    function show(id, on) {
      var el = document.getElementById(id);
      if (el) el.style.display = on ? 'inline' : 'none';
    }
    if (a) {
      show('pause-button-image', !a.paused);
      show('play-button-image', a.paused);
      var text = document.getElementById('pause-button-text');
      if (text) text.textContent = a.paused ? 'Play' : 'Pause';
    }
    var yes = document.getElementById('audio_yes');
    var no = document.getElementById('audio_no');
    if (yes && no) {
      yes.checked = !disabled();
      no.checked = disabled();
    }
    var slider = document.getElementById('volume');
    if (slider && u && typeof u.volume === 'number') slider.value = Math.round(u.volume * 100);
  }

  function refresh() {
    if (!group) return;
    var a = audio();
    var off = disabled();
    watch(a);
    group.hidden = !(a || off);
    var live = !!a && !off;
    playButton.hidden = !live;
    skipButton.hidden = !live;

    var name = trackName();
    group.title = live && name ? 'Now playing: ' + name : '';
    if (live) {
      playButton.title = (a.paused ? 'Play' : 'Pause') + (name ? ' (' + name + ')' : '');
      setIcon(playButton, a.paused ? icons.play : icons.pause);
      playButton.setAttribute('aria-label', a.paused ? 'Play music' : 'Pause music');
      skipButton.title = 'Next song';
    }
    var silent = off || muted();
    muteButton.setAttribute('aria-pressed', silent ? 'true' : 'false');
    muteButton.title = off ? 'Music is off: turn it on' : silent ? 'Unmute' : 'Mute';
    setIcon(muteButton, silent ? icons.muteOn : icons.muteOff);
    syncOptions();
  }

  // The track's own events catch what no wrapped function sees: a play that
  // autoplay rules refused, a new track starting over a pause.
  function watch(a) {
    if (!a || a === watched || !a.addEventListener) return;
    watched = a;
    a.addEventListener('play', refresh);
    a.addEventListener('pause', refresh);
    // A fade toward the volume set before a mute would undo it.
    a.addEventListener('volumechange', function () {
      if (muted() && a.volume !== 0) a.volume = 0;
    });
  }

  function onPlay() {
    if (window.togglePausePlay) window.togglePausePlay();
  }

  function onSkip() {
    if (window.shuffle) window.shuffle();
  }

  function onMute() {
    var u = ui();
    if (!u) return;
    if (disabled()) {
      window.enableAudio();
    } else if (muted()) {
      window.setVolume(Math.round((lastVolume || 1) * 100));
    } else {
      lastVolume = u.volume || 1;
      window.setVolume(0);
    }
  }

  function wrap(name, before) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () {
      if (before) before.apply(this, arguments);
      var result = original.apply(this, arguments);
      refresh();
      return result;
    };
  }

  function install() {
    var links = document.getElementById('header-links');
    if (!links || group) return;
    group = document.createElement('span');
    group.id = 'header-music';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Music');
    group.hidden = true;

    icons.pause = cloneIcon('#pause-button-image svg');
    icons.play = cloneIcon('#play-button-image svg');
    icons.skip = cloneIcon('.music_player button[onclick*="shuffle"] svg');
    icons.muteOff = speaker(false);
    icons.muteOn = speaker(true);

    playButton = makeButton('music-play', 'Pause music');
    skipButton = makeButton('music-skip', 'Next song');
    muteButton = makeButton('music-mute', 'Mute music');
    setIcon(skipButton, icons.skip);
    playButton.addEventListener('click', onPlay);
    skipButton.addEventListener('click', onSkip);
    muteButton.addEventListener('click', onMute);
    group.appendChild(playButton);
    group.appendChild(skipButton);
    group.appendChild(muteButton);
    links.insertBefore(group, links.firstChild);

    wrap('updateAudio');
    wrap('togglePausePlay');
    wrap('enableAudio');
    wrap('disableAudio');
    wrap('setVolume', function (volume) {
      if (volume > 0) lastVolume = volume / 100;
    });
    if (window.DepthColumn) window.DepthColumn.on('content', refresh);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  window.HeaderMusic = {refresh: refresh};
}());
