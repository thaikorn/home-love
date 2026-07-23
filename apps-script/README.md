# Home Love — Backend (Google Apps Script)

Backend API สำหรับแอปงานบ้านเก็บแต้ม รันบน Google Apps Script โดยใช้ Google Sheet เป็นฐานข้อมูล, Google Drive เก็บรูป, Gmail ส่งอีเมล

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `appsscript.json` | manifest (เขตเวลา Asia/Bangkok, web app config) |
| `Schema.gs` | นิยามตาราง/คอลัมน์/ค่า default (แหล่งความจริงเดียว) |
| `Db.gs` | ชั้นเข้าถึงข้อมูลบน Sheet (CRUD ทั่วไป) |
| `Setup.gs` | สร้าง tab + seed ค่าเริ่มต้น + สร้างผู้ปกครอง |
| `Auth.gs` | ล็อกอิน PIN เด็ก / user+pass ผู้ปกครอง + session token |
| `Time.gs` | ตรรกะช่วงเวลา (เปิด/cutoff) |
| `Points.gs` | สูตรแต้ม / สตรีค / เหรียญ / ปรับแต้มมือ |
| `Drive.gs` | อัปโหลดรูปขึ้น Drive |
| `Mail.gs` | อีเมลแจ้งเตือนผู้ปกครอง |
| `Actions.gs` | action ฝั่งเด็ก/ผู้ปกครอง (ส่งงาน ตรวจงาน แลกของ ฯลฯ) |
| `Crud.gs` | ตั้งค่า CRUD เด็ก/งาน/รางวัล/ช่วงเวลา |
| `Code.gs` | จุดเข้า doGet/doPost + router |

> **Sheet ID ของโปรเจกต์นี้** ถูกฝังเป็นค่าเริ่มต้นไว้แล้วใน `Setup.gs` (`DEFAULT_SHEET_ID`)
> = `1syFvYW4s5exaT1pI7tWf4PS29hLri9SQKsua_Bcbua8` — เปลี่ยนได้ถ้าต้องการใช้ Sheet อื่น

## Deploy อัตโนมัติด้วย clasp (แนะนำ)

```bash
cd apps-script
npm install            # ติดตั้ง clasp
npm run login          # เปิดเบราว์เซอร์ให้ล็อกอิน Google (ครั้งเดียว)
npm run create         # สร้าง Apps Script project + ไฟล์ .clasp.json
npm run push           # อัปโหลดโค้ด .gs ทั้งหมดขึ้น project

# ครั้งแรก: เปิด project ไปตั้งค่าและรันฟังก์ชัน
npm run open
#   ในหน้า editor: รัน initProperties() → setup() → createParent("admin","รหัสผ่าน","email")
#   (ไม่บังคับ) seedDemo()  — ใส่ข้อมูลตัวอย่าง (PIN เด็ก = 1234)

# deploy เป็น Web app (คง URL เดิมทุกครั้งที่ redeploy)
npm run redeploy       # = push โค้ด + สร้าง/อัปเดต deployment เดียวกัน
```

- ครั้งแรกต้องเข้าไปที่ **Deploy → New deployment → Web app** (Execute as: Me, Access: Anyone)
  แล้วคัดลอก **Web app URL** ไปใส่ `frontend/.env` (`VITE_API_URL`)
- `npm run redeploy` เก็บ deploymentId ไว้ใน `.clasp-deployment.json` เพื่อให้ URL ไม่เปลี่ยน

## Deploy แบบมือ (ถ้าไม่ใช้ clasp)

1. สร้าง Sheet (หรือใช้ ID ด้านบน) → [script.google.com](https://script.google.com) → New project → วางไฟล์ `.gs` ทั้งหมด
2. รัน `initProperties()` (ตั้ง `SHEET_ID` + `SECRET` ให้อัตโนมัติ) → `setup()` → `createParent(...)`
3. Deploy → New deployment → Web app (Execute as **Me**, Access **Anyone**) → คัดลอก URL

### Script Properties ที่เกี่ยวข้อง
| Property | ค่า |
|---|---|
| `SHEET_ID` | ตั้งอัตโนมัติจาก `DEFAULT_SHEET_ID` โดย `initProperties()`/`setup()` |
| `SECRET` | สร้างอัตโนมัติ (salt ของ hash) — **ห้ามเปลี่ยนภายหลัง** |
| `DRIVE_FOLDER_ID` | (ไม่บังคับ) โฟลเดอร์เก็บรูป — เว้นว่างจะสร้าง `HomeLove-Photos` ให้ |

> ทุกครั้งที่แก้โค้ดแล้วอยากให้ URL เดิมได้โค้ดใหม่: ใช้ `npm run redeploy` หรือ Manage deployments → แก้ version

## รูปแบบ API

**POST** (body เป็น JSON, `Content-Type: text/plain` เพื่อเลี่ยง CORS preflight):
```json
{ "action": "child.submit", "token": "<session token>", "params": { ... } }
```
ตอบกลับ: `{ "ok": true, "data": ... }` หรือ `{ "ok": false, "error": "..." }`

**GET** `?action=ping` = health check, `?action=children` = รายชื่อเด็กสาธารณะ

### Action หลัก
- `auth.childList`, `auth.loginChild {childId,pin}`, `auth.loginParent {username,password}`, `auth.me`, `auth.logout`
- เด็ก: `child.state`, `child.chores`, `child.submit {choreId,timeWindowId,photo,teamMemberIds}`, `child.submissions`, `child.rewards`, `child.redeem {rewardId}`, `child.redemptions`, `child.wish {text}`
- ผู้ปกครอง (ตรวจงาน/แลก/wish): `parent.reviewQueue`, `parent.approve {submissionId,quality}`, `parent.reject {submissionId,reason}`, `parent.adjustPoints {childId,delta,reason}`, `parent.adjustments`, `parent.redemptionQueue`, `parent.approveRedeem`, `parent.rejectRedeem`, `parent.wishes`, `parent.convertWish`, `parent.closeWish`, `parent.report`
- ผู้ปกครอง (ตั้งค่า CRUD): `parent.children.*`, `parent.chores.*`, `parent.rewards.*`, `parent.timewindows.*` (`.list/.create/.update/.delete`)

## ข้อควรรู้
- โควตา Apps Script (อีเมล/วัน, เวลา execution) เพียงพอสำหรับครอบครัวเดียว
- รูปใน Drive ตั้ง sharing แบบ "ใครมีลิงก์เปิดดูได้" (ไม่ public ทั้งอินเทอร์เน็ต แต่ลิงก์เดาไม่ได้)
- แต้ม/สตรีค/PIN คำนวณและเก็บฝั่ง backend เท่านั้น
