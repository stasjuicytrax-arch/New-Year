/**
 * 3D-визуализация зала («Зал 1.jpg», исходник не меняется): вырезка белого фона и оптимизированные копии с прозрачностью.
 * Запуск: node scripts/build-hall3d.mjs
 * Белый фон вырезается заливкой от краёв кадра (почти белые пиксели, связанные с краем); стены зала светло-серые и
 * образуют границу, поэтому белые скатерти внутри зала не затрагиваются. Край смягчается (альфа-размытие 0,8 px).
 * Результат: src/assets/img/hall3d-{ширина}.{avif,webp} и hall3d-meta.json (пропорции).
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Зал 1.jpg');
const OUT = join(ROOT, 'src', 'assets', 'img');
const WIDTHS = [640, 960, 1440, 1800];
const WORK_W = 1800; // вырезаем на уменьшенной копии: быстрее и хватает для самого крупного варианта

const { data, info } = await sharp(SRC).rotate().resize({ width: WORK_W }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const TH = 244; // «белое»: каждый канал не темнее
const isWhite = (i) => data[i] >= TH && data[i + 1] >= TH && data[i + 2] >= TH;

// заливка от краёв
const bg = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (bg[p] || !isWhite(p * 3)) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
while (stack.length) {
  const p = stack.pop();
  const x = p % W;
  const y = (p / W) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// альфа: фон = 0, остальное = 255; затем лёгкое сглаживание края
const alpha = Buffer.alloc(W * H);
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let p = 0; p < W * H; p++) {
  if (!bg[p]) {
    alpha[p] = 255;
    const x = p % W;
    const y = (p / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();

// RGBA, обрезка по границам зала с небольшим полем под тень
const PAD = 6;
const box = { left: Math.max(0, minX - PAD), top: Math.max(0, minY - PAD), width: 0, height: 0 };
box.width = Math.min(W, maxX + PAD + 1) - box.left;
box.height = Math.min(H, maxY + PAD + 1) - box.top;
const rgba = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  rgba[p * 4] = data[p * 3];
  rgba[p * 4 + 1] = data[p * 3 + 1];
  rgba[p * 4 + 2] = data[p * 3 + 2];
  rgba[p * 4 + 3] = soft[p];
}
const base = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer();

const meta = { ratio: +(box.width / box.height).toFixed(5), box: { left: box.left / W, top: box.top / H, width: box.width / W, height: box.height / H }, source: { w: W, h: H }, variants: [] };
for (const w of WIDTHS) {
  const width = Math.min(w, box.width);
  const pipe = sharp(base).resize({ width, withoutEnlargement: true });
  const stem = join(OUT, `hall3d-${w}`);
  await pipe.clone().avif({ quality: 62, effort: 5 }).toFile(`${stem}.avif`);
  await pipe.clone().webp({ quality: 84, alphaQuality: 95 }).toFile(`${stem}.webp`);
  meta.variants.push({ w, width, height: Math.round((box.height * width) / box.width) });
}
await writeFile(join(OUT, 'hall3d-meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('hall3d', meta.ratio, JSON.stringify(meta.box), meta.variants.map((v) => `${v.width}x${v.height}`).join(', '));
