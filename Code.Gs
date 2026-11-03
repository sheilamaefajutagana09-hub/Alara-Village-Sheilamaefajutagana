/**
 * ALARA VILLAGE landing page + 30-day outreach (Google Apps Script web app)
 * Files in this project: Code.gs (this file) and Index.html
 */

// ===================== SETTINGS =====================
// Google Drive folder "Alara image" (images + video)
const FOLDER_ID  = '1SprYlc16SGA-isLh9STW6GsQQXQ7o5Zt';

// Exact file name of the video in that folder
const VIDEO_NAME = 'alara_day_to_night_enhanced_trimmed-COMPRESS-COMPRESS.mp4';

// Google Sheet where leads are saved.
// Leave '' and the script creates "Alara Village Leads" for you (run leadsUrl() to get its link).
// To use your own sheet, paste its ID here. It must be a Google Sheet that this Google account can edit.
const SHEET_ID = '';

// OWNER: your email. Gets a message for every new inquiry plus follow-up reminders.
const NOTIFY_EMAIL = 'sheilamaefajutagana09@gmail.com';

// Shown on the emails clients receive
const SENDER_NAME = 'Alara Village';
const AGENT_NAME  = 'Sheila Mae Fajutagana';   // e.g. 'Maria'. Leave '' to sign as "Alara Village Team"
const AGENT_PHONE = '0991 885 9370';   // e.g. '0917 123 4567'. Leave '' to skip

// Facebook page. The link buttons in the client emails ("Visit our Facebook Page") go here.
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61577472729033';

// Backup link, used only if FACEBOOK_URL is left empty. Leave '' to use this web app's own link.
const SITE_URL = '';

// Hour (0-23) when the daily outreach runs. Set the project time zone to Asia/Manila.
const SEND_HOUR = 9;

const PAGE_TITLE = 'Alara Village | Imus, Cavite';
// ====================================================

const HEADERS = ['Date', 'Name', 'Mobile', 'Email', 'Model house', 'Preferred visit date', 'Status', 'Client email step', 'Owner reminder step', 'Token'];
const STATUS_LIST = ['New', 'Contacted', 'Visit set', 'Booked', 'Closed', 'Lost', 'STOP'];
const CLIENT_STOP = ['stop', 'unsubscribed', 'booked', 'closed', 'lost'];
const OWNER_STOP  = ['stop', 'booked', 'closed', 'lost'];

// Removes the plain-text signature from the HTML version (the template adds its own styled one).
const SIG_RE = /\n*\{\{agent\}\}\{\{contact\}\}\s*\nAlara Village · Imus, Cavite\s*$/;

// ===================== WEB APP =====================

/** Serves the landing page (or handles the unsubscribe link). */
function doGet(e) {
  if (e && e.parameter && e.parameter.u) return unsubscribe_(e.parameter.u);
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================== IMAGES + VIDEO =====================

var _fmap = null, _refreshed = false;

// name -> Drive file ID for everything in the folder (cached for 6 hours)
function fileMap_(force) {
  if (force) {
    if (_refreshed) return _fmap;
    _refreshed = true;
  } else if (_fmap) {
    return _fmap;
  }
  var cache = CacheService.getScriptCache();
  if (!force) {
    var hit = cache.get('fmap_v2');
    if (hit) { _fmap = JSON.parse(hit); return _fmap; }
  }
  var map = {}, it = DriveApp.getFolderById(FOLDER_ID).getFiles();
  while (it.hasNext()) { var f = it.next(); map[f.getName()] = f.getId(); }
  cache.put('fmap_v2', JSON.stringify(map), 21600);
  _fmap = map;
  return map;
}

/** Used inside Index.html: <?= img('hero-1-veta.jpg') ?> */
function img(name) {
  var id = fileMap_()[name];
  if (!id) id = fileMap_(true)[name]; // not found: re-read the folder once (e.g. file was just uploaded)
  return id ? 'https://lh3.googleusercontent.com/d/' + id : '';
}

// Video file ID: uses VIDEO_NAME if it is in the folder, otherwise any Alara .mp4, otherwise any .mp4
function videoId_() {
  var pick = function (m) {
    if (m[VIDEO_NAME]) return VIDEO_NAME;
    var keys = Object.keys(m).filter(function (n) { return /\.mp4$/i.test(n); });
    var best = function (re) { return keys.filter(function (n) { return re.test(n); }); };
    return best(/alara/i).filter(function (n) { return !/compress/i.test(n); })[0] ||
      best(/alara/i)[0] || keys[0] || '';
  };
  var map = fileMap_();
  var key = pick(map);
  if (!key) { map = fileMap_(true); key = pick(map); }
  return key ? map[key] : '';
}

// Link options for the video (use whichever Index.html calls)
function videoUrl()     { var id = videoId_(); return id ? 'https://drive.google.com/uc?export=download&id=' + id : ''; }
function videoSrc()     { var id = videoId_(); return id ? 'https://drive.usercontent.google.com/download?id=' + id + '&export=download' : ''; }
function videoPoster()  { var id = videoId_(); return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200' : ''; }
function videoPreview() { var id = videoId_(); return id ? 'https://drive.google.com/file/d/' + id + '/preview' : ''; }

// Sends the video to the page as base64 (more reliable than a direct Drive link)
function getVideo() {
  var id = videoId_();
  if (!id) return null;
  var b = DriveApp.getFileById(id).getBlob();
  return { type: b.getContentType() || 'video/mp4', data: Utilities.base64Encode(b.getBytes()) };
}

/** RUN ONCE: lets visitors see the images and video (sets every file to "Anyone with the link can view"). */
function shareImages() {
  var files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  var n = 0;
  while (files.hasNext()) {
    files.next().setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    n++;
  }
  Logger.log(n + ' files shared.');
}

/** RUN after you add or replace images/video in the folder. */
function refreshImages() {
  CacheService.getScriptCache().remove('fmap_v2');
  _fmap = null;
  Logger.log(Object.keys(fileMap_()).length + ' files found.');
}

/** RUN to check that every image the page needs, and the video, are in the folder. */
function checkImages() {
  var need = [
    'hero-1-veta.jpg', 'hero-2-zila.jpg', 'hero-3-raya.jpg', 'hero-4-yana.jpg',
    'amenities-pool-gym.jpg', 'amenities-homes-street.jpg', 'amenities-plan-with-confidence.jpg',
    'model-1-veta-render.jpg', 'model-2-zila-render.jpg', 'model-3-raya-render.jpg', 'model-4-yana-render.jpg',
    'floorplan-veta.jpg', 'floorplan-zila.jpg', 'floorplan-raya.jpg', 'floorplan-yana.jpg',
    'site-plan.jpg'
  ];
  CacheService.getScriptCache().remove('fmap_v2');
  _fmap = null;
  var have = fileMap_();
  var missing = need.filter(function (n) { return !have[n]; });
  if (!videoId_()) missing.push('a video (.mp4)');
  Logger.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'All ' + need.length + ' images and the video are found.');
}

// ===================== LEADS =====================

/** Called by the inquiry form. Saves the lead, then sends the Day 0 emails. */
function submitLead(d) {
  var name  = clean_(d && d.name, 120);
  var phone = clean_(d && d.phone, 40);
  var email = clean_(d && d.email, 120);
  var model = clean_(d && d.model, 30);
  var visitDate = clean_(d && d.visitDate, 30);
  if (!name || !phone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid details');

  var row;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sh = leadsSheet_();
    sh.appendRow([new Date(), name, phone, email, model, visitDate, 'New', -1, -1, Utilities.getUuid().replace(/-/g, '').slice(0, 16)]);
    row = sh.getLastRow();
  } catch (err) {
    // The exact reason shows up in Apps Script > Executions
    console.error('submitLead failed: ' + err + '\n' + (err && err.stack ? err.stack : ''));
    throw new Error('Hindi na-save ang details: ' + (err && err.message ? err.message : err));
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  try {
    processRow_(leadsSheet_(), row);
  } catch (err) {
    Logger.log('Outreach error: ' + err);
  }
  return true;
}

/** RUN this to test the form without the website. Check the Execution log for the exact error, if any. */
function testSubmit() {
  submitLead({ name: 'Test Lead', phone: '0917 000 0000', email: NOTIFY_EMAIL });
  Logger.log('OK: the lead was saved in the sheet and the Day 0 email was attempted. Check ' + leadsSheet_().getParent().getUrl());
}

/** RUN to get the link of the leads sheet. */
function leadsUrl() {
  Logger.log(leadsSheet_().getParent().getUrl());
}

/**
 * RUN ONCE after upgrading from the old 8-column sheet layout.
 * Moves old Status/step/token values from E:H to their new positions G:J.
 * Existing model/date values in the new layout are left untouched.
 */
function repairLegacyRows() {
  var sh = leadsSheet_();
  var last = sh.getLastRow();
  if (last < 2) {
    Logger.log('No lead rows to repair.');
    return;
  }

  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var repaired = 0;
  var statuses = STATUS_LIST.map(function (s) { return s.toLowerCase(); });

  values.forEach(function (row) {
    var oldStatus = String(row[4] || '').trim();
    var oldClient = row[5];
    var oldOwner = row[6];
    var oldToken = String(row[7] || '').trim();
    var newToken = String(row[9] || '').trim();

    // Legacy rows have a valid old status, a token in old column H,
    // and no token yet in the new column J.
    if (statuses.indexOf(oldStatus.toLowerCase()) > -1 && oldToken && !newToken) {
      row[4] = '';
      row[5] = '';
      row[6] = oldStatus;
      row[7] = oldClient;
      row[8] = oldOwner;
      row[9] = oldToken;
      repaired++;
    }
  });

  sh.getRange(2, 1, values.length, HEADERS.length).setValues(values);
  Logger.log('Repaired ' + repaired + ' legacy row(s).');
}

function leadsSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sh = null, fresh = false;
  // 1) the sheet this script created earlier, 2) the SHEET_ID above, 3) otherwise create a new one
  var ids = [props.getProperty('SHEET_ID'), SHEET_ID];
  for (var k = 0; k < ids.length && !sh; k++) {
    if (ids[k] && ids[k] !== 'PASTE_GOOGLE_SHEET_ID') {
      try { sh = SpreadsheetApp.openById(ids[k]).getSheets()[0]; } catch (e) { sh = null; }
    }
  }
  if (!sh) {
    var ss = SpreadsheetApp.create('Alara Village Leads');
    props.setProperty('SHEET_ID', ss.getId());
    sh = ss.getSheets()[0];
    fresh = true;
  }
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).setAllowInvalid(true).build();
  sh.getRange(2, 7, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  if (fresh) styleLeadsSheet_(sh);
  return sh;
}

/** RUN to apply (or re-apply) the green and gold theme to the leads sheet. */
function styleLeadsSheet() {
  var sh = leadsSheet_();
  styleLeadsSheet_(sh);
  Logger.log('Theme applied: ' + sh.getParent().getUrl());
}

function styleLeadsSheet_(sh) {
  var GREEN = '#2d5733', GOLD = '#c9a24a', CREAM = '#f7f3e6', DARK = '#1f3d25';
  var rows = sh.getMaxRows();
  var cols = HEADERS.length;

  sh.setName('Leads');
  sh.setTabColor(GREEN);
  sh.setHiddenGridlines(true);

  // whole table: font, vertical alignment
  sh.getRange(1, 1, rows, cols).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');

  // header row: green with gold text and gold underline
  sh.setRowHeight(1, 36);
  sh.getRange(1, 1, 1, cols)
    .setBackground(GREEN).setFontColor(GOLD).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center')
    .setBorder(null, null, true, null, null, null, GOLD, SpreadsheetApp.BorderStyle.SOLID_THICK);

  // banded rows (cream / white)
  sh.getBandings().forEach(function (b) { b.remove(); });
  var band = sh.getRange(2, 1, Math.max(rows - 1, 1), cols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  band.setFirstRowColor('#ffffff').setSecondRowColor(CREAM);

  // column widths
  [150, 190, 130, 240, 130, 150, 110, 130, 150, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // formats and alignment
  sh.getRange(2, 1, rows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm').setHorizontalAlignment('left');
  sh.getRange(2, 7, rows - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(2, 8, rows - 1, 2).setHorizontalAlignment('center').setFontColor('#888888');
  sh.getRange(2, 10, rows - 1, 1).setFontColor('#999999');

  // status colors
  var statusRange = sh.getRange(2, 7, rows - 1, 1);
  var colors = {
    'New':       ['#fff4cc', '#7a5b00'],
    'Contacted': ['#dbeafe', '#1e40af'],
    'Visit set': ['#e0e7ff', '#3730a3'],
    'Booked':    ['#d1fae5', '#065f46'],
    'Closed':    ['#bbf7d0', '#14532d'],
    'Lost':      ['#fee2e2', '#991b1b'],
    'STOP':      ['#e5e7eb', '#374151'],
    'Unsubscribed': ['#e5e7eb', '#374151']
  };
  var rules = Object.keys(colors).map(function (k) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(k).setBackground(colors[k][0]).setFontColor(colors[k][1])
      .setRanges([statusRange]).build();
  });
  sh.setConditionalFormatRules(rules);

  // trim unused columns and add a filter
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, rows, cols).createFilter();
}

function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// ===================== 30-DAY OUTREACH =====================

/** RUN ONCE: turns on the daily outreach (runs every day at SEND_HOUR). */
function setupOutreach() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runOutreach') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runOutreach').timeBased().everyDays(1).atHour(SEND_HOUR).create();
  Logger.log('Daily outreach is ON (about ' + SEND_HOUR + ':00 every day).');
}

/** Runs every day. Sends whatever email is due for each lead. */
function runOutreach() {
  var sh = leadsSheet_();
  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (MailApp.getRemainingDailyQuota() < 2) break;
    try {
      processRow_(sh, r);
    } catch (err) {
      Logger.log('Row ' + r + ': ' + err);
    }
  }
}

/** Sends the next due client email and the next due owner reminder for one row. */
function processRow_(sh, r) {
  var v = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  if (!v[0] || !v[1]) return;
  var status = String(v[6] || '').trim().toLowerCase();
  var days = Math.floor((new Date() - new Date(v[0])) / 86400000);
  var lead = { name: v[1], phone: v[2], email: v[3], model: v[4], visitDate: v[5], token: v[9] };

  if (lead.email && CLIENT_STOP.indexOf(status) < 0) {
    var i = nextDue_(Number(v[7]), days, CLIENT_EMAILS);
    if (i > -1) {
      sendClient_(CLIENT_EMAILS[i], lead);
      sh.getRange(r, 8).setValue(i);
    }
  }
  if (NOTIFY_EMAIL && OWNER_STOP.indexOf(status) < 0) {
    var j = nextDue_(Number(v[8]), days, OWNER_EMAILS);
    if (j > -1) {
      sendOwner_(OWNER_EMAILS[j], lead);
      sh.getRange(r, 9).setValue(j);
    }
  }
}

/** Index of the next email to send, or -1. Sends one email per run, in order. */
function nextDue_(lastIndex, days, steps) {
  var i = (isNaN(lastIndex) ? -1 : lastIndex) + 1;
  return i < steps.length && steps[i].day <= days ? i : -1;
}

function vars_(lead, withSheet) {
  var site = FACEBOOK_URL || SITE_URL || ScriptApp.getService().getUrl() || '';
  var unsub = lead.token && ScriptApp.getService().getUrl()
    ? ScriptApp.getService().getUrl() + '?u=' + lead.token : '';
  return {
    first: String(lead.name || '').trim().split(/\s+/)[0].toLowerCase(),
    name: lead.name, phone: lead.phone, email: lead.email, model: lead.model || '', visitDate: lead.visitDate || '',
    agent: AGENT_NAME || 'Alara Village Team',
    contact: AGENT_PHONE ? '\n' + AGENT_PHONE : '',
    site: site, unsub: unsub,
    sheet: withSheet ? leadsSheet_().getParent().getUrl() : ''
  };
}

function fill_(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, function (m, k) { return vars[k] == null ? '' : vars[k]; });
}

// ===================== EMAIL SENDING + HTML TEMPLATE =====================

/** Sends a styled HTML email (with a plain-text fallback) to the client. */
function sendClient_(step, lead, subjectPrefix) {
  const v = vars_(lead);
  const footer = v.unsub
    ? '\n\n--\nAyaw mo na ng emails na ito? I-click dito: ' + v.unsub
    : '\n\n--\nAyaw mo na ng emails na ito? Reply ka lang ng STOP.';
  const opts = {
    to: lead.email,
    subject: (subjectPrefix || '') + fill_(step.subject, v),
    body: fill_(step.body, v) + footer,
    htmlBody: emailHtml_(fill_(step.body.replace(SIG_RE, ''), v), v),
    inlineImages: { agent: agentPhoto_() },
    name: SENDER_NAME
  };
  if (NOTIFY_EMAIL) opts.replyTo = NOTIFY_EMAIL;
  MailApp.sendEmail(opts);
}

function sendOwner_(step, lead, subjectPrefix) {
  const v = vars_(lead, true);
  const body = fill_(step.body, v);
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: (subjectPrefix || '') + fill_(step.subject, v),
    body: body,
    htmlBody: ownerHtml_(body, v, step.day),
    inlineImages: { agent: agentPhoto_('green') },
    name: SENDER_NAME
  });
}

/**
 * Styled HTML for the owner emails (new inquiry + follow-up reminders), green and gold like the landing page.
 * Layout: green header with the lead's name, a lead card (call / email), the message, then an "Open leads sheet" button.
 */
function ownerHtml_(text, v, day) {
  const SANS = "'Poppins',Arial,Helvetica,sans-serif";
  const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
  const GREEN = '#2d5733', GOLD = '#8a6a3b', GOLD_L = '#e6c880', GOLD_B = '#c9a152';

  const btn = function (href, label, bg, color) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 12px 0"><tr>' +
      '<td style="background:' + bg + ';border-radius:2px"><a href="' + esc_(href) + '" style="display:inline-block;padding:14px 22px;' +
      'font:600 11px ' + SANS + ';letter-spacing:.16em;text-transform:uppercase;color:' + color + ';text-decoration:none">' +
      esc_(label) + '</a></td></tr></table>';
  };

  const paras = String(text).trim().split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean);
  const headline = paras.shift() || '';
  if (day > 0) paras.shift(); // the lead's name/phone line is shown in the lead card instead
  const label = day === 0 ? 'New inquiry' : 'Follow-up reminder \u00b7 Day ' + day;

  let hasSheet = false;
  const parts = [];
  paras.forEach(function (p) {
    if (/^Name:/.test(p)) return; // replaced by the lead card
    let lines = p.split('\n').filter(function (l) {
      if (/^https?:\/\/\S+$/.test(l.trim())) { hasSheet = true; return false; }
      return true;
    });
    if (!lines.length) return;
    const t = lines.join('\n');
    if (/^"[\s\S]*"$/.test(t)) {
      parts.push('<div style="margin:0 0 22px;padding:16px 20px;background:#faf7ef;border-left:3px solid ' + GOLD_B + ';font:italic 500 19px/1.55 ' + SERIF + ';color:' + GREEN + '">' +
        esc_(t) + '</div>');
    } else if (/:$/.test(t) && t.length < 14) {
      parts.push('<p style="margin:0 0 8px;font:600 10px ' + SANS + ';letter-spacing:.22em;text-transform:uppercase;color:' + GOLD + '">' + esc_(t.replace(/:$/, '')) + '</p>');
    } else if (lines.every(function (l) { return /^(-|\d+\.)\s+/.test(l.trim()); })) {
      parts.push(lines.map(function (l) {
        return '<p style="margin:0 0 8px;padding-left:20px;font:400 14px/24px ' + SANS + ';color:' + GREEN + '"><span style="color:' + GOLD + '">&mdash;</span>&nbsp; ' +
          esc_(l.trim().replace(/^(-|\d+\.)\s+/, '')) + '</p>';
      }).join('') + '<div style="height:14px"></div>');
    } else {
      parts.push('<p style="margin:0 0 20px;font:400 14px/24px ' + SANS + ';color:' + GREEN + '">' + lines.map(esc_).join('<br>') + '</p>');
    }
  });

  const row = function (k, val, link) {
    if (!val) return '';
    return '<tr><td style="padding:7px 0;width:84px;font:600 9px ' + SANS + ';letter-spacing:.2em;text-transform:uppercase;color:' + GOLD + ';vertical-align:top">' + k + '</td>' +
      '<td style="padding:7px 0;font:500 15px ' + SANS + ';color:' + GREEN + '">' +
      (link ? '<a href="' + esc_(link) + '" style="color:' + GREEN + ';text-decoration:none">' + esc_(val) + '</a>' : esc_(val)) + '</td></tr>';
  };
  const phoneDigits = String(v.phone || '').replace(/[^\d+]/g, '');
  const card = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;background:#f4f6f2;border-top:2px solid ' + GOLD_B + '"><tr><td style="padding:14px 22px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    row('Name', v.name) + row('Mobile', v.phone, phoneDigits ? 'tel:' + phoneDigits : '') + row('Email', v.email, v.email ? 'mailto:' + v.email : '') +
    '</table></td></tr></table>';

  let buttons = '';
  if (phoneDigits) buttons += btn('tel:' + phoneDigits, 'Call ' + String(v.name || '').split(' ')[0], GOLD_B, '#1b3323');
  if (v.sheet) buttons += btn(v.sheet, 'Open leads sheet', GREEN, GOLD_L);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap" rel="stylesheet">' +
    '</head><body style="margin:0;padding:0;background:#f4f6f2">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f2"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #efe3c3">' +
    // header
    '<tr><td style="background:' + GREEN + ';padding:30px 36px 26px;border-bottom:3px solid ' + GOLD_B + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">' +
    '<div style="font:600 10px ' + SANS + ';letter-spacing:.28em;text-transform:uppercase;color:' + GOLD_L + '">Alara Village &middot; ' + esc_(label) + '</div>' +
    '<div style="margin-top:10px;font:500 34px/1.1 ' + SERIF + ';color:#f3efe4">' + esc_(v.name || '') + '</div>' +
    '<div style="margin-top:8px;font:400 13px ' + SANS + ';color:#cfe0cf">' + esc_(headline.replace(/\.$/, '')) + '</div>' +
    '</td><td align="right" valign="top" width="84"><img src="cid:agent" width="72" height="72" alt="' + esc_(AGENT_NAME) + '" style="display:block;width:72px;height:72px;border:0;border-radius:50%"></td></tr></table></td></tr>' +
    // body
    '<tr><td style="padding:30px 36px 10px">' + card + parts.join('') + (buttons ? '<div style="margin-top:6px">' + buttons + '</div>' : '') + '</td></tr>' +
    // footer
    '<tr><td align="center" style="background:#ece8da;padding:18px 24px;font:400 11px/1.7 ' + SANS + ';color:#6f8a74;border-top:1px solid #ddd8c6">' +
    'Lead alert from your Alara Village page.<br>Set the Status in the sheet to Booked, Closed, Lost or STOP to stop reminders.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Builds the HTML email in the landing page style (green + gold, serif headings).
 * Text rules: one blank line = new paragraph. A line with only a link becomes a button.
 * Lines inside a stanza stay on their own lines (like the reference email).
 * "# TEXT" = headline line at the top. "## Title" = model title (gold serif). "- " or "1." lines = gold-dash list.
 * ">>> TEXT <<<" becomes a big centered line.
 */
function emailHtml_(text, v) {
  const SANS = "'Poppins',Arial,Helvetica,sans-serif";
  const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
  const GREEN = '#2d5733', GOLD = '#8a6a3b', GOLD_L = '#e6c880', GOLD_B = '#c9a152';

  // Space between stanzas: one blank line (same rhythm as the reference email). Change this one value to adjust.
  const GAP = '28px';

  let siteUsed = false;
  const btn = function (href, label, bg, color) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 30px"><tr>' +
      '<td style="background:' + bg + ';border-radius:2px"><a href="' + esc_(href) + '" style="display:inline-block;padding:15px 28px;' +
      'font:600 11px ' + SANS + ';letter-spacing:.18em;text-transform:uppercase;color:' + color + ';text-decoration:none">' +
      esc_(label) + '</a></td></tr></table>';
  };

  const paras = String(text).trim().split(/\n{2,}/).map(function (p) {
    p = p.trim();
    if (!p) return '';
    const base = 'margin:0 0 ' + GAP + ';font:400 15px/27px ' + SANS + ';color:' + GREEN;

    if (/^https?:\/\/\S+$/.test(p)) {
      siteUsed = true;
      return btn(p, 'Visit our Facebook Page', GREEN, GOLD_L);
    }
    if (/^>>>.*<<<$/.test(p)) {
      const mail = NOTIFY_EMAIL ? 'mailto:' + NOTIFY_EMAIL + '?subject=' + encodeURIComponent('Ready na ako') : '';
      const txt = mail
        ? '<a href="' + esc_(mail) + '" style="color:' + GREEN + ';text-decoration:underline">' + esc_(p) + '</a>'
        : '<span style="text-decoration:underline">' + esc_(p) + '</span>';
      return '<p style="margin:6px 0 ' + GAP + ';font:700 15px/22px ' + SANS + ';letter-spacing:.02em;text-transform:uppercase;color:' + GREEN + '">' + txt + '</p>';
    }
    const lines = p.split('\n');
    if (lines.every(function (l) { return /^(-|\d+\.)\s+/.test(l.trim()); })) {
      return lines.map(function (l) {
        return '<p style="margin:0 0 10px;padding-left:22px;font:400 15px/1.7 ' + SANS + ';color:' + GREEN + '">' +
          '<span style="color:' + GOLD + '">&mdash;</span>&nbsp; ' + esc_(l.trim().replace(/^(-|\d+\.)\s+/, '')) + '</p>';
      }).join('') + '<div style="height:' + GAP + '"></div>';
    }
    if (/^# /.test(lines[0])) {
      return '<p style="margin:0 0 ' + GAP + ';font:600 13px/22px ' + SANS + ';letter-spacing:.04em;text-transform:uppercase;color:' + GREEN + '">' +
        lines.map(function (l) { return esc_(l.replace(/^# /, '')); }).join('<br>') + '</p>';
    }
    if (/^## /.test(lines[0])) {
      return '<p style="' + base + '"><span style="font:italic 500 26px ' + SERIF + ';color:' + GOLD + '">' + esc_(lines[0].slice(3)) + '</span><br>' +
        lines.slice(1).map(function (l) { return esc_(l); }).join('<br>') + '</p>';
    }
    return '<p style="' + base + '">' + lines.map(esc_).join('<br>') + '</p>';
  }).join('');

  // Buttons under the message
  let cta = '';
  if (v.site && !siteUsed) cta += btn(v.site, 'Visit our Facebook Page', GREEN, GOLD_L);
  if (AGENT_PHONE) {
    cta += btn('tel:' + AGENT_PHONE.replace(/[^\d+]/g, ''),
      'Call ' + (AGENT_NAME ? AGENT_NAME.split(' ')[0] : 'us') + ' \u2014 ' + AGENT_PHONE, GOLD_B, '#1b3323');
  }

  const logoId = fileMap_()['logo.png'];
  const logo = logoId
    ? '<img src="https://lh3.googleusercontent.com/d/' + logoId + '" alt="" height="44" style="display:block;margin:0 auto 8px;height:44px;width:auto;border:0">'
    : '';

  const unsub = v.unsub
    ? '<a href="' + esc_(v.unsub) + '" style="color:' + GOLD_L + ';text-decoration:underline">Unsubscribe</a>'
    : 'Reply STOP to unsubscribe';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap" rel="stylesheet">' +
    '</head><body style="margin:0;padding:0;background:#f4f6f2">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f2"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #efe3c3">' +
    // header
    '<tr><td align="center" style="background:#ece8da;padding:26px 24px 22px;border-bottom:2px solid ' + GOLD_B + '">' + logo +
    '<div style="font:500 26px ' + SERIF + ';letter-spacing:.04em;color:' + GREEN + '">Alara Village</div>' +
    '<div style="margin-top:4px;font:500 9px ' + SANS + ';letter-spacing:.24em;text-transform:uppercase;color:' + GOLD + '">By LandOne Concept &middot; Imus, Cavite</div>' +
    '</td></tr>' +
    // body
    '<tr><td style="padding:36px 44px 12px">' + paras + '</td></tr>' +
    // buttons
    (cta ? '<tr><td style="padding:0 44px 8px">' + cta + '</td></tr>' : '') +
    // signature (left aligned, round photo, name, thin line)
    '<tr><td style="padding:6px 44px 0">' +
    '<img src="cid:agent" width="120" height="120" alt="' + esc_(v.agent) + '" style="display:block;margin:0 0 16px;width:120px;height:120px;border:0;border-radius:50%">' +
    '<div style="font:700 15px ' + SANS + ';color:' + GREEN + '">' + esc_(v.agent) + '</div>' +
    '<div style="margin-top:2px;font:400 12px ' + SANS + ';color:#6f8a74">Alara Village &middot; Imus, Cavite</div>' +
    '<div style="margin-top:28px;border-bottom:1px solid ' + GOLD_B + '"></div></td></tr>' +
    // trust line
    '<tr><td style="padding:18px 44px 26px;font:500 10px ' + SANS + ';letter-spacing:.14em;text-transform:uppercase;color:' + GOLD + '">' +
    'Free consultation &nbsp;&bull;&nbsp; No obligation &nbsp;&bull;&nbsp; Reply within 24 hours</td></tr>' +
    // footer
    '<tr><td align="center" style="background:' + GREEN + ';padding:22px 24px;font:400 11px/1.7 ' + SANS + ';color:#cfe0cf">' +
    'You received this because you requested information from Alara Village.<br>' + unsub +
    '<br><span style="color:#9db99f">&copy; 2026 Alara Village &mdash; LandOne Concept Inc. Imus, Cavite.</span></td></tr>' +
    '</table></td></tr></table></body></html>';
}

function unsubscribe_(token) {
  var sh = leadsSheet_();
  var last = sh.getLastRow();
  var done = false;
  if (last > 1 && String(token).length >= 8) {
    var hit = sh.getRange(2, 8, last - 1, 1).createTextFinder(String(token)).matchEntireCell(true).findNext();
    if (hit) {
      sh.getRange(hit.getRow(), 5).setValue('Unsubscribed');
      done = true;
    }
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;padding:0 20px;color:#2d5733;text-align:center">' +
    '<h2>' + (done ? "You're unsubscribed." : 'Link not found.') + '</h2>' +
    '<p>' + (done ? 'Hindi ka na makakatanggap ng emails mula sa amin. Salamat.' : 'Baka na-unsubscribe ka na. Reply ka na lang sa email namin.') + '</p></div>'
  ).setTitle('Alara Village');
}

/** RUN to receive every email (client and owner) in your inbox as a preview. */
function previewEmails() {
  if (!NOTIFY_EMAIL) throw new Error('Put your email in NOTIFY_EMAIL first.');
  var lead = { name: 'Juan Dela Cruz', phone: '0917 123 4567', email: NOTIFY_EMAIL, token: 'preview00preview' };
  CLIENT_EMAILS.forEach(function (s) { sendClient_(s, lead, '[CLIENT Day ' + s.day + '] '); });
  OWNER_EMAILS.forEach(function (s) { sendOwner_(s, lead, '[OWNER Day ' + s.day + '] '); });
  Logger.log('Sent ' + (CLIENT_EMAILS.length + OWNER_EMAILS.length) + ' preview emails to ' + NOTIFY_EMAIL);
}

// ===================== CLIENT EMAILS (1 email per day, Day 0 to Day 29 = 30 emails) =====================
// {{first}} {{agent}} {{contact}} {{site}} are filled in automatically.
// A link on its own line (blank line before and after) becomes a button in the email.

const CLIENT_EMAILS = [
  {
    day: 0,
    subject: `🏠 {{first}}, natanggap ko na yung inquiry mo`,
    body: `# 🏠 NATANGGAP NA NAMIN ANG INQUIRY MO. ANO NA ANG SUSUNOD?

Hi {{first}},

Salamat sa pag-inquire
sa Alara Village. 🏡

Within 24 hours,
may magme-message sa'yo
from our team.

Hindi mo kailangang
may ready na lahat ng numbers.

Sabihin mo lang kung
magkano ang budget mo,
kailan mo balak lumipat,
at ilan kayo sa bahay.

Mula doon,
ipapakita namin yung sample computation
ng model na babagay sa'yo. 📋

Free.

Walang obligation.

Habang naghihintay ka,
pwede mong bisitahin
ang Facebook page namin:

{{site}}

Pag may tanong ka agad,
reply ka lang dito. 💬

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 1,
    subject: `Baka sobrang aga pa? 🤔`,
    body: `# 🤔 BAKA SOBRANG AGA PA?

Hi {{first}},

Kilala mo ba yung thought na
"Baka hindi pa ako ready"?

Maybe ilang taon ka nang nagre-rent.

Or nag-iipon ka pa,
at hindi mo alam kung kailan
"enough" na.

Kaya pag naiisip mong mag-reserve,
parang may bumubulong…

"Paano kung hindi ko pala kaya?"

Fair question. 💭

Pero hindi mo kailangang sagutin 'yan
mag-isa.

At hindi mo kailangang sagutin 'yan
ngayon.

Kasi ang pagtingin sa numbers
ay hindi pa pagpirma. ✍️

Pwede mong tingnan ang sample computation,
tapos saka ka magdesisyon.

Kung hindi pa, okay lang.

At least alam mo na
kung ano ang kailangan
para maging ready.

Reply ka lang with your monthly budget range,
kahit rough lang. 💰

Hindi mo kailangang maging ready, {{first}}.

Kailangan mo lang malaman
kung gaano ka kalapit. 🎯

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 2,
    subject: `Tatlong bagay lang ang kailangan ko ☝️`,
    body: `# ☝️ TATLONG BAGAY LANG. ISANG REPLY.

Hi {{first}},

Hindi mo kailangan ng mahabang form.

Hindi mo rin kailangang
may hawak nang documents.

Tatlong bagay lang
ang kailangan ko
para makapag-send ng sample computation:

Una,
magkano ang budget mo kada buwan. 💰

Pangalawa,
kailan mo balak lumipat. 📆

Pangatlo,
ilan kayo sa bahay. 👨‍👩‍👧

Kahit rough lang,
okay na.

Isang reply lang,
at ako na ang bahala
sa susunod.

Free.

Walang obligation. 🙌

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 3,
    subject: `Saan napupunta ang binabayad mo kada buwan? 💸`,
    body: `# 💸 SAAN NAPUPUNTA ANG BINABAYAD MO KADA BUWAN?

Hi {{first}},

Every month,
may binabayaran ka
para sa tinitirhan mo.

At every month,
may napupuntahan
yung perang 'yon.

Hindi ko sinasabing masama ang mag-rent.

May mga panahon
na tama 'yon.

Pero kung may part of you
na nag-iisip ng
"someday, gusto kong may sarili akong bahay"…

Worth asking:

Kung halos ganito rin
ang buwan-buwan kong binabayaran,

saan ko gustong mapunta 'yon?

Sa bahay na hindi sa'yo?

O sa bahay na
magiging sa'yo? 🏡

Iba-iba ang sagot ng bawat tao.

Pero mas madali mong masasagot 'yan
kapag nakita mo na
ang actual numbers. 📊

Reply ka lang with the model
na gusto mong tingnan:

Veta,
Zila,
Raya,
o Yana.

I'll send you
ang sample computation. ⚡

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 4,
    subject: `Ano pa ang kasama sa presyo? 🧾`,
    body: `# 🧾 BUKOD SA PRESYO NG BAHAY, ANO PA ANG BABAYARAN MO?

Hi {{first}},

Isa sa mga tanong
na madalas hindi naitatanong:

"Bukod sa presyo ng bahay,
ano pa ang babayaran ko?"

Magandang tanong 'yan.

Mas mabuting itanong mo ngayon
kaysa malaman mo sa dulo. 😅

Hindi lang presyo ng bahay
ang binibilang.

Kasama ang reservation.

Kasama ang mga fees.

Kasama ang buwanang hulog.

Ipapaliwanag namin
ang bawat isa
sa simpleng salita.

Para walang sorpresa.

Para wala kang kailangang hulaan.

Reply ka lang ng
"buong computation",

at ihahanda ko 'yan
para sa'yo. 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 5,
    subject: `Mga tanong ng first-time buyers 🙋`,
    body: `# 🙋 FIRST TIME MONG BIBILI NG BAHAY?

Hi {{first}},

Normal ang dami ng tanong.

Ito yung madalas naming marinig:

Magkano ang kailangan kong simulan? 💰

Kaya ba ng sweldo ko ang hulog? 🤔

Ano ang mga requirements? 📄

Paano ang proseso,
step by step? 🗺️

Lahat ng 'yan,
may diretsong sagot.

Hindi mo kailangang
hulaan mag-isa.

Pumili ka ng isang tanong,
i-reply mo,

at sasagutin ko agad. ⚡

Isang linya lang,
sapat na.

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 6,
    subject: `Paano kung hindi ako ma-approve? 😟`,
    body: `# 😟 PAANO KUNG MA-REJECT AKO SA LOAN?

Hi {{first}},

Eto ang takot
na madalas kong marinig:

"Paano kung ma-reject ako sa loan?"

Totoo 'yan.

At hindi ko sasabihing
automatic na ma-approve ang lahat.

Depende sa income mo,
sa requirements,
at sa nagpapautang.

Pero eto ang maganda:

Hindi mo kailangang manghula.

Titingnan namin muna
ang sitwasyon mo,

bago ka magbayad
ng kahit ano. 🙌

Employed ka man,
OFW,
o may sariling business,

may paraan para makita
kung nasaan ka na.

At kung may kulang pa,
sasabihin namin
kung ano 'yon.

Kasi hindi lahat ng "hindi pa"
ay "hindi na."

Minsan,
kulang lang ng isang document.

O ilang buwan na paghahanda. 📅

Reply ka lang ng dalawang bagay:

Employed, OFW, o self-employed ka ba?

At roughly magkano
ang monthly income range mo? 💰

Estimate lang, okay na.

Private lang 'to. 🔒

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 7,
    subject: `Anong documents ang kakailanganin? 📄`,
    body: `# 📄 ANONG DOCUMENTS ANG KAKAILANGANIN MO?

Hi {{first}},

Hindi pare-pareho
ang requirements ng lahat.

Depende kung
employed ka,
OFW,
o may sariling business.

Karaniwan,
hinihingi ang valid ID
at patunay ng kita. 🪪

Pero ang eksaktong listahan,
depende sa sitwasyon mo.

Kaya hindi mo kailangang
mag-ipon agad ng mga papeles
na baka hindi naman kailangan.

Sabihin mo lang
kung alin sa tatlo ka.

Ipapadala ko
ang listahan
na para sa'yo lang. ✅

Isa-isa nating aayusin.

Walang nagmamadali.

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 8,
    subject: `Gaano kalaki ang bahay na kailangan mo? 📐`,
    body: `# 📐 GAANO KALAKI ANG BAHAY NA KAILANGAN MO?

Hi {{first}},

Hindi laging mas mabuti
ang mas malaki.

Ang tanong ay,

sino ang titira?

At sino ang madalas bumisita? 👨‍👩‍👧

Kung dalawa lang kayo,
baka sapat na ang Veta.

85 sqm. 🏡

Kung may mga anak,
tingnan mo ang Zila (96 sqm)
o ang Raya (110 sqm).

Kung kasama ninyo
ang mga magulang
o lolo't lola,

ang Yana ang bagay.

130 sqm. 🏠

Isipin mo rin
ang susunod na limang taon,

hindi lang ang ngayon.

Sabihin mo kung ilan kayo,

at tutulungan kitang pumili. 🙌

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 9,
    subject: `Alin ba sa apat ang bagay sa'yo? 🏘️`,
    body: `# 🏘️ APAT ANG MODEL. ALIN ANG BAGAY SA'YO?

Hi {{first}},

Hindi pare-pareho
ang kailangan ng bawat pamilya.

Kaya apat ang model
sa Alara Village.

## Veta 85
2-storey single detached,
1 bedroom, lanai, 2-car park.
A warm sanctuary
kung kayo ng partner mo,
or maliit pa ang pamilya. 💑

## Zila 96
2-storey partially attached,
1 guest room at 2 bedrooms.
Kung may kids ka na,
or lumalaki pa ang pamilya. 👨‍👩‍👧

## Raya 110
2-storey single attached,
2 bedrooms plus guest room
na may sariling T&B.
Para sa mga mahilig mag-host. 🎉

## Yana 130
2-storey single detached,
1 guest room, 2 bedrooms,
service room, at 3 toilet & bath.
Para sa multi-generational na pamilya. 👵👴

Hindi mo kailangang pumili ngayon.

Pero kung may bumubulong na sa'yo
kung alin,

sabihin mo lang.

I'll send you
yung floor plan
at sample computation niya. 📋

Pwede mo ring bisitahin
ang Facebook page namin:

{{site}}

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 10,
    subject: `Kilalanin natin si Veta 🏡`,
    body: `# 🏡 KILALANIN NATIN SI VETA

Hi {{first}},

Isa-isahin natin
ang mga bahay.

Una,
si Veta.

## Veta 85
Where bonds blossom.
85 sqm na 2-storey single detached home
na may living area, dining area,
kitchen, lanai, at 2-car park.

Isang warm sanctuary
kung saan mas lumalakas
ang samahan ng pamilya. 💞

Bagay ito sa mag-partner.

Sa maliit na pamilya.

O sa unang bahay
na gusto mong maramdamang
sa'yo talaga. 🔑

Gusto mong makita
ang floor plan?

Reply ka lang ng
"Veta". 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 11,
    subject: `Kilalanin natin si Zila 🌿`,
    body: `# 🌿 KILALANIN NATIN SI ZILA

Hi {{first}},

Ngayon,
si Zila naman.

## Zila 96
Where families flourish.
96 sqm na 2-storey partially attached home
na may guest room, 2 bedrooms,
main bedroom na may sariling toilet & bath,
lanai, at 2-car park.

Balanseng bahay
na dinisenyo para sa
bawat milestone ng pamilya. 👨‍👩‍👧

Mula sa unang anak.

Hanggang sa pagdating
ng mga bisita. 🎉

Bagay kung may mga anak ka na,
o kung lumalaki pa lang
ang pamilya.

Gusto mong makita
ang floor plan?

Reply ka lang ng
"Zila". 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 12,
    subject: `Kilalanin natin si Raya 🎉`,
    body: `# 🎉 KILALANIN NATIN SI RAYA

Hi {{first}},

Si Raya naman ngayon.

Para sa mga taong
mahilig magtipon.

## Raya 110
Where memories bloom.
110 sqm na 2-storey single attached home
na may 2 bedrooms,
main bedroom na may sariling toilet & bath,
guest room na may toilet & bath,
lanai, at 2-car park.

Maluwag na tahanan
para sa mga salu-salo.

Para sa mga selebrasyon.

Para sa ordinaryong araw
na gusto mong maging espesyal. ✨

Bagay kung madalas kayong
tumanggap ng bisita.

Gusto mong makita
ang floor plan?

Reply ka lang ng
"Raya". 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 13,
    subject: `Iba pag nakita mo na mismo 👣`,
    body: `# 👣 IBA PAG NAKITA MO NA MISMO

Hi {{first}},

May bagay na
hindi kayang ipakita
ng picture.

Kung gaano kalapad
ang kalsada.

Kung gaano kalamig
ang hangin
pag naglalakad ka sa park. 🌳

Kung kasya ba talaga
ang sasakyan,
ang pamilya,
at ang mga plano mo.

Kaya kung seryoso kang tumitingin,

come and see it
for yourself.

Hindi 'yan commitment.

Maglakad ka lang.

Tumayo ka sa loob ng bahay.

At tingnan mo
kung parang bahay mo na. 🏡

Minsan,
doon mo malalaman agad.

Minsan naman,
doon mo malalaman
na hindi pala ito
'yung hinahanap mo.

Both are good answers.

Reply ka lang with
2 or 3 days na free ka,

and I'll set it up. 📆

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 14,
    subject: `Kilalanin natin si Yana 👑`,
    body: `# 👑 KILALANIN NATIN SI YANA

Hi {{first}},

Ito na ang pinakamalaki.

Ang signature residence
ng Alara Village.

## Yana 130
Where legacies grow.
130 sqm na 2-storey single detached home.

Sa ibaba:
porch, lanai, living, dining,
L-shaped kitchen na may 3-seater bar counter,
guest room,
at maid's quarter na may toilet & bath.

Sa itaas:
family area,
master's bedroom na may balcony,
at 2 bedrooms.

May 2-car perpendicular parking.

Minimum lot cut:
171 sqm. 📐

Dinisenyo para sa
mas malaking pamilya,

at sa multi-generational
na tahanan. 👵👴

Limitado ang Yana.

12 lang sa 293 lots
ang para dito. 🔑

Gusto mong makita
ang floor plan?

Reply ka lang ng
"Yana". 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 15,
    subject: `Ano ang nasa loob ng village? 🏊`,
    body: `# 🏊 ANO ANG NASA LABAS NG PINTUAN MO?

Hi {{first}},

Hindi lang bahay
ang tinitingnan mo.

Tinitingnan mo rin
kung ano ang nasa labas
ng pintuan mo.

Kasi doon mo gugugulin
ang malaking bahagi
ng araw-araw mong buhay.

Sa Alara Village,

may pool para sa mga bata. 🏊

May gym para sa'yo. 💪

May mga park,
malalapad na kalsada,
clubhouse,
at river edge. 🌳

Ibig sabihin,
may mapupuntahan ka
kahit hindi lumalabas
ng village.

Bisitahin mo ang Facebook page namin
para sa mga update tungkol sa village:

{{site}}

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 16,
    subject: `Gaano katagal ang biyahe mo? 🚗`,
    body: `# 🚗 GAANO KATAGAL ANG BIYAHE MO?

Hi {{first}},

Bago ka pumili ng bahay,

tanungin mo muna
ang sarili mo.

Gaano katagal
ang biyahe papunta
sa trabaho?

Gaano kalayo
ang paaralan
ng mga anak mo? 🎒

Gaano kalapit
ang mga magulang
at kapamilya mo?

Mas mahalaga ang mga sagot na 'yan
kaysa sa kung gaano kaganda
ang bahay.

Kasi ang pinakamagandang bahay
ay yung hindi mo pagsisisihan
ang biyahe pauwi. 🏡

Kaya kung bibisita ka,

subukan mong daanan
ang ruta mula Alara
papunta sa pinupuntahan mo
araw-araw.

Doon mo malalaman
kung bagay ba talaga
sa buhay mo
ang Imus, Cavite. ✅

Reply ka lang ng petsa
na free ka,

at mag-set tayo ng visit. 📆

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 17,
    subject: `Isang ordinaryong araw sa Alara ☀️`,
    body: `# ☀️ ISANG ORDINARYONG ARAW SA ALARA

Hi {{first}},

Hindi lang bahay
ang binibili mo.

Binibili mo rin
yung mga ordinaryong araw
na mangyayari doon.

Yung paggising mo
at paglakad sa tahimik na kalye. 🌅

Yung almusal
na sabay-sabay kayong kumakain. 🍳

Yung hapon sa pool,
o sa park,
kasama ang mga bata. 🏊

Yung gabi
na pag-uwi mo,
may gate,
may ilaw,
at may bahay
na naghihintay sa'yo. 💡

Yan ang dinisenyo namin
para sa Alara Village.

Hindi perfect na buhay.

Pero mas magaan.

Bisitahin mo ang Facebook page namin
para makita pa ang village:

{{site}}

Tapos sabihin mo sa akin,

ano ang pinakagusto mong
parte ng araw? 💭

Reply ka lang.

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 18,
    subject: `Nasa malayo ka ba? ✈️`,
    body: `# ✈️ NASA MALAYO KA BA?

Hi {{first}},

Baka nasa ibang bansa ka.

O nasa ibang lungsod.

At baka iniisip mong
hindi mo magagawa ito
mula doon.

Hindi mo kailangang
nasa Cavite
para magsimulang magtanong. 💬

Sabihin mo lang
kung nasaan ka,
at anong oras ka available.

Titingnan namin
kung paano ka matutulungan.

Pwede nating simulan sa:

sample computation, 📋

at floor plan
ng model na gusto mo. 🏠

Para may hawak ka na
habang nagpapasya.

Reply ka lang
kung nasaan ka ngayon. 🌏

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 19,
    subject: `Mabilis na sagot sa mga madalas na tanong ❓`,
    body: `# ❓ MABILIS NA SAGOT SA MGA MADALAS NA TANONG

Hi {{first}},

Libre ba ang sample computation?

Oo.

Libre at walang obligation. ✅

Magkano ang reservation?

₱40,000. 💰

Kailangan bang bumisita muna?

Hindi.

Pero malaking tulong ito
para makita mo mismo
ang bahay at ang village. 👣

Pwede bang magtanong lang muna?

Oo.

Kahit kailan.

Walang tanong
na masyadong maliit
o masyadong maaga. 🙌

May iba ka pa bang tanong?

Reply ka lang,

at sasagutin ko
nang diretso. 💬

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 20,
    subject: `Ano ang reservation? 🔑`,
    body: `# 🔑 ANO ANG RESERVATION?

Hi {{first}},

Ang unang hakbang
para makuha ang bahay
na gusto mo
ay ang reservation.

₱40,000
para sa kahit anong model. 🏡

Alam kong malaking halaga 'yan.

Kaya gusto kong maging malinaw
kung kailan ito papasok
sa proseso.

Hindi ko hihilingin 'yan
bago mo makita
ang numbers mo.

Una,
makikita mo ang sample computation. 📋

Pangalawa,
ipapaliwanag namin ang terms
sa simpleng salita. 🗣️

Pagkatapos lang noon
ka magdedesisyon.

Kung may tanong ka
tungkol sa reservation,

reply ka lang.

Sasagutin ko
bago ka magbayad
ng kahit ano. 🙌

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 21,
    subject: `Para kanino mo ba talaga ginagawa 'to? 👨‍👩‍👧`,
    body: `# 👨‍👩‍👧 PARA KANINO MO BA TALAGA GINAGAWA 'TO?

Hi {{first}},

Minsan,
mas madaling magdesisyon
kapag iba ang tanong.

Hindi
"Kaya ko ba?"

Kundi
"Para kanino ko ito ginagawa?"

Para ba sa mga anak mo
na gustong may bakuran? 🌳

Para sa magulang mo
na gusto mong maiuwi
sa mas komportableng bahay? 💞

O para sa sarili mo,
na pagod nang lumipat-lipat? 📦

Kapag malinaw ang
"para kanino,"

mas malinaw din
kung ano ang kailangan
mong gawin.

At kapag alam mo na
kung ano ang kailangan,

hindi na siya
mukhang imposible.

Parang isang hakbang lang pala.

Ang hakbang na 'yon
ay makita ang numbers mo. 📊

Ready ka na ba?

Reply lang ng
"send the numbers",

and I'll take it
from there. ⚡

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 22,
    subject: `Checklist bago ka bumili ✅`,
    body: `# ✅ CHECKLIST BAGO KA BUMILI

Hi {{first}},

Eto ang checklist
na ginagamit namin
kapag may tinutulungan kaming pamilya:

Una,
ang pangangailangan ng pamilya. 👨‍👩‍👧

Pangalawa,
ang lokasyon. 📍

Pangatlo,
ang espasyo at layout. 📐

Pang-apat,
ang lifestyle. ☀️

Panglima,
ang mga plano
sa hinaharap. 🔭

Limang bagay lang.

Pero kapag malinaw ang lima,

mas madali nang pumili
ng model.

Pwede nating daanan 'yan
nang magkasama,

sa simpleng salita,

at walang pagmamadali.

Hindi ito exam.

Paraan lang ito
para masigurong
ang bahay na pipiliin mo
ay bagay sa buhay mo
ngayon,

at sa darating pa. 🙌

Reply ka lang ng
"checklist",

at sisimulan natin. ✅

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 23,
    subject: `Kasama mo ba ang partner mo sa desisyon? 💑`,
    body: `# 💑 KASAMA MO BA SILA SA DESISYON?

Hi {{first}},

Malaking desisyon ito.

At mas magaan
kapag hindi ka nag-iisa.

Baka may partner,
magulang,
o kapatid
na gusto mong makasama
sa pag-iisip. 💞

Isama mo sila sa pagtingin.

Hindi lang sa pagkakaalam
ng resulta.

Pwede mong ipasa sa kanila
ang Facebook page namin:

{{site}}

At kung gusto ninyong
bumisita nang sabay,

sabihin mo lang
kung anong araw. 📆

Mas malinaw ang desisyon
kapag pareho ninyong nakita.

At mas masaya
kapag pareho kayong sigurado. 🏡

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 24,
    subject: `Normal ang kabahan 💓`,
    body: `# 💓 NORMAL ANG KABAHAN

Hi {{first}},

Kung kinakabahan ka,

normal 'yan.

Hindi ito maliit
na desisyon.

Pero ang kaba
ay madalas senyales lang
na pinag-iisipan mo
nang mabuti.

Hindi ibig sabihin
na hindi mo kaya.

Ang kailangan mo lang
ay isang hakbang.

Ang hakbang na 'yon
ay makita ang numbers mo. 📊

Walang bayad.

Walang obligation.

At pwede mong ihinto
kahit kailan mo gusto.

Kasi kapag nakita mo na
ang buong larawan,

mas lumiliit ang takot.

Nawawala ang hulaan. ✨

Sabihin mo lang,

at ihahanda ko na
ang sample computation
para sa'yo. 📋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 25,
    subject: `Ano ang mangyayari pagkatapos mong mag-reserve? 🗺️`,
    body: `# 🗺️ ETO ANG BUONG PROSESO

Hi {{first}},

Para hindi ka mabigla,

eto ang buong proseso.

Una,
sasabihin mo ang budget
at timeline mo. 💰

Babalikan ka namin
ng malinaw na larawan
ng kung ano ang posible.

Pangalawa,
bibisita ka
at titingnan mo ang village. 👣

Para maramdaman mo
kung bagay ba ito
sa pamilya mo.

Pangatlo,
magre-reserve ka
at sisimulan natin ang paperwork. 📄

Gagabayan ka namin
sa bawat requirement
at dokumento.

Pang-apat,
mapapasa'yo na ang susi. 🔑

Ang bahay mo.

Ang pangalan mo sa title.

At isang mas maliwanag na bukas
na doon na nakatira. 🌅

May kasama ka
sa bawat hakbang.

Hindi ka maiiwang
nag-iisa.

Kung gusto mong magsimula
sa unang hakbang,

reply ka lang
ng budget mo. 💬

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 26,
    subject: `Walang pressure, pero... ⏳`,
    body: `# ⏳ WALANG PRESSURE, PERO…

Hi {{first}},

Hindi kita pipilitin.

At hindi ko sasabihing
mauubusan ka.

Pero may isang totoo:

Ang presyo,
promos,
at available na units
can change. 📆

Kung seryoso kang
kumuha ng bahay this year,

mas okay na alam mo
ang current numbers
habang pinag-iisipan mo pa.

Para pag dumating
ang tamang oras,

hindi ka na
nagsisimula sa zero. 🙌

Kung gusto mo,
I can send you:

yung current sample computation
ng model na gusto mo, 📋

yung floor plan, 🏠

at yung step-by-step na proseso,
from reservation
hanggang turnover. 🔑

Lahat 'yan,
sa iisang message.

Reply ka lang
with the model. 💬

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 27,
    subject: `Isang taon mula ngayon 📆`,
    body: `# 📆 ISANG TAON MULA NGAYON

Hi {{first}},

Isipin mo muna ito.

Isang taon mula ngayon,

saan mo gustong
nakatira? 🏡

Kung wala kang gagawin
ngayon,

baka ganoon pa rin
ang sagot mo.

Hindi ko sinasabing masama 'yon.

Pero baka may bahagi mo
na gustong iba. 💭

Hindi ko sinasabing magmadali ka.

Pero ang pagtingin sa numbers
ay hindi nangangailangan
ng desisyon.

Kaya walang mawawala sa'yo.

Isang reply lang,

at makikita mo
kung gaano ka kalapit
sa bahay na gusto mo. 🎯

Handa akong tumulong
kahit kailan mo gusto.

At sasabayan kita
sa bilis na
komportable sa'yo. 🙌

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 28,
    subject: `Isang salita lang 💬`,
    body: `# 💬 ISANG SALITA LANG

Hi {{first}},

Isang salita lang
ang kailangan ko
mula sa'yo.

"numbers"
kung gusto mo
ng sample computation. 📋

"visit"
kung gusto mong
bumisita sa village. 👣

"later"
kung gusto mong
balikan kita
sa susunod na buwan. 📆

Kahit alin diyan,
okay.

Hindi mo kailangang
magpaliwanag pa.

Ako na ang bahala
sa susunod na hakbang. 🙌

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  },
  {
    day: 29,
    subject: `{{first}}, last note ko na muna 🤝`,
    body: `# 🤝 ITO NA ANG HULI SA SERIES NG EMAILS KO

Hi {{first}},

Ito na ang huli
sa regular series
ng emails ko.

Kaya hihinto na muna ako rito.

Salamat sa pagbabasa. 🙏

Alam kong hindi madali
ang desisyong hinaharap mo.

Kaya salamat sa tiwala,

kahit sa pagbabasa lang.

Kung hindi pa ito
ang tamang panahon,

okay lang.

Hindi mo kailangang magmadali.

Para sa taong handa
ang magandang property decision.

Kapag handa ka na,

nandito lang ako.

Pero gusto kong ulitin
ang ilang bagay
na napag-usapan natin.

Alamin muna ang purpose mo. 🎯

Kilalanin ang totoong budget mo. 💰

Isama ang hidden costs. 🧾

Huwag magdesisyon
dahil sa pressure.

Tingnan ang whole picture
bago pumili. 🔍

Kung masusunod mo 'yan,

malaki na
ang advantage mo.

At kung kailangan mo ng tulong,

hindi ka nag-iisa.

Bukas ang pinto ko.

Kahit next week,
next month,
o next year. 🚪

Pwede kang mag-reply,
tumawag,
o mag-book ng consultation.

Sasagutin kita
nang walang pressure.

Ang goal natin
hindi lang magkaroon ng bahay.

Ang goal natin
ay bumuo ng yaman
at secure na kinabukasan.

Para sa'yo
at sa pamilya mo. 🏡

>>> I'M HERE WHENEVER YOU'RE READY <<<

Salamat ulit, {{first}}.

Hanggang sa muli? 👋

{{agent}}{{contact}}
Alara Village · Imus, Cavite`
  }
];

// ===================== OWNER EMAILS (30 days) =====================
// These go to NOTIFY_EMAIL. They stop when you set the lead's Status to Booked, Closed, Lost, or STOP.

const OWNER_EMAILS = [
  {
    day: 0,
    subject: `New inquiry: {{name}}`,
    body: `May bagong inquiry sa Alara Village.

Name: {{name}}
Mobile: {{phone}}
Email: {{email}}

Sabi ng page natin, may reply within 24 hours. Subukan mo siyang kontakin today.

Pwede mong i-text o i-message ito:

"Hi {{name}}, si {{agent}} ito from Alara Village. Natanggap ko yung inquiry mo. Magkano po ang monthly budget na komportable sa inyo? Para maipadala ko yung sample computation."

Pagkatapos, i-update mo ang Status sa sheet (Contacted, Visit set, Booked, Closed, Lost, o STOP):
{{sheet}}

Pag nilagay mo ang Booked, Closed, Lost, o STOP, titigil ang mga reminder at emails para sa kanya.`
  },
  {
    day: 1,
    subject: `Day 1: nakausap mo na ba si {{name}}?`,
    body: `Day 1 check.

{{name}}
{{phone}} · {{email}}

Kung hindi mo pa siya nakokontak, ngayon na ang tamang oras. Mas mainit pa ang interes niya.

Tip: isang tanong lang ang itanong mo. Yung budget range niya. Mas madaling sagutin kaysa sa mahabang form.

Update Status pagkatapos:
{{sheet}}`
  },
  {
    day: 3,
    subject: `Day 3: follow-up kay {{name}}`,
    body: `Day 3 follow-up.

{{name}} · {{phone}}

Kung hindi pa siya sumasagot, try ibang channel. Kung nag-text ka, tawagan mo. Kung tinawagan mo, mag-message ka.

Sample:

"Hi {{name}}, si {{agent}} ulit from Alara Village. Gusto ko lang i-share yung sample computation para sa model na bagay sa inyo. Okay lang ba na ipadala ko dito?"

Nagpadala na rin ng email ang system sa kanya today, kaya hindi ka magsisimula sa zero.

{{sheet}}`
  },
  {
    day: 7,
    subject: `Day 7: yayain mo na si {{name}} mag-visit`,
    body: `Day 7.

{{name}} · {{phone}}

Isang linggo na. Kung nakausap mo na siya pero wala pang visit, ito na ang time para yayain.

Sample:

"Hi {{name}}, gusto mo bang makita ang village nang personal? Walang obligation. May free ka ba this weekend or next?"

Kung nag-reply na siya, i-update ang Status sa Visit set.

{{sheet}}`
  },
  {
    day: 14,
    subject: `Day 14: si {{name}} pa rin ba ay open?`,
    body: `Day 14.

{{name}} · {{phone}}

Dalawang linggo na. Kung hindi pa siya nakakapag-decide, baka may kulang na tanong. Karaniwan, isa sa tatlo: presyo, loan, o location.

Sample:

"Hi {{name}}, may natira ka pa bang tanong tungkol sa presyo, loan, o sa bahay? Sasagutin ko nang diretso."

I-send mo rin ang floor plan ng model na tinitingnan niya.

{{sheet}}`
  },
  {
    day: 21,
    subject: `Day 21: huling malaking push kay {{name}}`,
    body: `Day 21.

{{name}} · {{phone}}

Tatlong linggo na. Ito na ang magandang pagkakataon para magbigay ng malinaw na next step.

Sample:

"Hi {{name}}, kung gusto mo, pwede nating i-lock in ang unit na gusto mo habang pinag-iisipan mo pa. Gusto mo bang ipaliwanag ko kung paano?"

Kung hindi pa siya ready, okay lang. Sabihin mong babalikan mo siya.

{{sheet}}`
  },
  {
    day: 30,
    subject: `Day 30: isara na ang loop kay {{name}}`,
    body: `Day 30.

{{name}} · {{phone}}

Katatapos lang ng 30 days. Natapos na rin ang email series niya.

Ngayon, i-update mo ang Status niya:

- Booked kung nag-reserve na
- Visit set kung may visit
- Lost kung hindi na
- STOP kung ayaw na niyang makontak

Kung may sagot siyang "later", i-set mo sa kalendaryo na balikan mo siya after a month.

{{sheet}}`
  }
];

// ===================== AGENT PHOTO FROM GOOGLE DRIVE =====================
// Upload this exact file name to the same Drive folder used by FOLDER_ID.
const AGENT_PHOTO_NAME = 'agent.jpg';

/**
 * Loads the agent photo from Google Drive for inline email display.
 * The email templates use cid:agent, so the image does not need to be public.
 */
function agentPhoto_(bg) {
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var files = folder.getFilesByName(AGENT_PHOTO_NAME);

  if (!files.hasNext()) {
    throw new Error(
      'Agent photo not found in the Drive folder. ' +
      'Upload a file named "' + AGENT_PHOTO_NAME + '".'
    );
  }

  return files.next().getBlob().setName(AGENT_PHOTO_NAME);
}
