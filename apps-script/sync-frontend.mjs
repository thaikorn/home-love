// sync-frontend.mjs — คัดลอก frontend build (ไฟล์เดียว, inline หมดโดย vite-plugin-singlefile)
// เข้ามาเป็น Index.html ใน apps-script/ เพื่อให้ clasp push ขึ้น Apps Script แล้ว
// Code.gs#doGet serve ผ่าน HtmlService.createHtmlOutputFromFile('Index')
//
// ใช้ผ่าน: npm run sync  (รันหลัง frontend build เสร็จ)

import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve('../frontend/dist/index.html');
const dest = resolve('./Index.html');

if (!existsSync(src)) {
  console.error(`ไม่พบ ${src} — ต้อง build frontend ก่อน (cd ../frontend && npm run build)`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`คัดลอก ${src} -> ${dest} แล้ว`);
