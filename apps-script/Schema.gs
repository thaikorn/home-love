/**
 * Schema.gs — นิยามโครงสร้างตาราง (tabs) ของ Google Sheet ที่ใช้เป็นฐานข้อมูล
 * ลำดับคอลัมน์ในนี้คือ "แหล่งความจริงเดียว" (single source of truth)
 * ใช้ทั้งตอน setup สร้าง sheet และตอนอ่าน/เขียนข้อมูล
 */

// ชื่อ tab ทั้งหมด
const TAB = {
  Children: 'Children',
  Parents: 'Parents',
  TimeWindows: 'TimeWindows',
  Chores: 'Chores',
  Submissions: 'Submissions',
  Rewards: 'Rewards',
  Redemptions: 'Redemptions',
  Wishes: 'Wishes',
  Badges: 'Badges',
  PointAdjustments: 'PointAdjustments',
  Config: 'Config',
  Sessions: 'Sessions',
};

// หัวคอลัมน์ของแต่ละ tab (ลำดับสำคัญ)
const SCHEMA = {
  Children: [
    'id', 'name', 'avatar', 'color', 'pinHash',
    'points', 'streakCurrent', 'streakMax', 'lastStreakDate', 'active',
  ],
  Parents: [
    'id', 'username', 'passwordHash', 'email',
  ],
  TimeWindows: [
    'id', 'name', 'startTime', 'endTime', 'cutoff', 'days', 'bonusMultiplier', 'active',
  ],
  Chores: [
    'id', 'name', 'icon', 'basePoints', 'timeWindowIds', 'active',
  ],
  Submissions: [
    'id', 'choreId', 'timeWindowId', 'submittedBy', 'teamMembers',
    'photoUrl', 'submittedAt', 'status', 'quality', 'rejectReason',
    'pointsPerPerson', 'reviewedBy', 'reviewedAt',
  ],
  Rewards: [
    'id', 'name', 'cost', 'limitDay', 'limitWeek', 'limitMonth', 'active',
  ],
  Redemptions: [
    'id', 'childId', 'rewardId', 'pointsReserved', 'status', 'requestedAt', 'decidedAt',
  ],
  Wishes: [
    'id', 'childId', 'text', 'createdAt', 'status',
  ],
  Badges: [
    'id', 'childId', 'kind', 'awardedAt',
  ],
  PointAdjustments: [
    'id', 'childId', 'delta', 'reason', 'adjustedBy', 'createdAt',
  ],
  Config: [
    'key', 'value',
  ],
  Sessions: [
    'token', 'role', 'refId', 'name', 'expiresAt',
  ],
};

// ค่า Config เริ่มต้น
const DEFAULT_CONFIG = {
  latePercent: '60',       // % แต้มเมื่อส่งสาย
  teamPercent: '70',       // % ส่วนแบ่งแต้มต่อคนเมื่อทำเป็นทีม
  timezone: 'Asia/Bangkok',
  language: 'th',
  streakBadges: '3,7,14,30',
  sessionHours: '720',     // อายุ session (ชั่วโมง) = 30 วัน
};

// สถานะต่างๆ
const SUB_STATUS = { PENDING: 'รอตรวจ', APPROVED: 'ผ่าน', REJECTED: 'ตีกลับ' };
const RED_STATUS = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติ', REJECTED: 'ปฏิเสธ' };
const WISH_STATUS = { NEW: 'ใหม่', CONVERTED: 'แปลงเป็นรางวัลแล้ว', CLOSED: 'ปิด' };
