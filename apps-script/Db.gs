/**
 * Db.gs — ชั้นเข้าถึงข้อมูล (Data Access Layer) บน Google Sheet
 * แปลงแต่ละแถวเป็น object ตาม SCHEMA และมี CRUD พื้นฐาน
 * ค่าที่เป็น array (teamMembers, timeWindowIds, days) เก็บใน cell เป็น comma-separated
 */

/**
 * แคชระดับ "การรันหนึ่งครั้ง" — ตัวแปรระดับสคริปต์รีเซ็ตทุกคำขออยู่แล้ว
 * จึงไม่มีทางค้างข้ามคำขอ และไม่ต้องกังวลว่าจะเห็นข้อมูลเก่าของคำขออื่น
 *
 * ทำไมต้องมี: การเรียก SpreadsheetApp แต่ละครั้งคือ round-trip ไปหา Google Sheets
 * (หลักสิบ–ร้อยมิลลิวินาที) เดิม readAll_() ยิงใหม่ทุกครั้งที่ถูกเรียก และ helper
 * อย่าง TZ_() → getConfig_() ถูกเรียก "ต่อแถว" ในลูปคิดแต้ม ทำให้หน้าเดียว
 * ยิงชีตเป็นพันครั้ง — นั่นคือสาเหตุที่แอปเปิดช้า
 */
const SS_CACHE_ = {};
const SHEET_CACHE_ = {};
const ROWS_CACHE_ = {};
const CFG_CACHE_ = {};
// รูปร่างของชีตที่รู้มาแล้วจากการอ่าน: { header: [...], lastRow: n, maxRows: n }
const SHEET_META_ = {};

// ล้างแคชของ tab เดียว — ต้องเรียกทุกครั้งที่เขียนชีต ไม่งั้นจะอ่านค่าเก่ากลับมา
// จำนวนแถวอาจขยับ (insert/remove) จึงต้องลืมไปด้วย — หัวตารางไม่เปลี่ยนจึงเก็บไว้ได้
function invalidate_(tab) {
  delete ROWS_CACHE_[tab];
  if (SHEET_META_[tab]) delete SHEET_META_[tab].lastRow;
  if (tab === TAB.Config) delete CFG_CACHE_.cfg;
}

// ล้างทั้งหมด — ใช้หลัง migration/ซ่อมชีตที่แตะหลาย tab รวดเดียว
function invalidateAll_() {
  Object.keys(ROWS_CACHE_).forEach(function (t) { delete ROWS_CACHE_[t]; });
  Object.keys(SHEET_META_).forEach(function (t) { delete SHEET_META_[t]; });
  delete CFG_CACHE_.cfg;
}

function ss_() {
  if (SS_CACHE_.ss) return SS_CACHE_.ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID ใน Script Properties');
  SS_CACHE_.ss = SpreadsheetApp.openById(id);
  return SS_CACHE_.ss;
}

function sheet_(tab) {
  if (SHEET_CACHE_[tab]) return SHEET_CACHE_[tab];
  const sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('ไม่พบ tab: ' + tab);
  SHEET_CACHE_[tab] = sh;
  return sh;
}

/**
 * อ่านทุกแถวของ tab เป็น array ของ object (แคชไว้ตลอดการรันหนึ่งครั้ง)
 * ⚠️ object ที่คืนมาใช้ร่วมกันทั้งรอบ — ห้ามแก้ค่าในนั้นตรงๆ
 *    ถ้าจะเปลี่ยนข้อมูลให้เรียก update_() หรือ Object.assign({}, row, patch)
 */
function readAll_(tab) {
  if (ROWS_CACHE_[tab]) return ROWS_CACHE_[tab];
  const sh = sheet_(tab);
  const values = sh.getDataRange().getValues();
  // getDataRange คลุมถึงแถว/คอลัมน์สุดท้ายที่มีข้อมูลพอดี — เก็บหัวตารางกับจำนวนแถวไว้ใช้ต่อ
  // จะได้ไม่ต้องยิง getRange(หัวตาราง)/getLastRow() ซ้ำตอนเขียน (ดู ensureCols_ / insert_)
  const meta = SHEET_META_[tab] || (SHEET_META_[tab] = {});
  meta.header = values[0] || [];
  meta.lastRow = values.length;
  const cols = SCHEMA[tab];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    const obj = { _row: r + 1 };
    for (let c = 0; c < cols.length; c++) obj[cols[c]] = row[c];
    rows.push(obj);
  }
  ROWS_CACHE_[tab] = rows;
  return rows;
}

// ดัชนี id -> แถว (สร้างจากแคชแถว จึงถูกทิ้งพร้อมกันเมื่อ invalidate_)
const BYID_CACHE_ = {};
function byId_(tab) {
  const rows = readAll_(tab);
  const hit = BYID_CACHE_[tab];
  if (hit && hit.rows === rows) return hit.map;
  const map = {};
  rows.forEach(function (r) { map[String(r.id)] = r; });
  BYID_CACHE_[tab] = { rows: rows, map: map };
  return map;
}

// findById_ ถูกเรียกในลูป (เช่น ต่อรายการงานหนึ่งชิ้น) จึงต้องเป็นการค้นแบบดัชนี
function findById_(tab, id) {
  return byId_(tab)[String(id)] || null;
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
function headerMatches_(header, cols) {
  if (!header || header.length < cols.length) return false;
  for (let i = 0; i < cols.length; i++) {
    if (String(header[i] || '') !== cols[i]) return false;
  }
  return true;
}
function ensureCols_(sh, tab) {
  if (SCHEMA_CHECKED_[tab]) return;
  const cols = SCHEMA[tab];
  // ถ้าเพิ่งอ่าน tab นี้ไป หัวตารางติดมากับข้อมูลอยู่แล้ว — ตรงกับ SCHEMA ก็จบ ไม่ต้องยิงชีตเลย
  // (ทางเขียนเกือบทุกเส้นอ่านข้อมูลก่อนอยู่แล้ว เช่น findById_ ก่อน update_)
  const known = SHEET_META_[tab];
  if (known && headerMatches_(known.header, cols)) { SCHEMA_CHECKED_[tab] = true; return; }
  SCHEMA_CHECKED_[tab] = true;
  const max = sh.getMaxColumns();
  if (max < cols.length) sh.insertColumnsAfter(max, cols.length - max);
  const header = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  if (!headerMatches_(header, cols)) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
}

// ดัชนีคอลัมน์ (1-based) ที่ต้องบังคับเป็นข้อความล้วนของ tab นั้น
function textColIdx_(tab) {
  const cols = SCHEMA[tab];
  return (TEXT_COLS[tab] || [])
    .map(function (name) { return cols.indexOf(name) + 1; })
    .filter(function (i) { return i > 0; });
}

/**
 * รวมเลขคอลัมน์ที่ติดกันเป็นช่วง [{from,to}] (0-based, ปลายทั้งสองรวมด้วย)
 * เขียนชีตทีละช่วงแทนทีละช่อง — การเขียนแต่ละครั้งคือ round-trip ไปหา Google Sheets
 * การอนุมัติงานหนึ่งชิ้นเดิมยิงเป็นสิบครั้งเพราะเขียนทีละฟิลด์
 */
function colRuns_(idx) {
  const runs = [];
  idx.slice().sort(function (a, b) { return a - b; }).forEach(function (i) {
    const last = runs[runs.length - 1];
    if (last && i === last.to + 1) last.to = i;
    else if (!last || i !== last.to) runs.push({ from: i, to: i });
  });
  return runs;
}

// เพิ่มแถวใหม่ (obj ต้องมี key ตาม SCHEMA; ที่ขาดจะเว้นว่าง)
function insert_(tab, obj) {
  const sh = sheet_(tab);
  ensureCols_(sh, tab);
  const cols = SCHEMA[tab];
  const row = cols.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  // จำนวนแถวเรารู้อยู่แล้วถ้าเพิ่งอ่าน tab นี้ไป และรู้แน่นอนหลังเพิ่มแถวเอง
  // — ไม่งั้นการเพิ่มหลายแถวติดกัน (เช่นแจกรางวัลบอสให้ลูกทุกคน) จะยิงถาม getLastRow ซ้ำทุกรอบ
  const meta = SHEET_META_[tab] || (SHEET_META_[tab] = {});
  if (meta.lastRow === undefined) meta.lastRow = sh.getLastRow();
  if (meta.maxRows === undefined) meta.maxRows = sh.getMaxRows();
  const rowNum = meta.lastRow + 1;
  if (rowNum > meta.maxRows) { sh.insertRowsAfter(meta.maxRows, 1); meta.maxRows += 1; } // ชีตเต็ม — ต่อแถวเพิ่ม
  // ตั้ง number format เป็นข้อความล้วน "ก่อน" เขียนค่า ไม่งั้น Sheet แปลงค่าให้เอง
  colRuns_(textColIdx_(tab).map(function (i) { return i - 1; })).forEach(function (r) {
    sh.getRange(rowNum, r.from + 1, 1, r.to - r.from + 1).setNumberFormat('@');
  });
  sh.getRange(rowNum, 1, 1, cols.length).setValues([row]);
  meta.lastRow = rowNum; // เพิ่งเขียนเอง จึงรู้แน่ว่าแถวสุดท้ายอยู่ตรงไหน

  // ต่อแถวใหม่เข้าแคชแทนการทิ้งแคชทั้ง tab — ไม่งั้นการอ่านครั้งถัดไปต้องดึงชีตใหม่ทั้งใบ
  // (เช่นแจกรางวัลบอสให้ลูกทีละคน: เพิ่ม 1 แถว แล้วอ่าน Quests ใหม่ทั้งตาราง สลับกันไปเรื่อยๆ)
  const cached = ROWS_CACHE_[tab];
  if (cached) {
    const fresh = { _row: rowNum };
    cols.forEach(function (c, i) { fresh[c] = row[i]; });
    cached.push(fresh);
    const byId = BYID_CACHE_[tab];
    if (byId && byId.rows === cached) byId.map[String(fresh.id)] = fresh;
  }
  if (tab === TAB.Config) delete CFG_CACHE_.cfg;
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
  const idx = [];
  Object.keys(patch).forEach(function (key) {
    const i = cols.indexOf(key);
    if (i >= 0) idx.push(i);
  });
  if (!idx.length) return Object.assign({}, existing, patch);

  const isText = {};
  textColIdx_(tab).forEach(function (i) { isText[i - 1] = true; });
  colRuns_(idx.filter(function (i) { return isText[i]; })).forEach(function (r) {
    sh.getRange(rowNum, r.from + 1, 1, r.to - r.from + 1).setNumberFormat('@');
  });
  colRuns_(idx).forEach(function (r) {
    const vals = [];
    for (let c = r.from; c <= r.to; c++) {
      const v = patch[cols[c]];
      vals.push(v === undefined ? '' : v);
    }
    sh.getRange(rowNum, r.from + 1, 1, vals.length).setValues([vals]);
  });

  /**
   * ปรับค่าในแคชให้ตรงกับที่เพิ่งเขียนลงชีต แทนการทิ้งแคชทั้ง tab
   *
   * ทางเขียนของเราสลับ "เขียนแล้วอ่าน" ตลอด (อนุมัติงานทีมสามคน = เขียน Children 6 ครั้ง
   * ซึ่งเดิมทำให้ต้องดึงตาราง Children ใหม่ทั้งใบ 9 ครั้งในคำขอเดียว)
   * เรารู้อยู่แล้วว่าเปลี่ยนอะไรไป จึงแก้ตามได้เลย — ค่าที่ได้เท่ากับการอ่านกลับมาใหม่
   *
   * ⚠️ กฎเดิมยังอยู่: โค้ดนอก Db.gs ห้ามแก้ค่าใน object ที่ readAll_/findById_ คืนมา
   *    ให้เปลี่ยนผ่าน update_() เท่านั้น มิฉะนั้นแคชกับชีตจะไม่ตรงกัน
   */
  idx.forEach(function (i) {
    const v = patch[cols[i]];
    existing[cols[i]] = v === undefined ? '' : v;
  });
  return Object.assign({}, existing, patch);
}

// ลบแถวตาม id (hard delete)
function remove_(tab, id) {
  const sh = sheet_(tab);
  const existing = findById_(tab, id);
  if (!existing) return false;
  sh.deleteRow(existing._row);
  invalidate_(tab); // เลขแถวของทุกแถวที่อยู่ถัดลงไปเลื่อนขึ้นหมด แคชเดิมใช้ไม่ได้แล้ว
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
// ⚠️ คืน object เดียวกันทั้งรอบ — อ่านอย่างเดียว ห้ามแก้ค่าในนั้น
// (TZ_() เรียกอันนี้ และ TZ_() ถูกเรียกต่อแถวในลูปคิดแต้ม)
function getConfig_() {
  if (CFG_CACHE_.cfg) return CFG_CACHE_.cfg;
  const rows = readAll_(TAB.Config);
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  rows.forEach(function (r) { if (r.key) cfg[r.key] = String(r.value); });
  CFG_CACHE_.cfg = cfg;
  return cfg;
}

function configNum_(cfg, key) {
  return parseFloat(cfg[key]);
}

/**
 * เขียนค่า Config หลายคีย์รวดเดียว (อ่านชีตครั้งเดียว เขียนเฉพาะคีย์ที่ค่าเปลี่ยนจริง)
 * คีย์ที่ยังไม่มีในชีตจะถูกเพิ่มให้ — Config ไม่มีคอลัมน์ id จึงใช้ update_ ไม่ได้
 *
 * หน้าตั้งค่าส่งค่ามาทีเดียวหลายสิบคีย์ ถ้าเขียนทีละช่องคือยิงชีตหลายสิบครั้ง
 * จึงเขียนคอลัมน์ value เป็นช่วงเดียวที่คลุมทุกแถวที่ต้องแก้ (แถวที่ไม่ได้แก้เขียนค่าเดิมกลับไป)
 */
function setConfigMany_(map) {
  const sh = sheet_(TAB.Config);
  ensureCols_(sh, TAB.Config);
  const vIdx = SCHEMA[TAB.Config].indexOf('value') + 1;
  const byKey = {};
  readAll_(TAB.Config).forEach(function (r) { byKey[String(r.key)] = r; });

  const changed = {};   // เลขแถว -> ค่าใหม่
  const missing = [];
  let lo = Infinity, hi = -Infinity;
  Object.keys(map).forEach(function (k) {
    const v = String(map[k]);
    const row = byKey[k];
    if (!row) { missing.push({ key: k, value: v }); return; }
    if (String(row.value) === v) return;
    changed[row._row] = v;
    if (row._row < lo) lo = row._row;
    if (row._row > hi) hi = row._row;
  });

  if (hi >= lo) {
    const rng = sh.getRange(lo, vIdx, hi - lo + 1, 1);
    const vals = rng.getValues();
    for (let i = 0; i < vals.length; i++) {
      if (Object.prototype.hasOwnProperty.call(changed, lo + i)) vals[i][0] = changed[lo + i];
    }
    rng.setNumberFormat('@'); // ทั้งคอลัมน์ value เป็นข้อความล้วนอยู่แล้ว (TEXT_COLS)
    rng.setValues(vals);
  }
  missing.forEach(function (m) { insert_(TAB.Config, m); });
  invalidate_(TAB.Config);
}
