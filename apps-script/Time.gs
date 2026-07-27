/**
 * Time.gs — ตรรกะช่วงเวลา (Time Windows) ตามเขตเวลา Asia/Bangkok
 */

function TZ_() { return getConfig_().timezone || 'Asia/Bangkok'; }

// คืน {date:'yyyy-MM-dd', hm:'HH:mm', dow:1..7(จันทร์=1), ts:Date} ของ "ตอนนี้"
function now_() {
  const tz = TZ_();
  const d = new Date();
  const date = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const hm = Utilities.formatDate(d, tz, 'HH:mm');
  // getDay: 0=อาทิตย์..6=เสาร์ -> แปลงเป็น 1=จันทร์..7=อาทิตย์
  const jsDow = parseInt(Utilities.formatDate(d, tz, 'u'), 10); // 'u' = 1..7 (จันทร์..อาทิตย์)
  return { date: date, hm: hm, dow: jsDow, ts: d };
}

// รับได้ทั้ง 'HH:mm', Date (ที่ Sheet แปลงไปแล้ว) และตัวเลขเศษของวัน — คืนจำนวนนาทีจากเที่ยงคืน
function hmToMin_(hm) {
  const parts = toHm_(hm).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return NaN;
  return h * 60 + (isNaN(m) ? 0 : m);
}

// ช่วงเวลานี้เปิดอยู่ตอนนี้ไหม (วันตรง + เวลาอยู่ในช่วง)
function isWindowOpenNow_(tw, ref) {
  if (!toBool_(tw.active)) return false;
  ref = ref || now_();
  const days = toArr_(tw.days).map(Number);
  if (days.length && days.indexOf(ref.dow) < 0) return false;
  const cur = hmToMin_(ref.hm);
  return cur >= hmToMin_(tw.startTime) && cur < hmToMin_(tw.endTime);
}

// ส่งตอนนี้ยังทันก่อน cutoff ไหม (ได้แต้มเต็ม)
function isBeforeCutoff_(tw, ref) {
  ref = ref || now_();
  return hmToMin_(ref.hm) < hmToMin_(tw.cutoff);
}

// วันจันทร์ของสัปดาห์ที่มี dateStr ('yyyy-MM-dd') — ใช้เป็นคีย์รอบสัปดาห์ของบอส
function mondayOf_(dateStr) {
  const p = String(dateStr).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = จันทร์
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// วันที่ 1 ของเดือนที่มี dateStr — ใช้เป็นคีย์รอบเดือนของบอส
function monthStartOf_(dateStr) { return String(dateStr).slice(0, 7) + '-01'; }

// วันที่ 1 ของเดือนถัดไป (ขอบบนของรอบ ไม่รวมวันนี้)
function nextMonthStart_(dateStr) {
  const p = String(dateStr).split('-').map(Number);
  const y = p[0];
  const m = p[1] || 1;
  return (m >= 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01';
}

// วันก่อนหน้า n วันของ dateStr
function addDaysStr_(dateStr, n) {
  const p = String(dateStr).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// รายการช่วงเวลาที่เปิดอยู่ตอนนี้
function openWindowsNow_() {
  const ref = now_();
  return where_(TAB.TimeWindows, function (tw) { return isWindowOpenNow_(tw, ref); });
}
