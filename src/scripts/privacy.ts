import '../styles/base.css';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/sections/layout.css';
import '../styles/sections/privacy.css';
import policy from '../../docs/privacy-policy.md?raw';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Минимальный markdown: # / ## заголовки, абзацы, списки «- ». Метки ⚠ [...] выводятся как есть. */
function render(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = (): void => {
    if (list.length) out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushPara = (): void => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    if (line.startsWith('## ')) { flushList(); flushPara(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { flushList(); flushPara(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('- ')) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushList();
  flushPara();
  return out.join('\n');
}

const root = document.querySelector<HTMLElement>('#policy');
if (root) {
  const back = `<p class="policy__back"><a href="${import.meta.env.BASE_URL}">Вернуться на главную</a></p>`;
  root.innerHTML = `${back}${render(policy)}${back}`;
}
