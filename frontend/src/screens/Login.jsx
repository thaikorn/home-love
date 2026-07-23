import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { useToast, Loading } from '../components.jsx';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('child'); // 'child' | 'parent'
  return (
    <div className="app">
      <div className="topbar"><h1>💗 Home Love</h1></div>
      <div className="app-body">
        {mode === 'child'
          ? <ChildLogin onLogin={onLogin} toParent={() => setMode('parent')} />
          : <ParentLogin onLogin={onLogin} toChild={() => setMode('child')} />}
      </div>
    </div>
  );
}

function ChildLogin({ onLogin, toParent }) {
  const toast = useToast();
  const [children, setChildren] = useState(null);
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call('auth.childList').then(setChildren).catch((e) => { toast(e.message, 'err'); setChildren([]); });
  }, [toast]);

  async function trySubmit(fullPin) {
    setBusy(true);
    try {
      const res = await call('auth.loginChild', { childId: picked.id, pin: fullPin });
      onLogin(res);
    } catch (e) {
      toast(e.message, 'err');
      setPin('');
    }
    setBusy(false);
  }

  function press(d) {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) trySubmit(next);
  }

  if (children === null) return <Loading />;

  if (!picked) {
    return (
      <div>
        <div className="card">
          <h2>แตะรูปของหนู 👇</h2>
          {children.length === 0
            ? <p className="muted">ยังไม่มีเด็กในระบบ — ให้ผู้ปกครองเพิ่มก่อน</p>
            : (
              <div className="avatars">
                {children.map((c) => (
                  <button key={c.id} className="avatar-btn" style={{ borderColor: c.color }} onClick={() => setPicked(c)}>
                    <div className="face">{c.avatar || '🙂'}</div>
                    <div className="nm">{c.name}</div>
                  </button>
                ))}
              </div>
            )}
        </div>
        <button className="btn ghost" onClick={toParent}>เข้าสู่ระบบผู้ปกครอง</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 60 }}>{picked.avatar}</div>
        <h2>สวัสดี {picked.name} — ใส่ PIN</h2>
        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => <div key={i} className={'dot' + (i < pin.length ? ' on' : '')} />)}
        </div>
        <div className="pinpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(String(n))}>{n}</button>)}
          <button onClick={() => setPin('')}>ล้าง</button>
          <button onClick={() => press('0')}>0</button>
          <button onClick={() => setPin(pin.slice(0, -1))}>⌫</button>
        </div>
      </div>
      <button className="btn ghost" onClick={() => { setPicked(null); setPin(''); }}>ย้อนกลับ</button>
    </div>
  );
}

function ParentLogin({ onLogin, toChild }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await call('auth.loginParent', { username, password });
      onLogin(res);
    } catch (err) { toast(err.message, 'err'); }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>เข้าสู่ระบบผู้ปกครอง</h2>
      <label>ชื่อผู้ใช้</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      <label>รหัสผ่าน</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      <button className="btn mt" disabled={busy}>{busy ? 'กำลังเข้า…' : 'เข้าสู่ระบบ'}</button>
      <button type="button" className="btn ghost mt" onClick={toChild}>โหมดเด็ก</button>
    </form>
  );
}
