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
};

export function play(name) {
  if (!soundOn()) return;
  try { (SOUNDS[name] || SOUNDS.tap)(); } catch { /* เสียงพังไม่ควรทำให้แอปพัง */ }
}

// ---------- confetti ----------
const COLORS = ['#ffc93c', '#45d6ff', '#ff3d6e', '#ff9f43', '#35d38a', '#ffffff'];
const NOTES = ['♪', '♫', '♬', '♩'];

export function confetti(count = 90, seconds = 1.6) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const bits = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5,
    y: innerHeight * 0.35 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 8,
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

// ---------- LEVEL UP เต็มจอ ----------
export function levelUp(level, title) {
  if (typeof document === 'undefined') return;
  play('levelup');
  confetti(120, 2);
  const el = document.createElement('div');
  el.className = 'fx-levelup';
  el.innerHTML =
    '<div class="box"><div class="lbl">🎶 LEVEL UP! 🎶</div>' +
    '<div class="lv">' + level + '</div>' +
    (title ? '<div class="ttl">' + title + '</div>' : '') + '</div>';
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
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
