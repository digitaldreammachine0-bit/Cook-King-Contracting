/* ===================== FOOTER MUSIC =====================

   No browser allows audible autoplay on a page the visitor has not touched.
   Chrome, Safari, Firefox and Edge all refuse it, and there is no flag to turn
   that off from the page. So "autoplay" here means: arm the track and start it
   on the visitor's first click, tap or key press anywhere on the page.

   Scrolling does not count as a gesture in Chrome, so a scroll alone will not
   start it. The first real touch will.

   If the browser refuses anyway, nothing breaks: the button stays in its play
   state and works on click like any other player.                            */

(function () {
  'use strict';

  var audio  = document.getElementById('site-music');
  var button = document.getElementById('music-toggle');
  if (audio === null || button === null) return;

  function setState(playing) {
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    button.setAttribute('title', playing ? 'Pause music' : 'Play music');
  }

  /* Drive the button off the audio element, not off the click. That way the
     button still reads correctly if playback stops for any other reason. */
  audio.addEventListener('play',  function () { setState(true); });
  audio.addEventListener('pause', function () { setState(false); });

  /* Start buffering only once the page has finished loading, so the track never
     competes with the logo or the models for bandwidth.

     Setting preload is enough on its own. Calling load() as well fires a second
     request and aborts the first, which costs a wasted round trip on a 2.5 MB
     file. If a browser ignores the change, the first gesture still starts the
     fetch; the track just begins a beat later. */
  window.addEventListener('load', function () {
    if (audio.paused && audio.currentTime === 0) audio.preload = 'auto';
  });

  button.addEventListener('click', function () {
    if (audio.paused) {
      var p = audio.play();
      if (p !== undefined && p.catch) p.catch(function () { setState(false); });
    } else {
      audio.pause();
    }
  });

  /* ---- first gesture anywhere ---- */

  function stopListening() {
    document.removeEventListener('pointerdown', firstGesture);
    document.removeEventListener('keydown', firstGesture);
  }

  function firstGesture(event) {
    /* A press on the button itself is the button's job. Stand down so the two
       handlers do not fight and cancel each other out. */
    if (button.contains(event.target)) { stopListening(); return; }

    var p = audio.play();
    if (p !== undefined && p.then) {
      /* Keep listening if it was refused, in case a later gesture is allowed. */
      p.then(stopListening, function () {});
    } else {
      stopListening();
    }
  }

  document.addEventListener('pointerdown', firstGesture);
  document.addEventListener('keydown', firstGesture);
})();
