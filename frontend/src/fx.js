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

// เล่นโน้ตต่อเนื่องเป็นทำนองสั้นๆ
function tones(seq, type = 'square', gainPeak = 0.06) {
  const ac = audio();
  if (!ac) return;
  let t = ac.currentTime;
  seq.forEach(([freq, dur]) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
    t += dur;
  });
}

const SOUNDS = {
  tap: () => tones([[420, 0.05]], 'square', 0.04),
  success: () => tones([[523, 0.09], [659, 0.09], [784, 0.16]]),
  levelup: () => tones([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]]),
  coin: () => tones([[988, 0.06], [1319, 0.14]]),
  boss: () => tones([[196, 0.14], [165, 0.14], [131, 0.3]], 'sawtooth', 0.07),
  error: () => tones([[200, 0.12], [150, 0.18]], 'sawtooth', 0.05),
};

export function play(name) {
  if (!soundOn()) return;
  try { (SOUNDS[name] || SOUNDS.tap)(); } catch { /* เสียงพังไม่ควรทำให้แอปพัง */ }
}

// ---------- confetti ----------
const COLORS = ['#ffc93c', '#38e8ff', '#a06bff', '#35d38a', '#ff5d6c', '#ffffff'];

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
  }));

  const end = performance.now() + seconds * 1000;
  (function frame(now) {
    g.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.vy += 0.32;          // แรงโน้มถ่วง
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      g.save();
      g.translate(b.x, b.y); g.rotate(b.rot);
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
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
    '<div class="box"><div class="lbl">LEVEL UP!</div>' +
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
