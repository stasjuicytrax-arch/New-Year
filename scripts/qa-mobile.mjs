/**
 * MOBILE QA (CLAUDE.md): прогон собранного сайта на телефонных вьюпортах.
 * Запуск: npm run build && npm run qa:mobile
 * Нужен Chromium: npx playwright install chromium. Код выхода 1 при любой ошибке.
 * Скриншоты (полная страница + каждая секция) пишутся в qa/ (в .gitignore): их нужно открыть и посмотреть глазами.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4179;
const SITE = `http://localhost:${PORT}/`;
const VIEWPORTS = [
  [360, 740],
  [375, 812],
  [375, 940],
  [390, 844],
  [412, 915],
  [430, 932],
  [768, 1024],
];
const PRELOAD_KEY = 'gnn-preloaded';

const errors = [];
const fail = (vp, msg) => errors.push(`[${vp}] ${msg}`);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(SITE)).ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('vite preview не поднялся');
}

/** Боке: DESIGN-SYSTEM §7.4 (непрозрачность ≤ 0.12, диаметр ≤ 28px). */
async function checkSource() {
  const src = await readFile(new URL('../src/scripts/gl/bokeh.ts', import.meta.url), 'utf8');
  const alpha = src.match(/styles\[i \* 4 \+ 1\] = ([\d.]+) \+ Math\.random\(\) \* ([\d.]+)/);
  if (!alpha || Number(alpha[1]) + Number(alpha[2]) > 0.1201) fail('src', 'боке: opacity выше 0.12');
  const radius = src.match(/styles\[i \* 4\] = ([\d.]+) \+ Math\.random\(\) \* ([\d.]+)/);
  if (!radius || (Number(radius[1]) + Number(radius[2])) * 2 > 28.01) fail('src', 'боке: диаметр больше 28px');
}

/** Всё, что считается в браузере. Возвращает список нарушений строками. */
async function inPage() {
  const out = [];
  const atTop = window.scrollY < 5; // hero в покое: на скролле он масштабируется пином, это не баг вёрстки
  const vw = document.documentElement.clientWidth;
  const rect = (el) => el.getBoundingClientRect();
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  const visible = (el) => {
    const s = getComputedStyle(el);
    const b = rect(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01 && b.width > 0 && b.height > 0;
  };

  // 1. горизонтальный скролл
  if (document.documentElement.scrollWidth > vw) out.push(`горизонтальный скролл: scrollWidth ${document.documentElement.scrollWidth} > clientWidth ${vw}`);

  // 2. центрирование ключевых медиа и обрезка краем экрана
  const media = [...document.querySelectorAll('.hero__hosts img, .chapter img, .chapter picture img')].filter(visible);
  for (const img of media) {
    if (img.closest('#hero') && !atTop) continue;
    const b = rect(img);
    const left = b.left;
    const right = vw - b.right;
    const full = b.width >= vw - 1; // full-bleed не считаем смещением
    if (!full && Math.abs(left - right) > 4) out.push(`${label(img)} не по центру: слева ${Math.round(left)}px, справа ${Math.round(right)}px`);
    if (!full && (b.left < -1 || b.right > vw + 1)) out.push(`${label(img)} обрезан краем экрана (${Math.round(b.left)}..${Math.round(b.right)})`);
  }

  // 3. резкость на ретине: naturalWidth ≥ 2 × CSS-ширина
  // naturalWidth у srcset с w-дескрипторами приведён к CSS-размеру, поэтому реальные пиксели берём у файла currentSrc
  for (const img of document.images) {
    if (!visible(img) || !img.complete || !img.naturalWidth || !img.currentSrc) continue;
    if (img.closest('[aria-hidden="true"]') || /\.svg(\?|$)/.test(img.currentSrc)) continue;
    const w = rect(img).width;
    const probe = new Image();
    probe.src = img.currentSrc;
    await probe.decode().catch(() => undefined);
    if (probe.naturalWidth < w * 2 - 1) out.push(`${label(img)} мыло: файл ${probe.naturalWidth}px < 2 × ${Math.round(w)}px (${img.currentSrc.split('/').pop()})`);
  }

  // 4. размеры текста и тач-цели
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim() || !visible(el) || el.closest('script,style,noscript,[aria-hidden="true"]')) continue;
    seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const isLabel = el.classList.contains('label') || !!el.closest('.label');
    const min = isLabel ? 11 : 14;
    if (fs < min - 0.01) out.push(`текст ${fs.toFixed(1)}px < ${min}px: ${label(el)} «${t.textContent.trim().slice(0, 28)}»`);
  }
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role=button]')) {
    if (!visible(el) || el.closest('.skip-link')) continue;
    if (el.matches('a') && el.closest('p, li') && !el.classList.contains('btn')) continue; // инлайн-ссылка в тексте
    const b = rect(el);
    if (b.width < 43.5 || b.height < 43.5) out.push(`тач-цель ${Math.round(b.width)}×${Math.round(b.height)} < 44: ${label(el)} «${(el.textContent || '').trim().slice(0, 24)}»`);
  }

  // 5. шапка: не перекрывает контент (по состоянию на текущем скролле) и бренд/телефон на месте
  const header = document.querySelector('#site-header');
  if (header) {
    const hb = rect(header);
    if (hb.right > vw + 1) out.push('шапка шире экрана');
    const brand = header.querySelector('.site-header__brand');
    const phone = header.querySelector('.site-header__phone');
    if (brand && rect(brand).right > rect(header.querySelector('.site-header__actions')).left + 1) out.push('бренд в шапке налезает на кнопки');
    if (!phone || phone.getAttribute('href') !== 'tel:+79082708971') out.push('в шапке нет телефона +7 908 270-89-71');
    if (brand && brand.textContent.trim() !== 'НОВОГОДНЯЯ НОЧЬ 2027') out.push(`бренд в шапке: «${brand.textContent.trim()}»`);
  }

  // 6. заголовки: без переносов слов, без выхода за экран
  for (const h of document.querySelectorAll('h1, h2, h3, .hero__line')) {
    if (!visible(h)) continue;
    if (h.closest('#hero') && !atTop) continue;
    const cs = getComputedStyle(h);
    if (cs.hyphens === 'auto' || cs.overflowWrap === 'anywhere' || cs.wordBreak === 'break-all') out.push(`перенос по слогам разрешён: ${label(h)}`);
    const range = document.createRange();
    range.selectNodeContents(h);
    const lines = [...range.getClientRects()].filter((r) => r.width > 1);
    const b = range.getBoundingClientRect();
    if (b.left < -1 || b.right > vw + 1) out.push(`заголовок вылезает за экран (${Math.round(b.left)}..${Math.round(b.right)}): «${h.textContent.trim().slice(0, 30)}»`);
    // слово разорвано, если единственное слово занимает больше одной строки
    for (const w of h.textContent.trim().split(/\s+/)) {
      if (w.length < 6 || w.includes('-')) continue; // перенос по дефису законен
      const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) {
        const n = tw.currentNode;
        const i = n.textContent.indexOf(w);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        const rs = [...r.getClientRects()].filter((x) => x.width > 1);
        const tops = new Set(rs.map((x) => Math.round(x.top / 4)));
        if (tops.size > 1 && h.classList.contains('hero__line') === false && h.querySelector('.char') === null) out.push(`слово «${w}» разорвано переносом`);
      }
    }
    void lines;
  }

  // 7. hero: зазор между строками и детская плашка
  const l = [...document.querySelectorAll('.hero__line')];
  if (l.length === 3 && atTop) {
    const rr = l.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    });
    const fs = parseFloat(getComputedStyle(l[1]).fontSize);
    const gap = rr[2].top - rr[1].bottom;
    if (gap > fs * 0.3) out.push(`разрыв между «НОВОГОДНЯЯ» и «НОЧЬ 2027»: ${Math.round(gap)}px (кегль ${Math.round(fs)}px)`);
  }
  const kids = document.querySelector('.hero__kids');
  if (kids && visible(kids) && atTop) {
    const cs = getComputedStyle(kids);
    const rows = Math.round((rect(kids).height - parseFloat(cs.paddingTop) * 2 - 2) / parseFloat(cs.lineHeight));
    if (rows > 2) out.push(`детская плашка в ${rows} строк`);
  }
  for (const b of document.querySelectorAll('.btn--primary')) {
    const bg = getComputedStyle(b).backgroundImage;
    if (!bg.includes('linear-gradient') || /rgb\(94, 104, 134\)|rgb\(154, 166, 196\)/.test(bg)) out.push('кнопка не на --chrome-button (тёмная полоса)');
  }
  return out;
}

async function run(browser, [width, height]) {
  const name = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => {
    try {
      sessionStorage.setItem(k, '1');
    } catch {}
  }, PRELOAD_KEY);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && fail(name, `console.error: ${m.text()}`));
  page.on('pageerror', (e) => fail(name, `pageerror: ${e.message}`));
  page.on('requestfailed', (r) => fail(name, `запрос упал: ${r.url()}`));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('fx-intro'), null, { timeout: 15000 }).catch(() => fail(name, 'fx-intro не снят'));
  await page.waitForTimeout(3500);

  const dir = `qa/${name}`;
  await mkdir(dir, { recursive: true });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const sections = await page.$$eval('main > section[id]', (els) => els.map((e) => e.id));

  // проход сверху вниз: на каждом экране считаем нарушения (шапка/плавающие элементы стоят на месте)
  const step = Math.round(height * 0.8);
  const seen = new Set();
  for (let y = 0; y < total; y += step) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(450);
    for (const v of await page.evaluate(inPage)) {
      if (!seen.has(v)) {
        seen.add(v);
        fail(name, `${v} (скролл ${y}px)`);
      }
    }
  }
  // шапка после hero: подложка с blur
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.5));
  await page.waitForTimeout(900);
  const hdr = await page.evaluate(() => {
    const h = document.querySelector('#site-header');
    const b = getComputedStyle(h, '::before');
    return { solid: h.classList.contains('is-solid'), blur: b.backdropFilter || b.webkitBackdropFilter || '', opacity: Number(b.opacity) };
  });
  if (!hdr.solid || !/blur/.test(hdr.blur) || hdr.opacity < 0.95) fail(name, 'после hero у шапки нет подложки с blur');

  // скриншоты: полная страница + каждая секция
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/full.png`, fullPage: true }).catch((e) => fail(name, `скриншот страницы: ${e.message}`));
  for (const id of sections) {
    const el = await page.$(`#${id}`);
    await el?.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await el?.screenshot({ path: `${dir}/${id}.png` }).catch(() => undefined);
  }
  await ctx.close();
}

await rm('qa', { recursive: true, force: true });
await mkdir('qa', { recursive: true });
await checkSource();
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  for (const vp of VIEWPORTS) await run(browser, vp);
} finally {
  await browser?.close();
  server.kill();
}

if (errors.length) {
  console.error(`Mobile QA: ${VIEWPORTS.length} вьюпортов, ${errors.length} ошибок\n` + errors.map((e) => ` - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Mobile QA: ${VIEWPORTS.length} вьюпортов, 0 ошибок`);
