import React, { useEffect, useState, useCallback } from 'react';
import { call, getToken, setToken, getCachedSession, setCachedSession, onStale } from './api.js';
import Login from './screens/Login.jsx';
import ChildApp from './screens/ChildApp.jsx';
import ParentApp from './screens/ParentApp.jsx';
import { ToastProvider } from './components.jsx';

export default function App() {
  return (
    <ToastProvider>
      <UpdateBar />
      <Root />
    </ToastProvider>
  );
}

/**
 * แถบ "มีเวอร์ชันใหม่" — หน้าที่เปิดค้างข้ามรอบ deploy จะรันโค้ดเก่าต่อไป (ดู onStale ใน api.js)
 *
 * ไม่รีโหลดทันทีที่รู้ — เด็กอาจกำลังแนบรูปส่งงานอยู่แล้วรูปหาย
 * รอจังหวะที่แอปกลับมาหน้าจอครั้งถัดไปแทน (ตอนนั้นไม่มีอะไรค้างกลางคัน) หรือให้แตะแถบเอง
 */
function UpdateBar() {
  const [build, setBuild] = useState('');
  useEffect(() => onStale(setBuild), []);

  useEffect(() => {
    if (!build || reloadedFor(build)) return; // รีโหลดไปแล้วแต่ id ยังไม่ตรง — อย่าวน ปล่อยให้กดเอง
    const onVis = () => { if (document.visibilityState === 'visible') update(build); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [build]);

  if (!build) return null;
  return (
    <button className="updatebar" onClick={() => update(build)}>
      ✨ มีเวอร์ชันใหม่ · แตะเพื่ออัปเดต
    </button>
  );
}

const RELOAD_KEY = 'homelove_reloaded_';
function reloadedFor(build) {
  try { return sessionStorage.getItem(RELOAD_KEY + build) === '1'; } catch { return false; }
}
function update(build) {
  try { sessionStorage.setItem(RELOAD_KEY + build, '1'); } catch { /* ignore */ }
  window.location.reload();
}

function Root() {
  /**
   * เดิมต้องรอ auth.me ตอบก่อนถึงจะรู้ว่าเป็นเด็กหรือผู้ปกครอง แล้วค่อยเริ่มโหลดข้อมูลหน้าแรก
   * = รอ Apps Script สองรอบต่อกันกว่าจะเห็นอะไร ทั้งที่รอบแรกได้มาแค่ชื่อกับบทบาท
   *
   * ตอนนี้จำ session ล่าสุดไว้ในเครื่อง เข้าหน้าจริงได้เลย แล้วยิง auth.me
   * ตามไปตรวจแบบไม่บล็อกหน้าจอ (ไปรวมอยู่ใน batch เดียวกับข้อมูลหน้าแรกพอดี)
   * token เสีย/หมดอายุเมื่อไหร่ก็เด้งกลับหน้าล็อกอินตอนนั้น
   */
  const cached = getToken() ? getCachedSession() : null;
  const [session, setSession] = useState(cached); // {role, refId, name}
  const [loading, setLoading] = useState(!!getToken() && !cached);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    call('auth.me').then(
      (me) => {
        if (!alive) return;
        if (!me) { setToken(''); setCachedSession(null); }
        else setCachedSession(me);
        setSession(me);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        // เน็ตสะดุดทั้งที่มี session เก่าอยู่ — ปล่อยให้ใช้หน้าเดิมต่อ อย่าเตะออก
        if (!cached) { setToken(''); setSession(null); }
        setLoading(false);
      },
    );
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLogin = useCallback((result) => {
    setToken(result.token);
    const me = { role: result.role, refId: result.refId, name: result.name };
    setCachedSession(me);
    setSession(me);
  }, []);

  const onLogout = useCallback(async () => {
    try { await call('auth.logout'); } catch { /* ignore */ }
    setToken('');
    setCachedSession(null);
    setSession(null);
  }, []);

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!session) return <Login onLogin={onLogin} />;
  if (session.role === 'child') return <ChildApp session={session} onLogout={onLogout} />;
  return <ParentApp session={session} onLogout={onLogout} />;
}
