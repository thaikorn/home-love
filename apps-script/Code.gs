/**
 * Code.gs — จุดเข้า Web App (doGet/doPost) + ตัวจัดเส้นทาง (router)
 *
 * Frontend เรียกผ่าน POST body เป็น JSON: { action, token, params }
 * ส่งเป็น Content-Type: text/plain เพื่อเลี่ยง CORS preflight (Apps Script รับได้)
 * token ส่งใน body ไม่ใช่ header
 *
 * ตอบกลับ: { ok:true, data } หรือ { ok:false, error }
 */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') return json_({ ok: true, data: { service: 'HomeLove', time: new Date().toISOString() } });
    if (action === 'children') return json_({ ok: true, data: publicChildren_() });
    return json_({ ok: false, error: 'unknown GET action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return json_({ ok: false, error: 'JSON ไม่ถูกต้อง' });
  }
  const action = body.action;
  const params = body.params || {};
  const token = body.token || '';

  try {
    return json_({ ok: true, data: dispatch_(action, token, params) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// รวม action ทั้งหมด และตรวจสิทธิ์ตาม prefix
function dispatch_(action, token, params) {
  if (!action) throw new Error('ไม่ได้ระบุ action');

  // --- login (ไม่ต้องมี token) ---
  if (action === 'auth.childList') return publicChildren_();
  if (action === 'auth.loginChild') return loginChild_(params.childId, params.pin);
  if (action === 'auth.loginParent') return loginParent_(params.username, params.password);
  if (action === 'auth.me') { const s = getSession_(token); return s ? { role: s.role, refId: s.refId, name: s.name } : null; }
  if (action === 'auth.logout') return { ok: logout_(token) };

  const session = getSession_(token);

  if (action.indexOf('child.') === 0) {
    requireRole_(session, 'child');
    const fn = CHILD_ACTIONS[action];
    if (!fn) throw new Error('unknown action: ' + action);
    return fn(session, params);
  }

  if (action.indexOf('parent.') === 0) {
    requireRole_(session, 'parent');
    const fn = PARENT_ACTIONS[action] || CRUD_ACTIONS[action];
    if (!fn) throw new Error('unknown action: ' + action);
    return fn(session, params);
  }

  throw new Error('unknown action: ' + action);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
