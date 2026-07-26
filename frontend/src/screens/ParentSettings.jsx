import React, { useEffect, useState, useCallback } from 'react';
import { call } from '../api.js';
import { useToast, Loading, Empty, Modal, EmojiPicker, TimeSelect, ZodiacPicker, CHORE_ICONS } from '../components.jsx';

const SUBTABS = [
  { key: 'children', label: 'เด็ก' },
  { key: 'chores', label: 'งานบ้าน' },
  { key: 'rewards', label: 'รางวัล' },
  { key: 'timewindows', label: 'ช่วงเวลา' },
];
const DAYS = [['1', 'จ'], ['2', 'อ'], ['3', 'พ'], ['4', 'พฤ'], ['5', 'ศ'], ['6', 'ส'], ['7', 'อา']];

export default function ParentSettings() {
  const [sub, setSub] = useState('children');
  return (
    <div>
      <div className="tag-days" style={{ marginBottom: 12 }}>
        {SUBTABS.map((t) => (
          <button key={t.key} className={sub === t.key ? 'on' : ''} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>
      {sub === 'children' && <ChildrenCrud />}
      {sub === 'chores' && <ChoresCrud />}
      {sub === 'rewards' && <RewardsCrud />}
      {sub === 'timewindows' && <TimeWindowsCrud />}
    </div>
  );
}

// ---------------- เด็ก ----------------
function ChildrenCrud() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(undefined); // undefined=ปิด, null=สร้างใหม่, obj=แก้
  const load = useCallback(() => call('parent.children.list').then(setList).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  if (list === null) return <Loading />;

  async function del(c) {
    if (!confirm(`ลบ/ปิดใช้งาน "${c.name}"?`)) return;
    try { const r = await call('parent.children.delete', { id: c.id }); toast(r.softDeleted ? 'มีประวัติ — ปิดใช้งานแทน' : 'ลบแล้ว'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>เด็ก ({list.length})</h2>
        <button className="btn sm" onClick={() => setEdit(null)}>+ เพิ่ม</button>
      </div>
      {list.length === 0 ? <Empty /> : list.map((c) => (
        <div key={c.id} className="item">
          <div className="grow">
            <div className="title" style={{ color: c.color }}>{c.avatar} {c.name} {!c.active && <span className="chip bad">ปิด</span>}</div>
            <div className="sub">{c.points} แต้ม · สตรีค {c.streakCurrent}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn gray sm" onClick={() => setEdit(c)}>แก้</button>
            <button className="btn bad sm" onClick={() => del(c)}>ลบ</button>
          </div>
        </div>
      ))}
      {edit !== undefined && <ChildForm data={edit} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); load(); }} />}
    </div>
  );
}

function ChildForm({ data, onClose, onDone }) {
  const toast = useToast();
  const isNew = !data;
  const [name, setName] = useState(data?.name || '');
  const [avatar, setAvatar] = useState(data?.avatar || '🐀');
  const [color, setColor] = useState(data?.color || '#ff8fab');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(data ? data.active : true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (isNew) {
        if (!/^\d{4}$/.test(pin)) { setBusy(false); return toast('PIN ต้อง 4 หลัก', 'err'); }
        await call('parent.children.create', { name, avatar, color, pin });
      } else {
        const p = { id: data.id, name, avatar, color, active };
        if (pin) p.pin = pin;
        await call('parent.children.update', p);
      }
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'เพิ่มเด็ก' : 'แก้ไขเด็ก'} onClose={onClose}>
      <label>ชื่อ</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <ZodiacPicker value={avatar} onChange={setAvatar} />
      <label>สีประจำตัว</label>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      <label>PIN 4 หลัก {isNew ? '(บังคับ)' : '(เว้นว่าง = ไม่เปลี่ยน)'}</label>
      <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      {!isNew && <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน</label>}
      <button className="btn mt" onClick={save} disabled={busy}>บันทึก</button>
    </Modal>
  );
}

// ---------------- งานบ้าน ----------------
function ChoresCrud() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [tws, setTws] = useState([]);
  const [edit, setEdit] = useState(undefined);
  const load = useCallback(() => Promise.all([call('parent.chores.list'), call('parent.timewindows.list')])
    .then(([c, t]) => { setList(c); setTws(t); }).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  if (list === null) return <Loading />;

  async function del(c) {
    if (!confirm(`ลบ/ปิด "${c.name}"?`)) return;
    try { const r = await call('parent.chores.delete', { id: c.id }); toast(r.softDeleted ? 'มีประวัติ — ปิดใช้งานแทน' : 'ลบแล้ว'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>งานบ้าน ({list.length})</h2>
        <button className="btn sm" onClick={() => setEdit(null)}>+ เพิ่ม</button>
      </div>
      {list.length === 0 ? <Empty /> : list.map((c) => (
        <div key={c.id} className="item">
          <div className="grow">
            <div className="title">{c.icon} {c.name} {!c.active && <span className="chip bad">ปิด</span>}</div>
            <div className="sub">
              {c.basePoints} แต้ม
              {(() => {
                const names = c.timeWindowIds.map((id) => (tws.find((t) => t.id === id) || {}).name).filter(Boolean);
                return names.length
                  ? ' · ' + names.join(', ')
                  : <> · <span className="chip bad">ยังไม่ได้ตั้งช่วงเวลา — ลูกจะไม่เห็นงานนี้</span></>;
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn gray sm" onClick={() => setEdit(c)}>แก้</button>
            <button className="btn bad sm" onClick={() => del(c)}>ลบ</button>
          </div>
        </div>
      ))}
      {edit !== undefined && <ChoreForm data={edit} tws={tws} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); load(); }} />}
    </div>
  );
}

function ChoreForm({ data, tws, onClose, onDone }) {
  const toast = useToast();
  const isNew = !data;
  const [name, setName] = useState(data?.name || '');
  const [icon, setIcon] = useState(data?.icon || '🧹');
  const [basePoints, setBasePoints] = useState(data?.basePoints || 10);
  const [wins, setWins] = useState(data?.timeWindowIds || []);
  const [active, setActive] = useState(data ? data.active : true);
  const [busy, setBusy] = useState(false);

  function toggle(id) { setWins((w) => w.includes(id) ? w.filter((x) => x !== id) : [...w, id]); }
  async function save() {
    if (!name.trim()) return toast('ใส่ชื่องานก่อน', 'err');
    // งานที่ไม่ผูกช่วงเวลา = ลูกจะไม่เห็นงานนี้เลย จึงบังคับให้เลือกอย่างน้อย 1 ช่วง
    if (!wins.length) {
      return toast(tws.length ? 'เลือกช่วงเวลาที่ทำได้อย่างน้อย 1 ช่วง' : 'ไปเพิ่มช่วงเวลาที่แท็บ “ช่วงเวลา” ก่อน', 'err');
    }
    setBusy(true);
    try {
      const p = { name, icon, basePoints: Number(basePoints), timeWindowIds: wins };
      if (isNew) await call('parent.chores.create', p);
      else await call('parent.chores.update', { id: data.id, ...p, active });
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'เพิ่มงาน' : 'แก้ไขงาน'} onClose={onClose}>
      <label>ชื่องาน</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <EmojiPicker value={icon} onChange={setIcon} options={CHORE_ICONS} label="ไอคอนงาน" />
      <label>แต้มพื้นฐาน</label>
      <input type="number" value={basePoints} onChange={(e) => setBasePoints(e.target.value)} />
      <label>ช่วงเวลาที่ทำได้ (เลือกได้หลายช่วง)</label>
      {tws.length === 0 ? (
        <div className="muted">ยังไม่มีช่วงเวลา — ไปเพิ่มที่แท็บ “ช่วงเวลา” ก่อน ไม่งั้นลูกจะไม่เห็นงานนี้</div>
      ) : (
        <div className="tag-days">
          {tws.map((t) => (
            <button key={t.id} className={wins.includes(t.id) ? 'on' : ''} onClick={() => toggle(t.id)}>
              {t.name} {t.startTime}–{t.endTime}
            </button>
          ))}
        </div>
      )}
      {tws.length > 0 && wins.length === 0 && (
        <div className="muted" style={{ color: 'var(--bad)' }}>ยังไม่ได้เลือกช่วงเวลา — ลูกจะไม่เห็นงานนี้</div>
      )}
      {!isNew && <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน</label>}
      <button className="btn mt" onClick={save} disabled={busy}>บันทึก</button>
    </Modal>
  );
}

// ---------------- รางวัล ----------------
function RewardsCrud() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(undefined);
  const load = useCallback(() => call('parent.rewards.list').then(setList).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  if (list === null) return <Loading />;

  async function del(r) {
    if (!confirm(`ลบ/ปิด "${r.name}"?`)) return;
    try { const res = await call('parent.rewards.delete', { id: r.id }); toast(res.softDeleted ? 'มีประวัติ — ปิดใช้งานแทน' : 'ลบแล้ว'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>ของรางวัล ({list.length})</h2>
        <button className="btn sm" onClick={() => setEdit(null)}>+ เพิ่ม</button>
      </div>
      {list.length === 0 ? <Empty /> : list.map((r) => (
        <div key={r.id} className="item">
          <div className="grow">
            <div className="title">{r.name} {!r.active && <span className="chip bad">ปิด</span>}</div>
            <div className="sub">{r.cost} แต้ม{r.limitDay ? ` · วันละ ${r.limitDay}` : ''}{r.limitWeek ? ` · สัปดาห์ละ ${r.limitWeek}` : ''}{r.limitMonth ? ` · เดือนละ ${r.limitMonth}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn gray sm" onClick={() => setEdit(r)}>แก้</button>
            <button className="btn bad sm" onClick={() => del(r)}>ลบ</button>
          </div>
        </div>
      ))}
      {edit !== undefined && <RewardForm data={edit} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); load(); }} />}
    </div>
  );
}

function RewardForm({ data, onClose, onDone }) {
  const toast = useToast();
  const isNew = !data;
  const [name, setName] = useState(data?.name || '');
  const [cost, setCost] = useState(data?.cost || 50);
  const [limitDay, setLimitDay] = useState(data?.limitDay ?? '');
  const [limitWeek, setLimitWeek] = useState(data?.limitWeek ?? '');
  const [limitMonth, setLimitMonth] = useState(data?.limitMonth ?? '');
  const [active, setActive] = useState(data ? data.active : true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const p = { name, cost: Number(cost), limitDay, limitWeek, limitMonth };
      if (isNew) await call('parent.rewards.create', p);
      else await call('parent.rewards.update', { id: data.id, ...p, active });
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'เพิ่มรางวัล' : 'แก้ไขรางวัล'} onClose={onClose}>
      <label>ชื่อรางวัล</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>ราคาแต้ม</label>
      <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
      <div className="row">
        <div><label>ลิมิต/วัน</label><input type="number" value={limitDay} onChange={(e) => setLimitDay(e.target.value)} placeholder="ไม่จำกัด" /></div>
        <div><label>ลิมิต/สัปดาห์</label><input type="number" value={limitWeek} onChange={(e) => setLimitWeek(e.target.value)} placeholder="ไม่จำกัด" /></div>
        <div><label>ลิมิต/เดือน</label><input type="number" value={limitMonth} onChange={(e) => setLimitMonth(e.target.value)} placeholder="ไม่จำกัด" /></div>
      </div>
      {!isNew && <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน</label>}
      <button className="btn mt" onClick={save} disabled={busy}>บันทึก</button>
    </Modal>
  );
}

// ---------------- ช่วงเวลา ----------------
function TimeWindowsCrud() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(undefined);
  const load = useCallback(() => call('parent.timewindows.list').then(setList).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  if (list === null) return <Loading />;

  async function del(t) {
    if (!confirm(`ลบ "${t.name}"?`)) return;
    try { await call('parent.timewindows.delete', { id: t.id }); toast('ลบแล้ว'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>ช่วงเวลา ({list.length})</h2>
        <button className="btn sm" onClick={() => setEdit(null)}>+ เพิ่ม</button>
      </div>
      {list.length === 0 ? <Empty /> : list.map((t) => (
        <div key={t.id} className="item">
          <div className="grow">
            <div className="title">{t.name} {!t.active && <span className="chip bad">ปิด</span>}</div>
            <div className="sub">{t.startTime}–{t.endTime} น. · ส่งทันเวลาก่อน {t.cutoff} น.</div>
            <div className="sub">
              ทำได้: {t.days.map((d) => (DAYS.find((x) => x[0] === String(d)) || [])[1]).join(' ')}
              {t.bonusMultiplier !== 1 && (
                <> · ×{t.bonusMultiplier} {(t.bonusDays || []).length
                  ? 'เฉพาะ ' + t.bonusDays.map((d) => (DAYS.find((x) => x[0] === String(d)) || [])[1]).join(' ')
                  : 'ทุกวันที่ทำได้'}</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn gray sm" onClick={() => setEdit(t)}>แก้</button>
            <button className="btn bad sm" onClick={() => del(t)}>ลบ</button>
          </div>
        </div>
      ))}
      {edit !== undefined && <TwForm data={edit} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); load(); }} />}
    </div>
  );
}

function TwForm({ data, onClose, onDone }) {
  const toast = useToast();
  const isNew = !data;
  const [name, setName] = useState(data?.name || '');
  const [startTime, setStart] = useState(data?.startTime || '08:00');
  const [endTime, setEnd] = useState(data?.endTime || '10:00');
  const [cutoff, setCutoff] = useState(data?.cutoff || '09:00');
  const [days, setDays] = useState(data ? data.days.map(String) : ['1', '2', '3', '4', '5', '6', '7']);
  const [bonusDays, setBonusDays] = useState(data ? (data.bonusDays || []).map(String) : []);
  const [bonus, setBonus] = useState(data?.bonusMultiplier || 1);
  const [active, setActive] = useState(data ? data.active : true);
  const [busy, setBusy] = useState(false);

  function toggle(d) {
    setDays((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d]);
    setBonusDays((b) => b.filter((x) => x !== d || !days.includes(d))); // ปิดวันไหน ตัดวันนั้นออกจากวันคูณด้วย
  }
  function toggleBonusDay(d) { setBonusDays((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d]); }
  async function save() {
    if (!days.length) return toast('เลือกวันที่ทำได้อย่างน้อย 1 วัน', 'err');
    setBusy(true);
    try {
      const p = {
        name, startTime, endTime, cutoff,
        days: days.map(Number), bonusDays: bonusDays.map(Number), bonusMultiplier: Number(bonus),
      };
      if (isNew) await call('parent.timewindows.create', p);
      else await call('parent.timewindows.update', { id: data.id, ...p, active });
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'เพิ่มช่วงเวลา' : 'แก้ไขช่วงเวลา'} onClose={onClose}>
      <label>ชื่อช่วงเวลา</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เช้า" />
      <TimeSelect label="เริ่มทำได้ตั้งแต่" value={startTime} onChange={setStart} />
      <TimeSelect label="ทำได้ถึง" value={endTime} onChange={setEnd} />
      <TimeSelect label="ส่งทันเวลาก่อน" hint="— ส่งหลังเวลานี้ได้แต้มน้อยลง" value={cutoff} onChange={setCutoff} />
      <label>วันที่ทำได้ <span style={{ opacity: 0.7 }}>— ลูกจะเห็นงานเฉพาะวันที่เลือก</span></label>
      <div className="tag-days">
        {DAYS.map(([d, lbl]) => <button key={d} className={days.includes(d) ? 'on' : ''} onClick={() => toggle(d)}>{lbl}</button>)}
      </div>

      <label>ตัวคูณโบนัส <span style={{ opacity: 0.7 }}>— เช่น วันหยุดใส่ 1.5 = ได้แต้ม 1.5 เท่า</span></label>
      <input type="number" step="0.1" min="1" value={bonus} onChange={(e) => setBonus(e.target.value)} />

      {Number(bonus) !== 1 && (
        <>
          <label>วันที่ได้ตัวคูณ <span style={{ opacity: 0.7 }}>— ไม่เลือก = ได้ทุกวันที่ทำได้</span></label>
          <div className="tag-days">
            {DAYS.filter(([d]) => days.includes(d)).map(([d, lbl]) => (
              <button key={d} className={bonusDays.includes(d) ? 'on' : ''} onClick={() => toggleBonusDay(d)}>{lbl}</button>
            ))}
          </div>
          <div className="muted">
            {bonusDays.length === 0 || bonusDays.length === days.length
              ? `ทุกวันที่ทำได้ จะได้ ×${bonus}`
              : `เฉพาะวัน ${DAYS.filter(([d]) => bonusDays.includes(d)).map(([, l]) => l).join(' ')} ได้ ×${bonus} · วันอื่น ×1`}
          </div>
        </>
      )}
      {!isNew && <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน</label>}
      <button className="btn mt" onClick={save} disabled={busy}>บันทึก</button>
    </Modal>
  );
}
