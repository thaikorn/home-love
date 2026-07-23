import React, { useEffect, useState, useCallback } from 'react';
import { call, getToken, setToken } from './api.js';
import Login from './screens/Login.jsx';
import ChildApp from './screens/ChildApp.jsx';
import ParentApp from './screens/ParentApp.jsx';
import { ToastProvider } from './components.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [session, setSession] = useState(null); // {role, refId, name}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const me = await call('auth.me');
        setSession(me);
      } catch {
        setToken('');
      }
      setLoading(false);
    })();
  }, []);

  const onLogin = useCallback((result) => {
    setToken(result.token);
    setSession({ role: result.role, refId: result.refId, name: result.name });
  }, []);

  const onLogout = useCallback(async () => {
    try { await call('auth.logout'); } catch { /* ignore */ }
    setToken('');
    setSession(null);
  }, []);

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!session) return <Login onLogin={onLogin} />;
  if (session.role === 'child') return <ChildApp session={session} onLogout={onLogout} />;
  return <ParentApp session={session} onLogout={onLogout} />;
}
