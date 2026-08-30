// sync-frontend.mjs — คัดลอก frontend build (ไฟล์เดียว, inline หมดโดย vite-plugin-singlefile)
// เข้ามาเป็น Index.html ใน apps-script/ เพื่อให้ clasp push ขึ้น Apps Script แล้ว
// Code.gs#doGet serve ผ่าน HtmlService.createHtmlOutputFromFile('Index')
//
// พร้อมกันนั้นก็ปั๊ม "build id" ของ bundle ชุดนี้ลงสองที่ให้ตรงกัน:
//   - Index.html  -> window.__BUILD_ID__  (หน้าเว็บรู้ว่าตัวเองเป็นโค้ดชุดไหน)
//   - Version.gs  -> BUILD_ID             (backend ติดไปกับทุก response, ดู json_ ใน Code.gs)
// หน้าเว็บที่เปิดค้างไว้ข้ามรอบ deploy จะเห็นสองค่านี้ไม่ตรงกัน แล้วรีโหลดตัวเอง
// (ดู noteBuild_ ใน frontend/src/api.js) — เด็กๆ ไม่มีทางรู้เองว่าต้องปิดแอปเปิดใหม่
//
// ใช้ผ่าน: npm run sync  (รันหลัง frontend build เสร็จ)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const src = resolve('../frontend/dist/index.html');
const dest = resolve('./Index.html');
const versionDest = resolve('./Version.gs');

if (!existsSync(src)) {
  console.error(`ไม่พบ ${src} — ต้อง build frontend ก่อน (cd ../frontend && npm run build)`);
  process.exit(1);
}

const html = readFileSync(src, 'utf8');

// id จาก hash ของ bundle ไม่ใช่เวลา — sync ซ้ำโดยโค้ดไม่เปลี่ยน id ต้องเท่าเดิม
// ไม่งั้นแอปจะเด้ง "มีเวอร์ชันใหม่" ใส่เด็กทั้งที่ไม่มีอะไรใหม่จริง
const buildId = createHash('sha1').update(html).digest('hex').slice(0, 10);

const tag = `<script>window.__BUILD_ID__=${JSON.stringify(buildId)};</script>`;
const stamped = html.includes('<head>') ? html.replace('<head>', `<head>${tag}`) : tag + html;

writeFileSync(dest, stamped);
writeFileSync(versionDest, `// Version.gs — สร้างอัตโนมัติโดย sync-frontend.mjs ห้ามแก้ด้วยมือ
// build id ของ Index.html ชุดที่ push ขึ้นไปพร้อมกัน (ดูหัวไฟล์ sync-frontend.mjs)
const BUILD_ID = ${JSON.stringify(buildId)};
`);

console.log(`คัดลอก ${src} -> ${dest} แล้ว (build ${buildId})`);
