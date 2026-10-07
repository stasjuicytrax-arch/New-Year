import { bookingBlock, event, footer, intro, manifest, nav, phones, program, typo, why } from '../../content/content';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

/** Каркас секций: заголовки и якоря из content.ts. Вёрстка секций наполняется в шагах 5-8 плана. */
export function renderSkeleton(): void {
  const [phone] = phones;
  $('#site-header').innerHTML = `
    <a class="site-header__brand" href="#hero">${nav.brand}</a>
    <div class="site-header__actions">
      <a class="site-header__phone" href="${phone.href}" data-goal="${phone.goal}" aria-label="${nav.callAria} ${phone.label}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>
        <span class="site-header__phone-text">${phone.label}</span>
      </a>
      <a class="site-header__cta" href="#booking" data-goal="book_click">${nav.cta}</a>
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
      <p><a href="${import.meta.env.BASE_URL}privacy.html">${footer.privacy}</a> · ${footer.copyright}</p>
    </div>`;
}
