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
  // ลบ tab "Sheet1" เริ่มต้นถ้ายังมี
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  // seed Config (เฉพาะที่ยังไม่มี)
  const existing = {};
  readAll_(TAB.Config).forEach(function (r) { existing[r.key] = true; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) {
    if (!existing[k]) insert_(TAB.Config, { key: k, value: DEFAULT_CONFIG[k] });
  });

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
