// FAQ · 약관 '간단 표기' ↔ HTML — 운영 › FAQ 관리 · 약관 관리가 쓴다(contentRepository). 다른 모듈을 부르지 않는다(시험하기 쉽게).
// === 간단 표기 ===
// # 제목 → 큰 제목, ## 소제목 → 작은 제목, - 항목 → 점 목록, 1. 항목 → 번호 목록, **굵게** → 굵게,
// < 로 시작하는 줄은 HTML 그대로(표 · 연락처 상자), 그 밖의 줄은 문단. 빈 줄은 문단 사이.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export const markupToHtml = (markup: string): string => {
  const out: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${x}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of markup.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const ul = /^[-•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(inline((ul ?? ol)![1]));
      continue;
    }
    flush();
    if (line.startsWith('<')) out.push(line);
    else if (line.startsWith('## ')) out.push(`<h4>${inline(line.slice(3))}</h4>`);
    else if (line.startsWith('# ')) out.push(`<h3>${inline(line.slice(2))}</h3>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
};
/** 굵게만 쓰는 짧은 글(FAQ 답) — **굵게** ↔ <b> */
export const boldToHtml = (s: string) => inline(s.trim()).replace(/\n/g, '<br>');
export const htmlToBold = (s: string) => s.replace(/<br\s*\/?>/g, '\n').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** 코드 글(HTML)을 간단 표기로 — 운영 화면이 처음 불러올 때(브라우저의 DOMParser 로 맨 윗 칸만 본다).
 *  표 · 겹친 목록처럼 간단 표기로 못 적는 칸은 HTML 한 줄로 그대로 둔다 */
export const htmlToMarkup = (html: string): string => {
  const body = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild!;
  const txt = (el: Element) => htmlToBold(el.innerHTML).replace(/\s*\n\s*/g, ' ').trim();
  const simple = (el: Element) => !el.querySelector('ul, ol, table, div, dl, a, h3, h4');
  const lines: string[] = [];
  for (const el of Array.from(body.children)) {
    const t = el.tagName;
    if (t === 'H3') lines.push('', `# ${txt(el)}`);
    else if (t === 'H4') lines.push(`## ${txt(el)}`);
    else if (t === 'P' && simple(el) && !el.className) lines.push(txt(el));
    else if ((t === 'UL' || t === 'OL') && Array.from(el.children).every(simple)) {
      Array.from(el.children).forEach((li, i) => lines.push(`${t === 'OL' ? `${i + 1}.` : '-'} ${txt(li)}`));
    } else lines.push(el.outerHTML.replace(/\n\s*/g, ' '));
  }
  return lines.join('\n').replace(/^\n+/, '');
};

