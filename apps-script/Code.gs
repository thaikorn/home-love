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
  const action = e && e.parameter && e.parameter.action;

  // ไม่มี action ระบุมา = โหลดหน้าเว็บ (frontend build เป็นไฟล์เดียวจาก vite-plugin-singlefile)
  if (!action) return servePage_();

  try {
    if (action === 'ping') return json_({ ok: true, data: { service: 'HomeLove', time: new Date().toISOString() } });
    if (action === 'children') return json_({ ok: true, data: publicChildren_() });
    return json_({ ok: false, error: 'unknown GET action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * serve หน้าเว็บ พร้อมฉีด URL ของ web app ไว้ที่ window.__API_URL__
 * หน้าเว็บถูก render ใน sandboxed iframe (script.googleusercontent.com) คนละ origin
 * กับ /exec จึงอ่าน URL จาก location เองไม่ได้ — และถ้าฉีดจากฝั่งนี้ frontend build
 * ที่ไม่มี VITE_API_URL ก็ยังเรียก API ได้ (กันเคส build ในเครื่องโดยไม่มี .env)
 */
function servePage_() {
  let inject = '';
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) inject = '<script>window.__API_URL__=' + JSON.stringify(url) + ';</script>';
  } catch (err) {
    Logger.log('ไม่สามารถอ่าน web app URL: ' + (err.message || err));
  }
  const content = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const html = content.indexOf('<head>') >= 0
    ? content.replace('<head>', '<head>' + inject)
    : inject + content;
  return HtmlService.createHtmlOutput(html)
    .setTitle('Home Love — งานบ้านเก็บแต้ม')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
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
  ensureRepaired_(); // migration ครั้งเดียว: ซ่อมค่าเวลา/วันที่ที่ Sheet เคยแปลงชนิดไป

  // --- batch: รวมหลาย action ไว้ในรอบเดียว ---
  // การเรียก Apps Script แต่ละครั้งคือการรันสคริปต์ใหม่ทั้งรอบ ซึ่งช้า
  // หน้าที่ต้องใช้ข้อมูลหลายชุดจึงส่งมาทีเดียวได้ แต่ละรายการล้มเหลวแยกกันได้
  if (action === 'batch') {
    const calls = params.calls;
    if (!calls || !calls.length) throw new Error('batch: ไม่มี calls');
    if (calls.length > 10) throw new Error('batch: ส่งได้ไม่เกิน 10 รายการต่อรอบ');
    return calls.map(function (c) {
      if (!c || c.action === 'batch') return { ok: false, error: 'batch ซ้อน batch ไม่ได้' };
      try { return { ok: true, data: dispatch_(c.action, token, c.params || {}) }; }
      catch (err) { return { ok: false, error: String(err.message || err) }; }
    });
  }

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
