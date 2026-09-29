// fx.js — เอฟเฟกต์ความสนุก: confetti, ตัวเลขลอย, LEVEL UP, เสียง
// เขียนเองล้วนๆ ไม่มีไลบรารีนอก (บันเดิลต้องเป็นไฟล์เดียว) และไม่มีไฟล์เสียง — สังเคราะห์ด้วย WebAudio

const SOUND_KEY = 'homelove_sound';

export function soundOn() {
  return localStorage.getItem(SOUND_KEY) !== 'off';
}
export function toggleSound() {
  const next = !soundOn();
  localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
  if (next) play('tap');
  return next;
}

// ---------- เสียง ----------
let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---------- เสียงเครื่องดนตรี (ธีมวงดนตรี) — at = วินาทีนับจากตอนนี้ ----------
// ไฉ่/สแนร์/เสียงเชียร์: noise ผ่านฟิลเตอร์
function noise(at, dur, filterType, freq, gainPeak = 0.2, attack = 0.005) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(ac.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

// กระเดื่อง: sine ที่เสียงตกลงเร็วๆ
function kick(at, gainPeak = 0.35) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  g.gain.setValueAtTime(gainPeak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + 0.22);
}
const snare = (at) => { noise(at, 0.14, 'bandpass', 1800, 0.18); tones1(at, 190, 0.08, 'triangle', 0.08); };

// โน้ตเดี่ยว ณ เวลาที่กำหนด (ใช้ทำระฆัง/เบส)
function tones1(at, freq, dur, type = 'sine', gainPeak = 0.06) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

// ดีดสายกีตาร์: sawtooth ผ่าน lowpass ที่ปิดลงเรื่อยๆ ให้เสียงนุ่มเหมือนสายสั่นจนหมดแรง
function pluck(at, freq, dur = 0.6, gainPeak = 0.05) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 8, t);
  f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(f); f.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}
// กวาดคอร์ด — แต่ละสายห่างกันนิดเดียวเหมือนดีดลงทีเดียว
const strum = (at, freqs, dur = 0.7, stagger = 0.022) => freqs.forEach((fq, i) => pluck(at + i * stagger, fq, dur));

const SOUNDS = {
  tap: () => noise(0, 0.045, 'highpass', 7000, 0.12),                        // ไฮแฮต
  success: () => strum(0, [262, 330, 392, 523]),                             // คอร์ด C
  coin: () => { tones1(0, 1319, 0.5, 'sine', 0.07); tones1(0.07, 1976, 0.6, 'sine', 0.05); }, // ระฆัง
  levelup: () => {                                                           // ลูกส่งกลอง + พาวเวอร์คอร์ด
    kick(0); snare(0.12); snare(0.24); kick(0.36); snare(0.42);
    strum(0.5, [147, 220, 294], 0.5, 0.012);
    strum(0.85, [196, 294, 392, 587], 1.1, 0.015);
    noise(0.85, 0.9, 'highpass', 5000, 0.08);                                // ฉาบ
  },
  boss: () => {                                                              // ปิดโชว์ — เสียงเชียร์ + คอร์ด
    noise(0, 1.6, 'bandpass', 1400, 0.12, 0.35);
    kick(0); strum(0.05, [196, 247, 294, 392, 494], 1.3, 0.02);
  },
  error: () => { tones1(0, 110, 0.35, 'sawtooth', 0.05); tones1(0, 104, 0.35, 'sawtooth', 0.05); }, // เบสเพี้ยน
  drum: () => { kick(0); noise(0, 0.25, 'highpass', 6000, 0.07); },          // กระเดื่อง + ฉาบเบาๆ (เลือกสมาชิกวง)
  cheer: () => {                                                             // คนดูกรี๊ด — noise สองชั้นขึ้นลงไม่พร้อมกัน
    noise(0, 2.4, 'bandpass', 1100, 0.1, 0.5);
    noise(0.3, 2.2, 'bandpass', 2300, 0.06, 0.6);
  },
};

export function play(name) {
  if (!soundOn()) return;
  try { (SOUNDS[name] || SOUNDS.tap)(); } catch { /* เสียงพังไม่ควรทำให้แอปพัง */ }
}

// ---------- confetti ----------
const COLORS = ['#ffc93c', '#45d6ff', '#ff3d6e', '#ff9f43', '#35d38a', '#ffffff'];
const NOTES = ['♪', '♫', '♬', '♩'];

// ผู้ใช้ตั้งเครื่องให้ลดการเคลื่อนไหว → ข้ามเอฟเฟกต์ขยับ เหลือแค่ข้อความกับเสียง
export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// origin: 'center' (พุ่งจากกลางจอ) | 'cannons' (ปืนใหญ่สองข้างล่างยิงเฉียงขึ้นกลางเวที)
export function confetti(count = 90, seconds = 1.6, origin = 'center') {
  if (reducedMotion()) return;
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:96';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const bits = Array.from({ length: count }, (_, i) => ({
    ...(origin === 'cannons'
      ? (() => {
        const left = i % 2 === 0;
        return {
          x: left ? 0 : innerWidth, y: innerHeight,
          vx: (left ? 1 : -1) * (3 + Math.random() * 6) * (innerWidth / 400),
          vy: -(11 + Math.random() * 9) * Math.min(1.4, innerHeight / 700),
        };
      })()
      : {
        x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5,
        y: innerHeight * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: -6 - Math.random() * 8,
      }),
    w: 6 + Math.random() * 7,
    h: 8 + Math.random() * 9,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    c: COLORS[(Math.random() * COLORS.length) | 0],
    note: Math.random() < 0.4 ? NOTES[(Math.random() * NOTES.length) | 0] : '', // บางชิ้นเป็นโน้ตดนตรี
  }));
  g.textAlign = 'center'; g.textBaseline = 'middle';

  const end = performance.now() + seconds * 1000;
  (function frame(now) {
    g.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.vy += 0.32;          // แรงโน้มถ่วง
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      g.save();
      g.translate(b.x, b.y); g.rotate(b.rot);
      g.fillStyle = b.c;
      if (b.note) { g.font = 'bold ' + Math.round(b.h * 2) + 'px sans-serif'; g.fillText(b.note, 0, 0); }
      else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    });
    if (now < end) requestAnimationFrame(frame);
    else canvas.remove();
  })(performance.now());
}

// ---------- ตัวเลขลอยขึ้น (+15 XP) ----------
export function floatText(text, opts = {}) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = text;
  el.className = 'fx-float' + (opts.className ? ' ' + opts.className : '');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ---------- ฉากคอนเสิร์ตเต็มจอ (เลเวลอัป / ปิดโชว์ / แผ่นเสียงทองคำ) ----------
/**
 * ม่านแดงแหวก → สปอตไลต์สองดวงกวาด → ควันเวที → ตัวหนังสือตกลงมาเด้ง → ปืนใหญ่ confetti สองข้าง
 * ทุกชิ้นขยับด้วย transform/opacity อย่างเดียว (GPU ทำ ไม่ต้องคำนวณ layout ใหม่) แตะจอเพื่อข้าม
 * record: true = มีแผ่นเสียงทองหมุนอยู่หลังตัวหนังสือ
 */
// หลายฉากพร้อมกัน (เช่น เลเวลอัป + ปิดโชว์) ต่อคิวเล่นทีละฉาก ไม่ซ้อนทับกัน
let showQueue = Promise.resolve();
export function stageShow(opts) {
  if (typeof document === 'undefined') return;
  showQueue = showQueue.then(() => new Promise((done) => runShow(opts, done)));
}

function runShow({ kicker, big, sub, record = false, sound = 'levelup' }, done) {
  play(sound);
  const still = reducedMotion();
  if (!still) setTimeout(() => play('cheer'), 650);

  const el = document.createElement('div');
  el.className = 'fx-levelup stage-show' + (still ? ' still' : '');
  el.innerHTML =
    '<div class="beam l"></div><div class="beam r"></div>' +
    '<div class="smoke"><i></i><i></i><i></i></div>' +
    '<div class="curtain l"></div><div class="curtain r"></div>' +
    (record ? '<div class="disc"></div>' : '') + '<div class="box">' +
    '<div class="lbl"></div><div class="lv"></div><div class="ttl"></div></div>';
  // ชื่อเวที/ยศมาจากข้อมูลที่ผู้ปกครองพิมพ์ — ใส่ด้วย textContent ไม่ประกอบเป็น HTML
  el.querySelector('.lbl').textContent = kicker || '';
  el.querySelector('.lv').textContent = big == null ? '' : String(big);
  el.querySelector('.ttl').textContent = sub || '';
  if (!sub) el.querySelector('.ttl').remove();

  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => { el.remove(); done(); }, 350);
  };
  el.onclick = close;
  document.body.appendChild(el);
  setTimeout(() => confetti(150, 2.6, 'cannons'), 450);   // ยิงตอนม่านแหวกพอดี
  setTimeout(close, still ? 2400 : 3600);
}

export function levelUp(level, title) {
  stageShow({ kicker: '🎶 LEVEL UP! 🎶', big: level, sub: title });
}

// ฉลองสั้นๆ ตอนส่งงาน (เกิดบ่อย ไม่ใช้ม่าน) — สปอตไลต์วาบลงกลางจอ + น้ำพุโน้ต
export function spotlightFlash() {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'fx-flash';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
  confetti(70, 1.3);
}

// ฉลองสั้นๆ ตอนแลกของ — กล่องของขวัญเด้งขึ้นกลางจอ ส่ายตัว แล้วระเบิดเป็นโน้ต/confetti
export function giftPop() {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'fx-gift';
  el.textContent = '🎁';
  document.body.appendChild(el);
  setTimeout(() => confetti(80, 1.4), 650);   // ตอนกล่องแตก
  setTimeout(() => el.remove(), 1000);
}

// ---------- ฉลองย้อนหลังให้เด็ก: เทียบกับค่าที่จำไว้ในเครื่อง ----------
// ครั้งแรกที่เห็น (ยังไม่มีค่าจำ) แค่จำไว้ ไม่ฉลอง — กันฉากเด้งตอนเปิดแอปเครื่องใหม่
function rememberAndCompare(key, value) {
  let prev = null;
  try { prev = localStorage.getItem(key); localStorage.setItem(key, value); } catch { /* โหมดส่วนตัว */ }
  return prev;
}

// คอนเสิร์ตประจำเดือน — จำ "เดือน:จำนวนเวทีที่ปิดแล้ว" ขึ้นเดือนใหม่นับใหม่
export function checkConcert(childId, boss) {
  if (!childId || !boss || !boss.month) return;
  const done = (boss.bosses || []).filter((b) => b.defeated);
  const prev = rememberAndCompare('homelove_concert_' + childId, boss.month + ':' + done.length);
  if (!prev) return;
  const [m, n] = prev.split(':');
  if (m !== boss.month || done.length <= parseInt(n, 10)) return;
  const last = done[done.length - 1];
  stageShow({
    kicker: '🏟️ ปิดโชว์สำเร็จ!', big: last.emoji || '🎤',
    sub: (last.name || 'คอนเสิร์ต') + (last.reward ? ` · ทุกคน +${last.reward} แต้ม` : ''),
    sound: 'boss',
  });
}

// แผ่นเสียงทองคำ (เหรียญสตรีค) ใบใหม่
export function checkRecords(childId, badges) {
  if (!childId || !badges) return;
  const prev = rememberAndCompare('homelove_records_' + childId, String(badges.length));
  if (prev == null || badges.length <= parseInt(prev, 10)) return;
  const b = badges.reduce((a, x) => (String(x.awardedAt) > String(a.awardedAt) ? x : a)); // ใบล่าสุด
  stageShow({
    kicker: '💿 แผ่นเสียงทองคำ!', big: String(b.kind || '').replace('streak-', '') + ' วัน',
    sub: 'ทำต่อเนื่องครบแล้ว สุดยอด!', record: true,
  });
}

// ---------- จำเลเวลล่าสุดไว้เทียบว่าขึ้นเลเวลหรือยัง ----------
const LV_KEY = 'homelove_level_';
export function checkLevelUp(childId, level, title) {
  if (!childId || !level) return;
  const key = LV_KEY + childId;
  const prev = parseInt(localStorage.getItem(key) || '0', 10);
  localStorage.setItem(key, String(level));
  if (prev && level > prev) levelUp(level, title);
}
