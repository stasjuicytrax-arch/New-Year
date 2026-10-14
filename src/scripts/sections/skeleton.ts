import { event, footer, telegramChannel, hero as heroContent, intro, manifest, marquee, nav, phones, program, typo, why } from '../../content/content';
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
const ICON_VK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12.77 17.5h.9s.27-.03.41-.18c.13-.14.12-.4.12-.4s-.02-1.23.54-1.41c.56-.18 1.27 1.19 2.03 1.72.57.4 1.01.31 1.01.31l2.03-.03s1.06-.07.56-.91c-.04-.07-.29-.62-1.5-1.75-1.27-1.18-1.1-.99.43-3.03.93-1.24 1.3-2 1.19-2.32-.11-.31-.8-.23-.8-.23l-2.28.01s-.17-.02-.29.05c-.12.07-.2.24-.2.24s-.36.96-.84 1.77c-1.02 1.72-1.43 1.81-1.6 1.7-.39-.25-.29-1.01-.29-1.55 0-1.68.26-2.38-.5-2.56-.25-.06-.44-.1-1.08-.11-.83-.01-1.53 0-1.93.2-.26.13-.47.42-.35.43.16.02.52.1.71.36.25.34.24 1.1.24 1.1s.14 2.1-.33 2.36c-.33.18-.77-.19-1.73-1.84-.49-.85-.86-1.79-.86-1.79s-.07-.17-.2-.27c-.15-.11-.37-.15-.37-.15l-2.17.01s-.33.01-.45.15c-.1.13-.01.4-.01.4s1.7 4.03 3.62 6.05c1.76 1.85 3.76 1.73 3.76 1.73z"/></svg>';
const ICON_TG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.3 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L23 5.8c.3-1.3-.5-1.9-1.5-1.5zM9 14.2l9.8-6.2c.5-.3.9-.1.5.2l-8.1 7.3-.3 3.6z"/></svg>';

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
  document.body.insertAdjacentHTML('beforeend', renderBooking());

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
          ${phones
            .map(
              (p) =>
                `<div class="footer__contact"><a class="footer__phone" href="${p.href}" data-goal="${p.goal}">${p.name} · ${p.label}</a><a class="footer__soc" href="${p.vk}" target="_blank" rel="noopener noreferrer" aria-label="ВКонтакте: ${p.name}" data-goal="vk_${p.goal}">${ICON_VK}</a></div>`,
            )
            .join('')}
          ${telegramChannel ? `<div class="footer__contact"><a class="footer__soc" href="${telegramChannel}" target="_blank" rel="noopener noreferrer" aria-label="Telegram-канал" data-goal="tg_channel">${ICON_TG}</a></div>` : ''}
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
