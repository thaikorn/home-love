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
    if (url) inject = '<script>window.__API_URL__=' + JSON.stringify(url) + ';</script>' + BOOT_SCRIPT_;
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

/**
 * สคริปต์เล็กๆ ที่ฝังไว้ใน <head> — ยิงข้อมูลหน้าแรกทันทีที่หน้าเปิด
 *
 * ทำไม: bundle ของแอปหนัก ~225KB มือถือเด็กใช้เวลา parse + mount React อยู่พักหนึ่ง
 * กว่าจะได้เริ่มยิงคำขอแรก ช่วงนั้นเน็ตว่างเปล่าเปลืองไปเฉยๆ ตัวนี้ยิงคู่ขนานไปเลย
 * แล้ว api.js ฝั่งโน้นจะมากิน promise นี้แทนการยิงใหม่ (ดู BOOT ใน api.js)
 *
 * ห้ามทำให้หน้าพังไม่ว่ากรณีใด — ล้ม/ช้า/localStorage ใช้ไม่ได้ ก็แค่คืน null
 * แล้วแอปถอยไปยิงเองตามปกติ
 */
const BOOT_SCRIPT_ = '<script>(function(){try{' +
  'var u=window.__API_URL__;if(!u||!window.fetch)return;' +
  'var t="";try{t=localStorage.getItem("homelove_token")||"";}catch(e){}' +
  'var req=fetch(u,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},' +
  'body:JSON.stringify({action:"boot",token:t,params:{}})})' +
  '.then(function(r){return r.json();})' +
  '.then(function(j){if(j&&j.build)window.__BUILD_SERVER__=j.build;return j&&j.ok?j.data:null;})' +
  '.catch(function(){return null;});' +
  'var late=new Promise(function(res){setTimeout(function(){res(null);},15000);});' +
  'window.__BOOT__=Promise.race([req,late]);' +
  '}catch(e){window.__BOOT__=null;}})();</script>';

/**
 * boot — ข้อมูลชุดแรกที่หน้าจอต้องใช้ รวมมาให้ในรอบเดียวตามบทบาทของ token
 * คืนเป็น map ของ action -> data เพื่อให้ฝั่งหน้าเว็บจับคู่กับ call() ที่มันจะเรียกได้ตรงๆ
 * action ไหนพัง ก็ตัดออกจาก map ไปเฉยๆ — หน้าเว็บจะยิงตัวนั้นเองทีหลัง
 */
function boot_(token) {
  const session = getSession_(token);
  const out = { 'auth.me': session ? { role: session.role, refId: session.refId, name: session.name } : null };
  const wanted = !session
    ? [['auth.childList', publicChildren_]]   // ยังไม่ล็อกอิน — หน้าเลือกเด็กใช้รายการนี้
    : session.role === 'child'
      ? [['child.counts', CHILD_ACTIONS['child.counts']],
         ['child.state', CHILD_ACTIONS['child.state']],
         ['child.leaderboard', CHILD_ACTIONS['child.leaderboard']]]
      : [['parent.counts', PARENT_ACTIONS['parent.counts']],
         ['parent.reviewQueue', PARENT_ACTIONS['parent.reviewQueue']],
         ['parent.reviewHistory', PARENT_ACTIONS['parent.reviewHistory']]];
  wanted.forEach(function (pair) {
    try { out[pair[0]] = pair[1](session, {}); }
    catch (err) { Logger.log('boot: ' + pair[0] + ' ล้มเหลว — ' + (err.message || err)); }
  });
  return out;
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

  // ข้อมูลชุดแรกของหน้าจอ รวมรอบเดียว — หน้าเว็บยิงตัวนี้ก่อน React จะบูตเสร็จด้วยซ้ำ
  if (action === 'boot') return boot_(token);

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
    const fn = PARENT_ACTIONS[action] || CRUD_ACTIONS[action] || CLASS_ACTIONS[action];
    if (!fn) throw new Error('unknown action: ' + action);
    return fn(session, params);
  }

  throw new Error('unknown action: ' + action);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ build: currentBuild_() }, obj)))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * build id ของ Index.html ชุดที่ push ขึ้นมาด้วยกัน — sync-frontend.mjs เขียน Version.gs ให้
 * หน้าเว็บที่เปิดค้างข้ามรอบ deploy เอาค่านี้ไปเทียบกับ window.__BUILD_ID__ ของตัวเองแล้วรีโหลด
 *
 * Version.gs เป็นไฟล์ generated (gitignored) — clone ใหม่แล้ว push โดยไม่ sync ก็จะไม่มีไฟล์นี้
 * ต้องคืนค่าว่าง (= ปิดฟีเจอร์นี้เงียบๆ) ห้ามโยน ReferenceError ทำทั้ง API พัง
 */
function currentBuild_() {
  return typeof BUILD_ID === 'string' ? BUILD_ID : '';
}
