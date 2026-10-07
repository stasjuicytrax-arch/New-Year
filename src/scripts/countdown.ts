import { event } from '../content/content';

/**
 * Обратный отсчёт до полуночи по Перми (DESIGN-SYSTEM §7.12).
 * Цель задана абсолютным моментом с оффсетом +05:00, поэтому часовой пояс зрителя не влияет на результат.
 */
export type CountdownVariant = 'compact' | 'full' | 'mini' | 'poster';

const TARGET = new Date(event.midnightISO).getTime();

const pad = (n: number): string => String(n).padStart(2, '0');

interface Parts {
  d: number;
  h: number;
  m: number;
  s: number;
  done: boolean;
}

export function remaining(now = Date.now()): Parts {
  const diff = Math.max(0, TARGET - now);
  const total = Math.floor(diff / 1000);
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    done: diff === 0,
  };
}

const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const UNITS: ReadonlyArray<{ key: keyof Omit<Parts, 'done'>; cap: string }> = [
  { key: 'd', cap: 'дн' },
  { key: 'h', cap: 'час' },
  { key: 'm', cap: 'мин' },
  { key: 's', cap: 'сек' },
];

export function mountCountdown(root: HTMLElement, label: string, variant: CountdownVariant = 'compact'): () => void {
  root.classList.add('countdown', `countdown--${variant}`);
  root.setAttribute('role', 'timer');
  root.innerHTML = `
    <p class="label countdown__label">${label}</p>
    <div class="countdown__board" aria-hidden="true">
      ${UNITS.map(
        (u, i) => `${i ? '<span class="countdown__sep">:</span>' : ''}
        <span class="countdown__unit"><span class="countdown__num" data-u="${u.key}">00</span><span class="countdown__cap">${u.cap}</span></span>`,
      ).join('')}
    </div>
    <span class="visually-hidden" data-sr></span>`;

  const nums = Object.fromEntries(
    UNITS.map((u) => [u.key, root.querySelector<HTMLElement>(`[data-u="${u.key}"]`)!]),
  ) as Record<string, HTMLElement>;
  const sr = root.querySelector<HTMLElement>('[data-sr]')!;
  let lastMinute = -1;
  let timer = 0;

  const render = (): void => {
    const p = remaining();
    nums.d.textContent = pad(p.d);
    nums.h.textContent = pad(p.h);
    nums.m.textContent = pad(p.m);
    nums.s.textContent = pad(p.s);
    root.classList.toggle('is-done', p.done);
    // Для скринридера обновляем раз в минуту, чтобы не болтать каждую секунду
    const minute = p.d * 1440 + p.h * 60 + p.m;
    if (minute !== lastMinute) {
      lastMinute = minute;
      sr.textContent = p.done
        ? 'Новый 2027 год наступил'
        : `${label} ${p.d} ${plural(p.d, 'день', 'дня', 'дней')} ${p.h} ${plural(p.h, 'час', 'часа', 'часов')} ${p.m} ${plural(p.m, 'минута', 'минуты', 'минут')}`;
    }
  };

  // Тик ровно на границе секунды, без накопления дрейфа
  const schedule = (): void => {
    window.clearTimeout(timer);
    if (document.hidden) return;
    render();
    timer = window.setTimeout(schedule, 1000 - (Date.now() % 1000) + 4);
  };
  const onVisibility = (): void => schedule();
  document.addEventListener('visibilitychange', onVisibility);
  schedule();

  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
