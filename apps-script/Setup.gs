/**
 * Setup.gs — สคริปต์ตั้งค่าเริ่มต้น (รันครั้งเดียวตอน deploy)
 * รัน setup() จากเมนู Apps Script เพื่อสร้าง tab ทั้งหมด + seed ค่าเริ่มต้น + ผู้ปกครองคนแรก
 *
 * ขั้นตอนแนะนำ: รัน initProperties() → setup() → createParent(...) [→ seedDemo()]
 */

// Sheet ID เริ่มต้น (แก้เป็นของคุณได้ หรือ override ผ่าน Script Property "SHEET_ID")
const DEFAULT_SHEET_ID = '1syFvYW4s5exaT1pI7tWf4PS29hLri9SQKsua_Bcbua8';

/**
 * ตั้ง Script Properties อัตโนมัติ (รันครั้งเดียวก่อน setup)
 *   SHEET_ID = DEFAULT_SHEET_ID (ถ้ายังไม่มี)
 *   SECRET   = สตริงสุ่ม (สร้างครั้งเดียว ห้ามเปลี่ยนภายหลัง)
 */
function initProperties() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    props.setProperty('SHEET_ID', DEFAULT_SHEET_ID);
    Logger.log('ตั้ง SHEET_ID = ' + DEFAULT_SHEET_ID);
  }
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
    Logger.log('สร้าง SECRET อัตโนมัติแล้ว');
  }
  Logger.log('initProperties() เสร็จ — รัน setup() ต่อได้เลย');
}

/**
 * bootstrap() — รันครั้งเดียวจบ (แนะนำให้รันอันนี้)
 * แก้รหัสผ่านผู้ปกครองด้านล่างก่อนกด Run แล้วกด Run → อนุญาต scope ที่ขอ
 */
function bootstrap() {
  const PARENT_USERNAME = 'admin';
  const PARENT_PASSWORD = 'CHANGE_ME';         // <<< แก้รหัสผ่านผู้ปกครองตรงนี้ก่อนรัน
  const PARENT_EMAIL = 'thaikorn@gmail.com';

  initProperties();
  setup();
  try {
    createParent(PARENT_USERNAME, PARENT_PASSWORD, PARENT_EMAIL);
  } catch (e) {
    Logger.log('ข้ามการสร้างผู้ปกครอง: ' + e.message);
  }
  Logger.log('✅ bootstrap เสร็จ — ล็อกอินผู้ปกครอง username="' + PARENT_USERNAME + '"');
}

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    props.setProperty('SHEET_ID', DEFAULT_SHEET_ID); // fallback ให้สะดวก
  }
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
    Logger.log('สร้าง SECRET อัตโนมัติแล้ว');
  }

  const ss = ss_();
  // สร้างทุก tab พร้อมหัวคอลัมน์
  Object.keys(SCHEMA).forEach(function (tab) {
    let sh = ss.getSheetByName(tab);
    if (!sh) sh = ss.insertSheet(tab);
    const cols = SCHEMA[tab];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  });
  applyTextFormats_();
  // ลบ tab "Sheet1" เริ่มต้นถ้ายังมี
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  // seed Config (เฉพาะที่ยังไม่มี)
  const existing = {};
  readAll_(TAB.Config).forEach(function (r) { existing[r.key] = true; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    if (!existing[k]) insert_(TAB.Config, { key: k, value: DEFAULT_CONFIG[k] });
  });

  // ซ่อมข้อมูลเดิมที่ Sheet เคยแปลงชนิดไป (ไม่ทำอะไรถ้าข้อมูลถูกอยู่แล้ว)
  ensureSchemaColumns_();
  repairSheetTypes();

  Logger.log('setup() เสร็จ — สร้าง tab และ config เริ่มต้นแล้ว');
  Logger.log('ขั้นต่อไป: รัน createParent("admin","รหัสผ่าน","email@example.com") เพื่อสร้างผู้ปกครองคนแรก');
}

/** สร้างผู้ปกครอง (รันจาก editor) */
function createParent(username, password, email) {
  if (!username || !password) throw new Error('ต้องมี username และ password');
  const dup = where_(TAB.Parents, function (p) { return p.username === username; });
  if (dup.length) throw new Error('username นี้มีแล้ว');
  const parent = {
    id: newId_('par'),
    username: username,
    passwordHash: hashSecret_(password),
    email: email || '',
  };
  insert_(TAB.Parents, parent);
  Logger.log('สร้างผู้ปกครอง "' + username + '" แล้ว');
  return parent.id;
}

/**
 * diagnoseAuth() — ตรวจสภาพระบบล็อกอิน (ไม่แสดงรหัส/แฮชจริง)
 * รันจาก editor แล้วดูผลใน Execution log
 */
function diagnoseAuth() {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  Logger.log('SECRET: ' + (secret ? 'มีอยู่ (ยาว ' + secret.length + ' ตัว)' : '❌ ไม่มี — ล็อกอินจะไม่ผ่านทุกกรณี'));

  const parents = readAll_(TAB.Parents);
  Logger.log('ผู้ปกครอง ' + parents.length + ' คน:');
  parents.forEach(function (p) {
    const h = String(p.passwordHash || '');
    Logger.log('  username="' + p.username + '" | แฮช ' + h.length + ' ตัว | ' +
      (/^[0-9a-f]{64}$/.test(h) ? 'รูปแบบถูกต้อง' : '❌ รูปแบบผิด (ต้องเป็น hex 64 ตัว) — ต้องรีเซ็ตรหัส'));
  });

  const children = readAll_(TAB.Children);
  Logger.log('เด็ก ' + children.length + ' คน:');
  children.forEach(function (c) {
    const h = String(c.pinHash || '');
    Logger.log('  "' + c.name + '" (' + c.id + ') | แฮช ' + h.length + ' ตัว | ' +
      (/^[0-9a-f]{64}$/.test(h) ? 'รูปแบบถูกต้อง' : '❌ รูปแบบผิด — ต้องรีเซ็ต PIN'));
  });
  return 'ดูผลใน Execution log';
}

/**
 * resetParentPassword() — ตั้งรหัสผ่านผู้ปกครองใหม่ (ใช้เมื่อลืมรหัส/แฮชเสีย)
 *
 * ไม่ต้องแก้โค้ด: ใส่รหัสใหม่ที่ ⚙️ Project Settings > Script properties
 *   ชื่อ  = NEW_PARENT_PASSWORD
 *   ค่า   = รหัสใหม่ที่ต้องการ
 * แล้วกด Run — ฟังก์ชันจะแฮชเก็บลงชีต และ "ลบ" property นั้นทิ้งทันที
 * เพื่อไม่ให้รหัสจริงค้างอยู่ที่ไหนเลย  (ถ้ายังไม่มี username นี้จะสร้างใหม่ให้)
 */
function resetParentPassword() {
  const USERNAME = 'admin';
  const props = PropertiesService.getScriptProperties();
  const NEW_PASSWORD = props.getProperty('NEW_PARENT_PASSWORD');

  if (!NEW_PASSWORD) {
    throw new Error('ยังไม่ได้ใส่รหัสใหม่ — ไปที่ ⚙️ Project Settings > Script properties ' +
      'แล้วเพิ่ม property ชื่อ NEW_PARENT_PASSWORD ใส่รหัสใหม่เป็นค่า จากนั้นกด Run อีกครั้ง');
  }
  if (String(NEW_PASSWORD).length < 4) throw new Error('รหัสใหม่สั้นเกินไป (อย่างน้อย 4 ตัว)');
  props.deleteProperty('NEW_PARENT_PASSWORD'); // ลบก่อนเขียน กันรหัสค้างแม้ขั้นต่อไปพลาด

  const rows = where_(TAB.Parents, function (p) { return String(p.username) === USERNAME; });
  if (!rows.length) {
    createParent(USERNAME, NEW_PASSWORD, 'thaikorn@gmail.com');
    Logger.log('ไม่พบ username "' + USERNAME + '" — สร้างใหม่พร้อมรหัสที่ตั้งให้แล้ว');
    return 'created';
  }
  update_(TAB.Parents, rows[0].id, { passwordHash: hashSecret_(NEW_PASSWORD) });

  // ตรวจว่าค่าที่เขียนลงชีตยังเป็นข้อความ hex 64 ตัวจริง (เคสเดิมโดน Sheet แปลงเป็นตัวเลข)
  const saved = String((findById_(TAB.Parents, rows[0].id) || {}).passwordHash || '');
  if (!/^[0-9a-f]{64}$/.test(saved)) {
    throw new Error('เขียนแฮชลงชีตแล้วแต่ค่าเพี้ยน (ยาว ' + saved.length + ' ตัว) — แจ้งให้ตรวจ TEXT_COLS/format ของ Parents!passwordHash');
  }
  Logger.log('ตั้งรหัสผ่านใหม่ให้ "' + USERNAME + '" แล้ว (ตรวจแฮชในชีตแล้ว 64 ตัวถูกต้อง) — ลองล็อกอินได้เลย');
  return 'updated';
}

/**
 * resetChildPin() — ตั้ง PIN เด็กใหม่ (ใช้เมื่อลืม PIN)
 * แก้ 2 ค่าด้านล่างก่อนกด Run (ดูชื่อ/id เด็กได้จาก diagnoseAuth)
 */
function resetChildPin() {
  const CHILD_NAME = 'พี่เหนือ';
  const NEW_PIN = '1234';             // <<< แก้เป็น PIN 4 หลักที่ต้องการก่อนกด Run

  if (!/^\d{4}$/.test(NEW_PIN)) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
  const rows = where_(TAB.Children, function (c) { return String(c.name) === CHILD_NAME; });
  if (!rows.length) throw new Error('ไม่พบเด็กชื่อ "' + CHILD_NAME + '" — รัน diagnoseAuth() ดูชื่อที่มีอยู่');
  update_(TAB.Children, rows[0].id, { pinHash: hashSecret_(NEW_PIN) });
  Logger.log('ตั้ง PIN ใหม่ให้ "' + CHILD_NAME + '" แล้ว');
  return 'updated';
}

/** บังคับ number format ของคอลัมน์ข้อความล้วนทุก tab (กัน Sheet แปลงค่าตอนเขียน) */
function applyTextFormats_() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    textColIdx_(tab).forEach(function (i) {
      sh.getRange(2, i, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    });
  });
}

/**
 * เติมหัวคอลัมน์ที่เพิ่มใหม่ใน SCHEMA ให้ชีตที่มีอยู่แล้ว
 * ปลอดภัยเพราะคอลัมน์ใหม่ "ต่อท้าย" เสมอ — แถวเดิมไม่เลื่อน ค่าใหม่เป็นว่าง
 */
function ensureSchemaColumns_() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    const cols = SCHEMA[tab];
    const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), cols.length)).getValues()[0];
    let changed = false;
    for (let i = 0; i < cols.length; i++) {
      if (String(header[i] || '') !== cols[i]) changed = true;
    }
    if (!changed) return;
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    Logger.log('อัปเดตหัวคอลัมน์ของ ' + tab + ' แล้ว');
  });
}

// ทำ migration ครั้งเดียวอัตโนมัติตอน request แรกหลัง deploy (ไม่ต้องเข้า editor ไปกด Run)
// เปลี่ยนเลขเวอร์ชันเมื่อมี migration ใหม่ที่ต้องรันซ้ำ
const REPAIR_FLAG_ = 'MIGRATION_V2';
function ensureRepaired_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(REPAIR_FLAG_)) return;
  try {
    withLock_(function () {
      if (props.getProperty(REPAIR_FLAG_)) return;
      ensureSchemaColumns_();
      applyTextFormats_();
      repairSheetTypes();
      props.setProperty(REPAIR_FLAG_, new Date().toISOString());
    });
  } catch (err) {
    Logger.log('ensureRepaired_ ล้มเหลว (ข้ามไป): ' + (err.message || err));
  }
}

/**
 * repairSheetTypes() — ซ่อมข้อมูลเดิมที่ Google Sheet แปลงชนิดไปแล้ว
 * (เช่น startTime/endTime/cutoff กลายเป็นค่าเวลา, lastStreakDate กลายเป็นวันที่)
 * เขียนกลับเป็นข้อความล้วนตามรูปแบบที่โค้ดคาดหวัง — รันซ้ำได้ ไม่พังถ้าข้อมูลถูกอยู่แล้ว
 * รันหลัง setup() หนึ่งครั้งบนชีตที่มีข้อมูลอยู่แล้ว
 */
function repairSheetTypes() {
  const HM = { TimeWindows: ['startTime', 'endTime', 'cutoff'] };
  const DATE = { Children: ['lastStreakDate'] };
  const ISO = {
    Submissions: ['submittedAt', 'reviewedAt'],
    Redemptions: ['requestedAt', 'decidedAt'],
    Wishes: ['createdAt'],
    Badges: ['awardedAt'],
    PointAdjustments: ['createdAt'],
    Sessions: ['expiresAt'],
  };
  let fixed = 0;

  function repair(map, converter) {
    Object.keys(map).forEach(function (tab) {
      const sh = sheet_(tab);
      const cols = SCHEMA[tab];
      const last = sh.getLastRow();
      if (last < 2) return;
      map[tab].forEach(function (name) {
        const idx = cols.indexOf(name) + 1;
        if (idx <= 0) return;
        const rng = sh.getRange(2, idx, last - 1, 1);
        const vals = rng.getValues();
        const out = vals.map(function (row) { return [converter(row[0])]; });
        rng.setNumberFormat('@');
        rng.setValues(out);
        vals.forEach(function (row, i) { if (String(row[0]) !== String(out[i][0])) fixed++; });
      });
    });
  }

  repair(HM, toHm_);
  repair(DATE, toDateStr_);
  repair(ISO, toIso_);
  Logger.log('repairSheetTypes() เสร็จ — แก้ค่าที่เพี้ยน ' + fixed + ' ช่อง');
  return fixed;
}

/** ใส่ข้อมูลตัวอย่างเพื่อลองเล่น (ไม่บังคับ) */
function seedDemo() {
  const tw = { id: newId_('tw'), name: 'เช้า', startTime: '08:00', endTime: '10:00', cutoff: '09:00', days: '1,2,3,4,5,6,7', bonusMultiplier: 1, active: true };
  insert_(TAB.TimeWindows, tw);
  insert_(TAB.Chores, { id: newId_('cho'), name: 'เก็บที่นอน', icon: '🛏️', basePoints: 10, timeWindowIds: tw.id, active: true });
  insert_(TAB.Chores, { id: newId_('cho'), name: 'ล้างจาน', icon: '🍽️', basePoints: 15, timeWindowIds: tw.id, active: true });
  insert_(TAB.Rewards, { id: newId_('rew'), name: 'เวลาเล่นเกม 30 นาที', cost: 50, limitDay: 1, limitWeek: '', limitMonth: '', active: true });
  insert_(TAB.Children, { id: newId_('chd'), name: 'น้องเอ', avatar: '🐱', color: '#ff8fab', pinHash: hashSecret_('1234'), points: 0, streakCurrent: 0, streakMax: 0, lastStreakDate: '', active: true });
  Logger.log('seedDemo() เสร็จ — เพิ่มช่วงเวลา/งาน/รางวัล/เด็กตัวอย่างแล้ว (PIN เด็ก = 1234)');
}
