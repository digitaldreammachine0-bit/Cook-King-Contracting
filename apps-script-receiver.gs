/* ===========================================================================
   THIS FILE IS NOT PART OF THE WEBSITE.

   Do not upload it to the web host. Nothing links to it. If you copy the site
   folder to a server, this file can be left behind and the site works fine.

   This is the code that goes into Google Apps Script, inside Russell's own
   Google account. It receives a quote request from the website and then:

     1. Saves any photos into a Drive folder.
     2. Adds one row to a Google Sheet, so there is a record he can open.
     3. Emails Russell the whole request.
     4. Copies the customer in, if they ticked the copy box.

   Step by step setup instructions are in SENDING-SETUP.md, in this same folder.
   =========================================================================== */

/* Where the request email lands. */
var OWNER_EMAIL = 'russrestores24.7@gmail.com';

/* Names of the two things the script makes in Drive the first time it runs.
   You never have to create these yourself. */
var SHEET_NAME = 'Cook King Quote Requests';
var FOLDER_NAME = 'Cook King Quote Photos';


/* ---------------------------------------------------------------------------
   Visiting the web app address in a browser runs this. It exists so you can
   check the address works. You should see a short line of text.
   --------------------------------------------------------------------------- */
function doGet() {
  return ContentService
    .createTextOutput('Cook King quote receiver is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}


/* ---------------------------------------------------------------------------
   The website posts here.
   --------------------------------------------------------------------------- */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: 'Nothing arrived in the request.' });
    }

    var q = JSON.parse(e.postData.contents);

    if (!q.name || !q.phone) {
      return reply({ ok: false, error: 'The name and phone number were missing.' });
    }

    var savedPhotos = savePhotos(q);
    appendToSheet(q, savedPhotos);
    sendMail(q, savedPhotos);

    return reply({ ok: true });

  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


/* ---------------------------------------------------------------------------
   Photos: written into a Drive folder, kept private to Russell's account.
   --------------------------------------------------------------------------- */
function savePhotos(q) {
  var out = { files: [], blobs: [], folderUrl: '' };
  if (!q.photos || !q.photos.length) return out;

  var folder = getFolder();
  out.folderUrl = folder.getUrl();

  // 12 hour with AM or PM, filenames included. hh is the 12 hour clock,
  // HH would be the 24 hour one and is never used on this project.
  var stamp = Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd hhmmss a');
  var who = String(q.name || 'customer').replace(/[^A-Za-z0-9 ]/g, '').trim();

  for (var i = 0; i < q.photos.length; i++) {
    var p = q.photos[i];
    if (!p || !p.dataUrl) continue;

    var comma = p.dataUrl.indexOf(',');
    if (comma < 0) continue;

    var meta = p.dataUrl.substring(0, comma);
    var b64 = p.dataUrl.substring(comma + 1);
    var mime = 'image/jpeg';
    var m = meta.match(/^data:([^;]+)/);
    if (m) mime = m[1];

    var name = who + ' ' + stamp + ' ' + (i + 1) + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
    var file = folder.createFile(blob);

    out.blobs.push(blob);
    out.files.push({ name: name, url: file.getUrl() });
  }
  return out;
}


/* ---------------------------------------------------------------------------
   The record Russell can open. One row per request.
   Every time on this sheet is 12 hour with AM or PM.
   --------------------------------------------------------------------------- */
function appendToSheet(q, saved) {
  var sheet = getSheet();

  var links = [];
  for (var i = 0; i < saved.files.length; i++) links.push(saved.files[i].url);

  sheet.appendRow([
    Utilities.formatDate(new Date(), tz(), 'M/d/yyyy h:mm a'),
    q.service || '',
    q.dayLabel || q.date || '',
    q.time || '',
    q.name || '',
    q.phone || '',
    q.email || '',
    q.address || '',
    q.note || '',
    q.sendCopy ? 'Yes' : 'No',
    saved.files.length,
    links.join('\n')
  ]);
}


/* ---------------------------------------------------------------------------
   The emails.
   --------------------------------------------------------------------------- */
function sendMail(q, saved) {
  var subject = 'Quote request - ' + (q.service || 'Job') + ' - ' + (q.name || '');

  var lines = [];
  lines.push('New quote request from the website.');
  lines.push('');
  lines.push('Service: ' + (q.service || ''));
  lines.push('Day: ' + (q.dayLabel || q.date || ''));
  lines.push('Time: ' + (q.time || ''));
  lines.push('');
  lines.push('Name: ' + (q.name || ''));
  lines.push('Phone: ' + (q.phone || ''));
  lines.push('Email: ' + (q.email || 'not given'));
  lines.push('Address or area: ' + (q.address || ''));
  lines.push('');

  if (q.note) {
    lines.push('About the job:');
    lines.push(q.note);
    lines.push('');
  }

  if (saved.files.length > 0) {
    lines.push('Photos: ' + saved.files.length + ' attached to this email.');
    lines.push('Also saved in Drive: ' + saved.folderUrl);
    lines.push('');
  } else {
    lines.push('Photos: none sent.');
    lines.push('');
  }

  lines.push('Sent from the website at ' + (q.submittedAt || nowText()) + '.');

  var options = { name: 'Cook King Contractor Website' };
  if (saved.blobs.length > 0) options.attachments = saved.blobs;
  if (q.sendCopy && q.email) options.cc = q.email;

  MailApp.sendEmail(OWNER_EMAIL, subject, lines.join('\n'), options);
}


/* ---------------------------------------------------------------------------
   Small helpers.
   The Sheet and the Drive folder are made once, then remembered, so the script
   never fills the Drive with duplicates.
   --------------------------------------------------------------------------- */
function tz() {
  return Session.getScriptTimeZone();
}

function nowText() {
  return Utilities.formatDate(new Date(), tz(), 'M/d/yyyy h:mm a');
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');

  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* it was removed */ }
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function getSheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');

  if (id) {
    try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (err) { /* it was removed */ }
  }

  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sheet = ss.getSheets()[0];
  sheet.appendRow([
    'Received', 'Service', 'Day', 'Time', 'Name', 'Phone', 'Email',
    'Address or area', 'About the job', 'Copy sent', 'Photo count', 'Photo links'
  ]);
  sheet.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  return sheet;
}


/* ---------------------------------------------------------------------------
   Optional. Run this once from the Apps Script editor to prove the script can
   email you, before the website is even pointed at it.
   Pick testEmail from the function list at the top, then press Run.
   --------------------------------------------------------------------------- */
function testEmail() {
  MailApp.sendEmail(
    OWNER_EMAIL,
    'Quote request - Test - Cook King website',
    'This is a test. If you are reading this, the script can send you email.\n\n' +
    'Sent at ' + nowText() + '.'
  );
}
