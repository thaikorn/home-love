import React, { useEffect, useState, useCallback } from 'react';
import { call, callBatch, fileToDataUrl } from '../api.js';
import { useToast, Empty, Modal, StatusChip, HudNav, AppBody, useLoad, fmtDate } from '../components.jsx';
import { confetti, floatText, play, checkLevelUp, soundOn, toggleSound } from '../fx.js';

const TABS = [
  { key: 'home', label: 'หน้าหลัก', ic: '🏠' },
  { key: 'chores', label: 'ภารกิจ', ic: '⚔️' },
  { key: 'status', label: 'สถานะ', ic: '📋' },
  { key: 'shop', label: 'ร้านค้า', ic: '🎁' },
  { key: 'wish', label: 'อธิษฐาน', ic: '⭐' },
];

export default function ChildApp({ session, onLogout }) {
  const [tab, setTab] = useState('home');
  const [counts, setCounts] = useState({});
  // nonce เปลี่ยน = สั่งให้หน้าที่เปิดอยู่ remount แล้วดึงข้อมูลใหม่
  const [nonce, setNonce] = useState(0);
  // ตัวเลขบนเมนู — โหลดใหม่ทุกครั้งที่สลับแท็บ
  useEffect(() => { call('child.counts').then(setCounts).catch(() => {}); }, [tab, nonce]);
  return (
    <div className="app">
      <div className="topbar">
        <div><h1>สวัสดี {session.name} 👋</h1><div className="sub">พร้อมลุยภารกิจหรือยัง?</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn gray sm" onClick={() => setNonce((n) => n + 1)} title="โหลดใหม่">🔄</button>
          <SoundToggle />
          <button className="btn gray sm" onClick={onLogout}>ออก</button>
        </div>
      </div>
      <AppBody scrollKey={tab}>
        {tab === 'home' && <Home key={nonce} />}
        {tab === 'chores' && <Chores key={nonce} session={session} />}
        {tab === 'status' && <Status key={nonce} />}
        {tab === 'shop' && <Shop key={nonce} />}
        {tab === 'wish' && <Wish key={nonce} />}
      </AppBody>
      <HudNav tabs={TABS} active={tab} onChange={setTab} badges={{ chores: counts.chores, status: counts.pending }} />
    </div>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(soundOn());
  return (
    <button className="btn gray sm" onClick={() => setOn(toggleSound())} title="เปิด/ปิดเสียง">
      {on ? '🔊' : '🔇'}
    </button>
  );
}

function Home() {
  const toast = useToast();
  const { data, load, view } = useLoad(useCallback(
    () => callBatch([['child.state'], ['child.leaderboard']]).then(([x, board]) => {
      checkLevelUp(x.id, x.level && x.level.level, x.level && x.level.title); // ขึ้นเลเวล = ฉลองเต็มจอ
      return { st: x, board: board || [] };
    }), []));
  if (view) return view;
  const { st, board } = data;

  async function buyShield() {
    try {
      const r = await call('child.buyShield');
      play('coin'); floatText('🛡️ +1', { className: 'cool' });
      toast(`ได้โล่แล้ว! มีโล่ ${r.shields} อัน`);
      load();
    } catch (e) { play('error'); toast(e.message, 'err'); }
  }
  const lv = st.level || { level: 1, xpInLevel: 0, xpForLevel: 200, xpToNext: 200, xp: 0 };
  const lvPct = Math.min(100, Math.round((lv.xpInLevel / lv.xpForLevel) * 100));
  const nextTier = st.nextStreakTier;
  const tierPct = nextTier ? Math.min(100, Math.round((st.streakCurrent / nextTier.days) * 100)) : 100;

  return (
    <div>
      <div className="card">
        <div className="levelbar">
          <div className="lv"><small>LV</small><b>{lv.level}</b></div>
          <div className="grow">
            <div className="bar-label"><span>{st.avatar} {st.name} · {lv.titleIcon} {lv.title}</span><span>{lv.xpInLevel}/{lv.xpForLevel} XP</span></div>
            <div className="bar"><i style={{ width: lvPct + '%' }} /></div>
            <div className="muted" style={{ marginTop: 4 }}>อีก {lv.xpToNext} แต้ม → เลเวล {lv.level + 1}</div>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="num">{st.points}</div><div className="lbl">◆ แต้มที่มี</div></div>
        <div className="stat"><div className="num">🔥{st.streakCurrent}</div><div className="lbl">ทำต่อเนื่อง (วัน)</div></div>
        <div className="stat"><div className="num">{st.streakMax}</div><div className="lbl">สถิติสูงสุด</div></div>
      </div>

      <div className="card">
        <h2>🔥 คอมโบทำต่อเนื่อง</h2>
        {st.streakBonusPercent > 0
          ? <p>ทำติดกัน <b>{st.streakCurrent} วัน</b> → ทุกงานได้แต้ม <b style={{ color: 'var(--gold)' }}>+{st.streakBonusPercent}%</b> 🎉</p>
          : <p className="muted">ทำงานให้ผ่านทุกวันติดกัน แล้วจะได้แต้มเพิ่มทุกงาน</p>}
        {nextTier && (
          <>
            <div className="bar-label">
              <span>ขั้นถัดไป +{nextTier.percent}%</span>
              <span>{st.streakCurrent}/{nextTier.days} วัน</span>
            </div>
            <div className="bar gold"><i style={{ width: tierPct + '%' }} /></div>
            <div className="muted" style={{ marginTop: 4 }}>อีก {nextTier.days - st.streakCurrent} วันติดกัน</div>
          </>
        )}
      </div>
      {st.boss && (
        <div className="card boss-card">
          <h2>🐉 บอสประจำสัปดาห์</h2>
          <div className={'face' + (st.boss.defeated ? ' down' : '')}>{st.boss.emoji}</div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{st.boss.name}</div>
          <div className="bar-label">
            <span>{st.boss.defeated ? 'ล้มบอสสำเร็จ! 🎉' : 'HP เหลือ ' + st.boss.hpLeft}</span>
            <span>{st.boss.damage}/{st.boss.target}</span>
          </div>
          <div className="bar hp"><i style={{ width: (100 - st.boss.percent) + '%' }} /></div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {st.boss.defeated
              ? `ทุกคนได้ +${st.boss.reward} แต้ม เจอกันใหม่สัปดาห์หน้า!`
              : `ช่วยกันทั้งบ้านสะสมแต้มให้ครบ ${st.boss.target} แล้วทุกคนได้ +${st.boss.reward} แต้ม`}
          </p>
        </div>
      )}

      {st.dailyQuest && st.dailyQuest.bonus > 0 && (
        <div className="card">
          <h2>📜 ภารกิจประจำวัน</h2>
          <div className="bar-label">
            <span>ทำงานให้ผ่านครบ {st.dailyQuest.target} ชิ้นวันนี้ → +{st.dailyQuest.bonus} แต้ม</span>
            <span>{st.dailyQuest.done}/{st.dailyQuest.target}</span>
          </div>
          <div className="bar gold"><i style={{ width: Math.round((st.dailyQuest.done / st.dailyQuest.target) * 100) + '%' }} /></div>
          {st.dailyQuest.claimed && <p className="muted" style={{ marginBottom: 0 }}>รับโบนัสวันนี้แล้ว ✅</p>}
        </div>
      )}

      <div className="card">
        <h2>🛡️ โล่กันสตรีคขาด</h2>
        <p className="muted">ถ้าลืมทำงานไป 1 วัน โล่จะกันไม่ให้สตรีคหลุด (ใช้อัตโนมัติ)</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 30 }}>{'🛡️'.repeat(st.shields) || '—'}</div>
          <div className="grow" style={{ flex: 1 }}>มีอยู่ {st.shields}/{st.shieldMax} อัน</div>
          <button className="btn sm" disabled={st.shields >= st.shieldMax || st.points < st.shieldCost} onClick={buyShield}>
            ซื้อ {st.shieldCost} แต้ม
          </button>
        </div>
      </div>

      {board.length > 1 && (
        <div className="card">
          <h2>🏆 กระดานผู้นำสัปดาห์นี้</h2>
          {board.map((c, i) => (
            <div key={c.id} className={'rank' + (i === 0 ? ' top' : '')}>
              <div className="pos">{['🥇', '🥈', '🥉'][i] || (i + 1)}</div>
              <div className="face">{c.avatar}</div>
              <div className="who">
                <div><b style={{ color: c.color }}>{c.name}</b> <span className="chip ok">LV.{c.level}</span></div>
                <div className="sub muted">{c.titleIcon} {c.title} · 🔥 {c.streakCurrent} วัน</div>
              </div>
              <div className="pts">{c.weekPoints}</div>
            </div>
          ))}
          <p className="muted" style={{ marginBottom: 0 }}>นับแต้มที่ทำได้ตั้งแต่วันจันทร์</p>
        </div>
      )}

      <div className="card">
        <h2>🏅 เหรียญที่สะสมได้</h2>
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
  const [sel, setSel] = useState(null);
  const { data: chores, load, view } = useLoad(useCallback(() => call('child.chores'), []));
  if (view) return view;
  return (
    <div>
      <div className="card">
        <h2>⚔️ ภารกิจที่ทำได้ตอนนี้</h2>
        {chores.length === 0 ? <Empty text="ตอนนี้ไม่มีงานในช่วงเวลานี้" /> : (
          <div className="tiles">
            {chores.map((c) => (
              <button key={c.id + c.timeWindowId} className="tile" onClick={() => setSel(c)}>
                <div className="emoji">{c.icon || '🧹'}</div>
                <div className="name">{c.name}</div>
                <div className="meta">
                  {c.basePoints} แต้ม{c.multiplierToday > 1 && <b style={{ color: 'var(--pink-dark)' }}> ×{c.multiplierToday} วันนี้!</b>}
                  {' · '}{c.timeWindowName} (ถึง {c.endTime} น.)
                </div>
                <div className="meta">{c.onTime ? `⏰ ทันเวลา — ส่งก่อน ${c.cutoff} น.` : `⚠️ เลย ${c.cutoff} น. แล้ว (ได้แต้มน้อยลง)`}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {sel && <SubmitModal chore={sel} session={session} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); confetti(70, 1.3); play('success'); floatText('ส่งงานแล้ว!'); toast('ส่งงานแล้ว รอผู้ปกครองตรวจ ✅'); }} />}
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
    <Modal
      title={`ส่งงาน: ${chore.name}`}
      onClose={onClose}
      action={<button className="btn" onClick={submit} disabled={busy}>{busy ? 'กำลังส่ง…' : '✅ ส่งงาน'}</button>}
    >
      <label>รูปผลงาน (บังคับ) — ถ่ายใหม่ หรือเลือกจากคลังรูป/ไฟล์ในเครื่องก็ได้</label>
      {/* ห้ามใส่ capture="environment" — iOS จะเด้งกล้องขึ้นมาอย่างเดียว
          ไม่ขึ้นเมนูให้เลือกคลังรูปหรือไฟล์ ตัดทางเลือกทิ้งไปเฉยๆ */}
      <input type="file" accept="image/*" onChange={pick} />
      {preview && <img className="photo mt" src={preview} alt="preview" />}
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
    </Modal>
  );
}

function Status() {
  const { data: subs, view } = useLoad(useCallback(() => call('child.submissions'), []));
  if (view) return view;
  return (
    <div className="card">
      <h2>สถานะงานของหนู</h2>
      {subs.length === 0 ? <Empty /> : subs.map((s) => (
        <div key={s.id} className="item">
          {s.photoUrl ? <img className="thumb" src={s.photoUrl} alt="" referrerPolicy="no-referrer" /> : <div className="thumb" />}
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
  // สามชุดนี้ต้องใช้พร้อมกัน — ส่งไปรอบเดียว
  const { data, load, view } = useLoad(useCallback(
    () => callBatch([['child.rewards'], ['child.redemptions'], ['child.state']])
      .then(([rw, rd, st]) => ({ rewards: rw, reds: rd, points: st.points })), []));

  if (view) return view;
  const { rewards, reds, points } = data;

  async function redeem(r) {
    if (points < r.cost) return toast('แต้มยังไม่พอ', 'err');
    try {
      await call('child.redeem', { rewardId: r.id });
      play('coin'); floatText(`-${r.cost} ◆`, { className: 'cool' });
      toast('ขอแลกแล้ว รอผู้ปกครองอนุมัติ 🎁');
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

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
