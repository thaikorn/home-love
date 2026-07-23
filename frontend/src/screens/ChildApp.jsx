import React, { useEffect, useState, useCallback } from 'react';
import { call, fileToDataUrl } from '../api.js';
import { useToast, Loading, Empty, Modal, StatusChip, fmtDate } from '../components.jsx';

const TABS = [
  { key: 'home', label: 'หน้าหลัก', ic: '🏠' },
  { key: 'chores', label: 'ทำงาน', ic: '🧹' },
  { key: 'status', label: 'สถานะ', ic: '📋' },
  { key: 'shop', label: 'ร้านรางวัล', ic: '🎁' },
  { key: 'wish', label: 'อธิษฐาน', ic: '⭐' },
];

export default function ChildApp({ session, onLogout }) {
  const [tab, setTab] = useState('home');
  return (
    <div className="app">
      <div className="topbar">
        <div><h1>สวัสดี {session.name} 👋</h1></div>
        <button className="btn gray sm" onClick={onLogout}>ออก</button>
      </div>
      <div className="app-body">
        {tab === 'home' && <Home />}
        {tab === 'chores' && <Chores session={session} />}
        {tab === 'status' && <Status />}
        {tab === 'shop' && <Shop />}
        {tab === 'wish' && <Wish />}
      </div>
      <nav className="bottomnav">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            <span className="ic">{t.ic}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Home() {
  const toast = useToast();
  const [st, setSt] = useState(null);
  useEffect(() => { call('child.state').then(setSt).catch((e) => toast(e.message, 'err')); }, [toast]);
  if (!st) return <Loading />;
  return (
    <div>
      <div className="stats">
        <div className="stat"><div className="num">{st.points}</div><div className="lbl">แต้มสะสม</div></div>
        <div className="stat"><div className="num">🔥{st.streakCurrent}</div><div className="lbl">สตรีคตอนนี้</div></div>
        <div className="stat"><div className="num">{st.streakMax}</div><div className="lbl">สตรีคสูงสุด</div></div>
      </div>
      <div className="card">
        <h2>เหรียญรางวัล 🏅</h2>
        {st.badges.length === 0 ? <Empty text="ยังไม่มีเหรียญ — ทำงานต่อเนื่องเพื่อรับเหรียญ!" /> : (
          <div className="badges">
            {st.badges.map((b, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="medal">🏅</div>
                <div className="muted">{b.kind.replace('streak-', '')} วัน</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chores({ session }) {
  const toast = useToast();
  const [chores, setChores] = useState(null);
  const [sel, setSel] = useState(null);

  const load = useCallback(() => {
    call('child.chores').then(setChores).catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(load, [load]);

  if (chores === null) return <Loading />;
  return (
    <div>
      <div className="card">
        <h2>งานที่ทำได้ตอนนี้</h2>
        {chores.length === 0 ? <Empty text="ตอนนี้ไม่มีงานในช่วงเวลานี้" /> : (
          <div className="tiles">
            {chores.map((c) => (
              <button key={c.id + c.timeWindowId} className="tile" onClick={() => setSel(c)}>
                <div className="emoji">{c.icon || '🧹'}</div>
                <div className="name">{c.name}</div>
                <div className="meta">{c.basePoints} แต้ม · {c.timeWindowName}</div>
                <div className="meta">{c.onTime ? '⏰ ทันเวลา' : '⚠️ สายแล้ว (ลดแต้ม)'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {sel && <SubmitModal chore={sel} session={session} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); toast('ส่งงานแล้ว รอผู้ปกครองตรวจ ✅'); }} />}
    </div>
  );
}

function SubmitModal({ chore, session, onClose, onDone }) {
  const toast = useToast();
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [team, setTeam] = useState([]);
  const [mates, setMates] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call('auth.childList').then((list) => setMates(list.filter((c) => c.id !== session.refId)));
  }, [session.refId]);

  async function pick(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setPhoto(url); setPreview(url);
    } catch { toast('อ่านรูปไม่สำเร็จ', 'err'); }
  }
  function toggleMate(id) {
    setTeam((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);
  }
  async function submit() {
    if (!photo) return toast('แนบรูปก่อนนะ 📸', 'err');
    setBusy(true);
    try {
      await call('child.submit', { choreId: chore.id, timeWindowId: chore.timeWindowId, photo, teamMemberIds: team });
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={`ส่งงาน: ${chore.name}`} onClose={onClose}>
      <label>ถ่ายรูป / เลือกรูปผลงาน (บังคับ)</label>
      <input type="file" accept="image/*" capture="environment" onChange={pick} />
      {preview && <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 12, marginTop: 10 }} />}
      {mates.length > 0 && (
        <>
          <label className="mt">ทำเป็นทีม? เลือกเพื่อน (แต่ละคนได้ 70%)</label>
          <div className="tag-days">
            {mates.map((m) => (
              <button key={m.id} className={team.includes(m.id) ? 'on' : ''} onClick={() => toggleMate(m.id)}>
                {m.avatar} {m.name}
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn mt" onClick={submit} disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งงาน'}</button>
    </Modal>
  );
}

function Status() {
  const toast = useToast();
  const [subs, setSubs] = useState(null);
  useEffect(() => { call('child.submissions').then(setSubs).catch((e) => toast(e.message, 'err')); }, [toast]);
  if (subs === null) return <Loading />;
  return (
    <div className="card">
      <h2>สถานะงานของหนู</h2>
      {subs.length === 0 ? <Empty /> : subs.map((s) => (
        <div key={s.id} className="item">
          {s.photoUrl ? <img className="thumb" src={s.photoUrl} alt="" /> : <div className="thumb" />}
          <div className="grow">
            <div className="title">{s.choreName}</div>
            <div className="sub">{fmtDate(s.submittedAt)}</div>
            {s.status === 'ผ่าน' && <div className="sub">ได้ {s.pointsPerPerson} แต้ม (คุณภาพ {s.quality}%)</div>}
            {s.status === 'ตีกลับ' && <div className="sub" style={{ color: 'var(--bad)' }}>เหตุผล: {s.rejectReason}</div>}
          </div>
          <StatusChip status={s.status} />
        </div>
      ))}
    </div>
  );
}

function Shop() {
  const toast = useToast();
  const [rewards, setRewards] = useState(null);
  const [reds, setReds] = useState([]);
  const [points, setPoints] = useState(0);

  const load = useCallback(() => {
    Promise.all([call('child.rewards'), call('child.redemptions'), call('child.state')])
      .then(([rw, rd, st]) => { setRewards(rw); setReds(rd); setPoints(st.points); })
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(load, [load]);

  async function redeem(r) {
    if (points < r.cost) return toast('แต้มยังไม่พอ', 'err');
    try {
      await call('child.redeem', { rewardId: r.id });
      toast('ขอแลกแล้ว รอผู้ปกครองอนุมัติ 🎁');
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  if (rewards === null) return <Loading />;
  return (
    <div>
      <div className="stat" style={{ marginBottom: 14 }}>
        <div className="num">{points}</div><div className="lbl">แต้มที่มี</div>
      </div>
      <div className="card">
        <h2>ร้านของรางวัล</h2>
        {rewards.length === 0 ? <Empty /> : rewards.map((r) => (
          <div key={r.id} className="item">
            <div className="grow"><div className="title">{r.name}</div><div className="sub">{r.cost} แต้ม</div></div>
            <button className="btn sm" disabled={points < r.cost} onClick={() => redeem(r)}>แลก</button>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>คำขอแลกของหนู</h2>
        {reds.length === 0 ? <Empty /> : reds.map((r) => (
          <div key={r.id} className="item">
            <div className="grow"><div className="title">{r.rewardName}</div><div className="sub">{r.pointsReserved} แต้ม · {fmtDate(r.requestedAt)}</div></div>
            <StatusChip status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Wish() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim()) return toast('พิมพ์คำอธิษฐานก่อน', 'err');
    setBusy(true);
    try { await call('child.wish', { text }); setText(''); toast('ส่งคำอธิษฐานแล้ว ⭐'); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  }
  return (
    <div className="card">
      <h2>อธิษฐานขอของ ⭐</h2>
      <p className="muted">บอกผู้ปกครองว่าหนูอยากได้อะไร เผื่อจะกลายเป็นของรางวัล!</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="หนูอยากได้…" />
      <button className="btn mt" onClick={send} disabled={busy}>ส่งคำอธิษฐาน</button>
    </div>
  );
}
