/**
 * Оптимизация фото: исходники в корне репозитория не меняются, результат пишется в src/assets/img/.
 * Запуск: npm run assets
 * Форматы: AVIF + WebP + JPEG, ширины 640/960/1440/2048 (без апскейла).
 * Цветокор (DESIGN-SYSTEM §9): холодный баланс, тени к --night-950, лёгкий синий split-toning.
 * Детские фото и фото ведущих (для «снежного шара») не перекрашиваются.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'assets', 'img');

/** @type {Array<{name:string, src:string, widths:number[], grade?:'cold'|'violet-to-blue', crop?:{left:number,top:number,width:number,height:number}}>} */
const IMAGES = [
  {
    name: 'hosts',
    src: 'Ведущие и организаторы главной новогодней ночи/IMG_1984.JPG',
    widths: [640, 960, 1440, 1707],
  },
  {
    name: 'ballet-violet',
    src: 'Шоу балет/653A0543_resized.jpg',
    widths: [640, 960, 1440, 2048, 2560],
    grade: 'violet-to-blue',
  },
  {
    name: 'ballet-feathers',
    src: 'Шоу балет/302edb11f64fe9062424e652296e12e7.jpg',
    widths: [640, 960, 1440, 1600],
    grade: 'cold',
  },
  {
    name: 'ded-moroz',
    src: 'Остальные картинки/0321-DSD01342.jpg',
    widths: [640, 960, 1440, 2048, 2560],
    grade: 'cold',
  },
  {
    name: 'snegurochka',
    src: 'Остальные картинки/0322-DSD01350.jpg',
    widths: [640, 960, 1440, 2048],
    grade: 'cold',
  },
  { name: 'kids-2', src: 'Для блока на детскую анимацию/a-min.jpg', widths: [640, 960, 1440, 2048] },
  { name: 'kids-4', src: 'Vintermagi med Ded Moroz og Snegurochka.png', widths: [640, 960, 1254] },
  { name: 'kids-5', src: 'Magisk boblefest i vintereventyrland.png', widths: [640, 960, 1254] },
  { name: 'dj-seven', src: 'Наш диджей DJ Seven/IMG_5835.PNG', widths: [640, 900, 1254] },
];

const NIGHT = { r: 0, g: 16, b: 46 }; // --night-900

/** Переносит фото в бренд: приглушённая насыщенность, тени и света уходят в ночной синий. */
async function grade(input, mode) {
  let img = sharp(input).rotate();
  if (mode === 'violet-to-blue') img = img.modulate({ hue: -28, saturation: 0.9, brightness: 0.96 });
  else img = img.modulate({ saturation: 0.8, brightness: 0.96 });
  const buf = await img.toBuffer();
  const { width, height } = await sharp(buf).metadata();
  const overlay = await sharp({
    create: { width, height, channels: 4, background: { ...NIGHT, alpha: 0.34 } },
  })
    .png()
    .toBuffer();
  return sharp(buf).composite([{ input: overlay, blend: 'soft-light' }]).toBuffer();
}

async function build({ name, src, widths, grade: mode, crop }) {
  const srcPath = join(ROOT, src);
  let base = mode ? await grade(srcPath, mode) : await sharp(srcPath).rotate().toBuffer();
  if (crop) base = await sharp(base).extract(crop).toBuffer();
  const meta = await sharp(base).metadata();
  const manifest = [];
  for (const w of widths) {
    const width = Math.min(w, meta.width);
    const pipe = sharp(base).resize({ width, withoutEnlargement: true });
    const stem = join(OUT, `${name}-${w}`);
    const height = Math.round((meta.height * width) / meta.width);
    await pipe.clone().avif({ quality: 62, effort: 5 }).toFile(`${stem}.avif`);
    await pipe.clone().webp({ quality: 84 }).toFile(`${stem}.webp`);
    await pipe.clone().jpeg({ quality: 86, mozjpeg: true }).toFile(`${stem}.jpg`);
    manifest.push({ w, width, height });
  }
  console.log(`${name}: ${manifest.map((m) => `${m.width}x${m.height}`).join(', ')}`);
  return [name, { src: meta.width + 'x' + meta.height, variants: manifest }];
}

await mkdir(OUT, { recursive: true });
const result = Object.fromEntries(await Promise.all(IMAGES.map(build)));
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');

// OG-картинка 1200x630 из афиши (центральная часть)
const poster = join(ROOT, 'Фирменный стиль мероприятия.jpg');
const pm = await sharp(poster).metadata();
const ogH = Math.round((pm.width * 630) / 1200);
await sharp(poster)
  .extract({ left: 0, top: 30 /* заголовок афиши и головы ведущих */, width: pm.width, height: ogH })
  .resize(1200, 630)
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(join(ROOT, 'public', 'og.jpg'));
console.log('og.jpg 1200x630');
