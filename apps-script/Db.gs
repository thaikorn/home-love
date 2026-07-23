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

// เพิ่มแถวใหม่ (obj ต้องมี key ตาม SCHEMA; ที่ขาดจะเว้นว่าง)
function insert_(tab, obj) {
  const sh = sheet_(tab);
  const cols = SCHEMA[tab];
  const row = cols.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  sh.appendRow(row);
  return obj;
}

// อัปเดตแถวตาม id (patch = object ของ field ที่จะเปลี่ยน)
function update_(tab, id, patch) {
  const sh = sheet_(tab);
  const cols = SCHEMA[tab];
  const existing = findById_(tab, id);
  if (!existing) throw new Error('ไม่พบ id ' + id + ' ใน ' + tab);
  const rowNum = existing._row;
  Object.keys(patch).forEach(function (key) {
    const idx = cols.indexOf(key);
    if (idx >= 0) sh.getRange(rowNum, idx + 1).setValue(patch[key]);
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
