import { bookingBlock, event, footer, hero, intro, manifest, nav, phones, program, typo, why } from '../../content/content';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

/** Каркас секций: заголовки и якоря из content.ts. Вёрстка секций наполняется в шагах 5-8 плана. */
export function renderSkeleton(): void {
  $('#site-header').innerHTML = `
    <a class="site-header__brand" href="#hero">${nav.brand}</a>
    <a class="site-header__cta" href="#booking">${nav.cta}</a>`;

  $('#hero').innerHTML = `
    <div class="container">
      <p class="label">${hero.label}</p>
      <h1 id="hero-title">${hero.titleLines.map((l) => `<span class="hero__line">${l}</span>`).join('')}</h1>
      <p>${typo(hero.subtitle)}</p>
    </div>`;

  $('#intro').innerHTML = `
    <div class="container">
      <p class="lead">${typo(intro.lead)}</p>
      <p>${typo(intro.note)}</p>
    </div>`;

  $('#program').innerHTML = `
    <div class="container"><h2 id="program-title" class="chrome">${program.title}</h2></div>
    ${program.chapters
      .map(
        (c) => `
    <article class="chapter" id="${c.id}">
      <div class="container">
        <p class="label">${program.chapterLabel} ${c.n}</p>
        <h3>${typo(c.title)}</h3>
        <p>${typo(c.text)}</p>
      </div>
    </article>`,
      )
      .join('')}`;

  $('#why').innerHTML = `
    <div class="container">
      <h2 id="why-title" class="chrome">${typo(why.title)}</h2>
      <ol class="why__list">${why.items.map((t) => `<li>${typo(t)}</li>`).join('')}</ol>
    </div>`;

  $('#manifest').innerHTML = `
    <div class="container">
      <h2 id="manifest-title" class="chrome">${manifest.title}</h2>
      <p>${typo(manifest.text)}</p>
    </div>`;

  $('#booking').innerHTML = `
    <div class="container">
      <h2 id="booking-title" class="chrome">${typo(bookingBlock.title)}</h2>
      <p>${typo(bookingBlock.text)}</p>
      <p>${bookingBlock.callLine} ${phones.map((p) => `<a href="${p.href}">${p.label}</a>`).join(' · ')}</p>
    </div>`;

  $('#site-footer').innerHTML = `
    <div class="container">
      <p class="site-footer__title chrome">${footer.headline}</p>
      <p>${footer.slogan}</p>
      <p><a href="${event.mapUrl}" target="_blank" rel="noopener">${footer.venueLine}</a></p>
      <p>${phones.map((p) => `<a href="${p.href}">${p.label}</a>`).join(' · ')}</p>
      <p><a href="/privacy.html">${footer.privacy}</a> · ${footer.copyright}</p>
    </div>`;
}
