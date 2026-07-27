import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

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
/**
 * action = ปุ่มลงมือหลัก อยู่ "บนสุด" ติดกับหัวข้อ ไม่ใช่ท้ายกล่อง
 *
 * ⚠️ ต้องแขวนไว้ที่ document.body ผ่าน portal เท่านั้น ห้ามปล่อยให้อยู่ในต้นไม้ของ .app-body
 *    บน iOS ตัว .app-body (กล่องที่มีสกอลบาร์ของตัวเอง) กลายเป็นกรอบอ้างอิงของลูกที่เป็น
 *    position:fixed และสร้าง stacking context ใหม่ ผลคือ inset:0 ไปกางเท่ากรอบเนื้อหา
 *    ไม่ใช่เท่าจอ แล้ว z-index:50 ของกล่องก็สู้ z-index:20 ของแถบเมนูล่างไม่ได้
 *    ปุ่มท้ายกล่องเลยไปนอนอยู่ใต้แถบเมนู มองไม่เห็นและกดไม่ได้
 *    อาการที่สังเกตได้: ฉากมืดหลังกล่องไม่คลุมแถบหัวกับแถบเมนูล่าง มันจบพอดีที่ขอบพื้นที่เนื้อหา
 */
export function Modal({ title, onClose, action, children }) {
  return createPortal(
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <h2>{title}</h2>
            <button className="btn gray sm" onClick={onClose}>ปิด</button>
          </div>
          {action && <div className="modal-action">{action}</div>}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ---------- เมนูล่างแบบ HUD เกม ----------
/**
 * tabs: [{key, label, ic}] · badges: { [key]: number } (0/ไม่มี = ไม่แสดง)
 */
export function HudNav({ tabs, active, onChange, badges = {} }) {
  return (
    <nav className="bottomnav">
      {tabs.map((t) => {
        const n = badges[t.key] || 0;
        return (
          <button
            key={t.key}
            className={active === t.key ? 'active' : ''}
            onClick={() => onChange(t.key)}
            aria-label={t.label}
          >
            <span className="slot">
              <span className="ic">{t.ic}</span>
              {n > 0 && <span className="badge">{n > 99 ? '99+' : n}</span>}
            </span>
            <span className="lb">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- โครงหน้า: ส่วนเนื้อหาที่มีสกอลบาร์ของตัวเอง ----------
/** สลับแท็บทีให้ดีดกลับขึ้นบนสุด ไม่ค้างอยู่ตำแหน่งที่เลื่อนไว้ของแท็บก่อนหน้า */
export function AppBody({ scrollKey, children }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [scrollKey]);
  return <div className="app-body" ref={ref}>{children}</div>;
}

/** ให้หน้าจอย่อย (เช่น แท็บย่อยในหน้าตั้งค่า) สั่งเลื่อนขึ้นบนสุดเองได้ */
export function scrollBodyTop() {
  const el = typeof document !== 'undefined' && document.querySelector('.app-body');
  if (el) el.scrollTop = 0;
}

// ---------- Loading / Empty / โหลดพลาด ----------
export function Loading() { return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>; }
export function Empty({ text }) { return <div className="empty">{text || 'ยังไม่มีข้อมูล'}</div>; }

export function ErrorRetry({ message, onRetry }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 34 }}>⚠️</div>
      <p>{message || 'โหลดข้อมูลไม่สำเร็จ'}</p>
      <button className="btn sm" onClick={onRetry}>ลองใหม่</button>
    </div>
  );
}

/**
 * โหลดข้อมูลแบบมาตรฐาน: กำลังโหลด → ได้ข้อมูล / พลาดแล้วกดลองใหม่ได้
 * (เดิมถ้าโหลดพลาดจะขึ้น toast แล้วปล่อยให้สปินเนอร์หมุนค้างตลอดกาล)
 * loader ต้องห่อด้วย useCallback · คืน view = <Loading/>/<ErrorRetry/> ถ้ายังไม่มีข้อมูลให้แสดง
 */
export function useLoad(loader) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    return Promise.resolve().then(loader)
      .then((d) => setData(d === undefined ? null : d))
      .catch((e) => setError(e.message || 'โหลดข้อมูลไม่สำเร็จ'));
  }, [loader]);
  useEffect(() => { load(); }, [load]);
  const view = error
    ? <ErrorRetry message={error} onRetry={load} />
    : (data === null ? <Loading /> : null);
  return { data, error, load, view };
}

// ---------- status chip ----------
export function StatusChip({ status }) {
  const map = {
    'รอตรวจ': 'warn', 'รออนุมัติ': 'warn', 'ใหม่': 'warn',
    'ผ่าน': 'ok', 'อนุมัติ': 'ok', 'แปลงเป็นรางวัลแล้ว': 'ok',
    'ตีกลับ': 'bad', 'ปฏิเสธ': 'bad',
  };
  return <span className={'chip ' + (map[status] || 'warn')}>{status}</span>;
}

// ---------- ตัวเลือกอีโมจิ ----------
// ไอคอนงานบ้านที่ใช้บ่อย (เลือกจากตารางได้ หรือพิมพ์อีโมจิอื่นเองก็ได้)
export const CHORE_ICONS = [
  '🧹', '🧽', '🧼', '🧺', '🪣', '🧴', '🗑️', '♻️',
  '🛏️', '🪟', '🪑', '🚪', '🛋️', '🪴', '🌱', '💧',
  '🍽️', '🥣', '🍚', '🥗', '🔪', '🍳', '☕', '🫧',
  '👕', '👚', '🧦', '👟', '🪥', '🚿', '🚽', '🧻',
  '🐶', '🐱', '🐟', '🐹', '🚗', '🛒', '📚', '✏️',
  '🎒', '🧸', '💊', '📦', '🔌', '💡', '📮', '🧾',
  '🎤', '🎸', '🥁', '🎹', '🎼',
];
// รูปประจำตัวเด็ก = 12 นักษัตร (เรียงตามปีนักษัตรไทย)
export const ZODIAC = [
  { e: '🐀', th: 'ชวด', sub: 'หนู' },
  { e: '🐂', th: 'ฉลู', sub: 'วัว' },
  { e: '🐅', th: 'ขาล', sub: 'เสือ' },
  { e: '🐇', th: 'เถาะ', sub: 'กระต่าย' },
  { e: '🐉', th: 'มะโรง', sub: 'งูใหญ่/มังกร' },
  { e: '🐍', th: 'มะเส็ง', sub: 'งูเล็ก' },
  { e: '🐎', th: 'มะเมีย', sub: 'ม้า' },
  { e: '🐐', th: 'มะแม', sub: 'แพะ' },
  { e: '🐒', th: 'วอก', sub: 'ลิง' },
  { e: '🐓', th: 'ระกา', sub: 'ไก่' },
  { e: '🐕', th: 'จอ', sub: 'หมา' },
  { e: '🐖', th: 'กุน', sub: 'หมู' },
];

/** ตัวเลือกรูปประจำตัวแบบ 12 นักษัตร (ค่าเก็บเป็นอีโมจิเหมือนเดิม) */
export function ZodiacPicker({ value, onChange, label = 'รูปประจำตัว (12 นักษัตร)' }) {
  const known = ZODIAC.some((z) => z.e === value);
  return (
    <>
      <label>{label}</label>
      <div className="zodiac-grid">
        {ZODIAC.map((z) => (
          <button
            key={z.e}
            type="button"
            className={value === z.e ? 'on' : ''}
            onClick={() => onChange(z.e)}
            title={z.sub}
          >
            <span className="face">{z.e}</span>
            <span className="nm">{z.th}</span>
            <span className="sub">{z.sub}</span>
          </button>
        ))}
      </div>
      <div className="emoji-current">
        <span className="preview">{value || '❓'}</span>
        <input value={value} maxLength={8} onChange={(ev) => onChange(ev.target.value)} placeholder="อีโมจิ" />
        <span className="muted">{known ? '' : 'อีโมจิเอง (ไม่ใช่นักษัตร)'}</span>
      </div>
    </>
  );
}

/**
 * ช่องเลือกอีโมจิ: ตารางให้กดเลือก + ช่องพิมพ์เอง (ค่าเป็น string เดียว)
 */
export function EmojiPicker({ value, onChange, options, label = 'ไอคอน' }) {
  return (
    <>
      <label>{label} <span style={{ opacity: 0.7 }}>— กดเลือก หรือพิมพ์อีโมจิเองก็ได้</span></label>
      <div className="emoji-grid">
        {options.map((e, i) => (
          <button
            key={e + i}
            type="button"
            className={value === e ? 'on' : ''}
            onClick={() => onChange(e)}
          >{e}</button>
        ))}
      </div>
      <div className="emoji-current">
        <span className="preview">{value || '❓'}</span>
        <input value={value} maxLength={8} onChange={(ev) => onChange(ev.target.value)} placeholder="อีโมจิ" />
      </div>
    </>
  );
}

// ---------- เลือกเวลาแบบไทย 24 ชั่วโมง ----------
// ไม่ใช้ <input type="time"> เพราะเบราว์เซอร์บังคับรูปแบบตาม locale ของเครื่อง
// (เครื่องที่ตั้งเป็นอังกฤษจะขึ้น am/pm ซึ่งสั่งเปลี่ยนจากโค้ดไม่ได้)
const MINUTE_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function TimeSelect({ value, onChange, label, hint }) {
  const m0 = /^\d{1,2}:\d{1,2}$/.test(value || '') ? value.split(':') : ['8', '0'];
  const h = String(parseInt(m0[0], 10) || 0).padStart(2, '0');
  const m = String(parseInt(m0[1], 10) || 0).padStart(2, '0');
  const minutes = MINUTE_STEPS.indexOf(m) >= 0 ? MINUTE_STEPS : MINUTE_STEPS.concat([m]).sort();
  return (
    <div>
      {label && <label>{label} {hint && <span style={{ opacity: 0.7 }}>{hint}</span>}</label>}
      <div className="time-select">
        <select value={h} onChange={(e) => onChange(e.target.value + ':' + m)}>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
            .map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <b>:</b>
        <select value={m} onChange={(e) => onChange(h + ':' + e.target.value)}>
          {minutes.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="muted">น.</span>
      </div>
    </div>
  );
}

// วันที่+เวลาแบบไทยสั้นๆ 24 ชั่วโมง เช่น "26 ก.ค. 21:49 น."
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = d.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return s.replace(' 24:', ' 00:') + ' น.';
}
