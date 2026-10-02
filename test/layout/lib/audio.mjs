'use strict';

// A stand-in for the game's music track, for pages where headless Chrome
// would refuse to play real audio. It is an Audio element whose paused flag
// follows play() and pause() at once (and fires the events), with a skip
// counter on currentTime. Evaluating it makes it dendryUI.currentAudio and
// tells the game a track has started, as the engine's own audio step does.
export const STUB_AUDIO = `(() => {
  const a = new Audio();
  let paused = true;
  let time = 0;
  window.__skipped = 0;
  Object.defineProperty(a, 'paused', { get: () => paused });
  Object.defineProperty(a, 'currentTime', {
    get: () => time,
    set: (value) => { time = value; if (value > 1000) window.__skipped += 1; },
  });
  a.play = () => {
    if (paused) { paused = false; a.dispatchEvent(new Event('play')); }
    return Promise.resolve();
  };
  a.pause = () => {
    if (!paused) { paused = true; a.dispatchEvent(new Event('pause')); }
  };
  window.dendryUI.currentAudio = a;
  window.dendryUI.currentAudioURL = 'music/1928_1930/MarekWeber.mp3';
  a.play();
  window.updateAudio('music/1928_1930/MarekWeber.mp3');
  return true;
})()`;
