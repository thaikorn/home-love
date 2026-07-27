import React, { useEffect, useState, useCallback } from 'react';
import { call } from '../api.js';
import { useToast, Empty, Modal, StatusChip, HudNav, AppBody, useLoad, fmtDate } from '../components.jsx';
import { confetti, play } from '../fx.js';
import ParentSettings from './ParentSettings.jsx';

const TABS = [
  { key: 'review', label: 'ตรวจงาน', ic: '✅' },
  { key: 'redeem', label: 'แลกของ', ic: '🎁' },
  { key: 'wishes', label: 'อธิษฐาน', ic: '⭐' },
  { key: 'points', label: 'แต้ม', ic: '💎' },
  { key: 'settings', label: 'ตั้งค่า', ic: '⚙️' },
];

export default function ParentApp({ session, onLogout }) {
  const [tab, setTab] = useState('review');
  const [counts, setCounts] = useState({});
  // ตัวเลขของค้างบนเมนู — โหลดใหม่ทุกครั้งที่สลับแท็บ
  useEffect(() => { call('parent.counts').then(setCounts).catch(() => {}); }, [tab]);
  return (
    <div className="app">
      <div className="topbar">
        <div><h1>ผู้ปกครอง</h1><div className="sub">{session.name}</div></div>
        <button className="btn gray sm" onClick={onLogout}>ออก</button>
      </div>
      <AppBody scrollKey={tab}>
        {tab === 'review' && <ReviewQueue />}
        {tab === 'redeem' && <RedeemQueue />}
        {tab === 'wishes' && <Wishes />}
        {tab === 'points' && <PointsView />}
        {tab === 'settings' && <ParentSettings />}
      </AppBody>
      <HudNav tabs={TABS} active={tab} onChange={setTab} badges={counts} />
    </div>
  );
}

function ReviewQueue() {
  const [sel, setSel] = useState(null);
  const { data: queue, load, view } = useLoad(useCallback(() => call('parent.reviewQueue'), []));
  if (view) return view;

  return (
    <div className="card">
      <h2>คิวตรวจงาน ({queue.length})</h2>
      {queue.length === 0 ? <Empty text="ไม่มีงานรอตรวจ 🎉" /> : queue.map((s) => (
        <div key={s.id} className="item">
          {s.photoUrl ? <img className="thumb" src={s.photoUrl} alt="" onClick={() => window.open(s.photoUrl, '_blank')} /> : <div className="thumb" />}
          <div className="grow">
            <div className="title">{s.choreIcon} {s.choreName}</div>
            <div className="sub">โดย {s.submittedByName}{s.teamMembers.length > 1 ? ` +ทีม ${s.teamMembers.length} คน` : ''}</div>
            <div className="sub">{fmtDate(s.submittedAt)} · ฐาน {s.basePoints} แต้ม</div>
          </div>
          <button className="btn sm" onClick={() => setSel(s)}>ตรวจ</button>
        </div>
      ))}
      {sel && <ReviewModal sub={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); }} />}
    </div>
  );
}

function ReviewModal({ sub, onClose, onDone }) {
  const toast = useToast();
  const [quality, setQuality] = useState(80);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      const r = await call('parent.approve', { submissionId: sub.id, quality });
      const kids = r.perChild || [];
      let msg = kids.length
        ? 'อนุมัติแล้ว · ' + kids.map((k) => `${k.name} +${k.points}${k.streakBonusPercent ? ` (สตรีค ${k.streak} วัน +${k.streakBonusPercent}%)` : ''}`).join(' · ')
        : `อนุมัติแล้ว +${r.pointsPerPerson} แต้ม/คน`;
      if (r.windowMultiplier > 1) msg += ` · ตัวคูณวันนี้ ×${r.windowMultiplier}`;
      const daily = kids.filter((k) => k.dailyQuestBonus > 0);
      if (daily.length) msg += ` · ภารกิจวัน +${daily[0].dailyQuestBonus} 📜`;
      if (kids.some((k) => k.shieldUsed)) msg += ' · ใช้โล่กันสตรีค 🛡️';
      const nb = Object.values(r.newBadges || {}).flat();
      if (nb.length) msg += ` · ได้เหรียญใหม่ 🏅`;
      const won = r.bossWinners || [];
      if (won.length) {
        confetti(140, 2.2); play('boss');
        msg += ` · ⚔️ ล้มบอสสำเร็จ! ทุกคนได้ +${won[0].points}`;
      } else {
        confetti(60, 1.2); play('success');
      }
      toast(msg);
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  async function reject() {
    if (!reason.trim()) return toast('ใส่เหตุผลการตีกลับก่อน', 'err');
    setBusy(true);
    try { await call('parent.reject', { submissionId: sub.id, reason }); toast('ตีกลับแล้ว'); onDone(); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={`ตรวจ: ${sub.choreName}`} onClose={onClose}>
      {sub.photoUrl && <img src={sub.photoUrl} alt="" style={{ width: '100%', borderRadius: 12 }} />}
      <div className="muted mt">ผู้ส่ง: {sub.submittedByName}{sub.teamMembers.length > 1 ? ` · ทีม: ${sub.teamMembers.map((m) => m.name).join(', ')}` : ''}</div>
      <label className="mt">คุณภาพงาน: <b>{quality}%</b></label>
      <input type="range" min="10" max="100" step="5" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
      <button className="btn ok mt" onClick={approve} disabled={busy}>อนุมัติ (ให้ {quality}%)</button>
      <label className="mt">— หรือตีกลับพร้อมเหตุผล —</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ยังไม่เรียบร้อย ลองใหม่นะ" />
      <button className="btn bad mt" onClick={reject} disabled={busy}>ตีกลับ</button>
    </Modal>
  );
}

function RedeemQueue() {
  const toast = useToast();
  const { data: queue, load, view } = useLoad(useCallback(() => call('parent.redemptionQueue'), []));
  if (view) return view;

  async function decide(id, approve) {
    try {
      await call(approve ? 'parent.approveRedeem' : 'parent.rejectRedeem', { redemptionId: id });
      toast(approve ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว (คืนแต้ม)');
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <h2>คำขอแลกของ ({queue.length})</h2>
      {queue.length === 0 ? <Empty text="ไม่มีคำขอ" /> : queue.map((r) => (
        <div key={r.id} className="item">
          <div className="grow">
            <div className="title">{r.rewardName}</div>
            <div className="sub">{r.childName} · {r.cost} แต้ม · {fmtDate(r.requestedAt)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ok sm" onClick={() => decide(r.id, true)}>อนุมัติ</button>
            <button className="btn bad sm" onClick={() => decide(r.id, false)}>ปฏิเสธ</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Wishes() {
  const toast = useToast();
  const [conv, setConv] = useState(null);
  const { data: wishes, load, view } = useLoad(useCallback(() => call('parent.wishes'), []));
  if (view) return view;

  async function close(id) {
    try { await call('parent.closeWish', { wishId: id }); toast('ปิดคำอธิษฐานแล้ว'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <h2>คำอธิษฐาน ({wishes.length})</h2>
      {wishes.length === 0 ? <Empty /> : wishes.map((w) => (
        <div key={w.id} className="item">
          <div className="grow">
            <div className="title">{w.text}</div>
            <div className="sub">{w.childName} · {fmtDate(w.createdAt)}</div>
            <StatusChip status={w.status} />
          </div>
          {w.status === 'ใหม่' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => setConv(w)}>แปลงเป็นรางวัล</button>
              <button className="btn gray sm" onClick={() => close(w.id)}>ปิด</button>
            </div>
          )}
        </div>
      ))}
      {conv && <ConvertModal wish={conv} onClose={() => setConv(null)} onDone={() => { setConv(null); load(); toast('สร้างของรางวัลแล้ว 🎁'); }} />}
    </div>
  );
}

function ConvertModal({ wish, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(wish.text);
  const [cost, setCost] = useState(50);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await call('parent.convertWish', { wishId: wish.id, name, cost: Number(cost) }); onDone(); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  }
  return (
    <Modal title="แปลงคำอธิษฐานเป็นของรางวัล" onClose={onClose}>
      <label>ชื่อรางวัล</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>ราคาแต้ม</label>
      <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
      <button className="btn mt" onClick={save} disabled={busy}>สร้างของรางวัล</button>
    </Modal>
  );
}

function PointsView() {
  const toast = useToast();
  const [adj, setAdj] = useState(null);
  const { data: report, load, view } = useLoad(useCallback(() => call('parent.report'), []));
  if (view) return view;

  return (
    <div className="card">
      <h2>แต้ม &amp; เลเวลลูกๆ</h2>
      {report.length === 0 ? <Empty /> : report.map((c) => (
        <div key={c.id} className="item">
          <div className="grow">
            <div className="title">{c.avatar} {c.name} <span className="chip ok">LV.{(c.level || {}).level ?? 1}</span> {!c.active && <span className="chip bad">ปิดใช้งาน</span>}</div>
            <div className="sub">🔥 ทำต่อเนื่อง {c.streakCurrent} วัน (สูงสุด {c.streakMax}){c.streakBonusPercent > 0 ? ` · โบนัส +${c.streakBonusPercent}%` : ''}</div>
            <div className="sub">{(c.level || {}).titleIcon} {(c.level || {}).title} · XP รวม {(c.level || {}).xp ?? 0} · อีก {(c.level || {}).xpToNext ?? 0} ขึ้นเลเวล{c.shields > 0 ? ` · 🛡️ ${c.shields}` : ''}</div>
          </div>
          <div className="right">
            <div className="num" style={{ fontWeight: 800, color: 'var(--pink-dark)' }}>{c.points}</div>
            <button className="btn sm mt" onClick={() => setAdj(c)}>ปรับแต้ม</button>
          </div>
        </div>
      ))}
      {adj && <AdjustModal child={adj} onClose={() => setAdj(null)} onDone={() => { setAdj(null); load(); toast('ปรับแต้มแล้ว'); }} />}
    </div>
  );
}

function AdjustModal({ child, onClose, onDone }) {
  const toast = useToast();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => { call('parent.adjustments', { childId: child.id }).then(setHistory).catch(() => {}); }, [child.id]);

  async function save(sign) {
    const n = Math.abs(parseInt(delta, 10)) * sign;
    if (!n || isNaN(n)) return toast('ใส่จำนวนแต้ม', 'err');
    if (!reason.trim()) return toast('ต้องใส่เหตุผลทุกครั้ง', 'err');
    setBusy(true);
    try { await call('parent.adjustPoints', { childId: child.id, delta: n, reason }); onDone(); }
    catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={`ปรับแต้ม: ${child.name}`} onClose={onClose}>
      <div className="muted">แต้มปัจจุบัน: <b>{child.points}</b></div>
      <label className="mt">จำนวนแต้ม</label>
      <input type="number" min="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="เช่น 10" />
      <label className="mt">เหตุผล (บังคับ)</label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น โบนัสช่วยงานพิเศษ" />
      <div className="row mt">
        <button className="btn ok" onClick={() => save(1)} disabled={busy}>➕ บวกแต้ม</button>
        <button className="btn bad" onClick={() => save(-1)} disabled={busy}>➖ ลบแต้ม</button>
      </div>
      {history.length > 0 && (
        <>
          <h2 className="mt">ประวัติการปรับ</h2>
          {history.slice(0, 8).map((h) => (
            <div key={h.id} className="item">
              <div className="grow"><div className="title">{h.delta > 0 ? '+' : ''}{h.delta} แต้ม</div><div className="sub">{h.reason} · {fmtDate(h.createdAt)}</div></div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
