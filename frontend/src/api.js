// api.js — ตัวเรียก backend (Apps Script Web App)
// ส่ง POST เป็น text/plain เพื่อเลี่ยง CORS preflight; token แนบใน body

const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = 'homelove_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// เรียก action -> คืน data (โยน error ถ้า ok:false)
export async function call(action, params = {}) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_API_URL');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: getToken(), params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json.data;
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
