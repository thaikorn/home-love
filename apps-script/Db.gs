/**
 * Db.gs — ชั้นเข้าถึงข้อมูล (Data Access Layer) บน Google Sheet
 * แปลงแต่ละแถวเป็น object ตาม SCHEMA และมี CRUD พื้นฐาน
 * ค่าที่เป็น array (teamMembers, timeWindowIds, days) เก็บใน cell เป็น comma-separated
 */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID ใน Script Properties');
  return SpreadsheetApp.openById(id);
}

function sheet_(tab) {
  const sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('ไม่พบ tab: ' + tab);
  return sh;
}

// อ่านทุกแถวของ tab เป็น array ของ object
function readAll_(tab) {
  const sh = sheet_(tab);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const cols = SCHEMA[tab];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    const obj = { _row: r + 1 };
    for (let c = 0; c < cols.length; c++) obj[cols[c]] = row[c];
    rows.push(obj);
  }
  return rows;
}

function findById_(tab, id) {
  const rows = readAll_(tab);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function where_(tab, predicate) {
  return readAll_(tab).filter(predicate);
}

/**
 * กันกรณีเพิ่มคอลัมน์ใหม่ใน SCHEMA แล้วชีตจริงยังไม่มี — ต่อคอลัมน์ให้พอและเขียนหัวตาราง
 * เช็คแค่ครั้งเดียวต่อ tab ต่อการรันหนึ่งครั้ง (ตัวแปรระดับสคริปต์รีเซ็ตทุกคำขอ)
 * จึงไม่ต้องไปรัน setup() ด้วยมือทุกครั้งที่ schema ขยับ
 */
const SCHEMA_CHECKED_ = {};
function ensureCols_(sh, tab) {
  if (SCHEMA_CHECKED_[tab]) return;
  SCHEMA_CHECKED_[tab] = true;
  const cols = SCHEMA[tab];
  const max = sh.getMaxColumns();
  if (max < cols.length) sh.insertColumnsAfter(max, cols.length - max);
  const header = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  for (let i = 0; i < cols.length; i++) {
    if (String(header[i] || '') !== cols[i]) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      return;
    }
  }
}

// ดัชนีคอลัมน์ (1-based) ที่ต้องบังคับเป็นข้อความล้วนของ tab นั้น
function textColIdx_(tab) {
  const cols = SCHEMA[tab];
  return (TEXT_COLS[tab] || [])
    .map(function (name) { return cols.indexOf(name) + 1; })
    .filter(function (i) { return i > 0; });
}

// ตั้ง number format เป็นข้อความล้วน "ก่อน" เขียนค่า ไม่งั้น Sheet แปลงค่าให้เอง
function forceTextFormat_(sh, tab, rowNum, onlyCols) {
  textColIdx_(tab).forEach(function (i) {
    if (onlyCols && onlyCols.indexOf(i) < 0) return;
    sh.getRange(rowNum, i).setNumberFormat('@');
  });
}

// เพิ่มแถวใหม่ (obj ต้องมี key ตาม SCHEMA; ที่ขาดจะเว้นว่าง)
function insert_(tab, obj) {
  const sh = sheet_(tab);
  ensureCols_(sh, tab);
  const cols = SCHEMA[tab];
  const row = cols.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  const rowNum = sh.getLastRow() + 1;
  if (rowNum > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1); // ชีตเต็ม — ต่อแถวเพิ่ม
  forceTextFormat_(sh, tab, rowNum);
  sh.getRange(rowNum, 1, 1, cols.length).setValues([row]);
  return obj;
}

// อัปเดตแถวตาม id (patch = object ของ field ที่จะเปลี่ยน)
function update_(tab, id, patch) {
  const sh = sheet_(tab);
  ensureCols_(sh, tab);
  const cols = SCHEMA[tab];
  const existing = findById_(tab, id);
  if (!existing) throw new Error('ไม่พบ id ' + id + ' ใน ' + tab);
  const rowNum = existing._row;
  Object.keys(patch).forEach(function (key) {
    const idx = cols.indexOf(key);
    if (idx < 0) return;
    forceTextFormat_(sh, tab, rowNum, [idx + 1]);
    sh.getRange(rowNum, idx + 1).setValue(patch[key]);
  });
  return Object.assign({}, existing, patch);
}

// ลบแถวตาม id (hard delete)
function remove_(tab, id) {
  const sh = sheet_(tab);
  const existing = findById_(tab, id);
  if (!existing) return false;
  sh.deleteRow(existing._row);
  return true;
}

// ---- helpers แปลงค่า ----
function toArr_(cell) {
  if (cell === '' || cell === null || cell === undefined) return [];
  return String(cell).split(',').map(function (s) { return s.trim(); }).filter(String);
}

function fromArr_(arr) {
  return (arr || []).join(',');
}

function toBool_(cell) {
  return cell === true || cell === 'TRUE' || cell === 'true' || cell === 1 || cell === '1';
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function pad2_(n) {
  return ('0' + n).slice(-2);
}

// เขตเวลาของ spreadsheet (cache ไว้ในรอบการรัน)
const SS_TZ_ = {};
function ssTz_() {
  if (!SS_TZ_.tz) SS_TZ_.tz = ss_().getSpreadsheetTimeZone();
  return SS_TZ_.tz;
}

/**
 * อ่านค่าเวลาจาก cell ให้เป็น 'HH:mm' เสมอ
 * รองรับทั้งข้อความ '08:00' (แบบใหม่), Date (ข้อมูลเก่าที่ Sheet แปลงไปแล้ว)
 * และตัวเลขเศษของวัน (0.5 = 12:00)
 */
function toHm_(cell) {
  if (cell === '' || cell === null || cell === undefined) return '';
  if (isDate_(cell)) return Utilities.formatDate(cell, ssTz_(), 'HH:mm');
  if (typeof cell === 'number' && cell >= 0 && cell < 1) {
    const mins = Math.round(cell * 1440);
    return pad2_(Math.floor(mins / 60)) + ':' + pad2_(mins % 60);
  }
  const m = String(cell).match(/(\d{1,2}):(\d{2})/);
  return m ? pad2_(m[1]) + ':' + m[2] : String(cell).trim();
}

// อ่านค่าวันที่จาก cell ให้เป็น 'yyyy-MM-dd' เสมอ
function toDateStr_(cell) {
  if (cell === '' || cell === null || cell === undefined) return '';
  if (isDate_(cell)) return Utilities.formatDate(cell, ssTz_(), 'yyyy-MM-dd');
  return String(cell).trim().slice(0, 10);
}

// อ่านค่า timestamp จาก cell ให้เป็น ISO string เสมอ
function toIso_(cell) {
  if (cell === '' || cell === null || cell === undefined) return '';
  if (isDate_(cell)) return cell.toISOString();
  return String(cell).trim();
}

function newId_(prefix) {
  return (prefix || 'id') + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

// ---- Config ----
function getConfig_() {
  const rows = readAll_(TAB.Config);
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  rows.forEach(function (r) { if (r.key) cfg[r.key] = String(r.value); });
  return cfg;
}

function configNum_(cfg, key) {
  return parseFloat(cfg[key]);
}

/**
 * เขียนค่า Config หลายคีย์รวดเดียว (อ่านชีตครั้งเดียว เขียนเฉพาะคีย์ที่ค่าเปลี่ยนจริง)
 * คีย์ที่ยังไม่มีในชีตจะถูกเพิ่มให้ — Config ไม่มีคอลัมน์ id จึงใช้ update_ ไม่ได้
 */
function setConfigMany_(map) {
  const sh = sheet_(TAB.Config);
  ensureCols_(sh, TAB.Config);
  const vIdx = SCHEMA[TAB.Config].indexOf('value') + 1;
  const byKey = {};
  readAll_(TAB.Config).forEach(function (r) { byKey[String(r.key)] = r; });
  Object.keys(map).forEach(function (k) {
    const v = String(map[k]);
    const row = byKey[k];
    if (!row) { insert_(TAB.Config, { key: k, value: v }); return; }
    if (String(row.value) === v) return;
    forceTextFormat_(sh, TAB.Config, row._row, [vIdx]);
    sh.getRange(row._row, vIdx).setValue(v);
  });
}
