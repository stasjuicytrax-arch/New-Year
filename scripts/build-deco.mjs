/**
 * Процедурный декор (DESIGN-SYSTEM §7): снежинка-глиф, ветки ели, ёлочные шары, статичный слой снега и боке.
 * Детерминированный PRNG: повторный запуск даёт те же файлы.
 * Запуск: npm run deco  ->  src/assets/deco/*
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'deco');
await mkdir(OUT, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 100) / 100;

/* ---------- Снежинка-глиф: тонкая 6-лучевая, stroke 1.25 ---------- */
function snowflakePath() {
  const d = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    const dir = [Math.cos(a), Math.sin(a)];
    const nrm = [-dir[1], dir[0]];
    const at = (t, s = 0) => [f(dir[0] * t + nrm[0] * s), f(dir[1] * t + nrm[1] * s)];
    const p0 = at(1.6), p1 = at(10.5);
    d.push(`M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}`);
    for (const [t, len] of [[4.6, 3.6], [7.4, 2.6]]) {
      for (const s of [-1, 1]) {
        const b = at(t), e = at(t + len * 0.7, s * len * 0.95);
        d.push(`M${b[0]} ${b[1]}L${e[0]} ${e[1]}`);
      }
    }
    // «вилка» на конце луча
    const tip = at(10.5);
    for (const s of [-1, 1]) {
      const e = at(12, s * 1.3);
      d.push(`M${tip[0]} ${tip[1]}L${e[0]} ${e[1]}`);
    }
  }
  return d.join('');
}
await writeFile(
  join(OUT, 'snowflake.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 28 28" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${snowflakePath()}"/></svg>\n`,
);

/* ---------- Ветки ели: тёмная хвоя с инеем и тёплыми огоньками ---------- */
function branchSvg(seed, W = 1500, H = 900) {
  const r = rng(seed);
  const out = [];
  const needle = (x, y, ang, len, w, col, op) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${f(w)}" stroke-opacity="${f(op)}"/>`);
  };
  const dark = ['#03101a', '#06192a', '#0a2538', '#0e3149', '#134560'];
  const frost = ['#dbe9ff', '#bcd6ff', '#f3f8ff', '#9fc2f5'];
  const lights = [];

  // Стебель с кривизной
  const segs = 26;
  const stem = [];
  let sx = 0, sy = H * 0.52, sa = -0.08 + (r() - 0.5) * 0.1;
  for (let i = 0; i <= segs; i++) {
    stem.push([sx, sy, sa]);
    const step = (W * 0.97) / segs;
    sa += (r() - 0.5) * 0.07 + 0.012;
    sx += Math.cos(sa) * step;
    sy += Math.sin(sa) * step;
  }

  function twig(x, y, ang, len, depth) {
    const n = Math.max(6, Math.round(len / 14));
    let cx = x, cy = y, ca = ang;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const step = len / n;
      const nx = cx + Math.cos(ca) * step, ny = cy + Math.sin(ca) * step;
      out.push(`<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(nx)}" y2="${f(ny)}" stroke="#05161f" stroke-width="${f(3.2 - t * 2)}" stroke-linecap="round"/>`);
      const nl = (1 - t * 0.55) * (34 + depth * 14);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const na = ca + side * (0.55 + r() * 0.5) + (r() - 0.5) * 0.2;
          const l = nl * (0.7 + r() * 0.5);
          const col = dark[Math.floor(r() * dark.length)];
          needle(cx + Math.cos(ca) * step * (k * 0.5), cy + Math.sin(ca) * step * (k * 0.5), na, l, 2.2 + r() * 1.1, col, 0.97);
          // контровой синий свет прожектора по верхней кромке хвои
          if (side === -1 && r() < 0.35) needle(cx + Math.cos(ca) * step * (k * 0.5), cy + Math.sin(ca) * step * (k * 0.5), na, l * 0.75, 0.9, '#598bfb', 0.42);
          if (r() < 0.1 + t * 0.2) {
            const fx = cx + Math.cos(ca) * step * (k * 0.5) + Math.cos(na) * l * 0.55;
            const fy = cy + Math.sin(ca) * step * (k * 0.5) + Math.sin(na) * l * 0.55;
            needle(fx, fy, na, l * 0.34, 1.1 + r() * 0.5, frost[Math.floor(r() * frost.length)], 0.22 + r() * 0.4);
          }
        }
      }
      // кончик ветки: иней и редкие огоньки гирлянды
      if (i === n - 1 && depth > 0 && r() < 0.5) lights.push([nx, ny]);
      cx = nx; cy = ny; ca += (r() - 0.5) * 0.18;
    }
  }

  stem.forEach(([x, y, a], i) => {
    if (i < 1) return;
    const t = i / segs;
    const base = (1 - t) * 270 + 80;
    for (const side of [-1, 1]) {
      const ang = a + side * (1.15 + r() * 0.35 - t * 0.25);
      twig(x, y, ang, base * (0.75 + r() * 0.4), 1);
      if (r() < 0.6) twig(x, y, a + side * (0.65 + r() * 0.3), base * 0.55, 2);
    }
  });
  // сам стебель поверх
  const poly = stem.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  out.push(`<polyline points="${poly}" fill="none" stroke="#041019" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`);
  out.push(`<polyline points="${poly}" fill="none" stroke="#0b2a3b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".7"/>`);

  // снежная пыль на хвое
  for (let i = 0; i < 160; i++) {
    out.push(`<circle cx="${f(r() * W)}" cy="${f(H * 0.18 + r() * H * 0.66)}" r="${f(0.6 + r() * 1.5)}" fill="#f3f8ff" fill-opacity="${f(0.25 + r() * 0.5)}"/>`);
  }

  const glow = lights
    .slice(0, 9)
    .map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(13 + r() * 9)}" fill="url(#lg)"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="lg"><stop offset="0" stop-color="#fff6e6"/><stop offset=".3" stop-color="#ffd9a3" stop-opacity=".95"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient></defs>
<g stroke-linecap="round">${out.join('')}</g>${glow}</svg>`;
}

for (const [i, seed] of [11, 29, 47, 83].entries()) {
  const svg = Buffer.from(branchSvg(seed));
  const sharpBuf = await sharp(svg, { density: 72 }).resize({ width: 1200 }).png().toBuffer();
  // мягкое свечение огоньков + лёгкая глубина резкости
  await sharp(sharpBuf)
    .webp({ quality: 74, alphaQuality: 70 })
    .toFile(join(OUT, `fir-${i + 1}.webp`));
}

/* ---------- Ёлочные шары: хромированные сферы с отражением зала ---------- */
/* Вертикальный градиент «небо - горизонт - пол» вместо мультяшного блика: тёмная полоса горизонта,
   холодный ключевой свет сверху-слева, едва заметный тёплый отсвет гирлянды у горизонта. */
function bauble({ id, r, sky, floor, key, w = 360, h = 520, matte = false }) {
  const cx = w / 2, cy = h - r - 24;
  const rnd = rng(id.length * 977 + r);
  const sparkle = matte
    ? Array.from({ length: 46 }, () => {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.94;
        return `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r="${f(0.5 + rnd() * 1.1)}" fill="#e9f1ff" fill-opacity="${f(0.15 + rnd() * 0.45)}"/>`;
      }).join('')
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="env" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${sky[0]}"/><stop offset=".30" stop-color="${sky[1]}"/>
<stop offset=".47" stop-color="${sky[2]}"/><stop offset=".53" stop-color="#02040f"/>
<stop offset=".60" stop-color="${floor[0]}"/><stop offset=".85" stop-color="${floor[1]}"/><stop offset="1" stop-color="${floor[2]}"/>
</linearGradient>
<radialGradient id="shade" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#000208" stop-opacity="0"/><stop offset="1" stop-color="#000208" stop-opacity=".65"/></radialGradient>
<radialGradient id="keyl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${key}" stop-opacity=".95"/><stop offset="1" stop-color="${key}" stop-opacity="0"/></radialGradient>
<radialGradient id="warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9a3" stop-opacity=".55"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe0ff" stop-opacity=".85"/><stop offset=".45" stop-color="#cfe0ff" stop-opacity="0"/><stop offset="1" stop-color="#598bfb" stop-opacity=".5"/></linearGradient>
<clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<filter id="bl"><feGaussianBlur stdDeviation="${f(r * 0.035)}"/></filter>
</defs>
<line x1="${cx}" y1="0" x2="${cx}" y2="${cy - r - 22}" stroke="#8da2c8" stroke-opacity=".55" stroke-width="1.2"/>
<rect x="${cx - 13}" y="${cy - r - 26}" width="26" height="18" rx="2" fill="#7f8fb2"/>
<rect x="${cx - 13}" y="${cy - r - 26}" width="26" height="5" rx="2" fill="#dfe8fa" fill-opacity=".7"/>
<g clip-path="url(#c)">
<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="url(#env)"/>
${sparkle}
<ellipse cx="${cx + r * 0.42}" cy="${cy + r * 0.04}" rx="${r * 0.22}" ry="${r * 0.05}" fill="url(#warm)"/>
<ellipse cx="${cx - r * 0.36}" cy="${cy - r * 0.46}" rx="${r * 0.3}" ry="${r * 0.14}" transform="rotate(-32 ${cx - r * 0.36} ${cy - r * 0.46})" fill="url(#keyl)" filter="url(#bl)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shade)"/>
</g>
<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
</svg>`;
}

const baubles = [
  { id: 'silver-l', r: 150, sky: ['#f3f7ff', '#b4c4e4', '#6b7ca6'], floor: ['#233463', '#101c46', '#050b24'], key: '#ffffff' },
  { id: 'silver-s', r: 92, sky: ['#f3f7ff', '#b4c4e4', '#6b7ca6'], floor: ['#233463', '#101c46', '#050b24'], key: '#ffffff' },
  { id: 'blue-l', r: 140, sky: ['#bcd3ff', '#4d7dea', '#1d3d96'], floor: ['#0d246e', '#071a58', '#020b2c'], key: '#e6eeff' },
  { id: 'blue-s', r: 86, sky: ['#bcd3ff', '#4d7dea', '#1d3d96'], floor: ['#0d246e', '#071a58', '#020b2c'], key: '#e6eeff' },
  { id: 'graphite-l', r: 120, sky: ['#9fb0d4', '#4a5a85', '#1c2748'], floor: ['#0d1634', '#070d24', '#02050f'], key: '#cfe0ff', matte: true },
  { id: 'graphite-s', r: 80, sky: ['#9fb0d4', '#4a5a85', '#1c2748'], floor: ['#0d1634', '#070d24', '#02050f'], key: '#cfe0ff', matte: true },
];
for (const b of baubles) {
  await sharp(Buffer.from(bauble(b)), { density: 72 }).webp({ quality: 88, alphaQuality: 95 }).toFile(join(OUT, `bauble-${b.id}.webp`));
}

/* ---------- Статичный слой снега и боке (фоллбэк: reduced-motion / нет WebGL / слабое устройство) ---------- */
{
  const W = 1600, H = 1000, r = rng(2027);
  const bokeh = [];
  const palette = [
    ['#5dc0e1', 0.16], ['#598bfb', 0.18], ['#1f5bff', 0.14], ['#ffb36b', 0.13], ['#ffe1bc', 0.09],
  ];
  for (let i = 0; i < 26; i++) {
    const [col, op] = palette[i % 9 === 0 ? 3 + (i % 2) : Math.floor(r() * 3)];
    const rad = 28 + r() * 90;
    bokeh.push(`<circle cx="${f(r() * W)}" cy="${f(r() * H * 0.9)}" r="${f(rad)}" fill="${col}" fill-opacity="${op}" filter="url(#s)"/>`);
  }
  const flakes = [];
  for (let i = 0; i < 360; i++) {
    const depth = r();
    const rad = depth < 0.6 ? 0.9 + r() * 0.9 : depth < 0.92 ? 1.6 + r() * 1.6 : 3.2 + r() * 2.8;
    const op = depth < 0.6 ? 0.45 : depth < 0.92 ? 0.8 : 0.35;
    flakes.push(`<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(rad)}" fill="#f5f8fc" fill-opacity="${f(op * (0.6 + r() * 0.4))}"${depth > 0.92 ? ' filter="url(#n)"' : ''}/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="s"><feGaussianBlur stdDeviation="9"/></filter><filter id="n"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
${bokeh.join('')}${flakes.join('')}</svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 70, alphaQuality: 80 }).toFile(join(OUT, 'snow-static.webp'));
}
console.log('deco done');
