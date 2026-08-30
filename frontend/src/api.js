// api.js — ตัวเรียก backend (Apps Script Web App)
// ส่ง POST เป็น text/plain เพื่อเลี่ยง CORS preflight; token แนบใน body

// ลำดับ: ค่าที่ build มา (VITE_API_URL) → ค่าที่ backend ฉีดให้ตอน serve หน้าเว็บ
// (ตัวหลังทำให้ build ที่ไม่มี .env ยังใช้งานได้ — ดู servePage_() ใน Code.gs)
const API_URL = import.meta.env.VITE_API_URL
  || (typeof window !== 'undefined' ? window.__API_URL__ : '')
  || '';
const TOKEN_KEY = 'homelove_token';
const SESSION_KEY = 'homelove_session';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  BOOT.clear(); // ข้อมูลที่ prefetch ไว้เป็นของ token เดิม ใช้กับคนที่เพิ่งล็อกอินไม่ได้
}

/**
 * จำ session ล่าสุดไว้ในเครื่อง เพื่อเปิดแอปเข้าหน้าจริงได้เลยโดยไม่ต้องรอ auth.me
 * (ยังยิง auth.me ตามไปตรวจอยู่ ถ้า token เสียจะเด้งกลับหน้าล็อกอินให้เอง)
 */
export function getCachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.role && s.refId ? s : null;
  } catch { return null; }
}
export function setCachedSession(s) {
  if (s && s.role) localStorage.setItem(SESSION_KEY, JSON.stringify({ role: s.role, refId: s.refId, name: s.name }));
  else localStorage.removeItem(SESSION_KEY);
}

// ---------- รู้ตัวเมื่อโค้ดหน้าเว็บเก่ากว่าที่ deploy อยู่ ----------
/**
 * แท็บที่เปิดค้างข้ามรอบ deploy จะรันโค้ดชุดเก่าต่อไปเรื่อยๆ — useLoad ดึงแค่ "ข้อมูล" ใหม่
 * ไม่ได้โหลด "โค้ด" ใหม่ เด็กจึงเห็นเลขสดบนหน้าตาเก่าโดยไม่มีทางรู้ว่าต้องปิดแอปเปิดใหม่
 *
 * sync-frontend.mjs ปั๊ม build id เดียวกันไว้ทั้งในหน้าเว็บ (window.__BUILD_ID__)
 * และใน backend (Version.gs → ติดมากับทุก response ผ่าน json_)
 * สองค่าไม่ตรงกันเมื่อไหร่ แปลว่าหน้านี้เก่าแล้ว
 *
 * ตอน npm run dev ไม่มี __BUILD_ID__ (หน้ามาจาก vite ไม่ได้ผ่าน sync) — เงียบไว้ ห้ามรีโหลดวน
 */
const pageBuild = (typeof window !== 'undefined' && window.__BUILD_ID__) || '';
let staleBuild = '';
const staleSubs = new Set();

function noteBuild_(serverBuild) {
  if (!serverBuild || !pageBuild || staleBuild || serverBuild === pageBuild) return;
  staleBuild = serverBuild;
  staleSubs.forEach((cb) => { try { cb(staleBuild); } catch { /* ignore */ } });
}

// สมัครรับข่าวว่าโค้ดหน้านี้เก่าแล้ว (เรียกซ้ำได้ ถ้ารู้อยู่แล้วจะเรียก cb ทันที)
export function onStale(cb) {
  if (staleBuild) cb(staleBuild);
  staleSubs.add(cb);
  return () => staleSubs.delete(cb);
}

// เด็กที่กลับเข้าแอปอาจได้ข้อมูลหน้าแรกจาก prefetch ทั้งหมด โดยไม่ยิง post() เลยสักครั้ง
// — BOOT_SCRIPT_ ใน Code.gs จึงเก็บ build ของ server ไว้ให้ตรงนี้
if (typeof window !== 'undefined' && window.__BOOT__ && window.__BOOT__.then) {
  window.__BOOT__.then(() => noteBuild_(window.__BUILD_SERVER__), () => {});
}

// กันหน้าจอหมุนค้างตลอดกาลตอนเน็ตสะดุด/Apps Script ค้าง
const TIMEOUT_MS = 25000;

// ยิงจริงหนึ่งคำขอ -> คืน data (โยน error ถ้า ok:false)
async function post(action, params) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_API_URL');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let json;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), params }),
      signal: ctrl.signal,
    });
    json = await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('เชื่อมต่อนานเกินไป — ลองใหม่อีกครั้ง');
    throw new Error('เชื่อมต่อไม่ได้ — เช็กอินเทอร์เน็ตแล้วลองใหม่');
  } finally {
    clearTimeout(timer);
  }
  noteBuild_(json.build);
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json.data;
}

// ---------- รวมคำขอที่ยิงในจังหวะเดียวกันให้เหลือรอบเดียว ----------
/**
 * การเรียก Apps Script หนึ่งครั้ง = รันสคริปต์ใหม่ทั้งรอบ (บูตสคริปต์ + อ่านชีต)
 * และคำขอของผู้ใช้คนเดียวกันถูกจัดคิวให้รันทีละอัน — สองคำขอที่ยิงพร้อมกัน
 * จึงไม่ได้เร็วขึ้นเลย แต่กลายเป็นรอสองรอบต่อกัน
 *
 * ทุกหน้าจอในแอปยิงอย่างน้อยสองคำขอตอน mount (ตัวเลขบนเมนู + ข้อมูลของแท็บนั้น)
 * ตัวรวมคำขอนี้จึงเก็บทุก call ที่เกิดในกรอบเวลาสั้นๆ ส่งไปเป็น batch เดียว
 * — ไม่ต้องแก้หน้าจอไหนเลย และ callBatch เดิมก็ไหลมารวมกับพวกมันได้ด้วย
 */
const BATCH_WINDOW_MS = 12;   // สั้นพอที่ผู้ใช้ไม่รู้สึก แต่กวาด call ในจังหวะ mount เดียวกันได้ครบ
const MAX_BATCH = 10;         // เพดานฝั่ง backend (ดู dispatch_ ใน Code.gs)

// action ที่ห้ามรวม: เปลี่ยน token ระหว่างทาง (batch หนึ่งรอบใช้ token เดียว)
const NO_BATCH = ['auth.loginChild', 'auth.loginParent', 'auth.logout'];

let queue = [];
let timer = null;

function flush() {
  clearTimeout(timer);
  timer = null;
  const batch = queue.splice(0, MAX_BATCH);
  if (queue.length) timer = setTimeout(flush, 0); // ส่วนที่เกินเพดานไปรอบถัดไป
  if (!batch.length) return;

  if (batch.length === 1) {
    post(batch[0].action, batch[0].params).then(batch[0].resolve, batch[0].reject);
    return;
  }
  post('batch', { calls: batch.map((c) => ({ action: c.action, params: c.params })) })
    .then((rows) => {
      batch.forEach((c, i) => {
        const r = rows[i];
        if (r && r.ok) c.resolve(r.data);
        else c.reject(new Error((r && r.error) || 'เกิดข้อผิดพลาด'));
      });
    })
    .catch((err) => batch.forEach((c) => c.reject(err))); // ทั้งรอบล้ม = ล้มเหมือนกันหมด
}

function enqueue(action, params) {
  return new Promise((resolve, reject) => {
    queue.push({ action, params, resolve, reject });
    if (queue.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
  });
}

// ---------- ข้อมูลที่หน้าเว็บสั่ง prefetch ไว้ตั้งแต่ยังโหลด JS ไม่เสร็จ ----------
/**
 * Code.gs ฝังสคริปต์เล็กๆ ไว้ใน <head> ให้ยิง action 'boot' ทันทีที่หน้าเปิด
 * แทนที่จะรอ React parse+mount เสร็จก่อนค่อยเริ่มยิง — ทับซ้อนเวลากันไปเลย
 * ตัวนี้คือฝั่งรับ: call() ตัวแรกของแต่ละ action จะไปกิน promise นั้นแทนการยิงใหม่
 */
const BOOT = {
  taken: {},
  // ทิ้งของ prefetch ทั้งหมด — ต้องล้าง window.__BOOT__ ด้วย ไม่งั้นข้อมูลของ token เดิม
  // จะถูกหยิบมาเสิร์ฟให้คนที่เพิ่งล็อกอินเข้ามา
  clear() {
    this.taken = {};
    if (typeof window !== 'undefined') window.__BOOT__ = null;
  },
  // คืน promise ของ action นี้ถ้ามีของ prefetch ให้ (กินได้ครั้งเดียว) มิฉะนั้น null
  take(action) {
    const p = typeof window !== 'undefined' ? window.__BOOT__ : null;
    if (!p || this.taken[action]) return null;
    this.taken[action] = true;
    // boot ส่งมาเฉพาะ action ที่สำเร็จ — ที่ขาดไปให้ถือว่าไม่มีของ แล้วถอยไปยิงเอง
    return p.then((data) => {
      if (!data || !Object.prototype.hasOwnProperty.call(data, action)) throw new Error('no-boot');
      return data[action];
    });
  },
};

// เรียก action -> คืน data (โยน error ถ้า ok:false)
export function call(action, params = {}) {
  if (NO_BATCH.indexOf(action) >= 0) return post(action, params);
  const booted = Object.keys(params).length === 0 ? BOOT.take(action) : null;
  if (!booted) return enqueue(action, params);
  // prefetch ใช้ไม่ได้ (ยิงไม่ทัน/ล้ม/ไม่มี action นี้) ก็ถอยไปยิงเองตามปกติ
  return booted.catch(() => enqueue(action, params));
}

/**
 * เรียกหลาย action พร้อมกัน — ตอนนี้แค่ปล่อยเข้าตัวรวมคำขอด้านบน
 * จึงรวมกับ call() ตัวอื่นที่ยิงในจังหวะเดียวกันได้ด้วย ไม่ใช่แยกเป็นอีกรอบต่างหาก
 * calls: [['child.state'], ['child.rewards', { ... }]] -> คืน array ของ data เรียงตามลำดับเดิม
 */
export function callBatch(calls) {
  return Promise.all(calls.map(([action, params]) => call(action, params || {})));
}

// แปลงไฟล์รูปเป็น data URL (ย่อขนาดเพื่อประหยัดโควตา/แบนด์วิดท์)
export function fileToDataUrl(file, maxSize = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const scale = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}
