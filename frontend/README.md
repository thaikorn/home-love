# Home Love — Frontend (React + Vite)

แอปฝั่งผู้ใช้ (เด็ก + ผู้ปกครอง) เป็น React SPA responsive ภาษาไทย เรียก backend ผ่าน `VITE_API_URL`

## เริ่มพัฒนา

```bash
cd frontend
npm install
cp .env.example .env      # แล้วใส่ VITE_API_URL = Web app URL จาก Apps Script
npm run dev               # เปิด http://localhost:5173
```

## Build / Deploy

Build เป็น**ไฟล์เดียว** (`vite-plugin-singlefile` inline JS/CSS ทั้งหมดเข้า `dist/index.html`)
แล้ว sync เข้า Apps Script serve ผ่าน HTML Service — ไม่มี hosting แยกอีกต่อไป
(ดู [`../apps-script/README.md`](../apps-script/README.md), `npm run redeploy`)

```bash
npm run build             # ได้ dist/index.html ไฟล์เดียว (inline หมด)
```

> ⚠️ ตัด PWA (`vite-plugin-pwa`) ออกแล้ว — service worker ใช้ไม่ได้ในหน้าที่ Apps Script
> serve เพราะ render อยู่ใน sandboxed iframe คนละ origin กับหน้าเปลือก

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/api.js` | เรียก backend + ย่อรูปเป็น data URL |
| `src/App.jsx` | จัดการ session/routing (login / เด็ก / ผู้ปกครอง) |
| `src/components.jsx` | Toast, Modal, Loading, StatusChip |
| `src/screens/Login.jsx` | เลือกเด็ก+PIN / ล็อกอินผู้ปกครอง |
| `src/screens/ChildApp.jsx` | หน้าเด็ก: หลัก/ทำงาน/สถานะ/ร้านรางวัล/อธิษฐาน |
| `src/screens/ParentApp.jsx` | ผู้ปกครอง: ตรวจงาน/แลกของ/อธิษฐาน/แต้ม+ปรับแต้ม |
| `src/screens/ParentSettings.jsx` | CRUD เด็ก/งาน/รางวัล/ช่วงเวลา |

## ไอคอน (เหลือไว้เผื่อใช้ในอนาคต)
มีไฟล์ `public/icon-192.png`, `public/icon-512.png`, `public/favicon.svg` อยู่ แต่ Apps Script
ไม่ serve static asset จาก path อื่นนอกจาก `doGet` — ตอนนี้จึงไม่ได้ถูกใช้งานจริง
