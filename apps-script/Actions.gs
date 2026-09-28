/**
 * Actions.gs — ตรรกะของแต่ละ action ที่ frontend เรียก
 * แยกตามบทบาท: child (เด็ก) / parent (ผู้ปกครอง)
 * action ที่แตะแต้ม/สถานะ ทำภายใต้ withLock_() เพื่อกัน race condition (6.7)
 */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

// ============ ส่วนที่ใช้ร่วม ============

// ประกอบข้อมูล dashboard เด็ก
function childState_(childId) {
  const child = findById_(TAB.Children, childId);
  if (!child) throw new Error('ไม่พบเด็ก');
  const cfg = getConfig_();
  const badges = where_(TAB.Badges, function (b) { return String(b.childId) === String(childId); })
    .map(function (b) { return { kind: b.kind, awardedAt: toIso_(b.awardedAt) }; });
  const streak = Number(child.streakCurrent) || 0;
  return {
    id: child.id, name: child.name, avatar: child.avatar, photo: child.photo || '', color: child.color,
    points: Number(child.points) || 0,
    level: levelFromXp_(childXp_(child.id), cfg),
    streakCurrent: streak,
    streakMax: Number(child.streakMax) || 0,
    streakBonusPercent: streakBonusPct_(streak, cfg),
    nextStreakTier: nextStreakTier_(streak, cfg), // {days, percent} หรือ null ถ้าถึงขั้นสูงสุดแล้ว
    shields: Number(child.shields) || 0,
    shieldCost: Math.max(0, parseInt(cfg.streakShieldCost || '0', 10)),
    shieldMax: Math.max(0, parseInt(cfg.streakShieldMax || '0', 10)),
    dailyQuest: dailyQuestState_(child.id, now_().date, cfg),
    boss: bossState_(now_().date, cfg),
    badges: badges,
  };
}

// ขั้นโบนัสสตรีคขั้นถัดไปที่ยังไม่ถึง (ไว้บอกเด็กว่าอีกกี่วันได้เพิ่ม)
function nextStreakTier_(streak, cfg) {
  const s = Number(streak) || 0;
  let best = null;
  String((cfg && cfg.streakBonusTiers) || '').split(',').forEach(function (part) {
    const kv = part.split(':');
    const days = parseInt(kv[0], 10);
    const pct = parseFloat(kv[1]);
    if (isNaN(days) || isNaN(pct) || days <= s) return;
    if (!best || days < best.days) best = { days: days, percent: pct };
  });
  return best;
}

// งานที่เด็กทำได้ตอนนี้ (กรองเฉพาะช่วงเวลาที่เปิด)
/**
 * กลุ่มงานที่เด็กคนนี้ใช้สิทธิ์ไปแล้ววันนี้ -> ชื่องานที่ส่งไป  เช่น { 'ดนตรี': 'ซ้อมดนตรี' }
 * นับทั้งงานที่ส่งเองและที่ถูกชวนเป็นทีม · งานที่ถูกตีกลับไม่นับ จะได้ส่งใหม่ได้
 */
function groupsUsedToday_(childId, date) {
  const groupOf = {};
  const names = {};
  readAll_(TAB.Chores).forEach(function (c) {
    const g = String(c.dailyGroup || '').trim();
    if (g) { groupOf[c.id] = g; names[c.id] = c.name; }
  });
  const used = {};
  if (!Object.keys(groupOf).length) return used;
  const tz = TZ_();
  where_(TAB.Submissions, function (x) {
    return groupOf[x.choreId] && x.status !== SUB_STATUS.REJECTED &&
      (String(x.submittedBy) === String(childId) || toArr_(x.teamMembers).indexOf(String(childId)) >= 0);
  }).forEach(function (x) {
    const iso = toIso_(x.submittedAt);
    if (iso && Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd') === date) used[groupOf[x.choreId]] = names[x.choreId];
  });
  return used;
}

// งานที่ทำได้ตอนนี้ของเด็กคนนี้ — ตัดงานในกลุ่มที่วันนี้ใช้สิทธิ์ไปแล้วออก
function availableChores_(childId) {
  const ref = now_();
  const used = childId ? groupsUsedToday_(childId, ref.date) : {};
  const open = openWindowsNow_();
  const openIds = {};
  open.forEach(function (tw) { openIds[tw.id] = tw; });
  const chores = where_(TAB.Chores, function (c) { return toBool_(c.active); });
  const result = [];
  chores.forEach(function (c) {
    const wins = toArr_(c.timeWindowIds).filter(function (id) { return openIds[id]; });
    if (!wins.length) return;
    if (used[String(c.dailyGroup || '').trim()]) return;
    // เลือกช่วงเวลาที่เปิดช่วงแรกให้ใช้ส่ง
    const tw = openIds[wins[0]];
    result.push({
      id: c.id, name: c.name, icon: c.icon, basePoints: Number(c.basePoints) || 0,
      timeWindowId: tw.id, timeWindowName: tw.name,
      onTime: isBeforeCutoff_(tw), cutoff: toHm_(tw.cutoff), endTime: toHm_(tw.endTime),
      multiplierToday: windowMultiplierFor_(tw, ref.dow), // ×1 = วันนี้ไม่มีตัวคูณพิเศษ
    });
  });
  return result;
}

// ============ ACTIONS ฝั่งเด็ก ============

const CHILD_ACTIONS = {
  'child.state': function (s) { return childState_(s.refId); },

  'child.chores': function (s) { return availableChores_(s.refId); },

  // ตัวเลขบนเมนู (HUD): ภารกิจที่ทำได้ตอนนี้ / ผลตรวจที่เพิ่งออก
  'child.counts': function (s) {
    const mine = where_(TAB.Submissions, function (x) {
      return String(x.submittedBy) === String(s.refId) ||
        toArr_(x.teamMembers).indexOf(String(s.refId)) >= 0;
    });
    return {
      chores: availableChores_(s.refId).length,
      pending: mine.filter(function (x) { return x.status === SUB_STATUS.PENDING; }).length,
    };
  },

  // ส่งงาน: {choreId, timeWindowId, photo(dataUrl), teamMemberIds:[]}
  'child.submit': function (s, p) {
    // mailNewSubmission_ ยิงออกไปหา Gmail API ซึ่งช้ากว่าเขียนชีตมาก — ต้องอยู่นอก withLock_
    // ไม่งั้นทุกคำขอที่แตะแต้ม/สถานะของทั้งบ้าน (ล็อกเดียวกันทั้งสคริปต์) ต้องรอคิวตามอีเมลไปด้วย
    const result = withLock_(function () {
      const chore = findById_(TAB.Chores, p.choreId);
      if (!chore || !toBool_(chore.active)) throw new Error('ไม่พบงานหรืองานถูกปิด');
      const tw = findById_(TAB.TimeWindows, p.timeWindowId);
      if (!tw) throw new Error('ไม่พบช่วงเวลา');
      if (toArr_(chore.timeWindowIds).indexOf(String(tw.id)) < 0) throw new Error('งานนี้ทำในช่วงเวลานี้ไม่ได้');
      if (!isWindowOpenNow_(tw)) throw new Error('หมดช่วงเวลาแล้ว ส่งงานไม่ได้');
      if (!p.photo) throw new Error('ต้องแนบรูปถ่ายผลงาน');

      const team = (p.teamMemberIds || []).map(String).filter(function (id) { return id !== String(s.refId); });
      const members = [String(s.refId)].concat(team);
      // งานกลุ่มวันละครั้ง — เช็กทุกคนในทีม (ก่อนอัปโหลดรูป จะได้ไม่มีไฟล์ค้างใน Drive)
      const group = String(chore.dailyGroup || '').trim();
      if (group) {
        const today = now_().date;
        members.forEach(function (id) {
          const done = groupsUsedToday_(id, today)[group];
          if (!done) return;
          const who = id === String(s.refId) ? 'วันนี้' : ((findById_(TAB.Children, id) || {}).name || 'เพื่อน') + ' วันนี้';
          throw new Error(who + 'ส่ง "' + done + '" ไปแล้ว — งานกลุ่ม "' + group + '" ทำได้วันละ 1 อย่าง');
        });
      }

      const up = uploadPhoto_(p.photo, 'sub_' + p.choreId + '_' + Date.now());

      const sub = {
        id: newId_('sub'), choreId: chore.id, timeWindowId: tw.id,
        submittedBy: s.refId, teamMembers: fromArr_(members),
        photoUrl: up.url, submittedAt: new Date().toISOString(),
        status: SUB_STATUS.PENDING, quality: '', rejectReason: '',
        pointsPerPerson: '', reviewedBy: '', reviewedAt: '',
      };
      insert_(TAB.Submissions, sub);
      return { sub: sub, child: findById_(TAB.Children, s.refId), chore: chore, photoUrl: up.url };
    });
    mailNewSubmission_(result.child, result.chore, result.photoUrl);
    return { id: result.sub.id, status: result.sub.status };
  },

  // ประวัติการส่งงานของเด็ก (ล่าสุดก่อน)
  'child.submissions': function (s) {
    const mine = where_(TAB.Submissions, function (x) {
      return String(x.submittedBy) === String(s.refId) ||
        toArr_(x.teamMembers).indexOf(String(s.refId)) >= 0;
    });
    // ห้ามส่ง mapSubmission_ เข้า map ตรงๆ — พารามิเตอร์ที่สองจะกลายเป็น index
    return mine.map(function (x) { return mapSubmission_(x, s.refId); })
      .sort(byNewest_('submittedAt'));
  },

  // กระดานผู้นำพี่น้อง — เรียงตามแต้มที่ทำได้สัปดาห์นี้
  // points = แต้มคงเหลือ (ลดเมื่อแลกของ) · xp = แต้มสะสมทั้งหมด (ไม่มีวันลด) — กระดานสะสมฝั่งเด็กใช้ xp
  'child.leaderboard': function () {
    const cfg = getConfig_();
    const week = weekPointsByChild_(mondayOf_(now_().date));
    return where_(TAB.Children, function (c) { return toBool_(c.active); })
      .map(function (c) {
        const lv = levelFromXp_(childXp_(c.id), cfg);
        return {
          id: c.id, name: c.name, avatar: c.avatar, photo: c.photo || '', color: c.color,
          weekPoints: week[c.id] || 0, points: Number(c.points) || 0, xp: lv.xp,
          streakCurrent: Number(c.streakCurrent) || 0,
          level: lv.level, title: lv.title, titleIcon: lv.titleIcon,
        };
      })
      .sort(function (a, b) { return b.weekPoints - a.weekPoints || b.points - a.points; });
  },

  // ซื้อโล่กันสตรีคขาดด้วยแต้ม
  'child.buyShield': function (s) {
    return withLock_(function () {
      const cfg = getConfig_();
      const cost = Math.max(0, parseInt(cfg.streakShieldCost || '0', 10));
      const max = Math.max(0, parseInt(cfg.streakShieldMax || '0', 10));
      const child = findById_(TAB.Children, s.refId);
      if (!child) throw new Error('ไม่พบเด็ก');
      const have = Number(child.shields) || 0;
      if (have >= max) throw new Error('มีโล่ครบสูงสุดแล้ว (' + max + ' อัน)');
      addPoints_(s.refId, -cost, true); // แต้มไม่พอจะโยน error เอง
      update_(TAB.Children, s.refId, { shields: have + 1 });
      return { shields: have + 1, points: Number(findById_(TAB.Children, s.refId).points) || 0 };
    });
  },

  'child.rewards': function () {
    return where_(TAB.Rewards, function (r) { return toBool_(r.active); })
      .map(function (r) { return { id: r.id, name: r.name, cost: Number(r.cost) || 0 }; });
  },

  // ขอแลกของ: {rewardId} — หักแต้มทันที (จอง)
  'child.redeem': function (s, p) {
    // เหตุผลเดียวกับ child.submit — ส่งเมลนอกล็อก อย่าให้ทั้งบ้านรอคิวตามอีเมล
    const result = withLock_(function () {
      const reward = findById_(TAB.Rewards, p.rewardId);
      if (!reward || !toBool_(reward.active)) throw new Error('ไม่พบของรางวัลหรือถูกปิด');
      const cost = Number(reward.cost) || 0;
      checkRedeemLimit_(s.refId, reward);
      addPoints_(s.refId, -cost, true); // หักทันที ห้ามติดลบ
      const red = {
        id: newId_('red'), childId: s.refId, rewardId: reward.id,
        pointsReserved: cost, status: RED_STATUS.PENDING,
        requestedAt: new Date().toISOString(), decidedAt: '',
      };
      insert_(TAB.Redemptions, red);
      return { red: red, child: findById_(TAB.Children, s.refId), reward: reward };
    });
    mailNewRedemption_(result.child, result.reward);
    return { id: result.red.id, status: result.red.status, points: Number(result.child.points) || 0 };
  },

  'child.redemptions': function (s) {
    return where_(TAB.Redemptions, function (r) { return String(r.childId) === String(s.refId); })
      .map(mapRedemption_).sort(byNewest_('requestedAt'));
  },

  // ส่งคำอธิษฐาน: {text}
  'child.wish': function (s, p) {
    if (!p.text || !String(p.text).trim()) throw new Error('พิมพ์คำอธิษฐานก่อน');
    const wish = {
      id: newId_('wsh'), childId: s.refId, text: String(p.text).trim(),
      createdAt: new Date().toISOString(), status: WISH_STATUS.NEW,
    };
    insert_(TAB.Wishes, wish);
    mailNewWish_(findById_(TAB.Children, s.refId), wish.text);
    return { id: wish.id };
  },
};

// จำกัดจำนวนครั้งการแลก ต่อวัน/สัปดาห์/เดือน (นับที่ไม่ถูกปฏิเสธ)
function checkRedeemLimit_(childId, reward) {
  const nowRef = now_();
  const all = where_(TAB.Redemptions, function (r) {
    return String(r.childId) === String(childId) &&
      String(r.rewardId) === String(reward.id) &&
      r.status !== RED_STATUS.REJECTED;
  });
  function countSince(days) {
    const since = Date.now() - days * 86400000;
    return all.filter(function (r) { return new Date(toIso_(r.requestedAt)).getTime() >= since; }).length;
  }
  const ld = Number(reward.limitDay), lw = Number(reward.limitWeek), lm = Number(reward.limitMonth);
  if (reward.limitDay !== '' && !isNaN(ld) && countSince(1) >= ld) throw new Error('เกินลิมิตต่อวันแล้ว');
  if (reward.limitWeek !== '' && !isNaN(lw) && countSince(7) >= lw) throw new Error('เกินลิมิตต่อสัปดาห์แล้ว');
  if (reward.limitMonth !== '' && !isNaN(lm) && countSince(30) >= lm) throw new Error('เกินลิมิตต่อเดือนแล้ว');
}

// ============ ACTIONS ฝั่งผู้ปกครอง ============

const PARENT_ACTIONS = {
  // ตัวเลขบนเมนู (HUD): งานรอตรวจ / คำขอแลก / คำอธิษฐานใหม่
  'parent.counts': function () {
    return {
      review: where_(TAB.Submissions, function (x) { return x.status === SUB_STATUS.PENDING; }).length,
      redeem: where_(TAB.Redemptions, function (r) { return r.status === RED_STATUS.PENDING; }).length,
      wishes: where_(TAB.Wishes, function (w) { return w.status === WISH_STATUS.NEW; }).length,
    };
  },

  // คิวตรวจงาน
  'parent.reviewQueue': function () {
    const cfg = getConfig_(); // อ่านครั้งเดียว ไม่ใช่ต่อรายการ
    return where_(TAB.Submissions, function (x) { return x.status === SUB_STATUS.PENDING; })
      .map(function (x) { return mapSubmissionFull_(x, cfg); })
      .sort(byNewest_('submittedAt'));
  },

  // ประวัติงานที่ตรวจไปแล้ว (ผ่าน/ตีกลับ) ล่าสุดก่อน — จำกัด 50 รายการกันข้อมูลบวมเมื่อสะสมนาน
  'parent.reviewHistory': function () {
    return where_(TAB.Submissions, function (x) {
      return x.status === SUB_STATUS.APPROVED || x.status === SUB_STATUS.REJECTED;
    })
      .map(mapSubmissionHistory_)
      .sort(byNewest_('reviewedAt'))
      .slice(0, 50);
  },

  // อนุมัติงาน: {submissionId, quality(10-100)}
  'parent.approve': function (s, p) {
    return withLock_(function () {
      const sub = findById_(TAB.Submissions, p.submissionId);
      if (!sub) throw new Error('ไม่พบงาน');
      if (sub.status !== SUB_STATUS.PENDING) throw new Error('งานนี้ตรวจไปแล้ว');
      const chore = findById_(TAB.Chores, sub.choreId);
      const tw = findById_(TAB.TimeWindows, sub.timeWindowId);
      const cfg = getConfig_();
      const quality = Math.max(10, Math.min(100, Number(p.quality) || 0));
      const submittedAt = new Date(toIso_(sub.submittedAt));
      const submittedRef = { hm: Utilities.formatDate(submittedAt, TZ_(), 'HH:mm') };
      const onTime = hmToMin_(submittedRef.hm) < hmToMin_(tw.cutoff);
      const dow = parseInt(Utilities.formatDate(submittedAt, TZ_(), 'u'), 10); // 1=จันทร์..7=อาทิตย์
      const members = toArr_(sub.teamMembers);
      const teamSize = members.length || 1;
      const perPerson = computePoints_(chore, tw, quality, onTime, teamSize, cfg, dow);

      const today = Utilities.formatDate(submittedAt, TZ_(), 'yyyy-MM-dd');

      // ปั๊ม "ผ่าน" ลงชีตก่อนแจกแต้ม — ไม่งั้นงานชิ้นนี้ยังเป็น "รอตรวจ" ตอนที่
      // awardDailyQuest_() ไปนับงานที่ผ่านของวันนี้ ทำให้นับขาดไป 1 ชิ้นเสมอ
      // (เป้าวันละ 3 ชิ้น เด็กที่ทำพอดี 3 ชิ้นจะไม่มีวันได้โบนัสเลย)
      // ด้วยเหตุผลเดียวกัน ดาเมจบอสก็เคยตกงานชิ้นล่าสุดไปทุกครั้ง
      update_(TAB.Submissions, sub.id, {
        status: SUB_STATUS.APPROVED, quality: quality, pointsPerPerson: perPerson,
        reviewedBy: s.refId, reviewedAt: new Date().toISOString(),
      });

      const badgesByChild = {};
      const perChild = [];
      const awards = [];   // ยอดที่แต่ละคนได้รับจริง เก็บลงคอลัมน์ awards
      members.forEach(function (cid) {
        const child = findById_(TAB.Children, cid);
        if (!child) return;
        // เดินสตรีคก่อนคิดโบนัส เพื่อให้ "วันนี้" นับรวมด้วย
        const res = bumpStreak_(child, today, cfg);
        if (res.newBadges.length) badgesByChild[cid] = res.newBadges;
        const streak = Number(res.child.streakCurrent) || 0;
        const got = applyStreakBonus_(perPerson, streak, cfg);
        addPoints_(cid, got.points, false);
        awards.push(String(cid) + ':' + got.points);
        const dailyBonus = awardDailyQuest_(cid, today, cfg);
        perChild.push({
          id: cid, name: child.name, points: got.points,
          streak: streak, streakBonusPercent: got.percent,
          shieldUsed: res.shieldUsed, dailyQuestBonus: dailyBonus,
        });
      });

      // ยอดรายคนต้องลงชีตก่อนคิดดาเมจบอส ไม่งั้นงานชิ้นนี้จะถูกนับด้วยยอดกลาง (ไม่รวมโบนัสสตรีค)
      update_(TAB.Submissions, sub.id, { awards: awards.join(',') });

      // บอสประจำเดือน: ถ้าดาเมจรวมถึงเป้าแล้ว แจกรางวัลให้ทุกคน (ครั้งเดียว/เดือน/บอสหนึ่งตัว)
      const bossWinners = awardBossIfDefeated_(today, cfg);

      return {
        pointsPerPerson: perPerson, onTime: onTime, teamSize: teamSize,
        windowMultiplier: windowMultiplierFor_(tw, dow),
        perChild: perChild, newBadges: badgesByChild,
        boss: bossState_(today, cfg), bossWinners: bossWinners,
      };
    });
  },

  // ตีกลับงาน: {submissionId, reason}
  'parent.reject': function (s, p) {
    return withLock_(function () {
      const sub = findById_(TAB.Submissions, p.submissionId);
      if (!sub) throw new Error('ไม่พบงาน');
      if (sub.status !== SUB_STATUS.PENDING) throw new Error('งานนี้ตรวจไปแล้ว');
      if (!p.reason || !String(p.reason).trim()) throw new Error('ต้องระบุเหตุผลการตีกลับ');
      update_(TAB.Submissions, sub.id, {
        status: SUB_STATUS.REJECTED, rejectReason: String(p.reason).trim(),
        reviewedBy: s.refId, reviewedAt: new Date().toISOString(),
      });
      return { ok: true };
    });
  },

  // ปรับแต้มด้วยมือ: {childId, delta, reason}
  'parent.adjustPoints': function (s, p) {
    return withLock_(function () {
      return adjustPoints_(p.childId, p.delta, p.reason, s.refId);
    });
  },

  'parent.adjustments': function (s, p) {
    let rows = readAll_(TAB.PointAdjustments);
    if (p && p.childId) rows = rows.filter(function (r) { return String(r.childId) === String(p.childId); });
    return rows.map(function (r) {
      return { id: r.id, childId: r.childId, delta: Number(r.delta), reason: r.reason, adjustedBy: r.adjustedBy, createdAt: toIso_(r.createdAt) };
    }).sort(byNewest_('createdAt'));
  },

  // คำขอแลกของ
  'parent.redemptionQueue': function () {
    return where_(TAB.Redemptions, function (r) { return r.status === RED_STATUS.PENDING; })
      .map(mapRedemptionFull_).sort(byNewest_('requestedAt'));
  },

  // อนุมัติแลก: {redemptionId}
  'parent.approveRedeem': function (s, p) {
    return withLock_(function () {
      const red = findById_(TAB.Redemptions, p.redemptionId);
      if (!red || red.status !== RED_STATUS.PENDING) throw new Error('ไม่พบคำขอหรือถูกตัดสินแล้ว');
      update_(TAB.Redemptions, red.id, { status: RED_STATUS.APPROVED, decidedAt: new Date().toISOString() });
      return { ok: true };
    });
  },

  // ปฏิเสธแลก: {redemptionId} — คืนแต้ม
  'parent.rejectRedeem': function (s, p) {
    return withLock_(function () {
      const red = findById_(TAB.Redemptions, p.redemptionId);
      if (!red || red.status !== RED_STATUS.PENDING) throw new Error('ไม่พบคำขอหรือถูกตัดสินแล้ว');
      addPoints_(red.childId, Number(red.pointsReserved) || 0, false); // คืนแต้ม
      update_(TAB.Redemptions, red.id, { status: RED_STATUS.REJECTED, decidedAt: new Date().toISOString() });
      return { ok: true, refunded: Number(red.pointsReserved) || 0 };
    });
  },

  // คำอธิษฐาน
  'parent.wishes': function () {
    return where_(TAB.Wishes, function (w) { return w.status !== WISH_STATUS.CLOSED; })
      .map(mapWishFull_).sort(byNewest_('createdAt'));
  },

  // แปลงคำอธิษฐานเป็นของรางวัล: {wishId, cost, name?, limitDay?, limitWeek?, limitMonth?}
  'parent.convertWish': function (s, p) {
    const wish = findById_(TAB.Wishes, p.wishId);
    if (!wish) throw new Error('ไม่พบคำอธิษฐาน');
    const reward = {
      id: newId_('rew'), name: p.name || wish.text, cost: Number(p.cost) || 0,
      limitDay: p.limitDay == null ? '' : p.limitDay,
      limitWeek: p.limitWeek == null ? '' : p.limitWeek,
      limitMonth: p.limitMonth == null ? '' : p.limitMonth,
      active: true,
    };
    insert_(TAB.Rewards, reward);
    update_(TAB.Wishes, wish.id, { status: WISH_STATUS.CONVERTED });
    return { rewardId: reward.id };
  },

  'parent.closeWish': function (s, p) {
    update_(TAB.Wishes, p.wishId, { status: WISH_STATUS.CLOSED });
    return { ok: true };
  },

  // รายงาน/สรุป
  'parent.report': function () {
    const cfg = getConfig_();
    return where_(TAB.Children, function (c) { return true; }).map(function (c) {
      return {
        id: c.id, name: c.name, avatar: c.avatar, photo: c.photo || '', color: c.color, active: toBool_(c.active),
        points: Number(c.points) || 0, streakCurrent: Number(c.streakCurrent) || 0, streakMax: Number(c.streakMax) || 0,
        streakBonusPercent: streakBonusPct_(Number(c.streakCurrent) || 0, cfg),
        level: levelFromXp_(childXp_(c.id), cfg),
        shields: Number(c.shields) || 0,
      };
    });
  },
};

// ============ mappers ============
// childId = คนที่กำลังดูอยู่ ใส่มาเพื่อให้โชว์แต้มที่ "เขา" ได้จริง ไม่ใช่ยอดกลางของงาน
function mapSubmission_(x, childId) {
  return {
    id: x.id, choreId: x.choreId, status: x.status, submittedAt: toIso_(x.submittedAt),
    photoUrl: drivePhotoSrc_(x.photoUrl), photoOpenUrl: driveOpenUrl_(x.photoUrl),
    quality: x.quality, rejectReason: x.rejectReason,
    pointsPerPerson: childId ? awardFor_(x, childId) : x.pointsPerPerson,
    choreName: (findById_(TAB.Chores, x.choreId) || {}).name || '',
  };
}
function mapSubmissionFull_(x, cfg0) {
  const chore = findById_(TAB.Chores, x.choreId) || {};
  const child = findById_(TAB.Children, x.submittedBy) || {};
  const tw = findById_(TAB.TimeWindows, x.timeWindowId) || {};
  const cfg = cfg0 || getConfig_();
  const members = toArr_(x.teamMembers).map(function (id) {
    const c = findById_(TAB.Children, id) || {}; return { id: id, name: c.name };
  });
  const submittedAt = new Date(toIso_(x.submittedAt));
  const dow = parseInt(Utilities.formatDate(submittedAt, TZ_(), 'u'), 10);
  const onTime = tw.cutoff
    ? hmToMin_(Utilities.formatDate(submittedAt, TZ_(), 'HH:mm')) < hmToMin_(tw.cutoff)
    : true;
  return {
    id: x.id, choreName: chore.name, choreIcon: chore.icon,
    photoUrl: drivePhotoSrc_(x.photoUrl), photoOpenUrl: driveOpenUrl_(x.photoUrl),
    submittedAt: toIso_(x.submittedAt), submittedByName: child.name, teamMembers: members,
    basePoints: Number(chore.basePoints) || 0, timeWindowId: x.timeWindowId,
    // ตัวประกอบของสูตรแต้ม — ส่งไปให้หน้าตรวจงานคิดยอดโชว์สดๆ ตอนเลื่อนคุณภาพ
    // ต้องตรงกับ computePoints_() ใน Points.gs เสมอ
    calc: {
      base: Number(chore.basePoints) || 0,
      onTime: onTime, cutoff: tw.cutoff || '',
      latePercent: configNum_(cfg, 'latePercent'),
      teamPercent: configNum_(cfg, 'teamPercent'),
      windowMultiplier: windowMultiplierFor_(tw, dow),
      teamSize: members.length || 1,
    },
  };
}
// สรุปงานที่ตรวจไปแล้วหนึ่งชิ้น — ใช้กับ parent.reviewHistory
function mapSubmissionHistory_(x) {
  const chore = findById_(TAB.Chores, x.choreId) || {};
  const members = toArr_(x.teamMembers).map(function (id) {
    const c = findById_(TAB.Children, id) || {};
    return { id: id, name: c.name, points: awardFor_(x, id) };
  });
  return {
    id: x.id, choreName: chore.name, choreIcon: chore.icon,
    status: x.status, quality: x.quality, rejectReason: x.rejectReason,
    submittedAt: toIso_(x.submittedAt), reviewedAt: toIso_(x.reviewedAt),
    teamMembers: members,
  };
}
function mapRedemption_(r) {
  const rw = findById_(TAB.Rewards, r.rewardId) || {};
  return { id: r.id, rewardName: rw.name || '', pointsReserved: Number(r.pointsReserved), status: r.status, requestedAt: toIso_(r.requestedAt) };
}
function mapRedemptionFull_(r) {
  const rw = findById_(TAB.Rewards, r.rewardId) || {};
  const c = findById_(TAB.Children, r.childId) || {};
  return { id: r.id, childName: c.name, rewardName: rw.name || '', cost: Number(r.pointsReserved), requestedAt: toIso_(r.requestedAt) };
}
function mapWishFull_(w) {
  const c = findById_(TAB.Children, w.childId) || {};
  return { id: w.id, childName: c.name, text: w.text, status: w.status, createdAt: toIso_(w.createdAt) };
}
function byNewest_(field) {
  return function (a, b) { return new Date(b[field]).getTime() - new Date(a[field]).getTime(); };
}
