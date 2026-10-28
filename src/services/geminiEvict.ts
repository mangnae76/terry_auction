// AI 명도 — 명도분석 '계산에 쓴 값'을 그 물건에 맞게 고쳐 달라고 Gemini 에게 묻는다.
// 금액 계산은 하지 않는다(계산은 postWinMoney 의 정해진 식). AI 는 값만 고치고, 고친 값마다 까닭을 낸다.
//
// 키는 사용자 각자의 것(BYOK) — geminiPdf · geminiRights 와 같은 키.
// AI 는 그럴듯하게 지어낸다. 그래서
//  1) 넘겨준 사실(권리분석 AI 결과 · 물건 정보)에 근거가 있는 칸만 고치게 하고
//  2) 근거가 없는 칸은 손대지 말라고 하며
//  3) 고친 칸마다 근거(reason)를 한 줄로 적게 한다.
import { GEMINI_API, GEMINI_MODEL, GeminiError } from './geminiPdf';
import { RIGHTS_MODEL } from './geminiRights';
import type { EvictInput } from './postWinMoney';

/** AI 가 고칠 수 있는 칸 — 물건마다 달라지는 것만(일당 · 예납 같은 시세는 그대로) */
export const AI_EVICT_FIELDS: Array<[keyof EvictInput, string]> = [
  ['dealMonths', '협의 때 걸리는 달(잔금 뒤 명도까지, 개월)'],
  ['execMonths', '강제집행 때 걸리는 달(잔금 뒤 명도까지, 개월)'],
  ['movePerPyeong', '협의 이사비 평당(원)'],
  ['serveExtra', '특별 · 공시송달 비용(원) — 연락두절 · 폐문부재면 늘린다'],
  ['truck', '운반 트럭(원) — 짐이 적으면 1톤 15만, 많으면 5톤 50만'],
  ['ladder', '사다리차(원) — 저층 · 엘리베이터면 0'],
  ['locksmith', '열쇠공(원) — 공실 · 비번을 알면 0'],
  ['storageMonths', '짐 보관 달(개월) — 짐이 없으면 0'],
];

export type EvictAiChange = { field: keyof EvictInput; value: number; reason: string };
export type EvictAi = { summary: string; changes: EvictAiChange[] };

const PROMPT = [
  '너는 한국 부동산 경매의 명도(점유자 내보내기) 실무자다.',
  '아래 [물건 사실]만 보고, [지금 값] 가운데 이 물건에 맞지 않는 칸을 고쳐라.',
  '규칙',
  '- [물건 사실]에 근거가 있는 칸만 고친다. 근거가 없으면 그 칸은 changes 에 넣지 않는다(지금 값을 그대로 둔다).',
  '- 금액은 원 단위 정수, 기간은 개월 정수다. 합계나 총비용을 계산하지 마라.',
  '- reason 은 한 줄, 어떤 사실 때문에 그 값인지 적는다(예: "임차인이 배당을 받아 협조 가능성이 높음").',
  '- summary 는 이 물건의 명도를 한두 문장으로 정리한다.',
  '- 서류에 없는 사람 · 날짜 · 금액을 지어내지 마라.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: AI_EVICT_FIELDS.map(([k]) => k) },
          value: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['field', 'value', 'reason'],
      },
    },
  },
  required: ['summary', 'changes'],
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const askEvictAi = async (key: string, facts: string, current: EvictInput, signal?: AbortSignal): Promise<EvictAi> => {
  if (!key) throw new GeminiError('AI 키가 없습니다 — 마이페이지 › AI 자동 분석에서 등록해 주세요');
  const now = AI_EVICT_FIELDS.map(([k, label]) => `- ${k} (${label}): ${current[k]}`).join('\n');
  const text = `${PROMPT}\n\n[물건 사실]\n${facts}\n\n[지금 값]\n${now}`;
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { temperature: 0, topK: 1, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  // eslint-disable-next-line no-console
  console.log('%c[AI 명도] 보내는 글', 'color:#2563eb;font-weight:700', text);

  type Body = { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  let res: Response | null = null;
  let body: Body = {};
  let model = RIGHTS_MODEL;
  // 혼잡(503) · 잠깐 한도(429)는 잠시 뒤 다시 — 두 번까지, 모델 이름을 못 알아들으면(404) 작은 모델로
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new GeminiError('취소했습니다');
    try {
      res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: payload, signal,
      });
      body = await res.json().catch(() => ({})) as Body;
    } catch (err) {
      if (signal?.aborted) throw new GeminiError('취소했습니다');
      throw new GeminiError(`AI 서버에 닿지 못했습니다 — 인터넷 연결을 확인해 주세요 (${err instanceof Error ? err.message : ''})`);
    }
    if (res.status === 404 && model !== GEMINI_MODEL) { model = GEMINI_MODEL; continue; }
    if (res.status !== 503 && res.status !== 429) break;
    if (attempt < 2) await wait(attempt === 0 ? 3000 : 8000);
  }
  if (!res || !res.ok) {
    const st = res?.status ?? 0;
    const why = st === 403 || st === 401 ? '키를 확인해 주세요' : st === 429 ? '사용 한도에 걸렸습니다'
      : st === 503 ? 'Gemini 서버가 붐빕니다. 잠시 뒤 다시 해 주세요' : body.error?.message || `오류 ${st}`;
    throw new GeminiError(`AI 명도 실패 — ${why}`);
  }
  const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let raw: Partial<EvictAi>;
  try { raw = JSON.parse(out) as Partial<EvictAi>; } catch { throw new GeminiError('AI 명도 실패 — 답을 읽지 못했습니다'); }
  // eslint-disable-next-line no-console
  console.log('%c[AI 명도] 받은 답', 'color:#16a34a;font-weight:700', raw);
  return normalizeEvictAi(raw);
};

/** 받은 답을 믿고 쓸 꼴로 — 모르는 칸 · 음수 · 숫자 아님은 버린다 */
export const normalizeEvictAi = (raw: Partial<EvictAi>): EvictAi => {
  const ok = new Set(AI_EVICT_FIELDS.map(([k]) => k));
  const changes = (Array.isArray(raw.changes) ? raw.changes : [])
    .filter((c) => c && ok.has(c.field) && Number.isFinite(Number(c.value)) && Number(c.value) >= 0)
    .map((c) => ({ field: c.field, value: Math.round(Number(c.value)), reason: String(c.reason ?? '').trim() }));
  return { summary: String(raw.summary ?? '').trim(), changes };
};
