/**
 * Points.gs — สูตรแต้ม, สตรีค, เหรียญ, และปรับแต้มด้วยมือ
 * ทุกฟังก์ชันที่เปลี่ยนแต้มจะถูกเรียกภายใต้ LockService (ดู Actions.gs)
 */

/**
 * ตัวคูณของช่วงเวลาสำหรับวันนั้นๆ (dow 1=จันทร์..7=อาทิตย์)
 * bonusDays ว่าง = คูณทุกวันที่ช่วงเวลาเปิด, ถ้าระบุ = คูณเฉพาะวันที่ระบุ
 */
function windowMultiplierFor_(tw, dow) {
  const mult = Number(tw.bonusMultiplier) || 1;
  const bonusDays = toArr_(tw.bonusDays).map(Number);
  if (!bonusDays.length) return mult;
  return bonusDays.indexOf(Number(dow)) >= 0 ? mult : 1;
}

/**
 * โบนัส % จากการทำต่อเนื่อง (สตรีค) แบบขั้นบันได — ใช้ขั้นสูงสุดที่ถึงแล้ว
 * เช่น '3:10,7:20,14:30,30:50' → สตรีค 8 วัน = +20%
 */
function streakBonusPct_(streak, cfg) {
  const s = Number(streak) || 0;
  let pct = 0;
  String((cfg && cfg.streakBonusTiers) || '').split(',').forEach(function (part) {
    const kv = part.split(':');
    const days = parseInt(kv[0], 10);
    const p = parseFloat(kv[1]);
    if (!isNaN(days) && !isNaN(p) && s >= days && p > pct) pct = p;
  });
  return pct;
}

// สูตรคำนวณแต้ม (6.1) — คืนจำนวนเต็ม (ปัดลง) ต่อคน "ก่อน" โบนัสสตรีคซึ่งเป็นของแต่ละคน
function computePoints_(chore, tw, quality, onTime, teamSize, cfg, dow) {
  const latePct = configNum_(cfg, 'latePercent') / 100;   // 0.60
  const teamPct = configNum_(cfg, 'teamPercent') / 100;   // 0.70
  const base = Number(chore.basePoints) || 0;
  const q = Math.max(0, Math.min(100, Number(quality))) / 100;
  const timeMult = onTime ? 1.0 : latePct;
  const bonus = windowMultiplierFor_(tw, dow);
  const teamShare = teamSize > 1 ? teamPct : 1.0;
  return Math.floor(base * q * timeMult * bonus * teamShare);
}

// แต้มของเด็กคนหนึ่งหลังบวกโบนัสสตรีคของเขาเอง
function applyStreakBonus_(basePoints, streak, cfg) {
  const pct = streakBonusPct_(streak, cfg);
  return { points: Math.floor(basePoints * (1 + pct / 100)), percent: pct };
}

// เพิ่มแต้มให้เด็ก (delta อาจติดลบ) — ไม่ให้ต่ำกว่า 0 ถ้า enforceFloor=true
function addPoints_(childId, delta, enforceFloor) {
  const child = findById_(TAB.Children, childId);
  if (!child) throw new Error('ไม่พบเด็ก ' + childId);
  const cur = Number(child.points) || 0;
  let next = cur + delta;
  if (enforceFloor && next < 0) {
    throw new Error('แต้มไม่พอ: คงเหลือ ' + cur + ' หักไม่ได้ ' + Math.abs(delta));
  }
  if (next < 0) next = 0;
  update_(TAB.Children, childId, { points: next });
  return next;
}

// อัปเดตสตรีค+มอบเหรียญ เมื่ออนุมัติงาน "งานแรกของวัน" (6.4)
function bumpStreak_(child, todayStr, cfg) {
  const last = toDateStr_(child.lastStreakDate); // อาจถูก Sheet แปลงเป็น Date มาก่อน
  if (last === todayStr) return { child: child, newBadges: [] }; // วันนี้ได้สตรีคแล้ว

  const yesterday = Utilities.formatDate(
    new Date(new Date(todayStr + 'T00:00:00').getTime() - 86400000),
    TZ_(), 'yyyy-MM-dd'
  );
  let cur = Number(child.streakCurrent) || 0;
  cur = (last === yesterday) ? cur + 1 : 1;
  const max = Math.max(Number(child.streakMax) || 0, cur);

  update_(TAB.Children, child.id, { streakCurrent: cur, streakMax: max, lastStreakDate: todayStr });

  // มอบเหรียญตามเกณฑ์ (กันซ้ำ)
  const thresholds = String(cfg.streakBadges).split(',').map(function (s) { return parseInt(s.trim(), 10); });
  const owned = {};
  where_(TAB.Badges, function (b) { return String(b.childId) === String(child.id); })
    .forEach(function (b) { owned[b.kind] = true; });
  const newBadges = [];
  thresholds.forEach(function (t) {
    const kind = 'streak-' + t;
    if (cur >= t && !owned[kind]) {
      insert_(TAB.Badges, { id: newId_('bdg'), childId: child.id, kind: kind, awardedAt: new Date().toISOString() });
      newBadges.push(kind);
    }
  });
  return { child: Object.assign({}, child, { streakCurrent: cur, streakMax: max, lastStreakDate: todayStr }), newBadges: newBadges };
}

// ปรับแต้มด้วยมือ (6.8) — บังคับเหตุผล, ห้ามติดลบ, บันทึกลง PointAdjustments
function adjustPoints_(childId, delta, reason, parentId) {
  const d = parseInt(delta, 10);
  if (isNaN(d) || d === 0) throw new Error('delta ต้องเป็นจำนวนเต็มที่ไม่ใช่ 0');
  if (!reason || !String(reason).trim()) throw new Error('ต้องระบุเหตุผลทุกครั้ง');
  const child = findById_(TAB.Children, childId);
  if (!child) throw new Error('ไม่พบเด็ก');
  const next = addPoints_(childId, d, true); // enforce floor >= 0
  insert_(TAB.PointAdjustments, {
    id: newId_('adj'), childId: childId, delta: d,
    reason: String(reason).trim(), adjustedBy: parentId, createdAt: new Date().toISOString(),
  });
  return { points: next, delta: d };
}
