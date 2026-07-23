# Home Love — Frontend (React + Vite + PWA)

แอปฝั่งผู้ใช้ (เด็ก + ผู้ปกครอง) เป็น React SPA แบบ PWA responsive ภาษาไทย เรียก backend ผ่าน `VITE_API_URL`

## เริ่มพัฒนา

```bash
cd frontend
npm install
cp .env.example .env      # แล้วใส่ VITE_API_URL = Web app URL จาก Apps Script
npm run dev               # เปิด http://localhost:5173
```

## Build / Deploy (ฟรี)

```bash
npm run build             # ได้ไฟล์ static ใน dist/
```

- **Netlify / Vercel:** ชี้ที่โฟลเดอร์ `frontend`, build `npm run build`, publish `dist`, ตั้ง env `VITE_API_URL`
- **GitHub Pages:** ตั้ง `VITE_BASE=/<repo>/` ตอน build แล้ว deploy `dist/`

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

## ไอคอน PWA
มีไฟล์ `public/icon-192.png`, `public/icon-512.png` (หัวใจสีชมพู, ใช้เป็น maskable ด้วย) และ `public/favicon.svg` ให้แล้ว — ติดตั้งเป็นแอปได้สวยงาม
