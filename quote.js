/* ===========================================================================
   Cook King Contractor - quote popup.

   Plain script on purpose, NOT an ES module, so the form still works when the
   page is opened straight off disk. Only the 3D needs a server.
   =========================================================================== */

(function () {
  'use strict';

  /* =========================================================================
     WHERE THE QUOTE GOES
     -------------------------------------------------------------------------
     The Send button builds a mailto: link and hands it to the customer's own
     email app. The draft opens addressed to Russell with every answer already
     written in. Nothing is posted to a server, so there is no service to
     switch on and nothing to keep running.

     This is the only place the address appears. Change it here to send the
     quotes somewhere else.
     ========================================================================= */
  var QUOTE_EMAIL = 'russrestores24.7@gmail.com';

  /* ---- how long the link may get ------------------------------------------
     Some Windows mail handlers refuse a mailto: link once the whole URL runs
     past about 2000 characters. The cap below sits under that with room to
     spare.

     The note is free text, so it is the one answer that can run away. When the
     link is too long the note is cut back and marked, and every other answer
     survives whole. If the link is still too long after that, the Send button
     shows the phone number instead of opening a broken draft.
     ---------------------------------------------------------------------- */
  var MAX_MAILTO_CHARS = 1900;
  var NOTE_CUT_MARK = ' [...]';

  /* ---- business contact, used by the popup header and every fallback ---- */
  var PHONE_DISPLAY = '480-414-6504';

  /* ---- photo limits -------------------------------------------------------
     A mailto: link cannot carry a file, so no picture ever leaves this page.
     The photo step is here to count the pictures. The email then asks the
     customer to attach them in their own email app.

     Each picture is still opened and shrunk here. That is what stops four
     phone photos from filling the browser's memory while the form is open.
     Note that the size shown beside each name is the size after that shrink,
     not the size of the file the customer will attach.
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
  var step = 0;            // 0, 1, 2 are the three question screens. 3 is the last one.
  var photos = [];         // { name, dataUrl, bytes }
  var lastMailto = '';     // the link built by the last Send press
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
     big for that storage.

     The answers are never cleared. Opening the mail app is not the same as the
     email being sent, so there is no moment this page can call a success. The
     customer can still close the draft, and the mail app may not open at all.
     Wiping their answers then would destroy work they still need.
     ========================================================================= */

  var TEXT_FIELDS = ['q-date', 'q-hour', 'q-minute', 'q-meridiem', 'q-note',
                     'q-name', 'q-phone', 'q-address', 'q-email'];

  function collect() {
    var out = { service: '' };
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
  }

  /* =========================================================================
     WHAT GOES IN THE EMAIL
     One function collects the answers. One writes the subject, one writes the
     body, and one wraps both into the mailto: link.
     ========================================================================= */

  function buildPayload() {
    var d = collect();
    return {
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
      photoNames: photos.map(function (p) { return p.name; })
    };
  }

  /* Russell reads this in a crowded inbox, so the subject carries the job and
     the customer, in that order. */
  function emailSubject(p) {
    var what = p.service === '' ? 'Quote' : p.service;
    var who = p.name === '' ? 'Website visitor' : p.name;
    return 'Quote request - ' + what + ' - ' + who;
  }

  /* The pictures cannot ride along on a mailto: link. This line goes near the
     top of the body, in the customer's own voice, so the reminder to attach
     them is one of the first things they read. */
  function photoLine(n) {
    if (n === 1) return 'I have 1 photo of the job. I am attaching it to this email now.';
    return 'I have ' + n + ' photos of the job. I am attaching them to this email now.';
  }

  /* Plain labelled lines, not JSON. Russell reads this on a phone. The day and
     the time come from the same two helpers the review screen uses, so the
     email and the screen always agree, and both stay 12 hour. */
  function emailBody(p, note) {
    var lines = [];
    lines.push('Hello Russell,');
    lines.push('');
    lines.push('I would like a quote. My details are below.');
    lines.push('');

    if (p.photoNames.length > 0) {
      lines.push(photoLine(p.photoNames.length));
      lines.push('');
    }

    if (p.service !== '')  lines.push('Service: ' + p.service);
    if (p.dayLabel !== '') lines.push('Day: ' + p.dayLabel);
    if (p.time !== '')     lines.push('Time: ' + p.time);
    lines.push('Name: ' + p.name);
    lines.push('Phone: ' + prettyPhone(p.phone));
    lines.push('Address or area: ' + p.address);
    if (p.email !== '')    lines.push('Email: ' + p.email);
    lines.push('Photos: ' + (p.photoNames.length === 0 ? 'None' : String(p.photoNames.length)));

    if (note !== '') {
      lines.push('');
      lines.push('About the job:');
      // The note comes from a textarea, so it can hold its own line breaks.
      lines.push(note.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
    }

    lines.push('');
    lines.push('Filled in on the Cook King Contractor website on ' + p.submittedAt + '.');
    return lines.join('\r\n');
  }

  /* Both halves are encoded. A line break becomes %0D%0A, which is what a
     mailto body needs, so the body is built with \r\n and the encoder does the
     rest. */
  function linkFor(p, note) {
    return 'mailto:' + QUOTE_EMAIL +
           '?subject=' + encodeURIComponent(emailSubject(p)) +
           '&body=' + encodeURIComponent(emailBody(p, note));
  }

  /* Build the link, then cut the note back until the whole thing fits.

     Encoding turns some characters into three, so the overshoot is measured
     again after every cut rather than worked out once. The loop is bounded so
     an odd note can never hang the button. A link that is still too long once
     the note is gone is refused by doSend(), not opened. */
  function buildMailto() {
    var p = buildPayload();
    var url = linkFor(p, p.note);
    if (url.length <= MAX_MAILTO_CHARS) return url;

    var note = p.note;
    var guard = 0;
    while (note !== '' && url.length > MAX_MAILTO_CHARS && guard < 300) {
      var over = url.length - MAX_MAILTO_CHARS;
      var cut = Math.ceil(over / 3);
      if (cut < 8) cut = 8;
      note = note.slice(0, Math.max(0, note.length - cut)).replace(/\s+$/, '');
      url = linkFor(p, note + NOTE_CUT_MARK);
      guard++;
    }
    return url;
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

    backBtn.hidden = onSent || step === 0;
    nextBtn.hidden = onReview || onSent;
    sendBtn.hidden = !onReview;
    doneBtn.hidden = !onSent;

    /* The last screen keeps the phone number in reach. The mail app may not
       have opened at all, and the customer needs a way through either way. */
    if (fallback !== null && onSent) fallback.hidden = false;

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
     HANDING THE DRAFT OVER
     ========================================================================= */

  function failWith(message) {
    sendError.textContent = message;
    sendError.hidden = false;
    if (fallback !== null) fallback.hidden = false;
    body.scrollTop = body.scrollHeight;
  }

  function doSend() {
    sendError.hidden = true;
    if (fallback !== null) fallback.hidden = true;

    var url = buildMailto();

    /* The note has already been cut back as far as it goes. A link still over
       the cap means one of the other answers is enormous. Opening it would
       hand the mail app a draft it may mangle, so it is not opened at all. */
    if (url.length > MAX_MAILTO_CHARS) {
      failWith('Your answers are too long to hand to your email app. Call ' + PHONE_DISPLAY +
               ' and Russell will take these details over the phone.');
      return;
    }

    lastMailto = url;
    window.location.href = url;

    /* The answers and the photo list both stay put. The mail app opening is
       not the same as the email being sent. The customer can still close the
       draft, and nothing here would survive that if it were cleared. */
    goTo(3);
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
    payload: buildPayload,
    mailto: buildMailto,
    lastMailto: function () { return lastMailto; },
    photoCount: function () { return photos.length; },
    limits: {
      MAX_PHOTOS: MAX_PHOTOS,
      MAX_EDGE: MAX_EDGE,
      MAX_TOTAL_CHARS: MAX_TOTAL_CHARS,
      MAX_MAILTO_CHARS: MAX_MAILTO_CHARS
    }
  };
})();
