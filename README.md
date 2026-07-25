# 💗 Home Love — แอปงานบ้านเก็บแต้มสำหรับครอบครัว

แอปช่วยสร้างวินัยและนิสัยรับผิดชอบงานบ้านให้ลูกๆ ผ่านระบบเกม:
เด็กเลือกทำงานบ้าน → ถ่ายรูปผลงาน → ผู้ปกครองตรวจให้คะแนน → ได้แต้ม/สตรีค/เหรียญ → เอาแต้มไปแลกของรางวัล

ครอบครัวเดียว · เขตเวลา `Asia/Bangkok` · UI ภาษาไทย · โฮสฟรี

## โครงสร้าง repo

```
docs/spec.md        เอกสาร requirements (v1.1)
apps-script/        Backend API + frontend hosting (Google Apps Script + Google Sheet + Drive + Gmail)
frontend/           React + Vite (ผู้ใช้เด็ก/ผู้ปกครอง) — build แล้ว serve ผ่าน Apps Script HTML Service
```

## เริ่มใช้งาน
1. ตั้งค่า backend ตาม [`apps-script/README.md`](apps-script/README.md) → ได้ Web app URL
   (deploy อัตโนมัติด้วย clasp: `cd apps-script && npm install && npm run login && npm run create && npm run redeploy`)
2. ตั้งค่า `frontend/.env` ตาม [`frontend/README.md`](frontend/README.md) ใส่ `VITE_API_URL` เป็น Web app URL เดียวกัน
   แล้ว `npm run redeploy` (build frontend + sync + push + deploy) — frontend กับ backend อยู่ URL เดียวกัน ไม่ต้อง host แยก

## Deploy อัตโนมัติ (GitHub Actions)
- workflow เดียว (`.github/workflows/deploy.yml`) — push `frontend/**` หรือ `apps-script/**.gs`/`appsscript.json`
  → build frontend (secret `VITE_API_URL`) → sync เข้า `apps-script/Index.html` → `clasp push` + `clasp deploy`
  (คง Web app URL เดิม)
  - repo secrets: **`CLASPRC_JSON`** (creds ของ clasp), **`CLASP_SCRIPT_ID`**, **`CLASP_DEPLOYMENT_ID`**, **`VITE_API_URL`**
  - deploy มือก็ได้: `cd apps-script && npm run redeploy`

> ⚠️ `CLASPRC_JSON` คือ OAuth token ของ Google — เก็บเป็น GitHub encrypted secret (ไม่ถูกเปิดให้ fork PR) ถ้าเพิกถอนสิทธิ์ให้รัน `clasp logout` แล้วลบ/ตั้ง secret ใหม่

## สถาปัตยกรรม
React SPA (static, ฟรี) → เรียก JSON API → Google Apps Script (auth, สูตรแต้ม, LockService) → Google Sheet (ฐานข้อมูล) / Drive (รูป) / Gmail (อีเมลผู้ปกครอง)

logic ตรวจ PIN/รหัสผ่านและคำนวณแต้มทั้งหมดอยู่ฝั่ง Apps Script — frontend ไม่ถือ secret และไม่คำนวณแต้มเอง

## ฟีเจอร์หลัก
- ล็อกอิน 2 โหมด: เด็ก (PIN 4 หลัก) / ผู้ปกครอง (user+password)
- ส่งงานพร้อมรูป, ทำเดี่ยว/จับคู่ทีม, กรองตามช่วงเวลา + cutoff
- คำนวณแต้ม: คุณภาพ × ตรงเวลา × โบนัสช่วงเวลา × ส่วนแบ่งทีม
- สตรีคต่อเนื่อง + เหรียญ 3/7/14/30 วัน
- ร้านของรางวัล + จองแต้ม + อนุมัติ/ปฏิเสธ (คืนแต้ม)
- คำอธิษฐาน → แปลงเป็นของรางวัล
- **ปรับแต้มด้วยมือ** (บวก/ลบ + เหตุผลบังคับ, ห้ามติดลบ)
- **CRUD เต็ม**: เด็ก/งาน/รางวัล/ช่วงเวลา (soft-delete เมื่อมีประวัติ)
- อีเมลแจ้งผู้ปกครองเมื่อมีงาน/คำขอแลก/คำอธิษฐานใหม่
