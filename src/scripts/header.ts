/**
 * Шапка получает тёмную полупрозрачную подложку с blur после ухода с hero,
 * чтобы не налезать на текст секций. Над hero шапка прозрачная и лежит на сцене.
 * Без слушателя scroll: IntersectionObserver по #hero (с учётом высоты шапки).
 */
export function initHeader(): void {
  const header = document.querySelector<HTMLElement>('#site-header');
  const hero = document.querySelector<HTMLElement>('#hero');
  if (!header || !hero) return;

  const io = new IntersectionObserver(
    ([entry]) => header.classList.toggle('is-solid', !entry.isIntersecting),
    { threshold: 0, rootMargin: '-64px 0px 0px 0px' },
  );
  io.observe(hero);
}
