import React, { useState, useCallback, createContext, useContext } from 'react';

// ---------- Toast ----------
const ToastCtx = createContext(() => {});
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={'toast ' + (toast.type === 'err' ? 'err' : '')}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

// ---------- Modal (bottom sheet) ----------
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{title}</h2>
          <button className="btn gray sm" onClick={onClose}>ปิด</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Loading / Empty ----------
export function Loading() { return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>; }
export function Empty({ text }) { return <div className="empty">{text || 'ยังไม่มีข้อมูล'}</div>; }

// ---------- status chip ----------
export function StatusChip({ status }) {
  const map = {
    'รอตรวจ': 'warn', 'รออนุมัติ': 'warn', 'ใหม่': 'warn',
    'ผ่าน': 'ok', 'อนุมัติ': 'ok', 'แปลงเป็นรางวัลแล้ว': 'ok',
    'ตีกลับ': 'bad', 'ปฏิเสธ': 'bad',
  };
  return <span className={'chip ' + (map[status] || 'warn')}>{status}</span>;
}

// วันที่แบบไทยสั้นๆ
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
