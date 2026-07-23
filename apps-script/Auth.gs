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
function createSession_(role, refId, name) {
  const cfg = getConfig_();
  const hours = configNum_(cfg, 'sessionHours') || 720;
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  insert_(TAB.Sessions, { token: token, role: role, refId: refId, name: name || '', expiresAt: expiresAt });
  return { token: token, role: role, refId: refId, name: name || '' };
}

// คืน session object ถ้า token ใช้ได้ มิฉะนั้น null
function getSession_(token) {
  if (!token) return null;
  const rows = where_(TAB.Sessions, function (s) { return s.token === token; });
  if (!rows.length) return null;
  const s = rows[0];
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    logout_(s.token); // ลบ session ที่หมดอายุทิ้ง
    return null;
  }
  return { token: s.token, role: s.role, refId: s.refId, name: s.name };
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
