/**
 * Popis žarnic — skupna zaloga.
 * PIN: Script Properties → SYNC_PIN
 * List: vezan na to tabelo ali Script Properties → SPREADSHEET_ID
 */
var HEADER = ['id', 'group', 'šifra', 'ime', 'ean', 'količina', 'opomba', 'updatedAt', 'updatedBy', 'deleted'];

function doGet(e) {
  try {
    return respond_(handle_(paramsFromGet_(e)), e);
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message ? err.message : err) }, e);
  }
}

function doPost(e) {
  try {
    return respond_(handle_(paramsFromPost_(e)), e);
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message ? err.message : err) }, e);
  }
}

function paramsFromGet_(e) {
  var p = (e && e.parameter) || {};
  var ops = [];
  if (p.ops) {
    try {
      ops = JSON.parse(p.ops);
    } catch (err) {
      throw new Error('bad_ops');
    }
  }
  return {
    pin: p.pin || '',
    action: p.action || 'pull',
    device: p.device || '',
    ops: ops,
    callback: p.callback || '',
  };
}

function paramsFromPost_(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('bad_ops');
    }
  }
  var p = (e && e.parameter) || {};
  return {
    pin: body.pin || p.pin || '',
    action: body.action || p.action || 'push',
    device: body.device || p.device || '',
    ops: body.ops || [],
    callback: p.callback || '',
  };
}

function handle_(req) {
  checkPin_(req.pin);
  if (req.action === 'ping') return { ok: true, pong: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (req.action === 'pull') return { ok: true, articles: readArticles_() };
    if (req.action === 'push') {
      applyOps_(req.ops || [], req.device || '');
      return { ok: true, articles: readArticles_() };
    }
    return { ok: false, error: 'unknown_action' };
  } finally {
    lock.releaseLock();
  }
}

function respond_(out, e) {
  var callback = e && e.parameter && e.parameter.callback;
  var body = JSON.stringify(out);
  if (callback && /^[A-Za-z_][A-Za-z0-9_]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + body + ')').setMimeType(
      ContentService.MimeType.JAVASCRIPT,
    );
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function checkPin_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty('SYNC_PIN');
  if (!expected || String(pin) !== String(expected)) {
    throw new Error('bad_pin');
  }
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    ss = null;
  }
  if (!ss && id) ss = SpreadsheetApp.openById(id);
  if (!ss) throw new Error('no_sheet');
  return ss.getSheets()[0];
}

function headerMap_(sheet) {
  var row = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADER.length)).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i] || '')
      .trim()
      .toLowerCase();
    if (key) map[key] = i;
  }
  HEADER.forEach(function (name, i) {
    if (map[name] === undefined) map[name] = i;
  });
  // aliases
  if (map['skupina'] === undefined) map['skupina'] = map['group'];
  if (map['sifra'] === undefined) map['sifra'] = map['šifra'];
  if (map['kolicina'] === undefined) map['kolicina'] = map['količina'];
  return map;
}

function cell_(row, map, name) {
  var idx = map[name];
  return idx === undefined ? '' : row[idx];
}

function asBool_(v) {
  if (v === true || v === 1) return true;
  var s = String(v || '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'da';
}

function asNumber_(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  var n = Number(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function rowToArticle_(row, map) {
  var id = String(cell_(row, map, 'id') || '').trim();
  if (!id) return null;
  return {
    id: id,
    skupina: String(cell_(row, map, 'group') || cell_(row, map, 'skupina') || ''),
    sifra: String(cell_(row, map, 'šifra') || cell_(row, map, 'sifra') || ''),
    ime: String(cell_(row, map, 'ime') || ''),
    ean: String(cell_(row, map, 'ean') || ''),
    kolicina: asNumber_(cell_(row, map, 'količina') || cell_(row, map, 'kolicina')),
    opomba: String(cell_(row, map, 'opomba') || ''),
    updatedAt: String(cell_(row, map, 'updatedAt') || ''),
    updatedBy: String(cell_(row, map, 'updatedBy') || ''),
    deleted: asBool_(cell_(row, map, 'deleted')),
  };
}

function articleToRow_(a, width, map) {
  var row = [];
  for (var i = 0; i < width; i++) row[i] = '';
  function set(name, value) {
    if (map[name] !== undefined) row[map[name]] = value;
  }
  set('id', a.id);
  set('group', a.skupina || '');
  set('šifra', a.sifra || '');
  set('sifra', a.sifra || '');
  set('ime', a.ime || '');
  set('ean', a.ean || '');
  set('količina', a.kolicina);
  set('kolicina', a.kolicina);
  set('opomba', a.opomba || '');
  set('updatedAt', a.updatedAt || '');
  set('updatedBy', a.updatedBy || '');
  set('deleted', a.deleted ? true : false);
  return row;
}

function newerOrEqual_(a, b) {
  if (!a) return false;
  if (!b) return true;
  return a >= b;
}

function readArticles_() {
  var sheet = getSheet_();
  var map = headerMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var width = Math.max(sheet.getLastColumn(), HEADER.length);
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var art = rowToArticle_(values[i], map);
    if (art) out.push(art);
  }
  return out;
}

function applyOps_(ops, device) {
  var sheet = getSheet_();
  var map = headerMap_(sheet);
  var lastRow = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), HEADER.length);
  var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var indexById = {};
  for (var i = 0; i < values.length; i++) {
    var existing = rowToArticle_(values[i], map);
    if (existing) indexById[existing.id] = i;
  }

  for (var o = 0; o < ops.length; o++) {
    var op = ops[o] || {};
    var id = String(op.id || '').trim();
    if (!id) continue;
    var fields = op.fields || {};
    var qtyDelta = asNumber_(op.qtyDelta);
    var when = String(op.updatedAt || '');
    var who = String(op.updatedBy || device || '');
    var idx = indexById[id];
    var current =
      idx === undefined
        ? {
            id: id,
            skupina: '',
            sifra: '',
            ime: '',
            ean: '',
            kolicina: 0,
            opomba: '',
            updatedAt: '',
            updatedBy: '',
            deleted: false,
          }
        : rowToArticle_(values[idx], map);

    current.kolicina = Math.max(0, asNumber_(current.kolicina) + qtyDelta);

    var canWriteFields = newerOrEqual_(when, current.updatedAt);
    if (canWriteFields) {
      if (fields.skupina !== undefined) current.skupina = String(fields.skupina);
      if (fields.sifra !== undefined) current.sifra = String(fields.sifra);
      if (fields.ime !== undefined) current.ime = String(fields.ime);
      if (fields.ean !== undefined) current.ean = String(fields.ean);
      if (fields.opomba !== undefined) current.opomba = String(fields.opomba);
      if (fields.deleted !== undefined) current.deleted = asBool_(fields.deleted);
      current.updatedAt = when || current.updatedAt;
      current.updatedBy = who || current.updatedBy;
    } else if (qtyDelta !== 0) {
      // delta stands even if fields lose LWW; still note the device
      if (newerOrEqual_(when, current.updatedAt)) {
        current.updatedAt = when;
        current.updatedBy = who || current.updatedBy;
      }
    }

    var row = articleToRow_(current, width, map);
    if (idx === undefined) {
      values.push(row);
      indexById[id] = values.length - 1;
    } else {
      values[idx] = row;
    }
  }

  if (values.length) {
    sheet.getRange(2, 1, values.length, width).setValues(values);
  }
}
