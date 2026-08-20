/* ===========================================================================
   Cook King Contractor - quote popup.

   Plain script on purpose, NOT an ES module, so the form still works when the
   page is opened straight off disk. Only the 3D needs a server.
   =========================================================================== */

(function () {
  'use strict';

  /* =========================================================================
     THE ONE LINE TO CHANGE WHEN SENDING GOES LIVE
     -------------------------------------------------------------------------
     Paste the Google Apps Script web app URL between the quotes.
     Step by step instructions are in SENDING-SETUP.md, next to this file.

     While this is empty the Send button explains that sending is not switched
     on yet and shows the phone number instead. It never fails quietly.

     To move to a different service later, replace this URL and, if the new
     service wants a different shape of data, edit buildPayload() below.
     Nothing else in this file needs to change.
     ========================================================================= */
  var QUOTE_ENDPOINT = '';

  /* ---- business contact, used by the popup header and every fallback ---- */
  var PHONE_DISPLAY = '480-414-6504';

  /* ---- photo limits -------------------------------------------------------
     Google publishes no size limit for data arriving at an Apps Script web
     app. The documented 50 MB figure is for calls the script makes OUT, not
     for the request coming IN. So these caps are deliberately conservative and
     have not been tested at the breaking point.

     Every picture is shrunk in the browser before it is sent, which is what
     actually keeps the request small. A modern phone photo lands around
     200 KB to 500 KB after this treatment instead of 3 MB to 6 MB.
     ---------------------------------------------------------------------- */
  var MAX_PHOTOS = 4;
  var MAX_EDGE = 1600;            // longest side in pixels after shrinking
  var JPEG_QUALITY = 0.82;
  var MAX_TOTAL_CHARS = 6000000;  // ~6 MB of encoded text across all photos

  var STORE_KEY = 'cookking.quote.v1';

  /* ---- element lookups ---- */
  var $ = function (id) { return document.getElementById(id); };

  var openBtn   = $('quote-open');
  var backdrop  = $('quote-backdrop');
  var panel     = $('quote-panel');
  var body      = $('quote-body');
  var closeBtn  = $('quote-close');
  var backBtn   = $('quote-back');
  var nextBtn   = $('quote-next');
  var sendBtn   = $('quote-send');
  var doneBtn   = $('quote-done');
  var stepLabel = $('quote-step');
  var reviewEl  = $('quote-review');
  var sendError = $('quote-send-error');
  var fallback  = $('quote-fallback');
  var handoff   = $('quote-handoff');
  var photoInput = $('q-photos');
  var photoList  = $('photo-list');

  if (openBtn === null || backdrop === null || panel === null) return;

  var screens = [$('quote-screen-1'), $('quote-screen-2'), $('quote-screen-3'), $('quote-screen-4')];

  /* ---- state ---- */
  var endpoint = QUOTE_ENDPOINT;
  var step = 0;            // 0, 1, 2 are the three questions screens. 3 is "sent".
  var sending = false;
  var photos = [];         // { name, dataUrl, bytes }
  var lastFocus = null;
  var saveTimer = 0;

  /* =========================================================================
     TIME AND DATE
     Every time this site shows or sends is 12 hour with AM or PM. The three
     dropdowns exist for exactly that reason: a native time field follows the
     phone's own locale and would print 24 hour time on some of them.
     ========================================================================= */

  function timeText() {
    var h = $('q-hour').value;
    var m = $('q-minute').value;
    var ap = $('q-meridiem').value;
    if (h === '' || ap === '') return '';
    return h + ':' + m + ' ' + ap;
  }

  function dayText(iso) {
    if (iso === '') return '';
    var p = iso.split('-');
    // Built from local parts so the date never slides by a day.
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function stampNow() {
    return new Date().toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true                    // 12 hour, always, on every machine
    });
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* Hour dropdown is built here so 1 to 12 can never drift out of sync. */
  (function fillHours() {
    var sel = $('q-hour');
    for (var h = 1; h <= 12; h++) {
      var o = document.createElement('option');
      o.value = String(h);
      o.textContent = String(h);
      sel.appendChild(o);
    }
  })();

  $('q-date').min = todayISO();

  /* =========================================================================
     SAVING WHAT THEY TYPED
     Answers go to the browser's own storage as they type, so closing the popup
     by accident does not wipe the work. Photos are not saved: they are far too
     big for that storage. Cleared only on a confirmed successful send.
     ========================================================================= */

  var TEXT_FIELDS = ['q-date', 'q-hour', 'q-minute', 'q-meridiem', 'q-note',
                     'q-name', 'q-phone', 'q-address', 'q-email'];

  function collect() {
    var out = { service: '', copy: $('q-copy').checked };
    var picked = document.querySelector('input[name="service"]:checked');
    if (picked !== null) out.service = picked.value;
    for (var i = 0; i < TEXT_FIELDS.length; i++) {
      out[TEXT_FIELDS[i]] = $(TEXT_FIELDS[i]).value;
    }
    return out;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(collect())); }
    catch (err) { /* storage full or blocked. Not worth interrupting them. */ }
  }

  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (err) { return; }
    if (raw === null) return;

    var d = null;
    try { d = JSON.parse(raw); } catch (err) { return; }
    if (d === null || typeof d !== 'object') return;

    for (var i = 0; i < TEXT_FIELDS.length; i++) {
      var k = TEXT_FIELDS[i];
      if (typeof d[k] === 'string') $(k).value = d[k];
    }
    if (typeof d.service === 'string' && d.service !== '') {
      var r = document.querySelector('input[name="service"][value="' + d.service + '"]');
      if (r !== null) r.checked = true;
    }
    $('q-copy').checked = d.copy === true;
  }

  function forget() {
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* nothing to do */ }
  }

  /* =========================================================================
     ERRORS
     Words carry the message. The input border also brightens, so the meaning
     never rides on colour alone.
     ========================================================================= */

  function showError(errId, fieldId, message) {
    var e = $(errId);
    if (e !== null) { e.textContent = message; e.hidden = false; }
    if (fieldId !== null) {
      var f = $(fieldId);
      if (f !== null) f.setAttribute('aria-invalid', 'true');
    }
  }

  function clearError(errId, fieldId) {
    var e = $(errId);
    if (e !== null) { e.textContent = ''; e.hidden = true; }
    if (fieldId !== null) {
      var f = $(fieldId);
      if (f !== null) f.removeAttribute('aria-invalid');
    }
  }

  function clearAllErrors() {
    var list = panel.querySelectorAll('.err');
    for (var i = 0; i < list.length; i++) { list[i].textContent = ''; list[i].hidden = true; }
    var bad = panel.querySelectorAll('[aria-invalid]');
    for (var j = 0; j < bad.length; j++) bad[j].removeAttribute('aria-invalid');
    var marked = panel.querySelectorAll('.field.is-bad');
    for (var k = 0; k < marked.length; k++) marked[k].classList.remove('is-bad');
  }

  function digitsIn(s) { return s.replace(/[^0-9]/g, '').length; }

  /* Print a number back the way people read it, not as ten loose digits. Only
     touches plain US numbers. Anything else is left exactly as typed, so an
     extension or a note written next to it never gets mangled. */
  function prettyPhone(raw) {
    var d = String(raw).replace(/[^0-9]/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length !== 10) return String(raw).trim();
    return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  }

  function emailLooksReal(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

  function validateStep1() {
    clearAllErrors();
    var ok = true;
    var first = null;

    if (document.querySelector('input[name="service"]:checked') === null) {
      showError('err-service', null, 'Pick one so Russell knows what to bring.');
      $('err-service').closest('.field').classList.add('is-bad');
      if (first === null) first = $('svc-moves');
      ok = false;
    }
    if ($('q-date').value === '') {
      showError('err-date', 'q-date', 'Pick the day you need this.');
      if (first === null) first = $('q-date');
      ok = false;
    }
    if (timeText() === '') {
      showError('err-time', null, 'Pick a start time, including AM or PM.');
      $('err-time').closest('.field').classList.add('is-bad');
      if (first === null) first = $('q-hour');
      ok = false;
    }
    if (first !== null) first.focus();
    return ok;
  }

  function validateStep2() {
    clearAllErrors();
    var ok = true;
    var first = null;

    if ($('q-name').value.trim() === '') {
      showError('err-name', 'q-name', 'Enter your name.');
      if (first === null) first = $('q-name');
      ok = false;
    }
    if (digitsIn($('q-phone').value) < 10) {
      showError('err-phone', 'q-phone', 'Enter a phone number with at least 10 digits.');
      if (first === null) first = $('q-phone');
      ok = false;
    }
    if ($('q-address').value.trim() === '') {
      showError('err-address', 'q-address', 'Enter the address, or just the area you are in.');
      if (first === null) first = $('q-address');
      ok = false;
    }

    var mail = $('q-email').value.trim();
    if (mail !== '' && !emailLooksReal(mail)) {
      showError('err-email', 'q-email', 'Check this address. It needs an @ and a dot.');
      if (first === null) first = $('q-email');
      ok = false;
    } else if (mail === '' && $('q-copy').checked) {
      showError('err-email', 'q-email', 'Add your email, or untick the copy box below.');
      if (first === null) first = $('q-email');
      ok = false;
    }

    if (first !== null) first.focus();
    return ok;
  }

  /* =========================================================================
     PHOTOS
     Shrunk here in the browser. Nothing full size ever leaves the phone.
     ========================================================================= */

  function prettySize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      createImageBitmap(file).then(function (bmp) {
        var big = Math.max(bmp.width, bmp.height);
        var scale = big > MAX_EDGE ? MAX_EDGE / big : 1;
        var w = Math.max(1, Math.round(bmp.width * scale));
        var h = Math.max(1, Math.round(bmp.height * scale));

        var cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
        bmp.close();

        var url = cv.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve({
          name: file.name,
          dataUrl: url,
          // Roughly the real byte count behind the encoded text.
          bytes: Math.round((url.length - (url.indexOf(',') + 1)) * 0.75)
        });
      }).catch(reject);
    });
  }

  function totalChars() {
    var n = 0;
    for (var i = 0; i < photos.length; i++) n += photos[i].dataUrl.length;
    return n;
  }

  function drawPhotoList() {
    photoList.textContent = '';
    for (var i = 0; i < photos.length; i++) {
      (function (index) {
        var li = document.createElement('li');
        li.className = 'photo-row';

        var nm = document.createElement('span');
        nm.className = 'photo-name';
        nm.textContent = photos[index].name;

        var sz = document.createElement('span');
        sz.className = 'photo-size';
        sz.textContent = prettySize(photos[index].bytes);

        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'photo-drop';
        rm.textContent = 'Remove';
        rm.setAttribute('aria-label', 'Remove ' + photos[index].name);
        rm.addEventListener('click', function () {
          photos.splice(index, 1);
          drawPhotoList();
        });

        li.appendChild(nm);
        li.appendChild(sz);
        li.appendChild(rm);
        photoList.appendChild(li);
      })(i);
    }
  }

  if (photoInput !== null) {
    photoInput.addEventListener('change', function () {
      clearError('err-photos', null);
      var picked = Array.prototype.slice.call(photoInput.files);
      photoInput.value = '';       // so the same file can be picked again later
      if (picked.length === 0) return;

      var room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        showError('err-photos', null, 'That is the limit of ' + MAX_PHOTOS + ' photos. Remove one to add another.');
        return;
      }
      var over = picked.length > room;
      var take = picked.slice(0, room);

      Promise.all(take.map(shrink)).then(function (done) {
        var skipped = 0;
        for (var i = 0; i < done.length; i++) {
          photos.push(done[i]);
          if (totalChars() > MAX_TOTAL_CHARS) { photos.pop(); skipped++; }
        }
        drawPhotoList();

        if (skipped > 0) {
          showError('err-photos', null, 'These photos add up to too much to send. ' +
            skipped + ' of them were left out. Text the rest to ' + PHONE_DISPLAY + '.');
        } else if (over) {
          showError('err-photos', null, 'Only the first ' + MAX_PHOTOS + ' photos were added. Text the rest to ' + PHONE_DISPLAY + '.');
        }
      }).catch(function () {
        showError('err-photos', null, 'One of those files would not open as a picture. Try a different one.');
      });
    });
  }

  /* =========================================================================
     THE REVIEW SCREEN
     ========================================================================= */

  function addRow(term, value) {
    if (value === '' || value === null) return;
    var wrap = document.createElement('div');
    wrap.className = 'review-row';
    var dt = document.createElement('dt');
    dt.textContent = term;
    var dd = document.createElement('dd');
    dd.textContent = value;
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    reviewEl.appendChild(wrap);
  }

  function drawReview() {
    reviewEl.textContent = '';
    var d = collect();
    addRow('Service', d.service);
    addRow('Day', dayText(d['q-date']));
    addRow('Time', timeText());
    addRow('About the job', d['q-note'].trim());
    addRow('Name', d['q-name'].trim());
    addRow('Phone', prettyPhone(d['q-phone']));
    addRow('Address or area', d['q-address'].trim());
    addRow('Email', d['q-email'].trim());
    addRow('Photos', photos.length === 0 ? 'None' : String(photos.length));
    addRow('Copy to you', d.copy && d['q-email'].trim() !== '' ? 'Yes' : 'No');
  }

  /* =========================================================================
     WHAT GETS SENT
     One function builds the whole parcel. Swapping to another service later
     means changing this and the URL at the top, and nothing else.
     ========================================================================= */

  function buildPayload() {
    var d = collect();
    return {
      source: 'cookking-website',
      submittedAt: stampNow(),           // 12 hour, e.g. 8/19/2026, 3:24 PM
      service: d.service,
      date: d['q-date'],
      dayLabel: dayText(d['q-date']),
      time: timeText(),                  // 12 hour, e.g. 3:15 PM
      note: d['q-note'].trim(),
      name: d['q-name'].trim(),
      phone: d['q-phone'].trim(),
      address: d['q-address'].trim(),
      email: d['q-email'].trim(),
      sendCopy: d.copy === true && d['q-email'].trim() !== '',
      photos: photos.map(function (p) { return { name: p.name, dataUrl: p.dataUrl }; })
    };
  }

  function sendPayload(payload) {
    /* text/plain keeps this a simple cross-origin request. Anything else makes
       the browser send a preflight check first, which Apps Script does not
       answer, and the send would fail before it ever left. */
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (res) {
      if (!res.ok) throw new Error('The server answered ' + res.status + '.');
      return res.json();
    }).then(function (out) {
      if (out === null || out.ok !== true) {
        throw new Error(out && out.error ? String(out.error) : 'The request was not accepted.');
      }
      return out;
    });
  }

  /* =========================================================================
     SCREEN SWITCHING
     ========================================================================= */

  function paint() {
    for (var i = 0; i < screens.length; i++) screens[i].hidden = (i !== step);

    var onReview = step === 2;
    var onSent = step === 3;

    stepLabel.hidden = onSent;
    if (!onSent) stepLabel.textContent = 'Step ' + (step + 1) + ' of 3';

    backBtn.hidden = onSent || step === 0 || sending;
    nextBtn.hidden = onReview || onSent;
    sendBtn.hidden = !onReview;
    doneBtn.hidden = !onSent;

    backBtn.disabled = sending;
    sendBtn.disabled = sending;
    sendBtn.textContent = sending ? 'Sending...' : 'Send my request';

    if (onReview) drawReview();
    body.scrollTop = 0;
  }

  function goTo(n) {
    /* Bounded on purpose. Without this, one extra advance lands the popup on a
       screen that does not exist: an empty panel reading "Step 5 of 3". */
    step = n < 0 ? 0 : (n > 3 ? 3 : n);
    clearAllErrors();
    sendError.hidden = true;
    if (fallback !== null) fallback.hidden = true;
    paint();
    panel.focus();
  }

  /* =========================================================================
     SENDING, AND EVERY WAY IT CAN GO
     ========================================================================= */

  function failWith(message) {
    sendError.textContent = message;
    sendError.hidden = false;
    if (fallback !== null) fallback.hidden = false;
    body.scrollTop = body.scrollHeight;
  }

  function doSend() {
    if (sending) return;

    sendError.hidden = true;
    if (fallback !== null) fallback.hidden = true;

    if (endpoint === '') {
      failWith('Sending is not switched on for this site yet. Call ' + PHONE_DISPLAY +
               ' and Russell will take these details over the phone.');
      return;
    }

    sending = true;
    paint();

    sendPayload(buildPayload()).then(function () {
      sending = false;
      forget();                      // only ever cleared on a confirmed success
      photos = [];
      drawPhotoList();
      goTo(3);
    }).catch(function (err) {
      sending = false;
      paint();
      failWith('That did not go through. ' + (err && err.message ? err.message : '') +
               ' Your answers are still here, so you can try again.');
    });
  }

  /* =========================================================================
     OPENING, CLOSING, AND KEEPING FOCUS INSIDE
     ========================================================================= */

  function focusables() {
    var all = panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled === true) continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      if (el.closest('[hidden]') !== null) continue;
      out.push(el);
    }
    return out;
  }

  function trap(e) {
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (list.length === 0) { e.preventDefault(); return; }
    var first = list[0];
    var last = list[list.length - 1];

    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    trap(e);
  }

  /* Everything behind the popup is switched off for the mouse, the keyboard,
     and screen readers while it is open. */
  function setOutsideInert(on) {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === backdrop) continue;
      if (on) kids[i].setAttribute('inert', '');
      else kids[i].removeAttribute('inert');
    }
  }

  function open() {
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    setOutsideInert(true);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);
    goTo(0);
  }

  function close() {
    if (sending) return;                 // never yank it away mid send
    backdrop.hidden = true;
    setOutsideInert(false);
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    save();
    if (lastFocus !== null && typeof lastFocus.focus === 'function') lastFocus.focus();
    else openBtn.focus();
  }

  panel.setAttribute('tabindex', '-1');

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  doneBtn.addEventListener('click', close);

  backdrop.addEventListener('mousedown', function (e) {
    if (e.target === backdrop) close();
  });

  nextBtn.addEventListener('click', function () {
    if (step > 1) return;              // the review and sent screens have no Next
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && !validateStep2()) return;
    save();
    goTo(step + 1);
  });

  backBtn.addEventListener('click', function () {
    if (step === 0 || step === 3) return;   // nothing behind the first or sent screen
    goTo(step - 1);
  });

  sendBtn.addEventListener('click', doSend);

  panel.addEventListener('input', saveSoon);
  panel.addEventListener('change', saveSoon);

  restore();
  drawPhotoList();

  /* Exposed for verification steps only, the same way scene.js exposes
     window.__cookking. Nothing on the page reads this. */
  window.__quote = {
    setEndpoint: function (u) { endpoint = u; },
    getEndpoint: function () { return endpoint; },
    payload: buildPayload,
    photoCount: function () { return photos.length; },
    limits: { MAX_PHOTOS: MAX_PHOTOS, MAX_EDGE: MAX_EDGE, MAX_TOTAL_CHARS: MAX_TOTAL_CHARS }
  };
})();
