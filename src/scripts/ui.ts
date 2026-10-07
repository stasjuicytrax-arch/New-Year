import { gsap } from './scroll';

/**
 * Рамка-«билет» (DESIGN-SYSTEM §7.6): SVG-контур со срезанными углами (верх-лево и низ-право),
 * точно по размеру блока, поэтому срез всегда ровно 14px. Контур можно «нарисовать» по линии.
 */
export interface TicketFrame {
  svg: SVGSVGElement;
  stroke: SVGPathElement;
  fill: SVGPathElement;
}

const NS = 'http://www.w3.org/2000/svg';

export function ticketFrame(el: HTMLElement, chamfer = 14): TicketFrame {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ticket__frame');
  svg.setAttribute('aria-hidden', 'true');
  const fill = document.createElementNS(NS, 'path');
  fill.setAttribute('class', 'ticket__fill');
  const stroke = document.createElementNS(NS, 'path');
  stroke.setAttribute('class', 'ticket__stroke');
  stroke.setAttribute('pathLength', '1');
  svg.append(fill, stroke);
  el.prepend(svg);

  const update = (): void => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const c = Math.min(chamfer, w / 3, h / 3);
    const d = `M${c} .5H${w - 0.5}V${h - c}L${w - c} ${h - 0.5}H.5V${c}Z`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    fill.setAttribute('d', d);
    stroke.setAttribute('d', d);
  };
  new ResizeObserver(update).observe(el);
  update();
  return { svg, stroke, fill };
}

/** Магнитная кнопка: тянется к курсору до `strength` px. Только fine pointer. */
export function magnetic(wrap: HTMLElement, strength = 8): void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const qx = gsap.quickTo(wrap, 'x', { duration: 0.5, ease: 'power3.out' });
  const qy = gsap.quickTo(wrap, 'y', { duration: 0.5, ease: 'power3.out' });
  window.addEventListener(
    'pointermove',
    (e) => {
      const r = wrap.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const reach = Math.max(r.width, r.height) * 0.9;
      if (Math.hypot(dx, dy) < reach) {
        qx(Math.max(-strength, Math.min(strength, dx * 0.12)));
        qy(Math.max(-strength, Math.min(strength, dy * 0.2)));
      } else {
        qx(0);
        qy(0);
      }
    },
    { passive: true },
  );
}
