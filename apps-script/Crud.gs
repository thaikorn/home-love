/**
 * Crud.gs — จัดการข้อมูลตั้งค่าฝั่งผู้ปกครอง (CRUD เต็ม)
 * เด็ก / งานบ้าน / ของรางวัล / ช่วงเวลา
 * กฎ soft-delete: ถ้ามีข้อมูลอ้างอิงอยู่ ให้ "ปิดใช้งาน" แทนการลบจริง
 */

// มีการส่งงานอ้างอิงเด็กคนนี้ไหม
function childHasHistory_(childId) {
  const subs = where_(TAB.Submissions, function (x) {
    return String(x.submittedBy) === String(childId) ||
      toArr_(x.teamMembers).indexOf(String(childId)) >= 0;
  });
  if (subs.length) return true;
  const reds = where_(TAB.Redemptions, function (r) { return String(r.childId) === String(childId); });
  if (reds.length) return true;
  const adj = where_(TAB.PointAdjustments, function (a) { return String(a.childId) === String(childId); });
  return adj.length > 0;
}

function choreHasHistory_(choreId) {
  return where_(TAB.Submissions, function (x) { return String(x.choreId) === String(choreId); }).length > 0;
}

function rewardHasHistory_(rewardId) {
  return where_(TAB.Redemptions, function (r) { return String(r.rewardId) === String(rewardId); }).length > 0;
}

const CRUD_ACTIONS = {
  // ---------- เด็ก ----------
  'parent.children.list': function () {
    return where_(TAB.Children, function () { return true; }).map(function (c) {
      return {
        id: c.id, name: c.name, avatar: c.avatar, color: c.color,
        points: Number(c.points) || 0, streakCurrent: Number(c.streakCurrent) || 0,
        streakMax: Number(c.streakMax) || 0, active: toBool_(c.active),
      };
    });
  },
  // {name, avatar, color, pin}
  'parent.children.create': function (s, p) {
    if (!p.name) throw new Error('ต้องมีชื่อ');
    if (!/^\d{4}$/.test(String(p.pin || ''))) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
    const child = {
      id: newId_('chd'), name: p.name, avatar: p.avatar || '🙂', color: p.color || '#8ecae6',
      pinHash: hashSecret_(p.pin), points: 0, streakCurrent: 0, streakMax: 0, lastStreakDate: '', active: true,
    };
    insert_(TAB.Children, child);
    return { id: child.id };
  },
  // {id, name?, avatar?, color?, pin?, active?}
  'parent.children.update': function (s, p) {
    const patch = {};
    ['name', 'avatar', 'color'].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
    if (p.active !== undefined) patch.active = !!p.active;
    if (p.pin) {
      if (!/^\d{4}$/.test(String(p.pin))) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
      patch.pinHash = hashSecret_(p.pin);
    }
    update_(TAB.Children, p.id, patch);
    return { ok: true };
  },
  // {id} — ลบจริงถ้าไม่มีประวัติ, ไม่งั้นปิดใช้งาน
  'parent.children.delete': function (s, p) {
    if (childHasHistory_(p.id)) {
      update_(TAB.Children, p.id, { active: false });
      return { softDeleted: true };
    }
    remove_(TAB.Children, p.id);
    return { deleted: true };
  },

  // ---------- งานบ้าน ----------
  'parent.chores.list': function () {
    return where_(TAB.Chores, function () { return true; }).map(function (c) {
      return {
        id: c.id, name: c.name, icon: c.icon, basePoints: Number(c.basePoints) || 0,
        timeWindowIds: toArr_(c.timeWindowIds), active: toBool_(c.active),
      };
    });
  },
  'parent.chores.create': function (s, p) {
    if (!p.name) throw new Error('ต้องมีชื่องาน');
    const chore = {
      id: newId_('cho'), name: p.name, icon: p.icon || '🧹',
      basePoints: Number(p.basePoints) || 0, timeWindowIds: fromArr_(p.timeWindowIds || []), active: true,
    };
    insert_(TAB.Chores, chore);
    return { id: chore.id };
  },
  'parent.chores.update': function (s, p) {
    const patch = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.icon !== undefined) patch.icon = p.icon;
    if (p.basePoints !== undefined) patch.basePoints = Number(p.basePoints) || 0;
    if (p.timeWindowIds !== undefined) patch.timeWindowIds = fromArr_(p.timeWindowIds);
    if (p.active !== undefined) patch.active = !!p.active;
    update_(TAB.Chores, p.id, patch);
    return { ok: true };
  },
  'parent.chores.delete': function (s, p) {
    if (choreHasHistory_(p.id)) {
      update_(TAB.Chores, p.id, { active: false });
      return { softDeleted: true };
    }
    remove_(TAB.Chores, p.id);
    return { deleted: true };
  },

  // ---------- ของรางวัล ----------
  'parent.rewards.list': function () {
    return where_(TAB.Rewards, function () { return true; }).map(function (r) {
      return {
        id: r.id, name: r.name, cost: Number(r.cost) || 0,
        limitDay: r.limitDay, limitWeek: r.limitWeek, limitMonth: r.limitMonth, active: toBool_(r.active),
      };
    });
  },
  'parent.rewards.create': function (s, p) {
    if (!p.name) throw new Error('ต้องมีชื่อรางวัล');
    const reward = {
      id: newId_('rew'), name: p.name, cost: Number(p.cost) || 0,
      limitDay: p.limitDay == null ? '' : p.limitDay,
      limitWeek: p.limitWeek == null ? '' : p.limitWeek,
      limitMonth: p.limitMonth == null ? '' : p.limitMonth, active: true,
    };
    insert_(TAB.Rewards, reward);
    return { id: reward.id };
  },
  'parent.rewards.update': function (s, p) {
    const patch = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.cost !== undefined) patch.cost = Number(p.cost) || 0;
    ['limitDay', 'limitWeek', 'limitMonth'].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
    if (p.active !== undefined) patch.active = !!p.active;
    update_(TAB.Rewards, p.id, patch);
    return { ok: true };
  },
  'parent.rewards.delete': function (s, p) {
    if (rewardHasHistory_(p.id)) {
      update_(TAB.Rewards, p.id, { active: false });
      return { softDeleted: true };
    }
    remove_(TAB.Rewards, p.id);
    return { deleted: true };
  },

  // ---------- ช่วงเวลา ----------
  'parent.timewindows.list': function () {
    return where_(TAB.TimeWindows, function () { return true; }).map(function (t) {
      return {
        id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime, cutoff: t.cutoff,
        days: toArr_(t.days).map(Number), bonusMultiplier: Number(t.bonusMultiplier) || 1, active: toBool_(t.active),
      };
    });
  },
  'parent.timewindows.create': function (s, p) {
    if (!p.name) throw new Error('ต้องมีชื่อช่วงเวลา');
    const tw = {
      id: newId_('tw'), name: p.name, startTime: p.startTime, endTime: p.endTime, cutoff: p.cutoff || p.endTime,
      days: fromArr_(p.days || [1, 2, 3, 4, 5, 6, 7]), bonusMultiplier: Number(p.bonusMultiplier) || 1, active: true,
    };
    insert_(TAB.TimeWindows, tw);
    return { id: tw.id };
  },
  'parent.timewindows.update': function (s, p) {
    const patch = {};
    ['name', 'startTime', 'endTime', 'cutoff'].forEach(function (k) { if (p[k] !== undefined) patch[k] = p[k]; });
    if (p.days !== undefined) patch.days = fromArr_(p.days);
    if (p.bonusMultiplier !== undefined) patch.bonusMultiplier = Number(p.bonusMultiplier) || 1;
    if (p.active !== undefined) patch.active = !!p.active;
    update_(TAB.TimeWindows, p.id, patch);
    return { ok: true };
  },
  'parent.timewindows.delete': function (s, p) {
    remove_(TAB.TimeWindows, p.id);
    return { deleted: true };
  },
};
