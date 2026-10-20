// 글 본문의 짜임 — 표와 줄 맞춤.
//
// 본문은 그냥 글자로 담는다(HTML 을 담지 않는다). 대신 몇 가지 표식을 두고
// 보여 줄 때 이 모듈이 읽어 토막으로 나눈다. 운영 툴과 앱이 같은 규칙을 쓴다.
//
//   [가운데] 이 줄은 가운데로
//   [오른쪽] 이 줄은 오른쪽으로
//   | 항목 | 내용 |      ← 표
//   | --- | --- |        ← 이 줄이 있으면 윗줄이 머리글
//   | 기간 | 10월 한 달 |

export type Align = 'left' | 'center' | 'right';

export const ALIGN_MARK: Record<Exclude<Align, 'left'>, string> = {
  center: '[가운데]',
  right: '[오른쪽]',
};

/** 표 집어넣기를 누르면 본문에 끼워 넣는 뼈대 */
export const TABLE_SNIPPET = '| 항목 | 내용 |\n| --- | --- |\n| 기간 | 10월 한 달 |';

export interface TextBlock {
  kind: 'text';
  align: Align;
  lines: string[];
}
export interface TableBlock {
  kind: 'table';
  head: string[];
  rows: string[][];
}
export type BodyBlock = TextBlock | TableBlock;

const alignOf = (line: string): { align: Align; text: string } => {
  for (const [key, mark] of Object.entries(ALIGN_MARK)) {
    if (line.startsWith(mark)) return { align: key as Align, text: line.slice(mark.length).trimStart() };
  }
  return { align: 'left', text: line };
};

const isTableLine = (line: string) => line.trim().startsWith('|');
const isRuleLine = (line: string) => /^\|[\s:\-|]+\|?$/.test(line.trim()) && line.includes('-');

const cellsOf = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** 줄 하나에 맞춤 표식을 새로 붙인다 (왼쪽이면 떼기만 한다) */
export const markLine = (line: string, align: Align): string => {
  const bare = alignOf(line).text;
  if (align === 'left') return bare;
  return bare ? `${ALIGN_MARK[align]} ${bare}` : ALIGN_MARK[align];
};

/** 본문 글자를 보여 줄 토막으로 나눈다 */
export const parseBody = (body?: string): BodyBlock[] => {
  const src = (body ?? '').replace(/\r\n/g, '\n');
  if (!src.trim()) return [];
  const out: BodyBlock[] = [];
  const lines = src.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      const grid: string[][] = [];
      let head: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (isRuleLine(lines[i])) {
          // 바로 윗줄이 머리글이었다
          head = grid.pop() ?? [];
        } else {
          grid.push(cellsOf(lines[i]));
        }
        i += 1;
      }
      out.push({ kind: 'table', head, rows: grid });
      continue;
    }

    const { align, text } = alignOf(lines[i]);
    const last = out[out.length - 1];
    if (last && last.kind === 'text' && last.align === align) last.lines.push(text);
    else out.push({ kind: 'text', align, lines: [text] });
    i += 1;
  }

  return out;
};
