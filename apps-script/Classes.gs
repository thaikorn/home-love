/**
 * Classes.gs — แพ็กคลาสเรียนพิเศษของเด็ก (กีตาร์/กลอง/ร้องเพลง ฯลฯ)
 * แพ็กคลาส (ClassPackages) + ประวัติแต่ละครั้งที่เรียน/เลื่อน (ClassSessions)
 * จำนวนครั้งที่เหลือคำนวณจากประวัติจริงเสมอ ไม่ใช่ตัวนับแยกที่อาจเพี้ยนได้
 * ผู้ปกครองดูแลเท่านั้น — เด็กไม่เห็นแท็บนี้
 */

function mapPackage_(pkg) {
  const c = findById_(TAB.Children, pkg.childId) || {};
  const sessions = where_(TAB.ClassSessions, function (x) { return String(x.packageId) === String(pkg.id); });
  const done = sessions.filter(function (x) { return x.status === CLASS_SESSION_STATUS.DONE; });
  const last = done.slice().sort(function (a, b) { return toDateStr_(b.date).localeCompare(toDateStr_(a.date)); })[0];
  const total = Number(pkg.totalSessions) || 0;
  return {
    id: pkg.id, childId: pkg.childId, childName: c.name, childAvatar: c.avatar, childPhoto: c.photo || '', childColor: c.color,
    subject: pkg.subject, icon: pkg.icon, totalSessions: total,
    dayOfWeek: Number(pkg.dayOfWeek) || 0, note: pkg.note || '', active: toBool_(pkg.active),
    usedSessions: done.length,
    remaining: Math.max(0, total - done.length),
    lastSessionDate: last ? toDateStr_(last.date) : '',
  };
}

function mapSession_(x) {
  return { id: x.id, packageId: x.packageId, date: toDateStr_(x.date), status: x.status, note: x.note || '', createdAt: toIso_(x.createdAt) };
}

const CLASS_ACTIONS = {
  'parent.classes.list': function () {
    return where_(TAB.ClassPackages, function () { return true; }).map(mapPackage_);
  },

  // {childId, subject, icon?, totalSessions, dayOfWeek, note?, startFrom?}
  // startFrom = เลขครั้งที่จะเรียนครั้งถัดไป (เช่นเคยเรียนมาแล้วนอกระบบ 5 ครั้ง ให้ส่ง startFrom=6)
  // ค่าเริ่มต้น 1 = ยังไม่เคยเรียนเลย ไม่ backfill อะไร
  'parent.classes.create': function (s, p) {
    if (!findById_(TAB.Children, p.childId)) throw new Error('ไม่พบเด็ก');
    if (!String(p.subject || '').trim()) throw new Error('ต้องมีชื่อวิชา');
    const total = parseInt(p.totalSessions, 10);
    if (isNaN(total) || total < 1) throw new Error('จำนวนครั้งต้องเป็นตัวเลขมากกว่า 0');
    const dow = parseInt(p.dayOfWeek, 10);
    if (isNaN(dow) || dow < 1 || dow > 7) throw new Error('เลือกวันเรียนประจำ');
    const startFrom = parseInt(p.startFrom, 10) || 1;
    if (startFrom < 1) throw new Error('เริ่มนับจากครั้งที่ต้องเป็นอย่างน้อย 1');
    const pkg = {
      id: newId_('clp'), childId: p.childId, subject: String(p.subject).trim(), icon: p.icon || '🎵',
      totalSessions: total, dayOfWeek: dow, note: p.note || '', active: true,
      createdAt: new Date().toISOString(),
    };
    insert_(TAB.ClassPackages, pkg);
    // backfill ครั้งที่เรียนไปแล้วก่อนเริ่มใช้ระบบ ให้จำนวนครั้งที่เหลือถูกตั้งแต่แรก
    const already = Math.min(startFrom - 1, total);
    const today = toDateStr_(new Date());
    for (let i = 0; i < already; i++) {
      insert_(TAB.ClassSessions, {
        id: newId_('cls'), packageId: pkg.id, date: today, status: CLASS_SESSION_STATUS.DONE,
        note: 'นับรวมจากก่อนเริ่มใช้ระบบ', createdAt: new Date().toISOString(),
      });
    }
    return { id: pkg.id };
  },

  // {id, subject?, icon?, totalSessions?, dayOfWeek?, note?, active?}
  'parent.classes.update': function (s, p) {
    const patch = {};
    if (p.subject !== undefined) {
      if (!String(p.subject).trim()) throw new Error('ต้องมีชื่อวิชา');
      patch.subject = String(p.subject).trim();
    }
    if (p.icon !== undefined) patch.icon = p.icon;
    if (p.totalSessions !== undefined) {
      const total = parseInt(p.totalSessions, 10);
      if (isNaN(total) || total < 1) throw new Error('จำนวนครั้งต้องเป็นตัวเลขมากกว่า 0');
      patch.totalSessions = total;
    }
    if (p.dayOfWeek !== undefined) {
      const dow = parseInt(p.dayOfWeek, 10);
      if (isNaN(dow) || dow < 1 || dow > 7) throw new Error('เลือกวันเรียนประจำ');
      patch.dayOfWeek = dow;
    }
    if (p.note !== undefined) patch.note = p.note;
    if (p.active !== undefined) patch.active = !!p.active;
    update_(TAB.ClassPackages, p.id, patch);
    return { ok: true };
  },

  // {id, totalSessions?} — แพ็กเดิมเรียนครบ/ซื้อแพ็กถัดไป: สร้างแพ็กใหม่ก๊อปค่าจากแพ็กเดิม
  // แล้วปิดแพ็กเดิม (เก็บประวัติไว้ดูย้อนหลัง) — จำนวนครั้งที่เหลือของแพ็กใหม่เริ่มนับจาก 0
  'parent.classes.renew': function (s, p) {
    const old = findById_(TAB.ClassPackages, p.id);
    if (!old) throw new Error('ไม่พบแพ็กคลาส');
    let total = Number(old.totalSessions) || 0;
    if (p.totalSessions !== undefined) {
      total = parseInt(p.totalSessions, 10);
      if (isNaN(total) || total < 1) throw new Error('จำนวนครั้งต้องเป็นตัวเลขมากกว่า 0');
    }
    const pkg = {
      id: newId_('clp'), childId: old.childId, subject: old.subject, icon: old.icon,
      totalSessions: total, dayOfWeek: old.dayOfWeek, note: old.note || '', active: true,
      createdAt: new Date().toISOString(),
    };
    insert_(TAB.ClassPackages, pkg);
    update_(TAB.ClassPackages, old.id, { active: false });
    return { id: pkg.id };
  },

  // {id} — ลบแพ็กคลาสจริง พร้อมประวัติการเรียนทั้งหมดของแพ็กนั้น (แก้ข้อมูลที่กรอกผิดได้เต็มที่
  // ไม่เหมือนงานบ้าน/ของรางวัลที่ต้องเก็บประวัติไว้เพราะผูกกับแต้มที่แจกไปแล้วจริง)
  'parent.classes.delete': function (s, p) {
    where_(TAB.ClassSessions, function (x) { return String(x.packageId) === String(p.id); })
      .forEach(function (x) { remove_(TAB.ClassSessions, x.id); });
    remove_(TAB.ClassPackages, p.id);
    return { deleted: true };
  },

  // {packageId} — ประวัติการเรียน/เลื่อนของแพ็กนี้ ใหม่สุดก่อน
  'parent.classes.sessions': function (s, p) {
    return where_(TAB.ClassSessions, function (x) { return String(x.packageId) === String(p.packageId); })
      .map(mapSession_)
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  },

  // {packageId, date, status, note?} — บันทึกว่าเรียนแล้ว/เลื่อน 1 ครั้ง
  'parent.classes.logSession': function (s, p) {
    if (!findById_(TAB.ClassPackages, p.packageId)) throw new Error('ไม่พบแพ็กคลาส');
    const date = toDateStr_(p.date) || toDateStr_(new Date());
    const status = p.status === CLASS_SESSION_STATUS.RESCHEDULED ? CLASS_SESSION_STATUS.RESCHEDULED : CLASS_SESSION_STATUS.DONE;
    const session = {
      id: newId_('cls'), packageId: p.packageId, date: date, status: status,
      note: p.note || '', createdAt: new Date().toISOString(),
    };
    insert_(TAB.ClassSessions, session);
    return mapSession_(session);
  },

  // {id} — ลบประวัติ 1 ครั้งที่บันทึกผิด
  'parent.classes.deleteSession': function (s, p) {
    remove_(TAB.ClassSessions, p.id);
    return { deleted: true };
  },
};
