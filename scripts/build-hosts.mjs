/**
 * Ведущие для hero: «Дуэт в стильных серых костюмах.png» уже вырезан (RGBA, чистые края), фон не трогаем.
 * Запуск: npm run hosts. Результат: src/assets/img/hosts-cutout-{600,1024}.{avif,webp,png}.
 * Ширины 600 и 1024; оригинал 1024x1536, поэтому больше 1024 не делаем (без апскейла) и не кадрируем:
 * геометрия hero (головы 37-77% ширины, верх голов на 8% высоты) считается по полному холсту.
 */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Дуэт в стильных серых костюмах.png');
const OUT = join(ROOT, 'src', 'assets', 'img');

for (const w of [600, 1024]) {
  const r = sharp(SRC).resize({ width: w, withoutEnlargement: true });
  await r.clone().avif({ quality: 62 }).toFile(join(OUT, `hosts-cutout-${w}.avif`));
  await r.clone().webp({ quality: 86, alphaQuality: 95 }).toFile(join(OUT, `hosts-cutout-${w}.webp`));
  await r.clone().png({ compressionLevel: 9 }).toFile(join(OUT, `hosts-cutout-${w}.png`));
  console.log('hosts-cutout', w);
}
