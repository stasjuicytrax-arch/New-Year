import { djMarquee, event, menu, program, typo, type Chapter } from '../../content/content';
import { picture } from '../media';

/**
 * Десять глав «Что вас ждёт». Раскладка чередуется: full / right / left, на mobile фото на всю ширину, текст под ним.
 * Тексты строго из content.ts (docs/CONTENT.md). Анимации (маски, параллакс, счётчики) вешает reveal.ts по data-атрибутам.
 */

const FULL = '(min-width: 1024px) 1280px, 100vw';

const head = (c: Chapter, extra = ''): string => `
  <header class="ch__head">
    <p class="ch__no"><span class="ch__digits chrome" data-count="${Number(c.n)}" data-pad="2">${c.n}</span><span class="label label--dot">${program.chapterLabel} ${c.n}</span></p>
    <h3 class="ch__title" data-split>${typo(c.title)}</h3>
    <p class="ch__text" data-fade>${typo(c.text)}</p>
    ${extra}
  </header>`;

const word = (c: Chapter): string => {
  const w = c.word ?? '';
  return `<div class="ch__word" aria-hidden="true" style="--len:${w.length}"><span class="ch__word-in chrome" data-word="${w}">${w}</span></div>`;
};

const shell = (c: Chapter, mod: string, inner: string): string => `
  <article class="chapter ch ch--${mod}" id="${c.id}" data-chapter aria-labelledby="${c.id}-t">
    <div class="container">${inner}</div>
  </article>`;

const titled = (html: string, c: Chapter): string => html.replace('class="ch__title"', `id="${c.id}-t" class="ch__title"`);

const mask = (html: string, cls = ''): string => `<div class="ch__mask ${cls}" data-mask>${html}</div>`;

function ch01(c: Chapter): string {
  return shell(
    c,
    'full',
    `${titled(head(c), c)}
    <div class="ch__media">
      ${mask(picture({ name: 'ballet-violet', alt: 'Балет в роскошных костюмах', sizes: FULL, cls: 'ch__img' }), 'ch__mask--wide')}
    </div>
    <div class="ch__strip" aria-hidden="true">${picture({ name: 'ballet-feathers', alt: '', sizes: '100vw', cls: 'ch__img' })}</div>`,
  );
}

function ch02(c: Chapter): string {
  const cutout = picture({
    name: 'hosts-cutout',
    variants: [
      { w: 600, h: 900 },
      { w: 1024, h: 1536 },
    ],
    fallback: 'webp',
    alt: `${event.hosts.join(' и ')}, ведущие Главной новогодней ночи`,
    sizes: '(min-width: 1024px) 40vw, min(100vw, 500px)',
    cls: 'ch__img',
  });
  return shell(
    c,
    'split',
    `${titled(head(c), c)}
    <div class="ch__media ch__media--hosts"><div class="ch__halo" aria-hidden="true"></div><div class="ch__cutout" data-parallax="-4">${cutout}</div></div>`,
  );
}

function ch03(c: Chapter): string {
  return shell(
    c,
    'left',
    `${titled(head(c), c)}
    <div class="ch__media ch__media--duo">
      ${mask(picture({ name: 'ded-moroz', alt: 'Дважды лучший Дед Мороз России', sizes: '(min-width: 1024px) 24vw, 60vw', cls: 'ch__img ch__img--ded' }), 'ch__frame ch__frame--a')}
      ${mask(picture({ name: 'snegurochka', alt: 'Снегурочка на сцене', sizes: '(min-width: 1024px) 24vw, 60vw', cls: 'ch__img' }), 'ch__frame ch__frame--b')}
    </div>`,
  );
}

function word04(c: Chapter): string {
  return shell(c, 'word ch--illusion', `${word(c)}${titled(head(c), c)}<div class="ch__fx ch__fx--smoke" aria-hidden="true"></div>`);
}

/** Глава 05: «фотоплёнка» — лента поляроидов из фото страницы, едет по скроллу; на входе одна вспышка камеры. */
const FILM = [
  { name: 'ballet-violet', alt: 'Балет в роскошных костюмах', tilt: -2.2 },
  { name: 'hosts', alt: 'Александр Меркурьев и Стас Торопов', tilt: 1.8 },
  { name: 'ded-moroz', alt: 'Дед Мороз на сцене', tilt: -1.4 },
  { name: 'snegurochka', alt: 'Снегурочка на сцене', tilt: 2.4 },
  { name: 'dj-seven', alt: 'DJ Seven за пультом', tilt: -1.8 },
  { name: 'ballet-feathers', alt: 'Танцовщицы с перьями', tilt: 1.5 },
] as const;

function ch05(c: Chapter): string {
  const items = FILM.map(
    (f) => `<figure class="film__item" style="--tilt:${f.tilt}deg">${picture({ name: f.name, alt: f.alt, sizes: '(min-width: 1024px) 22vw, 64vw', cls: 'film__img' })}</figure>`,
  ).join('');
  return shell(
    c,
    'center ch--photo',
    `${titled(head(c), c)}
    <div class="film" data-film><div class="film__track">${items}</div></div>
    <div class="ch__flash" aria-hidden="true"></div>`,
  );
}

function ch06(c: Chapter): string {
  const sz = '(min-width: 1024px) 22vw, 52vw';
  return shell(
    c,
    'right ch--kids',
    `${titled(head(c, `<p class="ch__tag" data-fade><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/></svg>${typo(c.extra ?? '')}</p>`), c)}
    <div class="ch__media ch__media--fan" data-fan>
      <div class="ch__polaroid ch__polaroid--1">${picture({ name: 'kids-1', alt: 'Аниматор в костюме принцессы на детском празднике', sizes: sz, cls: 'ch__img' })}</div>
      <div class="ch__polaroid ch__polaroid--2">${picture({ name: 'kids-2', alt: 'Детская анимация с воздушными шарами', sizes: sz, cls: 'ch__img' })}</div>
      <div class="ch__polaroid ch__polaroid--3">${picture({ name: 'kids-3', alt: 'Аниматор пускает мыльные пузыри', sizes: sz, cls: 'ch__img' })}</div>
    </div>`,
  );
}

function ch07(c: Chapter): string {
  return shell(
    c,
    'center ch--bokeh',
    `<div class="ch__bokeh" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>${titled(head(c), c)}`,
  );
}

function ch08(c: Chapter): string {
  const marquee = Array.from({ length: 4 }, () => `<span>${djMarquee}</span>`).join('');
  return shell(
    c,
    'left ch--dj',
    `${titled(head(c, `<p class="ch__dj chrome" data-fade>${c.extra ?? ''}</p>`), c)}
    <div class="ch__media ch__media--dj">
      <div class="ch__neon" aria-hidden="true"><i></i><i></i><i></i></div>
      ${mask(picture({ name: 'dj-seven', alt: 'DJ Seven за пультом', sizes: '(min-width: 1024px) 36vw, min(100vw, 450px)', cls: 'ch__img' }), 'ch__square')}
      <div class="ch__eq" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    </div>
    <div class="ch__marquee" aria-hidden="true"><div class="ch__marquee-track">${marquee}${marquee}</div></div>`,
  );
}

function word09(c: Chapter): string {
  return shell(
    c,
    'word ch--fx',
    `<div class="ch__rays" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>${word(c)}${titled(head(c), c)}`,
  );
}

function ch10(c: Chapter): string {
  const items = menu.items
    .map((it, i) => {
      const n = String(i + 1).padStart(2, '0');
      const body = it.choice
        ? `<div class="menu__fork">
            <div class="menu__opt"><b>${it.choice[0].name}</b><span>${typo(it.choice[0].text)}</span></div>
            <span class="menu__or">${menu.or}</span>
            <div class="menu__opt"><b>${it.choice[1].name}</b><span>${typo(it.choice[1].text)}</span></div>
          </div>
          <p class="menu__note"><a href="#booking">${it.note ?? menu.choiceAt}</a></p>`
        : `<p class="menu__desc">${typo(it.text)}</p>`;
      return `<li class="menu__item"><span class="menu__n">${n}</span><div><h4 class="menu__name">${it.name}</h4>${body}</div></li>`;
    })
    .join('');
  const totals = menu.totals
    .map(
      (t) => `<p class="menu__total"><span class="menu__big chrome" data-count="${t.value}" data-dec="1" data-unit=" ${t.unit}">${String(t.value).replace('.', ',')} ${t.unit}</span><span class="label">${t.label}</span></p>`,
    )
    .join('');
  return shell(
    c,
    'menu',
    `${titled(head(c, `<p class="ch__ribbon" data-fade>${c.extra ?? ''}</p>`), c)}
    <div class="menu" data-menu>
      <div class="menu__card glass">
        <ol class="menu__list" data-cascade>${items}</ol>
        <button class="menu__more" type="button" aria-expanded="false" data-more>${menu.more}</button>
      </div>
      <div class="menu__totals"><p class="label">${menu.perGuest}</p>${totals}</div>
    </div>`,
  );
}

const builders: Record<string, (c: Chapter) => string> = {
  'ch-01': ch01,
  'ch-02': ch02,
  'ch-03': ch03,
  'ch-04': word04,
  'ch-05': ch05,
  'ch-06': ch06,
  'ch-07': ch07,
  'ch-08': ch08,
  'ch-09': word09,
  'ch-10': ch10,
};

export function renderChapters(): string {
  return program.chapters.map((c) => builders[c.id](c)).join('');
}
