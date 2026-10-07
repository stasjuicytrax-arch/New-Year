import sharp from 'sharp';

const K = 1707 / 934;
const top = Math.round(250 * K);
const bottom = Math.round(1010 * K);
const H = bottom - top;
const W = 1707;

// Стереть остатки (координаты превью 934x1400)
const erase = [
  [[285, 335], [375, 335], [375, 398], [285, 398]],
  [[438, 250], [462, 250], [462, 288], [438, 288]],
];
const maskSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0.8" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#f)"/>` +
    erase.map((p) => `<polygon points="${p.map(([x, y]) => `${Math.round(x * K)},${Math.round(y * K - top)}`).join(' ')}" fill="black"/>`).join('') +
    `</svg>`,
);
const m = await sharp(maskSvg).blur(1).greyscale().raw().toBuffer();

const { data, info } = await sharp('hosts-raw2.png')
  .extract({ left: 0, top, width: W, height: H })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < info.width * info.height; i++) {
  let a = data[i * 4 + 3];
  a = Math.max(0, Math.min(255, ((a - 110) * 255) / 145)); // убрать дымку
  data[i * 4 + 3] = Math.round((a * m[i]) / 255);
}
const base = sharp(data, { raw: info }).trim({ threshold: 2 });
const buf = await base.png().toBuffer();
const meta = await sharp(buf).metadata();
console.log('trimmed', meta.width, meta.height);

for (const h of [900, 1400]) {
  const r = sharp(buf).resize({ height: h });
  await r.clone().webp({ quality: 86, alphaQuality: 95 }).toFile(`hosts-cutout-${h}.webp`);
  await r.clone().avif({ quality: 62 }).toFile(`hosts-cutout-${h}.avif`);
}
await sharp(buf).resize({ height: 900 }).png({ compressionLevel: 9, palette: false }).toFile('hosts-cutout-900.png');
await sharp(buf).resize({ height: 1000 }).flatten({ background: '#12317a' }).jpeg({ quality: 82 }).toFile('hosts-final-preview.jpg');
