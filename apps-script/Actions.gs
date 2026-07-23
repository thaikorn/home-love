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
  const badges = where_(TAB.Badges, function (b) { return String(b.childId) === String(childId); })
    .map(function (b) { return { kind: b.kind, awardedAt: b.awardedAt }; });
  return {
    id: child.id, name: child.name, avatar: child.avatar, color: child.color,
    points: Number(child.points) || 0,
    streakCurrent: Number(child.streakCurrent) || 0,
    streakMax: Number(child.streakMax) || 0,
    badges: badges,
  };
}

// งานที่เด็กทำได้ตอนนี้ (กรองเฉพาะช่วงเวลาที่เปิด)
function availableChores_() {
  const open = openWindowsNow_();
  const openIds = {};
  open.forEach(function (tw) { openIds[tw.id] = tw; });
  const chores = where_(TAB.Chores, function (c) { return toBool_(c.active); });
  const result = [];
  chores.forEach(function (c) {
    const wins = toArr_(c.timeWindowIds).filter(function (id) { return openIds[id]; });
    if (!wins.length) return;
    // เลือกช่วงเวลาที่เปิดช่วงแรกให้ใช้ส่ง
    const tw = openIds[wins[0]];
    result.push({
      id: c.id, name: c.name, icon: c.icon, basePoints: Number(c.basePoints) || 0,
      timeWindowId: tw.id, timeWindowName: tw.name,
      onTime: isBeforeCutoff_(tw), cutoff: tw.cutoff, endTime: tw.endTime,
    });
  });
  return result;
}

// ============ ACTIONS ฝั่งเด็ก ============

const CHILD_ACTIONS = {
  'child.state': function (s) { return childState_(s.refId); },

  'child.chores': function () { return availableChores_(); },

  // ส่งงาน: {choreId, timeWindowId, photo(dataUrl), teamMemberIds:[]}
  'child.submit': function (s, p) {
    return withLock_(function () {
      const chore = findById_(TAB.Chores, p.choreId);
      if (!chore || !toBool_(chore.active)) throw new Error('ไม่พบงานหรืองานถูกปิด');
      const tw = findById_(TAB.TimeWindows, p.timeWindowId);
      if (!tw) throw new Error('ไม่พบช่วงเวลา');
      if (toArr_(chore.timeWindowIds).indexOf(String(tw.id)) < 0) throw new Error('งานนี้ทำในช่วงเวลานี้ไม่ได้');
      if (!isWindowOpenNow_(tw)) throw new Error('หมดช่วงเวลาแล้ว ส่งงานไม่ได้');
      if (!p.photo) throw new Error('ต้องแนบรูปถ่ายผลงาน');

      const up = uploadPhoto_(p.photo, 'sub_' + p.choreId + '_' + Date.now());
      const team = (p.teamMemberIds || []).map(String).filter(function (id) { return id !== String(s.refId); });
      const members = [String(s.refId)].concat(team);

      const sub = {
        id: newId_('sub'), choreId: chore.id, timeWindowId: tw.id,
        submittedBy: s.refId, teamMembers: fromArr_(members),
        photoUrl: up.url, submittedAt: new Date().toISOString(),
        status: SUB_STATUS.PENDING, quality: '', rejectReason: '',
        pointsPerPerson: '', reviewedBy: '', reviewedAt: '',
      };
      insert_(TAB.Submissions, sub);
      mailNewSubmission_(findById_(TAB.Children, s.refId), chore, up.url);
      return { id: sub.id, status: sub.status };
    });
  },

  // ประวัติการส่งงานของเด็ก (ล่าสุดก่อน)
  'child.submissions': function (s) {
    const mine = where_(TAB.Submissions, function (x) {
      return String(x.submittedBy) === String(s.refId) ||
        toArr_(x.teamMembers).indexOf(String(s.refId)) >= 0;
    });
    return mine.map(mapSubmission_).sort(byNewest_('submittedAt'));
  },

  'child.rewards': function () {
    return where_(TAB.Rewards, function (r) { return toBool_(r.active); })
      .map(function (r) { return { id: r.id, name: r.name, cost: Number(r.cost) || 0 }; });
  },

  // ขอแลกของ: {rewardId} — หักแต้มทันที (จอง)
  'child.redeem': function (s, p) {
    return withLock_(function () {
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
      mailNewRedemption_(findById_(TAB.Children, s.refId), reward);
      return { id: red.id, status: red.status, points: (Number(findById_(TAB.Children, s.refId).points) || 0) };
    });
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
    return all.filter(function (r) { return new Date(r.requestedAt).getTime() >= since; }).length;
  }
  const ld = Number(reward.limitDay), lw = Number(reward.limitWeek), lm = Number(reward.limitMonth);
  if (reward.limitDay !== '' && !isNaN(ld) && countSince(1) >= ld) throw new Error('เกินลิมิตต่อวันแล้ว');
  if (reward.limitWeek !== '' && !isNaN(lw) && countSince(7) >= lw) throw new Error('เกินลิมิตต่อสัปดาห์แล้ว');
  if (reward.limitMonth !== '' && !isNaN(lm) && countSince(30) >= lm) throw new Error('เกินลิมิตต่อเดือนแล้ว');
}

// ============ ACTIONS ฝั่งผู้ปกครอง ============

const PARENT_ACTIONS = {
  // คิวตรวจงาน
  'parent.reviewQueue': function () {
    return where_(TAB.Submissions, function (x) { return x.status === SUB_STATUS.PENDING; })
      .map(mapSubmissionFull_).sort(byNewest_('submittedAt'));
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
      const submittedRef = { hm: Utilities.formatDate(new Date(sub.submittedAt), TZ_(), 'HH:mm') };
      const onTime = hmToMin_(submittedRef.hm) < hmToMin_(tw.cutoff);
      const members = toArr_(sub.teamMembers);
      const teamSize = members.length || 1;
      const perPerson = computePoints_(chore, tw, quality, onTime, teamSize, cfg);

      const today = Utilities.formatDate(new Date(sub.submittedAt), TZ_(), 'yyyy-MM-dd');
      const badgesByChild = {};
      members.forEach(function (cid) {
        addPoints_(cid, perPerson, false);
        const child = findById_(TAB.Children, cid);
        if (child) {
          const res = bumpStreak_(child, today, cfg);
          if (res.newBadges.length) badgesByChild[cid] = res.newBadges;
        }
      });

      update_(TAB.Submissions, sub.id, {
        status: SUB_STATUS.APPROVED, quality: quality, pointsPerPerson: perPerson,
        reviewedBy: s.refId, reviewedAt: new Date().toISOString(),
      });
      return { pointsPerPerson: perPerson, onTime: onTime, teamSize: teamSize, newBadges: badgesByChild };
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
      return { id: r.id, childId: r.childId, delta: Number(r.delta), reason: r.reason, adjustedBy: r.adjustedBy, createdAt: r.createdAt };
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
    return where_(TAB.Children, function (c) { return true; }).map(function (c) {
      return {
        id: c.id, name: c.name, avatar: c.avatar, color: c.color, active: toBool_(c.active),
        points: Number(c.points) || 0, streakCurrent: Number(c.streakCurrent) || 0, streakMax: Number(c.streakMax) || 0,
      };
    });
  },
};

// ============ mappers ============
function mapSubmission_(x) {
  return {
    id: x.id, choreId: x.choreId, status: x.status, submittedAt: x.submittedAt,
    photoUrl: x.photoUrl, quality: x.quality, rejectReason: x.rejectReason,
    pointsPerPerson: x.pointsPerPerson,
    choreName: (findById_(TAB.Chores, x.choreId) || {}).name || '',
  };
}
function mapSubmissionFull_(x) {
  const chore = findById_(TAB.Chores, x.choreId) || {};
  const child = findById_(TAB.Children, x.submittedBy) || {};
  const members = toArr_(x.teamMembers).map(function (id) {
    const c = findById_(TAB.Children, id) || {}; return { id: id, name: c.name };
  });
  return {
    id: x.id, choreName: chore.name, choreIcon: chore.icon, photoUrl: x.photoUrl,
    submittedAt: x.submittedAt, submittedByName: child.name, teamMembers: members,
    basePoints: Number(chore.basePoints) || 0, timeWindowId: x.timeWindowId,
  };
}
function mapRedemption_(r) {
  const rw = findById_(TAB.Rewards, r.rewardId) || {};
  return { id: r.id, rewardName: rw.name || '', pointsReserved: Number(r.pointsReserved), status: r.status, requestedAt: r.requestedAt };
}
function mapRedemptionFull_(r) {
  const rw = findById_(TAB.Rewards, r.rewardId) || {};
  const c = findById_(TAB.Children, r.childId) || {};
  return { id: r.id, childName: c.name, rewardName: rw.name || '', cost: Number(r.pointsReserved), requestedAt: r.requestedAt };
}
function mapWishFull_(w) {
  const c = findById_(TAB.Children, w.childId) || {};
  return { id: w.id, childName: c.name, text: w.text, status: w.status, createdAt: w.createdAt };
}
function byNewest_(field) {
  return function (a, b) { return new Date(b[field]).getTime() - new Date(a[field]).getTime(); };
}
