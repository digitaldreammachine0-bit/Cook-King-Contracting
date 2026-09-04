/* ===================== FOOTER MUSIC =====================

   The track only ever starts when the visitor presses the footer play button.
   Nothing on this page starts audio on its own.                              */

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

  button.addEventListener('click', function () {
    if (audio.paused) {
      var p = audio.play();
      if (p !== undefined && p.catch) p.catch(function () { setState(false); });
    } else {
      audio.pause();
    }
  });
})();
