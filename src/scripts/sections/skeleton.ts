import { event, footer, hero as heroContent, intro, manifest, marquee, nav, phones, program, typo, why } from '../../content/content';
import { renderBooking } from './booking';
import { renderChapters } from './chapters';
import { renderHall } from './hall';
import { renderSeating } from './seating';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

/** Разметка всей страницы кроме hero: шапка, полоса отсчёта, интро, главы, «почему», манифест, бронь, футер. */
export function renderSkeleton(): void {
  const [phone] = phones;
  const [dateT, timeT] = heroContent.tickets;

  $('#site-header').innerHTML = `
    <a class="site-header__brand" href="#hero">${nav.brand}</a>
    <div class="site-header__actions">
      <a class="site-header__phone" href="${phone.href}" data-goal="${phone.goal}" aria-label="${nav.callAria} ${phone.label}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>
        <span class="site-header__phone-text">${phone.label}</span>
      </a>
      <a class="btn btn--secondary btn--sm site-header__cta" href="#seats" data-goal="book_click"><span>${nav.cta}</span></a>
    </div>`;

  const run = `<div class="marquee__track">${Array.from({ length: 8 }, () => `<span class="chrome">${marquee}</span>`).join('')}</div>`;
  $('#marquee-a').innerHTML = run;
  $('#marquee-b').innerHTML = run;

  $('#intro').innerHTML = `
    <div class="container intro">
      <p class="lead intro__lead" data-words>${typo(intro.lead)}</p>
      <div class="intro__cta" data-fade>
        <span class="btn-wrap"><a class="btn btn--secondary" href="#seats" data-goal="book_click"><span>${intro.cta}</span></a></span>
      </div>
    </div>`;

  $('#program').innerHTML = `
    <div class="container program__head sec-head">
      <h2 id="program-title" class="chrome" data-split>${program.title}</h2>
      <p class="program__lead" data-fade>${program.lead}</p>
    </div>
    ${renderChapters()}`;

  $('#why').innerHTML = `
    <div class="container why__grid">
      <div class="why__main">
        <h2 id="why-title" class="chrome" data-split>${typo(why.title)}</h2>
        <ol class="why__list" data-cascade>
          ${why.items.map((t, i) => `<li class="why__item"><span class="why__n">${String(i + 1).padStart(2, '0')}</span><span class="why__t">${typo(t)}</span></li>`).join('')}
        </ol>
      </div>
      <aside class="why__ticket glass" aria-label="Дата и бронь">
        <p class="why__date chrome">${dateT.value}</p>
        <p class="label">${timeT.label} ${timeT.value}</p>
        <span class="btn-wrap"><a class="btn btn--primary" href="#seats" data-goal="book_click"><span>${heroContent.cta}</span></a></span>
      </aside>
    </div>`;

  const hl = manifest.highlights.reduce((html, w) => html.replace(w, `<span class="hl">${w}</span>`), typo(manifest.text));
  $('#manifest').innerHTML = `
    <div class="container manifest__in">
      <span class="manifest__year chrome" aria-hidden="true">2027</span>
      <h2 id="manifest-title" class="chrome" data-split>${manifest.title}</h2>
      <p class="manifest__text">${hl}</p>
    </div>`;

  $('#hall').innerHTML = renderHall();
  $('#seats').innerHTML = renderSeating();
  $('#booking').innerHTML = renderBooking();

  $('#site-footer').innerHTML = `
    <div class="container footer__scene">
      <p class="footer__farewell chrome">${footer.farewell}</p>
      <p class="footer__slogan">${footer.slogan}</p>
      <div class="footer__cols">
        <div class="footer__col">
          <p class="label label--dot">${footer.colAddress}</p>
          <h3 class="footer__big">${event.venue}</h3>
          <p class="footer__text">Пермь, ${event.address}</p>
          <a class="footer__link" href="${event.mapUrl}" target="_blank" rel="noopener">${footer.route}</a>
        </div>
        <div class="footer__col footer__col--phones">
          <p class="label label--dot">${footer.colPhones}</p>
          ${phones.map((p) => `<a class="footer__phone" href="${p.href}" data-goal="${p.goal}">${p.label}</a>`).join('')}
        </div>
        <div class="footer__col">
          <p class="label label--dot">${footer.colBooking}</p>
          <span class="btn-wrap"><a class="btn btn--primary" href="#seats" data-goal="book_click"><span>${heroContent.cta}</span></a></span>
        </div>
      </div>
      <hr class="footer__rule">
      <p class="footer__legal"><a href="${import.meta.env.BASE_URL}privacy.html">${footer.privacy}</a><span aria-hidden="true"> · </span>${footer.copyright}</p>
    </div>`;
}
