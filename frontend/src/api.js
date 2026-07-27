// api.js — ตัวเรียก backend (Apps Script Web App)
// ส่ง POST เป็น text/plain เพื่อเลี่ยง CORS preflight; token แนบใน body

// ลำดับ: ค่าที่ build มา (VITE_API_URL) → ค่าที่ backend ฉีดให้ตอน serve หน้าเว็บ
// (ตัวหลังทำให้ build ที่ไม่มี .env ยังใช้งานได้ — ดู servePage_() ใน Code.gs)
const API_URL = import.meta.env.VITE_API_URL
  || (typeof window !== 'undefined' ? window.__API_URL__ : '')
  || '';
const TOKEN_KEY = 'homelove_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// กันหน้าจอหมุนค้างตลอดกาลตอนเน็ตสะดุด/Apps Script ค้าง
const TIMEOUT_MS = 25000;

// เรียก action -> คืน data (โยน error ถ้า ok:false)
export async function call(action, params = {}) {
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
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json.data;
}

/**
 * เรียกหลาย action ในรอบเดียว (Apps Script ต่อรอบช้า — หน้าที่ใช้ข้อมูลหลายชุดจะเร็วขึ้นมาก)
 * calls: [['child.state'], ['child.rewards', { ... }]] -> คืน array ของ data เรียงตามลำดับเดิม
 */
export async function callBatch(calls) {
  const rows = await call('batch', {
    calls: calls.map(([action, params]) => ({ action, params: params || {} })),
  });
  return rows.map((r) => {
    if (!r.ok) throw new Error(r.error || 'เกิดข้อผิดพลาด');
    return r.data;
  });
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
