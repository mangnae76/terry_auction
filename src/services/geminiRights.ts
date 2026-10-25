// AI 권리분석 — 권리분석 탭의 'AI 분석 요청' 칸에 올린 서류를 Gemini 에게 보내
// 말소기준권리·인수/말소 권리·명도 난이도·결론을 받아 온다.
//
// 키는 사용자 각자의 것이다(BYOK) — geminiPdf 와 같은 키를 쓴다.
// 앱이 Google 로 바로 보내고, 요금은 그 사용자의 Google 계정으로 나간다.
//
// AI 는 서류에 없는 것을 그럴듯하게 지어낸다. 그래서
//  1) 값마다 '어느 서류의 어느 글에서 봤는지'(evidence)를 같이 내게 하고
//  2) 못 찾은 칸은 비워 두게 하며(빈칸을 메우라고 시키지 않는다)
//  3) 어떤 서류가 없어서 판단이 모자랐는지(missingDocs)를 따로 적게 한다.
import { GEMINI_API, GEMINI_MODEL, GeminiError } from './geminiPdf';

/** 명도 난이도 — 이 넷 가운데 하나 */
export const EVICT_LEVELS = ['쉬움', '보통', '약간 높음', '높음'] as const;
/** 결론 — 이 셋 가운데 하나 */
export const RIGHTS_VERDICTS = ['입찰 추천', '주의', '비추천'] as const;

export type RightsAiRight = {
  kind: string;
  date: string;
  holder: string;
  /** 인수면 '왜 떠안는지', 말소면 비워 둔다 */
  reason?: string;
};

export type RightsAi = {
  /** 말소기준권리 — 어떤 권리가, 언제, 누구 것으로 기준이 되었나 */
  baseRight: { kind: string; date: string; holder: string; rank: string; evidence: string };
  /** 낙찰자가 떠안는 권리 */
  takeover: { count: number; items: RightsAiRight[]; summary: string };
  /** 낙찰되면 없어지는 권리 */
  extinguish: { count: number; items: RightsAiRight[] };
  /** 서류·현황에서 걸리는 것들 */
  risk: { summary: string; items: string[] };
  /** 명도 난이도 */
  evict: { level: string; reason: string; strategy: string; advice: string };
  /** 한 줄 결론 */
  conclusion: { verdict: string; text: string };
  /** 없어서 판단이 모자랐던 서류 — 화면에 '이것까지 올리면 더 정확해집니다' 로 쓴다 */
  missingDocs: string[];
  /** 언제 받은 분석인지 · 무엇을 보고 했는지 */
  askedAt: string;
  usedDocs: string[];
};

/** 서류 칸 이름 — 화면의 일곱 칸과 같은 말을 쓴다 */
export const DOC_LABELS: Record<string, string> = {
  'doc.registry': '등기사항전부(요약)증명서',
  'doc.saleSpec': '매각물건명세서',
  'doc.survey': '현황조사서',
  'doc.household': '전입세대확인서',
  'doc.building': '건축물대장',
  'doc.appraisal': '감정평가서',
  'doc.delivery': '송달내역',
};

const str = { type: 'STRING' };
const rightItem = {
  type: 'OBJECT',
  properties: {
    kind: str, date: str, holder: str, reason: str,
  },
  required: ['kind', 'date', 'holder'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    baseRight: {
      type: 'OBJECT',
      properties: {
        kind: str, date: str, holder: str, rank: str, evidence: str,
      },
      required: ['kind', 'date', 'holder', 'rank', 'evidence'],
    },
    takeover: {
      type: 'OBJECT',
      properties: { count: { type: 'INTEGER' }, items: { type: 'ARRAY', items: rightItem }, summary: str },
      required: ['count', 'items', 'summary'],
    },
    extinguish: {
      type: 'OBJECT',
      properties: { count: { type: 'INTEGER' }, items: { type: 'ARRAY', items: rightItem } },
      required: ['count', 'items'],
    },
    risk: {
      type: 'OBJECT',
      properties: { summary: str, items: { type: 'ARRAY', items: str } },
      required: ['summary', 'items'],
    },
    evict: {
      type: 'OBJECT',
      properties: {
        level: { type: 'STRING', enum: [...EVICT_LEVELS] }, reason: str, strategy: str, advice: str,
      },
      required: ['level', 'reason', 'strategy', 'advice'],
    },
    conclusion: {
      type: 'OBJECT',
      properties: { verdict: { type: 'STRING', enum: [...RIGHTS_VERDICTS] }, text: str },
      required: ['verdict', 'text'],
    },
    missingDocs: { type: 'ARRAY', items: str },
  },
  required: ['baseRight', 'takeover', 'extinguish', 'risk', 'evict', 'conclusion', 'missingDocs'],
};

/**
 * 보내는 글.
 *
 * 원래 쓰시던 글에서 고친 곳과 까닭:
 *  · '빈칸 없이 작성' → 뺐다. 빈칸을 메우라고 시키면 서류에 없는 것을 지어낸다.
 *    대신 '못 찾으면 비워 두고, 어떤 서류가 없어서 못 찾았는지 적으라'로 바꿨다.
 *  · 마크다운 양식 → JSON 으로. 화면 칸에 그대로 꽂아야 해서 글꼴이 아니라 자료가 필요하다.
 *  · 말소기준권리를 '권리종류 / 접수일자 / 권리자 / 순위' 한 덩어리 글 → 네 칸으로 쪼갰다.
 *  · 인수·말소는 '개수와 이유' 한 덩어리 글 → 개수(숫자)와 권리 목록으로 쪼갰다.
 *    개수를 숫자로 받아야 화면에 크게 세울 수 있고, 목록과 개수가 어긋나는지도 볼 수 있다.
 *  · 난이도·결론은 아무 말이나 못 쓰게 고를 수 있는 값으로 못 박았다.
 *  · 값마다 근거(evidence)를 달게 했다 — 어느 서류 어느 줄에서 봤는지.
 *  · 말소기준권리 판단 규칙을 글로 박아 넣었다. 그냥 물으면 전세권·가등기에서 흔들린다.
 */
export const RIGHTS_PROMPT = [
  '너는 한국 부동산 경매의 권리분석을 하는 사람이다. 첨부한 서류 사진·PDF 를 읽고 JSON 으로만 답하라.',
  '',
  '첨부되는 서류 (없는 것도 있다):',
  ...Object.values(DOC_LABELS).map((v) => `- ${v}`),
  '',
  '지켜야 할 것',
  '- 서류에 실제로 적힌 것만 쓴다. 없거나 흐려서 못 읽으면 그 칸은 빈 글자("")로 두고 지어내지 않는다.',
  '- 빈칸을 메우려고 추측하지 않는다. 모르는 것은 모른다고 두는 편이 낫다.',
  '- 어떤 서류가 없어서 판단이 모자랐으면 missingDocs 에 그 서류 이름을 적는다.',
  '- 날짜는 YYYY-MM-DD. 금액은 원 단위 숫자에 쉼표를 넣어 적는다.',
  '- 글은 한국어 존댓말로, 한 줄에 한 가지씩 짧게 쓴다.',
  '',
  '말소기준권리 고르는 규칙',
  '- 후보는 (근)저당권, 담보가등기, 압류, 가압류, 경매개시결정등기 다섯이다. 그 가운데 접수일이 가장 빠른 것이 말소기준권리다.',
  '- 전세권은 그 전세권자가 배당요구를 했거나 스스로 경매를 넣은 때에만 말소기준권리가 된다. 아니면 후보가 아니다.',
  '- 소유권이전·소유권보존은 말소기준권리가 되지 않는다.',
  '- rank 에는 등기부의 순위번호(예: 갑구 3번, 을구 2번)를 적는다.',
  '',
  '인수·말소 가르는 규칙',
  '- 말소기준권리보다 앞선(먼저 접수된) 권리는 낙찰자가 떠안는다 → takeover.',
  '- 말소기준권리와 그 뒤의 권리는 낙찰되면 없어진다 → extinguish.',
  '- 다만 뒤에 있어도 없어지지 않는 것이 있다: 예고등기, 건물철거·토지인도 가처분, 유치권, 법정지상권,',
  '  그리고 대항력 있는 임차인이 배당에서 다 못 받은 보증금. 이런 것은 takeover 에 넣고 reason 에 까닭을 적는다.',
  '- count 는 items 의 개수와 반드시 같게 맞춘다.',
  '',
  '명도 난이도',
  '- level 은 쉬움 / 보통 / 약간 높음 / 높음 가운데 하나만 고른다.',
  '- reason 에는 점유자가 누구인지, 전입일, 임대차 관계, 폐문부재 여부 같은 것을 두세 가지로 든다.',
  '- strategy 에는 입찰 전후로 할 일을 두세 가지 적는다.',
  '- advice 에는 보증금 인수 위험, 이사비·명도비를 입찰가에 얼마나 잡아야 하는지를 적는다.',
  '',
  '리스크',
  '- risk.items 에는 매각물건명세서의 특별매각조건, 농지취득자격증명, 법정지상권·유치권 신고,',
  '  전차인·실거주자, 미납 관리비, 송달 안 된 이해관계인처럼 걸리는 것을 한 줄씩 적는다.',
  '- 걸리는 것이 없으면 빈 배열로 둔다. 억지로 만들지 않는다.',
  '',
  '결론',
  '- verdict 는 입찰 추천 / 주의 / 비추천 가운데 하나만 고른다.',
  '- text 에는 그렇게 본 까닭과 마지막으로 챙길 것을 세 문장 안으로 적는다.',
  '- 서류가 모자라 판단하기 어려우면 그 사실을 text 에 먼저 적고 verdict 는 주의로 둔다.',
].join('\n');

export type RightsDocPart = { mimeType: string; base64: string; label: string };

const wait = (ms: number) => new Promise((done) => { setTimeout(done, ms); });

/** 서류를 Gemini 에 보내 권리분석을 받아 온다 */
export const askRightsAnalysis = async (
  key: string,
  parts: RightsDocPart[],
): Promise<RightsAi> => {
  if (!key) throw new GeminiError('AI 키가 없습니다 — 더보기 > AI 자동 분석에서 등록해 주세요');
  if (parts.length === 0) throw new GeminiError('분석할 서류가 없습니다 — 서류를 한 장이라도 올려 주세요');

  const payload = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        // 어느 칸에 올린 서류인지 먼저 알려 주고 그 뒤에 그림을 붙인다
        ...parts.flatMap((p) => ([
          { text: `[${p.label}]` },
          { inlineData: { mimeType: p.mimeType, data: p.base64 } },
        ])),
        { text: RIGHTS_PROMPT },
      ],
    }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });

  type Body = {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  let res: Response | null = null;
  let body: Body = {};
  // 혼잡(503)·잠깐 한도(429)는 잠시 뒤 다시 — 두 번까지 (geminiPdf 와 같은 규칙)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetch(`${GEMINI_API}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: payload,
    });
    body = await res.json().catch(() => ({})) as Body;
    if (res.status !== 503 && res.status !== 429) break;
    if (attempt < 2) await wait(attempt === 0 ? 3000 : 8000);
  }
  if (!res) throw new GeminiError('AI 분석 실패');
  if (!res.ok) {
    const why = res.status === 403 || res.status === 401 ? '키를 확인해 주세요'
      : res.status === 429 ? '사용 한도에 걸렸습니다'
        : res.status === 503 ? 'Gemini 서버가 붐빕니다. 잠시 뒤 다시 해 주세요'
          : body.error?.message || `오류 ${res.status}`;
    throw new GeminiError(`AI 분석 실패 — ${why}`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new GeminiError('AI 분석 실패 — 답이 비어 있습니다');
  let raw: Partial<RightsAi>;
  try {
    raw = JSON.parse(text) as Partial<RightsAi>;
  } catch {
    throw new GeminiError('AI 분석 실패 — 답을 읽지 못했습니다');
  }
  return normalizeRightsAi(raw, parts.map((p) => p.label));
};

/** 받아 온 답을 화면이 믿고 쓸 수 있는 꼴로 — 빠진 칸을 메우고 개수를 목록에 맞춘다 */
export const normalizeRightsAi = (raw: Partial<RightsAi>, usedDocs: string[] = []): RightsAi => {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown): RightsAiRight[] => (Array.isArray(v) ? v : []).map((r) => ({
    kind: text((r as RightsAiRight)?.kind),
    date: text((r as RightsAiRight)?.date),
    holder: text((r as RightsAiRight)?.holder),
    reason: text((r as RightsAiRight)?.reason),
  })).filter((r) => r.kind || r.date || r.holder);
  const takeoverItems = list(raw.takeover?.items);
  const extinguishItems = list(raw.extinguish?.items);
  const level = EVICT_LEVELS.includes(text(raw.evict?.level) as typeof EVICT_LEVELS[number])
    ? text(raw.evict?.level) : '';
  const verdict = RIGHTS_VERDICTS.includes(text(raw.conclusion?.verdict) as typeof RIGHTS_VERDICTS[number])
    ? text(raw.conclusion?.verdict) : '';
  return {
    baseRight: {
      kind: text(raw.baseRight?.kind),
      date: text(raw.baseRight?.date),
      holder: text(raw.baseRight?.holder),
      rank: text(raw.baseRight?.rank),
      evidence: text(raw.baseRight?.evidence),
    },
    // 개수는 AI 가 적은 숫자가 아니라 목록 길이를 쓴다 — 둘이 어긋나면 목록이 사실이다
    takeover: { count: takeoverItems.length, items: takeoverItems, summary: text(raw.takeover?.summary) },
    extinguish: { count: extinguishItems.length, items: extinguishItems },
    risk: {
      summary: text(raw.risk?.summary),
      items: (Array.isArray(raw.risk?.items) ? raw.risk.items : []).map(text).filter(Boolean),
    },
    evict: {
      level,
      reason: text(raw.evict?.reason),
      strategy: text(raw.evict?.strategy),
      advice: text(raw.evict?.advice),
    },
    conclusion: { verdict, text: text(raw.conclusion?.text) },
    missingDocs: (Array.isArray(raw.missingDocs) ? raw.missingDocs : []).map(text).filter(Boolean),
    askedAt: new Date().toISOString(),
    usedDocs,
  };
};
