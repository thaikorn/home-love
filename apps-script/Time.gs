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

function hmToMin_(hm) {
  const parts = String(hm).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
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

// รายการช่วงเวลาที่เปิดอยู่ตอนนี้
function openWindowsNow_() {
  const ref = now_();
  return where_(TAB.TimeWindows, function (tw) { return isWindowOpenNow_(tw, ref); });
}
