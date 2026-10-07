# CLAUDE.md — «Главная новогодняя ночь 2027»

Одностраничный промо-сайт новогоднего вечера в Перми (WHITE HALL, 31.12, сбор 21:00). Домен: **ngperm.ru**. Цель — заявки на бронирование столов.

## Прочитать перед любой работой
1. `docs/TZ.md` — техническое задание (структура, блоки, анимации, стек, план, приёмка).
2. `docs/DESIGN-SYSTEM.md` — токены, типографика, сетка, ритм, приёмы, анти-шаблоны.
3. `docs/CONTENT.md` — все тексты и факты. Тексты не выдумывать, брать только отсюда.

## Обязательные скиллы
- **Impeccable** (`/impeccable …`): `init` на старте; `typeset`, `layout`, `colorize`, `animate` по ходу; `critique` после каждой секции; `audit` + `polish` перед каждым пушем этапа.
- **Taste Skill**: `design-taste-frontend` (всегда), `high-end-visual-design` (hero и главы), `full-output-enforcement` (всегда, без заглушек).
- Если `/skills` их не показывает, см. TZ §1.1.

## Git
- Репозиторий: https://github.com/stasjuicytrax-arch/New-Year.git, ветка `main`.
- **Коммит и `git push` после каждого пункта плана (TZ §8)**: клиент следит за процессом.
- Сообщения коммитов: Conventional Commits на английском + скиллы в скобках, например `feat(hero): chrome title reveal [impeccable animate]`.

## Просмотр сайта по ссылке (GitHub Pages)
- Pages включён, автодеплой `.github/workflows/deploy.yml` уже в репозитории: каждый пуш в `main` → https://stasjuicytrax-arch.github.io/New-Year/
- `base` для Vite подставляется в CI автоматически (`--base` из настроек Pages). В `vite.config.ts` base не хардкодить; ссылки на ассеты только через импорт или `import.meta.env.BASE_URL`.
- Домен ngperm.ru подключаем в конце (TZ §8, шаг 10): `public/CNAME`, DNS у регистратора.
- Перед пушем всегда `git pull --rebase --autostash` (в репозиторий иногда коммитят с сайта GitHub).

## Жёсткие правила
- Исходники в корне (кириллические папки, `Referens/`, `BIO.docx`, афиша) не изменять и не удалять. Оптимизированные копии кладём в `src/assets/`.
- Файл `Техническое задания для Claude.md` устарел (шаблон другого проекта), игнорировать.
- Display-шрифт только прописными, без курсива. Эмодзи на сайте не используем.
- «НОВОГОДНЯЯ» (на афише опечатка «НОВОГОДНЯ»).
- Mobile-first; `prefers-reduced-motion` обязателен.
- Все места с ⚠ в CONTENT.md — плейсхолдеры через `content.ts`, легко заменяемые; в UI не показывать «Lorem» и «TBD».
