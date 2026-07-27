/**
 * Auth.gs — การยืนยันตัวตนและ session token
 * - เด็ก: PIN 4 หลัก (ผูกกับ childId)
 * - ผู้ปกครอง: username + password
 * PIN/รหัสผ่านเก็บเป็น hash (SHA-256 + SECRET เป็น salt)
 */

function hashSecret_(value) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    secret + ':' + String(value)
  );
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function verifySecret_(value, hash) {
  return hashSecret_(value) === String(hash);
}

// ---- Sessions ----
// getSession_ ถูกเรียกทุก request และเดิมอ่าน "ทั้งตาราง" Sessions ทุกครั้ง
// จึงแคช token -> session ไว้สั้นๆ และล้างแถวหมดอายุตอนล็อกอิน ไม่งั้นตารางโตไม่หยุด
const SESSION_CACHE_SEC_ = 300;

function sessionCacheKey_(token) { return 'sess_' + token; }

function createSession_(role, refId, name) {
  const cfg = getConfig_();
  const hours = configNum_(cfg, 'sessionHours') || 720;
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  pruneSessions_(); // ล็อกอินไม่บ่อย — เก็บกวาดตอนนี้ถูกที่สุด
  insert_(TAB.Sessions, { token: token, role: role, refId: refId, name: name || '', expiresAt: expiresAt });
  return { token: token, role: role, refId: refId, name: name || '' };
}

// ลบแถว session ที่หมดอายุ/เสียแล้ว คืนจำนวนแถวที่ลบ
function pruneSessions_() {
  const sh = sheet_(TAB.Sessions);
  const values = sh.getDataRange().getValues();
  const now = Date.now();
  const doomed = [];
  for (let r = 1; r < values.length; r++) {
    if (!values[r][0]) continue; // แถวว่าง ปล่อยไว้
    const exp = new Date(toIso_(values[r][1])).getTime();
    if (!exp || isNaN(exp) || exp < now) doomed.push(r + 1);
  }
  // ลบจากล่างขึ้นบน เลขแถวที่ยังไม่ได้ลบจะได้ไม่เลื่อน
  for (let i = doomed.length - 1; i >= 0; i--) sh.deleteRow(doomed[i]);
  return doomed.length;
}

// คืน session object ถ้า token ใช้ได้ มิฉะนั้น null
// หมายเหตุ: ถ้าผู้ปกครองปิดใช้งานเด็กระหว่างนี้ session เดิมจะยังใช้ได้อีกไม่เกิน 5 นาที
// (การออกจากระบบล้างแคชทันที จึงไม่ค้างสิทธิ์)
function getSession_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const key = sessionCacheKey_(token);
  const hit = cache.get(key);
  if (hit) {
    const c = JSON.parse(hit);
    if (new Date(c.expiresAt).getTime() >= Date.now()) {
      return { token: c.token, role: c.role, refId: c.refId, name: c.name };
    }
    cache.remove(key);
  }
  const rows = where_(TAB.Sessions, function (s) { return s.token === token; });
  if (!rows.length) return null;
  const s = rows[0];
  const expiresAt = toIso_(s.expiresAt);
  if (new Date(expiresAt).getTime() < Date.now()) {
    logout_(s.token); // ลบ session ที่หมดอายุทิ้ง
    return null;
  }
  const out = { token: s.token, role: s.role, refId: s.refId, name: s.name };
  cache.put(key, JSON.stringify({
    token: out.token, role: out.role, refId: out.refId, name: out.name, expiresAt: expiresAt,
  }), SESSION_CACHE_SEC_);
  return out;
}

function requireRole_(session, role) {
  if (!session) throw new Error('unauthorized: ต้องล็อกอินก่อน');
  if (role && session.role !== role) throw new Error('forbidden: ไม่มีสิทธิ์');
  return session;
}

// ---- login endpoints ----
function loginChild_(childId, pin) {
  const child = findById_(TAB.Children, childId);
  if (!child || !toBool_(child.active)) throw new Error('ไม่พบเด็กหรือถูกปิดใช้งาน');
  if (!verifySecret_(pin, child.pinHash)) throw new Error('PIN ไม่ถูกต้อง');
  return createSession_('child', child.id, child.name);
}

function loginParent_(username, password) {
  const rows = where_(TAB.Parents, function (p) { return p.username === username; });
  if (!rows.length) throw new Error('username หรือรหัสผ่านไม่ถูกต้อง');
  const parent = rows[0];
  if (!verifySecret_(password, parent.passwordHash)) throw new Error('username หรือรหัสผ่านไม่ถูกต้อง');
  return createSession_('parent', parent.id, parent.username);
}

function logout_(token) {
  CacheService.getScriptCache().remove(sessionCacheKey_(token)); // กันสิทธิ์ค้างในแคช
  const sh = sheet_(TAB.Sessions);
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === token) { sh.deleteRow(r + 1); return true; }
  }
  return false;
}

// รายชื่อเด็ก (สำหรับหน้าเลือกรูปก่อนใส่ PIN) — ไม่คืน pinHash
function publicChildren_() {
  return where_(TAB.Children, function (c) { return toBool_(c.active); })
    .map(function (c) { return { id: c.id, name: c.name, avatar: c.avatar, color: c.color }; });
}
