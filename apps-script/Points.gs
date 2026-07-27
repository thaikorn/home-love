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

/**
 * อ่านคอลัมน์ awards ("chd_x:12,chd_y:8") เป็น { childId: points }
 * คืน null ถ้าว่างหรืออ่านไม่ได้ — ผู้เรียกจะได้ถอยไปใช้ pointsPerPerson แทน
 * (งานที่อนุมัติไปก่อนจะมีคอลัมน์นี้ย่อมว่างเปล่า)
 */
function parseAwards_(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const out = {};
  let ok = false;
  s.split(',').forEach(function (part) {
    const i = part.lastIndexOf(':');
    if (i <= 0) return;
    const cid = part.slice(0, i).trim();
    const pts = Number(part.slice(i + 1));
    if (!cid || isNaN(pts)) return;
    out[cid] = (out[cid] || 0) + pts;
    ok = true;
  });
  return ok ? out : null;
}

/** แต้มที่เด็กคนนี้ได้รับจริงจากงานชิ้นนี้ (รวมโบนัสสตรีคของเขาเอง) */
function awardFor_(sub, childId) {
  const awards = parseAwards_(sub.awards);
  if (awards) return Number(awards[String(childId)]) || 0;
  return Number(sub.pointsPerPerson) || 0;  // งานเก่า — มีแค่ยอดกลาง
}

/**
 * XP สะสมของเด็ก = แต้มที่ "หามาได้" ตลอดกาล (งานที่ผ่าน + การปรับแต้มฝั่งบวก)
 * ไม่ใช่แต้มคงเหลือ — แลกของรางวัลแล้วเลเวลต้องไม่ลดลง
 */
function childXp_(childId) {
  let xp = 0;
  where_(TAB.Submissions, function (x) {
    return x.status === SUB_STATUS.APPROVED &&
      (String(x.submittedBy) === String(childId) || toArr_(x.teamMembers).indexOf(String(childId)) >= 0);
  }).forEach(function (x) { xp += awardFor_(x, childId); });
  where_(TAB.PointAdjustments, function (a) { return String(a.childId) === String(childId); })
    .forEach(function (a) { const d = Number(a.delta) || 0; if (d > 0) xp += d; });
  return xp;
}

// ยศตามเลเวล — ใช้ยศสูงสุดที่ถึงแล้ว
const TITLES = [
  { lv: 1, name: 'ผู้ฝึกหัด', ic: '🥚' },
  { lv: 3, name: 'เด็กขยัน', ic: '🐣' },
  { lv: 5, name: 'นักรบบ้าน', ic: '🗡️' },
  { lv: 8, name: 'จ่าฝูง', ic: '🛡️' },
  { lv: 12, name: 'อัศวินงานบ้าน', ic: '⚔️' },
  { lv: 18, name: 'แม่ทัพ', ic: '👑' },
  { lv: 25, name: 'ตำนานบ้านนี้', ic: '🐉' },
];
function titleForLevel_(level) {
  let t = TITLES[0];
  TITLES.forEach(function (x) { if (level >= x.lv) t = x; });
  return t;
}

// เลเวลจาก XP — ทุก xpPerLevel แต้ม = 1 เลเวล
function levelFromXp_(xp, cfg) {
  const per = Math.max(1, parseInt((cfg && cfg.xpPerLevel) || '200', 10));
  const total = Math.max(0, Number(xp) || 0);
  const level = Math.floor(total / per) + 1;
  const title = titleForLevel_(level);
  return {
    level: level,
    xp: total,
    xpInLevel: total - (level - 1) * per,
    xpForLevel: per,
    xpToNext: level * per - total,
    nextLevelAt: level * per,
    title: title.name,
    titleIcon: title.ic,
  };
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
// ถ้าขาดไป 1 วันแต่มีโล่ 🛡️ จะใช้โล่กันสตรีคขาดให้อัตโนมัติ
function bumpStreak_(child, todayStr, cfg) {
  const last = toDateStr_(child.lastStreakDate); // อาจถูก Sheet แปลงเป็น Date มาก่อน
  if (last === todayStr) return { child: child, newBadges: [], shieldUsed: false }; // วันนี้ได้สตรีคแล้ว

  const yesterday = addDaysStr_(todayStr, -1);
  const dayBefore = addDaysStr_(todayStr, -2);
  let cur = Number(child.streakCurrent) || 0;
  let shields = Number(child.shields) || 0;
  let shieldUsed = false;

  if (last === yesterday) {
    cur = cur + 1;
  } else if (last === dayBefore && shields > 0) {
    cur = cur + 1; shields -= 1; shieldUsed = true;   // ขาดไปวันเดียว — ใช้โล่กันไว้
  } else {
    cur = 1;
  }
  const max = Math.max(Number(child.streakMax) || 0, cur);

  const patch = { streakCurrent: cur, streakMax: max, lastStreakDate: todayStr };
  if (shieldUsed) patch.shields = shields;
  update_(TAB.Children, child.id, patch);

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
  return {
    child: Object.assign({}, child, { streakCurrent: cur, streakMax: max, lastStreakDate: todayStr, shields: shields }),
    newBadges: newBadges,
    shieldUsed: shieldUsed,
  };
}

// ============ ภารกิจประจำวัน / บอสประจำสัปดาห์ ============

// เคยแจกรางวัลรอบนี้ให้เด็กคนนี้แล้วหรือยัง
function questAwarded_(childId, kind, periodKey) {
  return where_(TAB.Quests, function (q) {
    return String(q.childId) === String(childId) && String(q.kind) === kind &&
      String(q.periodKey) === String(periodKey);
  }).length > 0;
}

function recordQuest_(childId, kind, periodKey, points) {
  insert_(TAB.Quests, {
    id: newId_('qst'), childId: childId, kind: kind, periodKey: periodKey,
    points: points, awardedAt: new Date().toISOString(),
  });
}

// จำนวนงานที่ "ผ่าน" ของเด็กคนนี้ในวันที่กำหนด
function approvedCountOn_(childId, dateStr) {
  return where_(TAB.Submissions, function (x) {
    if (x.status !== SUB_STATUS.APPROVED) return false;
    if (String(x.submittedBy) !== String(childId) &&
        toArr_(x.teamMembers).indexOf(String(childId)) < 0) return false;
    return Utilities.formatDate(new Date(toIso_(x.submittedAt)), TZ_(), 'yyyy-MM-dd') === dateStr;
  }).length;
}

// สถานะภารกิจประจำวันของเด็ก
function dailyQuestState_(childId, dateStr, cfg) {
  const target = Math.max(1, parseInt(cfg.dailyQuestTarget || '3', 10));
  const bonus = Math.max(0, parseInt(cfg.dailyQuestBonus || '0', 10));
  const done = approvedCountOn_(childId, dateStr);
  return {
    target: target, bonus: bonus, done: Math.min(done, target),
    claimed: questAwarded_(childId, 'daily', dateStr),
  };
}

// แจกโบนัสภารกิจประจำวันถ้าครบเป้าและยังไม่เคยได้ — คืนแต้มที่แจก (0 = ไม่แจก)
function awardDailyQuest_(childId, dateStr, cfg) {
  const st = dailyQuestState_(childId, dateStr, cfg);
  if (st.done < st.target || st.claimed || st.bonus <= 0) return 0;
  addPoints_(childId, st.bonus, false);
  recordQuest_(childId, 'daily', dateStr, st.bonus);
  return st.bonus;
}

// วันที่ของ cell เป็น yyyy-MM-dd ตามโซนเวลาบ้าน — คืน '' ถ้าอ่านไม่ออก/ว่าง
// (ห้ามโยน new Date('') เข้า formatDate ตรงๆ มันจะพังทั้งคำขอ)
function dateStrOf_(v) {
  const iso = toIso_(v);
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TZ_(), 'yyyy-MM-dd');
}

// แต้มรวมของเด็กทุกคนในสัปดาห์ (กระดานผู้นำ)
function weekPointsByChild_(mondayStr) {
  return periodPointsByChild_(mondayStr, addDaysStr_(mondayStr, 7));
}

// แต้มรวมของเด็กทุกคนในช่วง [fromStr, untilStr) — ใช้ทั้งกระดานผู้นำและ "ดาเมจ" ใส่บอส
// นับทั้งงานที่ผ่านการตรวจ และแต้มที่ผู้ปกครองปรับเองในช่วงนั้น
// (ถ้าไม่นับการปรับแต้ม ผู้ปกครองแก้แต้มให้เด็กแล้วกระดานจะไม่ขยับตาม)
function periodPointsByChild_(fromStr, untilStr) {
  const byChild = {};
  const inWeek = function (v) {
    const d = dateStrOf_(v);
    return d && d >= fromStr && d < untilStr;
  };
  where_(TAB.Submissions, function (x) { return x.status === SUB_STATUS.APPROVED; })
    .forEach(function (x) {
      if (!inWeek(x.submittedAt)) return;
      // ยอดรายคนถ้ามี (รวมโบนัสสตรีคที่แต่ละคนได้ไม่เท่ากัน) ไม่งั้นถอยไปใช้ยอดกลาง
      const awards = parseAwards_(x.awards);
      if (awards) {
        Object.keys(awards).forEach(function (cid) { byChild[cid] = (byChild[cid] || 0) + awards[cid]; });
        return;
      }
      const pts = Number(x.pointsPerPerson) || 0;
      toArr_(x.teamMembers).forEach(function (cid) { byChild[cid] = (byChild[cid] || 0) + pts; });
    });
  readAll_(TAB.PointAdjustments).forEach(function (a) {
    if (!inWeek(a.createdAt)) return;
    byChild[String(a.childId)] = (byChild[String(a.childId)] || 0) + (Number(a.delta) || 0);
  });
  // หักแต้มจนติดลบแล้วอย่าให้กระดานโชว์ค่าติดลบ
  Object.keys(byChild).forEach(function (k) { if (byChild[k] < 0) byChild[k] = 0; });
  return byChild;
}

// ============ บอสประจำเดือน ============
// 3 ตัวเรียงกันในหนึ่งเดือน: ล้มตัวที่ 1 ตัวที่ 2 ถึงจะโผล่ ล้มครบแล้วจบเดือน
// ดาเมจ = แต้มที่ทุกคนในบ้านทำได้รวมกันตั้งแต่วันที่ 1 ของเดือน (สะสมต่อเนื่อง ไม่รีเซ็ตรายตัว)
const BOSS_SLOTS = [1, 2, 3];

// อ่านค่าบอสทั้ง 3 ตัวจาก Config (ตัวที่ไม่ได้ตั้งชื่อไว้ = ไม่ใช้)
function bossList_(cfg) {
  const out = [];
  BOSS_SLOTS.forEach(function (i) {
    const name = String(cfg['boss' + i + 'Name'] || '').trim();
    if (!name) return;
    out.push({
      slot: i, name: name,
      emoji: String(cfg['boss' + i + 'Emoji'] || '👹').trim() || '👹',
      target: Math.max(1, parseInt(cfg['boss' + i + 'Target'], 10) || 1),
      reward: Math.max(0, parseInt(cfg['boss' + i + 'Reward'], 10) || 0),
    });
  });
  return out;
}

// ดาเมจรวมของทั้งบ้านในเดือนที่มี dateStr
function monthDamage_(dateStr) {
  const byChild = periodPointsByChild_(monthStartOf_(dateStr), nextMonthStart_(dateStr));
  let total = 0;
  Object.keys(byChild).forEach(function (k) { total += byChild[k]; });
  return total;
}

/**
 * สถานะบอสของเดือนนั้น
 * คืนทั้งรายการ 3 ตัว (bosses) และตัวที่กำลังสู้อยู่ (current)
 * ฟิลด์ระดับบนสุด (name/emoji/target/damage/…) = ตัวที่กำลังสู้ เพื่อให้หน้าจอเดิมใช้ได้เหมือนเดิม
 */
function bossState_(dateStr, cfg) {
  const list = bossList_(cfg);
  const month = String(dateStr).slice(0, 7);
  const total = monthDamage_(dateStr);
  let left = total;
  const bosses = list.map(function (b) {
    const dealt = Math.min(left, b.target);   // ดาเมจไหลลงตัวถัดไปเมื่อตัวก่อนหน้าล้มแล้ว
    left = Math.max(0, left - b.target);
    return {
      slot: b.slot, name: b.name, emoji: b.emoji, target: b.target, reward: b.reward,
      damage: dealt, hpLeft: b.target - dealt,
      percent: Math.min(100, Math.round((dealt / b.target) * 100)),
      defeated: dealt >= b.target,
    };
  });
  let current = null;
  for (let i = 0; i < bosses.length; i++) { if (!bosses[i].defeated) { current = bosses[i]; break; } }
  const allDefeated = bosses.length > 0 && !current;
  const show = current || bosses[bosses.length - 1] || null;
  if (!show) return null;   // ผู้ปกครองปิดบอสทั้งหมด (ไม่ได้ตั้งชื่อไว้สักตัว)
  return {
    month: month, monthStart: monthStartOf_(dateStr), monthDamage: total,
    bosses: bosses, index: show.slot, count: bosses.length, allDefeated: allDefeated,
    name: show.name, emoji: show.emoji, target: show.target, reward: show.reward,
    damage: show.damage, hpLeft: show.hpLeft, percent: show.percent, defeated: show.defeated,
  };
}

// ล้มบอสตัวไหนสำเร็จ → แจกรางวัลของตัวนั้นให้เด็กที่ยังเปิดใช้งานทุกคน
// (ครั้งเดียวต่อบอสต่อเดือนต่อคน — คีย์รอบคือ 'yyyy-MM')
function awardBossIfDefeated_(dateStr, cfg) {
  const st = bossState_(dateStr, cfg);
  if (!st) return [];
  const winners = [];
  const kids = where_(TAB.Children, function (c) { return toBool_(c.active); });
  st.bosses.forEach(function (b) {
    if (!b.defeated || b.reward <= 0) return;
    kids.forEach(function (c) {
      if (questAwarded_(c.id, 'boss' + b.slot, st.month)) return;
      addPoints_(c.id, b.reward, false);
      recordQuest_(c.id, 'boss' + b.slot, st.month, b.reward);
      winners.push({ id: c.id, name: c.name, points: b.reward, bossName: b.name, bossEmoji: b.emoji });
    });
  });
  return winners;
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
