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
  [1920, 950, true],
  [1440, 800, true],
  [1366, 650, true],
];
const PRELOAD_KEY = 'gnn-preloaded';

const only = process.env.QA_ONLY?.split(',');
const VPS = only ? VIEWPORTS.filter(([w, h]) => only.includes(`${w}x${h}`)) : VIEWPORTS;
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
async function inPage(desktop) {
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
  const media = [...document.querySelectorAll('.hero__hosts img, .ch__cutout, .ch__media--dj, .ch__media--fan, .ch__media--duo, .ch__mask--wide')].filter(visible);
  for (const img of desktop ? [] : media) {
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
  for (const img of desktop ? [] : document.images) {
    if (!visible(img) || !img.complete || !img.naturalWidth || !img.currentSrc) continue;
    if (img.closest('[aria-hidden="true"]') || /\.svg(\?|$)/.test(img.currentSrc)) continue;
    const w = img.offsetWidth; // без transform-параллакса
    // реальная ширина файла берётся один раз на адрес (кэш на странице)
    const cache = (window.__qaProbe ??= new Map());
    if (!cache.has(img.currentSrc)) {
      const probe = new Image();
      probe.src = img.currentSrc;
      await probe.decode().catch(() => undefined);
      cache.set(img.currentSrc, probe.naturalWidth);
    }
    const probe = { naturalWidth: cache.get(img.currentSrc) };
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
  for (const el of desktop ? [] : document.querySelectorAll('a[href], button, input, select, textarea, summary, [role=button]')) {
    if (!visible(el) || el.closest('.skip-link')) continue;
    // Стулья на схеме мельче 44px по определению; запасные способы выбора (карточка стола, список) проверяются в сценарии выбора мест
    if (el.closest('svg.hall') && !el.matches('.tbl__hit')) continue;
    if (el.matches('a') && el.closest('p, li, .check') && !el.classList.contains('btn')) continue; // инлайн-ссылка в тексте
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
    if (brand && brand.textContent.trim() !== 'WHITE HALL · 31.12') out.push(`бренд в шапке: «${brand.textContent.trim()}»`);
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
    const fs3 = parseFloat(getComputedStyle(l[2]).fontSize);
    if (fs3 < fs * 0.5 - 0.01) out.push(`«НОЧЬ 2027» ${Math.round(fs3)}px < половины «НОВОГОДНЯЯ» (${Math.round(fs / 2)}px)`);
    // «в одну строку» считаем по рядам глифов: высота рамки текста у Prata выше кегля
    const rg = document.createRange();
    rg.selectNodeContents(l[2]);
    const ys = [...rg.getClientRects()].filter((x) => x.width > 1).map((x) => x.top);
    if (Math.max(...ys) - Math.min(...ys) > fs3 * 0.5) out.push('«НОЧЬ 2027» не в одну строку');
    const mid = (rr[2].left + rr[2].right) / 2;
    if (Math.abs(mid - document.documentElement.clientWidth / 2) > 4) out.push(`«НОЧЬ 2027» не по центру (смещение ${Math.round(mid - document.documentElement.clientWidth / 2)}px)`);
    const gap = rr[2].top - rr[1].bottom;
    if (gap > fs * 0.3) out.push(`разрыв между «НОВОГОДНЯЯ» и «НОЧЬ 2027»: ${Math.round(gap)}px (кегль ${Math.round(fs)}px)`);
  }
  // hero-афиша: макушки ниже H1 на 24px (mobile) / 32px (desktop); таймер крупно; на десктопе всё до кнопки в первом экране
  const stage = document.querySelector('.hero__stage');
  if (stage && atTop) {
    const title = stage.querySelector('.hero__title').getBoundingClientRect();
    const hh = stage.querySelector('.hero__hosts img').getBoundingClientRect();
    const headsTop = hh.top + hh.height * 0.08; // верх голов на 8% высоты холста
    const need = desktop || window.innerWidth >= 1024 ? 32 : 24;
    if (headsTop - title.bottom < need - 1) out.push(`отступ от H1 до макушек ${Math.round(headsTop - title.bottom)}px < ${need}px`);
    if (headsTop - title.bottom > need + 60) out.push('между H1 и ведущими лишняя пустота: ' + Math.round(headsTop - title.bottom) + 'px');
    const timer = stage.querySelector('.hero__timer .countdown__num');
    if (timer && parseFloat(getComputedStyle(timer).fontSize) < (desktop ? 56 : 36)) out.push('цифры таймера мельче нормы (' + getComputedStyle(timer).fontSize + ')');
    if (desktop) {
      const lab = stage.querySelector('.hero__label').getBoundingClientRect();
      const names = stage.querySelector('.hero__names').getBoundingClientRect();
      const cta = stage.querySelector('.hero__cta .btn').getBoundingClientRect();
      const tick = stage.querySelector('.hero__tickets').getBoundingClientRect();
      if (lab.top < 64) out.push('метка hero под шапкой: top ' + Math.round(lab.top));
      for (const [n, r] of [['имена', names], ['билеты', tick], ['кнопка', cta]]) {
        if (r.bottom > window.innerHeight) out.push(`в первый экран не влезает: ${n} (низ ${Math.round(r.bottom)}px > ${window.innerHeight}px)`);
      }
    }
    const hr = stage.getBoundingClientRect();
    for (const el of stage.querySelectorAll('.hero__info, .hero__names, .hero__timer')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > hr.bottom + 1) out.push('элемент hero выходит за границы hero: ' + label(el));
    }
  }

  // обрезка глифов: у каждого элемента с background-clip:text высота бокса не меньше 1.1 кегля
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.webkitBackgroundClip !== 'text' && cs.backgroundClip !== 'text') continue;
    if (!visible(el) || cs.display === 'inline') continue;
    const fs = parseFloat(cs.fontSize);
    const h = el.offsetHeight;
    if (h < fs * 1.1 - 0.5) out.push(`обрезка глифов: ${label(el)} высота ${h}px < 1.1 × ${Math.round(fs)}px («${(el.textContent || '').trim().slice(0, 18)}»)`);
  }

  // шкала: ни один заголовок секции не крупнее H2, ни один абзац не крупнее lead
  const sizeOf = (el) => parseFloat(getComputedStyle(el).fontSize);
  for (const el of document.querySelectorAll('h2')) if (visible(el) && sizeOf(el) > 56.1) out.push(`H2 крупнее 56px: ${Math.round(sizeOf(el))}px («${el.textContent.trim().slice(0, 20)}»)`);
  for (const el of document.querySelectorAll('h3, .ch__title')) if (visible(el) && sizeOf(el) > 36.1) out.push(`H3 крупнее 36px: ${Math.round(sizeOf(el))}px`);
  for (const el of document.querySelectorAll('.ch__digits')) if (visible(el) && sizeOf(el) > 72.1) out.push(`номер главы крупнее 72px: ${Math.round(sizeOf(el))}px`);
  for (const el of document.querySelectorAll('.intro__lead, .ch__text, .manifest__text, .booking__text, .footer__slogan, .hero__sub, .lead')) {
    if (visible(el) && sizeOf(el) > 24.1) out.push(`абзац крупнее lead (24px): ${label(el)} ${Math.round(sizeOf(el))}px`);
  }

  // кнопки: один компонент, две вариации, pill, высота 56 (desktop) / 52 (mobile) / 44 (шапка), текст по центру
  for (const b of document.querySelectorAll('.btn')) {
    const cs = getComputedStyle(b);
    if (!visible(b)) continue;
    if (cs.clipPath !== 'none') out.push('у кнопки срезаны углы (clip-path): ' + label(b));
    if (parseFloat(cs.borderTopLeftRadius) < 20) out.push('кнопка не pill: ' + label(b) + ' радиус ' + cs.borderTopLeftRadius);
    if (!b.classList.contains('btn--primary') && !b.classList.contains('btn--secondary')) out.push('кнопка без варианта primary/secondary: ' + label(b));
    if (b.classList.contains('btn--primary') && cs.backgroundColor !== 'rgb(245, 248, 252)') out.push('primary не светлая заливка: ' + cs.backgroundColor);
    const want = b.classList.contains('btn--sm') ? 44 : window.innerWidth >= 768 ? 56 : 52;
    const r = b.getBoundingClientRect();
    if (Math.abs(r.height - want) > 1.5) out.push(`высота кнопки ${Math.round(r.height)}px, нужно ${want}px: ${label(b)}`);
    const sp = b.querySelector('span');
    if (sp) {
      const sr = sp.getBoundingClientRect();
      if (Math.abs((sr.top + sr.bottom) / 2 - (r.top + r.bottom) / 2) > 2 || Math.abs((sr.left + sr.right) / 2 - (r.left + r.right) / 2) > 2) out.push(`текст кнопки не по центру: ${label(b)} dy=${Math.round((sr.top + sr.bottom) / 2 - (r.top + r.bottom) / 2)} dx=${Math.round((sr.left + sr.right) / 2 - (r.left + r.right) / 2)} (btn ${Math.round(r.top)}+${Math.round(r.height)}, span ${Math.round(sr.top)}+${Math.round(sr.height)})`);
    }
  }
  const skip = document.querySelector('.skip-link');
  if (skip && document.activeElement !== skip) {
    const r = skip.getBoundingClientRect();
    if (r.right > 0 && r.bottom > 0 && r.left < window.innerWidth) out.push('skip-link виден без фокуса (белая плашка)');
  }
  return out;
}

async function run(browser, [width, height, desktop = false]) {
  const name = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: desktop ? 1 : 3, isMobile: !desktop, hasTouch: !desktop });
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
  const sections = await page.$$eval('main > section[id], .ch[id], footer', (els) => els.map((e) => e.id || 'footer'));

  // проход сверху вниз: на каждом экране считаем нарушения (шапка/плавающие элементы стоят на месте)
  const step = Math.round(height * 0.9);
  const seen = new Set();
  for (let y = 0; y < total; y += step) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(150);
    for (const v of await page.evaluate(inPage, desktop)) {
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
  const want = process.env.QA_SHOTS === 'all' ? sections : sections.filter((id) => ['hero', 'ch-10', 'booking', 'site-footer'].includes(id));
  for (const id of want) {
    const el = await page.$(`#${id}`);
    await el?.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await el?.screenshot({ path: `${dir}/${id}.png` }).catch(() => undefined);
  }
  await hallScenario(page, name, dir, desktop).catch((e) => fail(name, `галерея зала, сценарий упал: ${String(e.message).split(String.fromCharCode(10)).slice(0, 4).join(' | ')}`));
  await seatingScenario(page, name, dir, desktop).catch((e) => fail(name, `схема зала, сценарий упал: ${String(e.message).split(String.fromCharCode(10)).slice(0, 12).join(' | ')}`));
  await ctx.close();
}

/** Галерея «Зал WHITE HALL»: заголовок и подпись, бенто на десктопе / лента на телефоне, лайтбокс. */
async function hallScenario(page, name, dir, desktop) {
  page.setDefaultTimeout(8000);
  const bad = (m) => fail(name, `галерея зала: ${m}`);
  await page.evaluate(() => document.querySelector('#hall').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1800);

  const g = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const items = [...document.querySelectorAll('#hall .hall__item')];
    const r = items.map((e) => e.getBoundingClientRect());
    const rail = document.querySelector('#hall [data-rail]');
    const grid = document.querySelector('#hall .hall__grid').getBoundingClientRect();
    const title = document.querySelector('#hall-title');
    return {
      vh, vw,
      title: title.textContent.trim(), titleTop: title.getBoundingClientRect().top, titleFont: getComputedStyle(title).fontFamily,
      cap: document.querySelector('#hall .hall__cap').textContent.replace(/\s+/g, ' ').trim(),
      n: items.length,
      rects: r.map((b) => ({ l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom })),
      radius: items.map((e) => getComputedStyle(e).borderRadius),
      grid: { top: grid.top, bottom: grid.bottom, w: grid.width },
      railScroll: rail.scrollWidth, railClient: rail.clientWidth, snap: getComputedStyle(rail).scrollSnapType,
      dots: [...document.querySelectorAll('#hall .hall__dots span')].map((d) => d.classList.contains('is-on')),
      dotsShown: getComputedStyle(document.querySelector('#hall .hall__dots')).display !== 'none',
      prevBottom: document.querySelector('#hall').previousElementSibling.getBoundingClientRect().bottom,
    };
  });
  if (g.n !== 5) bad(`в галерее ${g.n} фото, нужно 5`);
  if (g.title !== 'ЗАЛ WHITE HALL') bad(`заголовок «${g.title}»`);
  if (!/prata/i.test(g.titleFont)) bad(`заголовок не Prata: ${g.titleFont}`);
  if (g.cap !== 'Банкетный зал WHITE HALL · Пермь, ул. Монастырская, 2а') bad(`подпись «${g.cap}»`);
  if (g.titleTop < 63) bad(`заголовок под шапкой (top ${Math.round(g.titleTop)}px)`);
  if (g.radius.some((x) => x !== '20px')) bad(`радиус фото ${g.radius.join(',')}, нужно 20px`);
  if (desktop) {
    const [big, ...small] = g.rects;
    const gap = small[2].t - small[0].b;
    if (g.grid.bottom > g.vh + 0.5 || g.grid.top < 63) bad(`бенто не помещается в экран: ${Math.round(g.grid.top)}–${Math.round(g.grid.bottom)} при высоте ${g.vh}`);
    if (g.grid.w > 1401) bad(`сетка шире 1400px: ${Math.round(g.grid.w)}`);
    if (Math.abs(big.h - (small[0].h + small[2].h + gap)) > 3 || gap < 12) bad('большое фото не занимает 2 ряда');
    if (!(big.r <= small[0].l + 1 && Math.abs(small[0].t - small[1].t) < 2 && Math.abs(small[2].t - small[3].t) < 2 && small[1].l > small[0].l)) bad('4 малых фото не лежат 2×2 справа от большого');
    if (g.dotsShown) bad('на десктопе показаны точки ленты');
  } else {
    if (g.railScroll <= g.railClient + 4) bad('лента не прокручивается по горизонтали');
    if (!/x/.test(g.snap) || !/mandatory/.test(g.snap)) bad(`нет scroll-snap: ${g.snap}`);
    const second = g.rects[1];
    if (!(second.l < g.vw - 8 && second.l > g.vw * 0.6)) bad(`край следующего фото не виден (left ${Math.round(second.l)} из ${g.vw})`);
    if (g.dots.length !== 5 || !g.dots[0]) bad('точки-индикатор: нет 5 точек или первая не активна');
    await page.locator('#hall [data-rail]').evaluate((el) => el.scrollTo({ left: el.querySelectorAll('.hall__item')[1].offsetLeft - parseFloat(getComputedStyle(el).paddingLeft), behavior: 'instant' }));
    await page.waitForTimeout(500);
    const dots2 = await page.evaluate(() => [...document.querySelectorAll('#hall .hall__dots span')].map((d) => d.classList.contains('is-on')));
    if (!dots2[1]) bad('точка-индикатор не переключилась после прокрутки ленты');
    await page.locator('#hall [data-rail]').evaluate((el) => el.scrollTo({ left: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${dir}/hall-fit.png` });

  // лайтбокс: открытие, стрелки, клавиши, свайпы, Esc, крестик
  const first = page.locator('#hall .hall__item--1');
  await (desktop ? first.click() : first.tap());
  await page.waitForSelector('#hall-lightbox[open]', { timeout: 3000 }).catch(() => bad('клик по фото не открыл лайтбокс'));
  await page.waitForTimeout(500);
  const lb = () => page.evaluate(() => {
    const img = document.querySelector('#hall-lightbox .lightbox__img');
    const r = img ? img.getBoundingClientRect() : { width: 0, height: 0 };
    return { count: document.querySelector('#hall-lightbox [data-lb-count]').textContent, w: Math.round(r.width), h: Math.round(r.height), open: document.querySelector('#hall-lightbox').open, vw: innerWidth, vh: innerHeight };
  });
  const a = await lb();
  if (a.count !== '1 / 5') bad(`счётчик лайтбокса «${a.count}»`);
  if (a.w < a.vw - 2 || a.h < a.vh - 2) bad(`фото в лайтбоксе не на весь экран: ${a.w}×${a.h} из ${a.vw}×${a.vh}`);
  const btns = await page.evaluate(() => ['[data-lb-close]', '[data-lb-prev]', '[data-lb-next]'].map((q) => { const b = document.querySelector('#hall-lightbox ' + q).getBoundingClientRect(); return Math.min(b.width, b.height); }));
  if (btns.some((x) => x < 44)) bad('кнопки лайтбокса меньше 44px');
  await page.screenshot({ path: `${dir}/hall-lightbox.png` });
  await page.locator('#hall-lightbox [data-lb-next]').click();
  if ((await lb()).count !== '2 / 5') bad('кнопка «следующее» не листает');
  await page.keyboard.press('ArrowRight');
  if ((await lb()).count !== '3 / 5') bad('стрелка вправо не листает');
  await page.keyboard.press('ArrowLeft');
  if ((await lb()).count !== '2 / 5') bad('стрелка влево не листает');
  const swipe = (dx, dy) => page.evaluate(([dx, dy]) => {
    const st = document.querySelector('#hall-lightbox [data-stage]');
    const mk = (type, x, y) => st.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: y }));
    mk('pointerdown', 200, 300); mk('pointerup', 200 + dx, 300 + dy);
  }, [dx, dy]);
  await swipe(-120, 0);
  if ((await lb()).count !== '3 / 5') bad('свайп влево не листает вперёд');
  await swipe(120, 0);
  if ((await lb()).count !== '2 / 5') bad('свайп вправо не листает назад');
  await swipe(0, 160);
  await page.waitForTimeout(250);
  if ((await lb()).open) bad('свайп вниз не закрыл лайтбокс');
  await (desktop ? first.click() : first.tap());
  await page.waitForSelector('#hall-lightbox[open]', { timeout: 3000 }).catch(() => bad('лайтбокс не открылся повторно'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if ((await lb()).open) bad('Esc не закрыл лайтбокс');
  await (desktop ? first.click() : first.tap());
  await page.waitForSelector('#hall-lightbox[open]', { timeout: 3000 }).catch(() => undefined);
  await page.locator('#hall-lightbox [data-lb-close]').click();
  await page.waitForTimeout(250);
  if ((await lb()).open) bad('крестик не закрыл лайтбокс');
  if (await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden')) bad('после закрытия лайтбокса страница осталась заблокированной');
}

/** Сценарии схемы зала: только места; места + дети; только дети (детские билеты без мест). */
async function seatingScenario(page, name, dir, desktop) {
  page.setDefaultTimeout(8000);
  const bad = (m) => fail(name, `схема зала: ${m}`);
  const digits = (str) => String(str).replace(/\D/g, '');

  // якорь: после перехода по «Забронировать» заголовок блока не под шапкой
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.locator('#hero a[href="#seats"]').click();
  await page.waitForTimeout(2200);
  const anchorTop = await page.evaluate(() => document.querySelector('#seats-title').getBoundingClientRect().top);
  if (anchorTop < 64) bad(`после перехода к #seats заголовок под шапкой (top ${Math.round(anchorTop)}px)`);

  // схема целиком в кадре: сцена и все 15 столов видны без прокрутки (десктоп: вместе с заголовком, легендой и над панелью итога;
  // телефон: карта не выше экрана без шапки и 120px, ставим её под шапку)
  if (!desktop) {
    await page.evaluate(() => { const m = document.querySelector('#seats [data-map]'); window.scrollBy(0, m.getBoundingClientRect().top - 72); });
    await page.waitForTimeout(900);
  }
  const fit = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const svg = document.querySelector('#seats svg.hall');
    const sr = svg.getBoundingClientRect();
    const panel = document.querySelector('#seats-panel');
    const panelShown = panel && getComputedStyle(panel).display !== 'none';
    const panelTop = panelShown ? panel.getBoundingClientRect().top : vh;
    const legend = document.querySelector('#seats .seats__legend').getBoundingClientRect();
    const title = document.querySelector('#seats-title').getBoundingClientRect();
    const mq = document.querySelector('#seats').previousElementSibling.getBoundingClientRect();
    const kidsR = document.querySelector('#seats .kids').getBoundingClientRect();
    const mapR = document.querySelector('#seats [data-map]').getBoundingClientRect();
    const items = [...document.querySelectorAll('#seats .tbl__body'), document.querySelector('#seats .hall__stage')].map((e) => e.getBoundingClientRect());
    const out = items.filter((r) => r.left < -0.5 || r.right > vw + 0.5 || r.top < 63.5 || r.bottom > panelTop + 0.5).length;
    return { orient: svg.dataset.orient, w: sr.width, h: sr.height, top: sr.top, bottom: sr.bottom, panelTop, panelShown, legendBottom: legend.bottom, titleTop: title.top, gapMarquee: title.top - mq.bottom, kidsH: kidsR.height, kidsW: kidsR.width, mapW: mapR.width, out, count: items.length, vh };
  });
  if (fit.count !== 16) bad(`в кадре ${fit.count} объектов вместо 15 столов и сцены`);
  if (fit.out) bad(`схема не помещается в экран: за пределами кадра ${fit.out} из ${fit.count} (вьюпорт ${fit.vh}px, схема ${Math.round(fit.top)}–${Math.round(fit.bottom)}, панель ${Math.round(fit.panelTop)})`);
  if (fit.gapMarquee < (desktop ? 72 : 48) - 1) bad(`между бегущей строкой и заголовком «Выберите места» ${Math.round(fit.gapMarquee)}px, нужно не меньше ${desktop ? 72 : 48}`);
  if (desktop) {
    if (Math.abs(fit.kidsW - fit.mapW) > 2) bad(`блок детских билетов (${Math.round(fit.kidsW)}px) не на всю ширину схемы (${Math.round(fit.mapW)}px)`);
    if (fit.kidsH > 96) bad(`блок детских билетов высотой ${Math.round(fit.kidsH)}px, нужно около 72`);
    if (fit.orient !== 'h' || fit.w <= fit.h) bad(`на десктопе схема должна быть горизонтальной (orient ${fit.orient}, ${Math.round(fit.w)}×${Math.round(fit.h)})`);
    if (fit.titleTop < 63) bad(`заголовок блока под шапкой (top ${Math.round(fit.titleTop)}px)`);
    if (!fit.panelShown) bad('на десктопе панель итога не закреплена внизу');
    if (fit.legendBottom > fit.panelTop + 0.5) bad(`легенда уходит под панель (низ ${Math.round(fit.legendBottom)}, панель ${Math.round(fit.panelTop)})`);
  } else {
    if (fit.orient !== 'v') bad(`на телефоне схема должна быть вертикальной (orient ${fit.orient})`);
    if (fit.h > fit.vh - 64 - 120 + 1) bad(`схема выше 100svh − шапка − 120px: ${Math.round(fit.h)}px при экране ${fit.vh}px`);
  }
  await page.screenshot({ path: `${dir}/seats-fit.png` });

  // список столов: только ссылка «Список столов» под схемой и компактный диалог поверх (большого списка из 15 карточек нет ни на десктопе, ни на телефоне)
  if (await page.locator('#seats-list').count()) bad('остался большой список из 15 карточек под схемой');
  const listBtn = page.locator('[data-openlist]');
  await listBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await (desktop ? listBtn.click() : listBtn.tap());
  await page.waitForSelector('#tables-dialog[open]', { timeout: 3000 }).catch(() => bad('«Список столов» не открыл диалог'));
  const rows = await page.locator('#tables-dialog .tlist__row').count();
  if (rows !== 15) bad(`в диалоге списка ${rows} столов, нужно 15`);
  await page.screenshot({ path: `${dir}/seats-list-dialog.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // вход: на правой стене исходника точно на уровне стола 11 (на десктопе, где зал повёрнут, — на верхней стене над столом 11)
  const door = await page.evaluate(() => {
    const g = document.querySelector('#seats .hall__door .hall__gap').getBoundingClientRect();
    const t = document.querySelector('#seats .tbl[data-table="11"] .tbl__body').getBoundingClientRect();
    const h = document.querySelector('#seats svg.hall').dataset.orient === 'h';
    return { h, dGap: h ? Math.abs((g.left + g.right) / 2 - (t.left + t.right) / 2) : Math.abs((g.top + g.bottom) / 2 - (t.top + t.bottom) / 2), side: h ? g.bottom < t.top : g.left > t.right };
  });
  if (door.dGap > 2) bad(`вход не на уровне стола 11 (смещение ${door.dGap.toFixed(1)}px)`);
  if (!door.side) bad(door.h ? 'вход должен быть на верхней стене над столом 11' : 'вход должен быть на правой стене справа от стола 11');

  const geo = await page.evaluate(() => {
    const map = document.querySelector('#seats [data-map]').getBoundingClientRect();
    const hit = document.querySelector('.tbl__hit[data-hit="7"]').getBoundingClientRect();
    return { mapW: map.width, vw: window.innerWidth, hitW: hit.width, hitH: hit.height, tables: document.querySelectorAll('.tbl').length, seats: document.querySelectorAll('.seat').length };
  });
  if (geo.tables !== 15 || geo.seats !== 120) bad(`столов ${geo.tables}, мест ${geo.seats}, нужно 15 и 120`);
  if (geo.mapW > geo.vw + 1) bad('схема шире экрана');
  if (!desktop && (geo.hitW < 44 || geo.hitH < 44)) bad(`зона стола ${Math.round(geo.hitW)}×${Math.round(geo.hitH)} < 44px`);

  const panelText = (sel) => page.locator(`#seats-panel ${sel}`).innerText().catch(() => '');
  const formState = () => page.evaluate(() => ({
    choice: !document.querySelector('[data-choice]').hidden,
    sel: document.querySelector('[data-choice-sel]').textContent,
    kidsLine: document.querySelector('[data-choice-kids]').textContent,
    sum: document.querySelector('[data-choice-sum]').textContent,
    adults: document.querySelector('input[name="adults"]').value,
    kids: document.querySelector('input[name="kids4"]').value,
    locked: document.querySelector('[data-step="adults"]').classList.contains('is-locked'),
    tableHidden: document.querySelector('[data-tablepos]').hidden,
  }));

  // ---- 1. только места ----
  const hit7 = page.locator('.tbl__hit[data-hit="7"]');
  await hit7.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // плавный скролл страницы должен успокоиться
  let seatCount;
  if (desktop) {
    await hit7.click();
    seatCount = 8;
  } else {
    await hit7.tap();
    await page.waitForSelector('#table-card[open]', { timeout: 3000 }).catch(() => bad('тап по столу не открыл карточку'));
    const seatBtn = await page.evaluate(() => [...document.querySelectorAll('#table-card .cseat')].map((b) => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))));
    if (seatBtn.length !== 8 || seatBtn.some((w) => w < 44)) bad('в карточке стола нет 8 мест по 44px');
    await page.locator('#table-card [data-cs="2"]').tap();
    await page.locator('#table-card [data-cs="3"]').tap();
    await page.screenshot({ path: `${dir}/seats-card.png` });
    await page.locator('#table-card [data-cardclose]').tap();
    await page.waitForTimeout(300);
    seatCount = 2;
  }
  await page.waitForTimeout(400);
  const sum1 = (await panelText('[data-sum]')).trim();
  const expectSeats = desktop ? 'Стол 7: места 1, 2, 3, 4, 5, 6, 7, 8 — 120 000' : 'Стол 7: места 2, 3 — 30 000';
  if (digits(sum1) !== digits(expectSeats) || !sum1.startsWith(expectSeats.split(' — ')[0])) bad(`только места: итог «${sum1}», ожидалось «${expectSeats} ₽»`);
  if (sum1.includes('Детские')) bad('только места: в итоге появились детские билеты');
  const seatsMoney = seatCount * 15000;
  if (digits(await panelText('[data-total] b')) !== String(seatsMoney)) bad(`только места: сумма «${await panelText('[data-total] b')}», ожидалось ${seatsMoney}`);
  const panelBox = await page.locator('#seats-panel').boundingBox();
  if (!panelBox) bad('панель итога не видна');
  else if (!desktop) {
    const vh = page.viewportSize().height;
    if (panelBox.y + panelBox.height < vh - 2 || panelBox.y < vh * 0.4) bad('панель итога не закреплена снизу');
  }
  if (await page.locator('#seats-panel [data-kind]').count()) bad('остался переключатель «Взрослый / Ребёнок» у мест');

  // ---- 2. места + дети ----
  const kidsStep = page.locator('[data-kstep="1"]');
  await kidsStep.scrollIntoViewIfNeeded();
  await kidsStep.click();
  await page.locator('#kid-age-0').selectOption('6');
  await page.waitForTimeout(300);
  const sum2 = (await panelText('[data-sum]')).trim();
  if (!sum2.includes('Детские билеты: 1 (6 лет) — 7 000')) bad(`места + дети: итог «${sum2}»`);
  if (digits(await panelText('[data-total] b')) !== String(seatsMoney + 7000)) bad(`места + дети: сумма «${await panelText('[data-total] b')}», ожидалось ${seatsMoney + 7000}`);
  await page.locator('[data-kstep="1"]').click();
  await page.locator('#kid-age-1').selectOption('9');
  const sum2b = (await panelText('[data-sum]')).trim();
  if (!sum2b.includes('Детские билеты: 2 (6 и 9 лет) — 14 000')) bad(`два ребёнка: итог «${sum2b}»`);
  await page.locator('[data-kstep="-1"]').click();
  await page.waitForTimeout(200);
  await page.locator('#seats .kids').screenshot({ path: `${dir}/seats-kids.png` });
  // возвращаемся к заголовку блока: на десктопе форма брони стоит в первой строке своей секции, и панель прячется, когда форма видна
  await page.evaluate(() => document.querySelector('#seats-title').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  const toggle = page.locator('#seats-panel [data-toggle]');
  const setPanel = async (open) => {
    if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await (desktop ? toggle.click() : toggle.tap());
    await page.waitForTimeout(250);
  };
  await setPanel(true);
  await page.screenshot({ path: `${dir}/seats-selected.png` });

  // зум кнопками (панель свёрнута, кнопка по центру экрана: её не перекрывают шапка и панель)
  await setPanel(false);
  await page.evaluate(() => document.querySelector('[data-zoom="in"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  await page.locator('[data-zoom="in"]').click();
  if (!(await page.evaluate(() => document.querySelector('[data-map]').classList.contains('is-zoomed')))) bad('кнопка + не приблизила схему');
  await page.locator('[data-zoom="reset"]').click();

  // перенос в форму
  await page.locator('#seats-panel .btn').click();
  await page.waitForTimeout(1200);
  const f2 = await formState();
  if (!f2.choice || !f2.sel.includes('Стол 7')) bad('блок «Ваш выбор» не показал места');
  if (!f2.kidsLine.includes('Детские билеты: 1 (6 лет)')) bad(`блок «Ваш выбор» не показал детей: «${f2.kidsLine}»`);
  if (digits(f2.sum) !== String(seatsMoney + 7000)) bad(`в «Ваш выбор» итог «${f2.sum}»`);
  if (!f2.locked || !f2.tableHidden) bad('поля «Взрослые/Расположение стола» не подставлены автоматически');
  if (f2.adults !== String(seatCount) || f2.kids !== '1') bad(`в форму ушло взрослых ${f2.adults}, детей ${f2.kids}, ожидалось ${seatCount} и 1`);
  await page.locator('#booking-form').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('#booking').screenshot({ path: `${dir}/booking-with-choice.png` });

  // ---- 3. только дети (места сняты, билет остаётся) ----
  await page.evaluate(() => document.querySelector('#seats-title').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  await setPanel(true);
  const seatRows = () => page.locator('#seats-panel .prow[data-key] [data-del]');
  for (let guard = 0; guard < 12 && (await seatRows().count()) > 0; guard++) {
    await seatRows().first().click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  const emptyState = await page.evaluate(() => document.querySelector('#seats-panel').dataset.empty);
  if (emptyState !== 'false') bad('только дети: панель считает выбор пустым');
  if (digits(await panelText('[data-total] b')) !== '7000') bad(`только дети: сумма «${await panelText('[data-total] b')}», ожидалось 7 000`);
  const goBtn = page.locator('#seats-panel .btn');
  if (!(await goBtn.isVisible())) bad('только дети: кнопка «Забронировать» не видна');
  await goBtn.click();
  await page.waitForTimeout(1200);
  const f3 = await formState();
  if (!f3.choice || f3.sel !== '' && f3.sel !== null && f3.sel.trim() !== '') bad(`только дети: в «Ваш выбор» остались места «${f3.sel}»`);
  if (f3.adults !== '0' || f3.kids !== '1') bad(`только дети: взрослых ${f3.adults}, детей ${f3.kids}, ожидалось 0 и 1`);
  if (digits(f3.sum) !== '7000') bad(`только дети: итог «${f3.sum}»`);
  const hs = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (hs) bad('после выбора появился горизонтальный скролл');
}

await rm('qa', { recursive: true, force: true });
await mkdir('qa', { recursive: true });
await checkSource();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const killServer = () => { try { server.kill('SIGKILL'); } catch {} };
process.on('exit', killServer);
setTimeout(() => { console.error('Mobile QA: общий таймаут 290 с'); killServer(); process.exit(2); }, 290000).unref();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  // по четыре вьюпорта параллельно: весь прогон укладывается в 5 минут
  for (let i = 0; i < VPS.length; i += 4) await Promise.all(VPS.slice(i, i + 4).map((vp) => run(browser, vp)));
} finally {
  await browser?.close();
  killServer();
}

if (errors.length) {
  console.error(`Mobile QA: ${VPS.length} вьюпортов, ${errors.length} ошибок\n` + errors.map((e) => ` - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Mobile QA: ${VPS.length} вьюпортов, 0 ошибок`);
process.exit(0);
