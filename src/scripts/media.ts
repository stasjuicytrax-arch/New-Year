import manifest from '../assets/img/manifest.json';

/** URL всех оптимизированных фото (имя файла: name-ширина.расширение). Ссылки только через Vite, base подставляется сам. */
const files = import.meta.glob('../assets/img/*.{avif,webp,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const url = (name: string, w: number, ext: string): string => files[`../assets/img/${name}-${w}.${ext}`] ?? '';

interface Variant {
  w: number;
  h: number;
}

export interface PictureOptions {
  name: string;
  alt: string;
  sizes: string;
  /** Явные варианты (для файлов вне manifest.json, например hosts-cutout). */
  variants?: Variant[];
  /** Формат <img>-фолбэка: jpg для фото, webp для вырезок с альфой. */
  fallback?: 'jpg' | 'webp';
  cls?: string;
  eager?: boolean;
}

/** <picture> с AVIF + WebP + JPEG, srcset по ширинам. Размеры width/height берутся у самого крупного варианта (нет сдвига макета). */
export function picture({ name, alt, sizes, variants, fallback = 'jpg', cls = '', eager = false }: PictureOptions): string {
  const list: Variant[] =
    variants ?? (manifest as Record<string, { variants: Array<{ width: number; height: number }> }>)[name].variants.map((v) => ({ w: v.width, h: v.height }));
  const srcset = (ext: string): string => list.map((v) => `${url(name, v.w, ext)} ${v.w}w`).join(', ');
  const big = list[list.length - 1];
  const mid = list[Math.min(1, list.length - 1)];
  return `<picture>
    <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
    <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">
    <img class="${cls}" src="${url(name, mid.w, fallback)}" srcset="${srcset(fallback)}" sizes="${sizes}" width="${big.w}" height="${big.h}" alt="${alt}" decoding="async"${eager ? '' : ' loading="lazy"'}>
  </picture>`;
}
