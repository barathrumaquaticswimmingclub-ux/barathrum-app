'use strict';
(() => {
  const screen = document.getElementById('launchScreen');
  if (!screen) return;
  const started = performance.now();
  let timer;
  const hide = () => { screen.hidden = true; clearTimeout(timer); };
  const finish = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, Math.max(0, 900 - (performance.now() - started)));
  };
  window.brtmSplash = { finish };
  // A failed script or slow connection must never trap the user on the artwork.
  timer = setTimeout(hide, 8000);
  screen.querySelector('img').addEventListener('error', hide, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) hide(); });
})();
