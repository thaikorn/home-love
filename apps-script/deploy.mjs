// deploy.mjs — deploy Apps Script web app โดยคง "deployment เดิม" ไว้
// เพื่อให้ Web app URL ไม่เปลี่ยนทุกครั้งที่ deploy
// ใช้ผ่าน: npm run redeploy  (จะ push โค้ดก่อน แล้วเรียกไฟล์นี้)
//
// เก็บ deploymentId ไว้ในไฟล์ .clasp-deployment.json (อย่า commit)

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const STORE = '.clasp-deployment.json';
const desc = `deploy ${new Date().toISOString()}`;

function run(cmd) {
  console.log('> ' + cmd);
  return execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
}

let deploymentId = null;
if (existsSync(STORE)) {
  try { deploymentId = JSON.parse(readFileSync(STORE, 'utf8')).deploymentId; } catch { /* ignore */ }
}

let out;
if (deploymentId) {
  // อัปเดต deployment เดิม → URL คงเดิม
  out = run(`clasp deploy -i ${deploymentId} -d "${desc}"`);
} else {
  // ครั้งแรก: สร้าง deployment ใหม่ แล้วจำ id ไว้
  out = run(`clasp deploy -d "${desc}"`);
  const m = out.match(/-\s*(AKfyc\S+)\s*@/);
  if (m) {
    deploymentId = m[1];
    writeFileSync(STORE, JSON.stringify({ deploymentId }, null, 2));
    console.log('บันทึก deploymentId ลง ' + STORE + ' แล้ว');
  } else {
    console.warn('อ่าน deploymentId จากผลลัพธ์ไม่ได้ — ครั้งหน้าจะสร้าง deployment ใหม่');
  }
}
console.log(out);
console.log('เสร็จ — ดู Web app URL ด้วย `clasp open` แล้วไปที่ Deploy > Manage deployments');
