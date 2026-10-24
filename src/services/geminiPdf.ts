// AI(Gemini)로 경매 PDF 읽기 — 규칙으로 못 읽은 칸만 채운다.
//
// 키는 사용자 각자의 것이다(BYOK). 이 기기에만 적어 두고, 앱이 Google 로 바로 보낸다 —
// 우리 서버를 거치지 않으므로 우리가 키를 들고 있지 않고, 요금은 그 사용자의 Google 계정으로 나간다.
//
// AI 는 못 찾은 값을 그럴듯하게 지어낼 수 있다. 그래서
//  1) 값마다 'PDF 의 어느 글에서 찾았는지'(evidence)를 같이 내게 하고
//  2) 그 글이나 값이 실제 PDF 글자 안에 있는지 확인해, 없으면 버린다
//  3) 규칙이 이미 읽은 칸은 건드리지 않는다 (빈칸만 채운다)
//  4) 채운 칸은 이름을 남겨 화면에 'AI' 로 표시할 수 있게 한다
import type { ParsedPdfAuction } from './pdfAuctionImport';

/** 늘 그때의 Flash-Lite — 버전이 바뀌어도 이름이 그대로 남는 별칭이다.
 *  같은 PDF 로 견줘 보니 Flash 는 한 건에 2분이 넘고 Flash-Lite 는 3초 안팎이었다 (답은 같았다). */
export const GEMINI_MODEL = 'gemini-flash-lite-latest';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_STORE = 'myturn.gemini.key';
const ON_STORE = 'myturn.gemini.on';

// === 키 ===
export const getGeminiKey = (): string => {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
};
export const setGeminiKey = (key: string) => {
  try { localStorage.setItem(KEY_STORE, key.trim()); } catch { /* 못 적으면 이번만 쓴다 */ }
};
export const clearGeminiKey = () => {
  try { localStorage.removeItem(KEY_STORE); localStorage.removeItem(ON_STORE); } catch { /* 그만 */ }
};
/** 'AI로 읽기' 스위치 — 키가 있어도 끌 수 있다 */
export const isGeminiOn = (): boolean => {
  try { return localStorage.getItem(ON_STORE) !== '0' && Boolean(getGeminiKey()); } catch { return false; }
};
export const setGeminiOn = (on: boolean) => {
  try { localStorage.setItem(ON_STORE, on ? '1' : '0'); } catch { /* 그만 */ }
};

/** 키가 살아 있는지 — 모델 목록을 한 번 불러 본다 (요금이 들지 않는 호출) */
export const testGeminiKey = async (key: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const res = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key.trim() } });
    if (res.ok) return { ok: true, message: '키가 확인됐습니다' };
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, message: body.error?.message || `확인 실패 (${res.status})` };
  } catch {
    return { ok: false, message: '인터넷 연결을 확인해 주세요' };
  }
};

// === 읽어 올 칸 ===
/** 한 줄 칸 — 값과 근거 */
const SCALAR_FIELDS = {
  caseNumber: '사건번호 (예: 2024타경12345)',
  courtName: '관할 법원 이름 (예: 인천지방법원)',
  courtDept: '경매계 (예: 경매5계)',
  courtPhone: '경매계 전화번호',
  address: '물건 소재지 지번 주소 (동·호수 포함)',
  roadAddress: '도로명 주소',
  propertyType: '물건 종류 (아파트, 다세대, 연립, 오피스텔, 단독, 상가 등)',
  auctionRound: '매각 회차 또는 유찰 횟수 표기 (예: 2차, 유찰 1회)',
  eventDate: '매각기일 (YYYY-MM-DD)',
  appraisalValue: '감정가 (원, 숫자만)',
  minimumBidValue: '최저매각가격 (원, 숫자만)',
  depositValue: '입찰보증금 (원, 숫자만)',
  officialPriceValue: '공시가격 (원, 숫자만)',
  buildingAreaM2: '전용면적 또는 건물면적 (㎡, 숫자만)',
  landAreaM2: '대지권 면적 (㎡, 숫자만)',
  approvalDate: '사용승인일 (YYYY-MM-DD)',
  caseStartDate: '경매개시결정일 (YYYY-MM-DD)',
  cancellationBaseDate: '말소기준권리 일자 (YYYY-MM-DD)',
  distributionRequestDate: '배당요구종기 (YYYY-MM-DD)',
  smallAmountBaseDate: '소액임차인 기준일 (YYYY-MM-DD)',
  ownerName: '소유자',
  debtorName: '채무자',
  creditorName: '채권자 (경매 신청인)',
} as const;
type ScalarKey = keyof typeof SCALAR_FIELDS;

const NUMBER_FIELDS: ScalarKey[] = ['appraisalValue', 'minimumBidValue', 'depositValue', 'officialPriceValue', 'buildingAreaM2', 'landAreaM2'];
const DATE_FIELDS: ScalarKey[] = ['eventDate', 'approvalDate', 'caseStartDate', 'cancellationBaseDate', 'distributionRequestDate', 'smallAmountBaseDate'];

/** 이 이름들을 화면에 쓴다 — 'AI 가 채운 칸' 목록 */
export const AI_FIELD_LABELS: Record<string, string> = {
  caseNumber: '사건번호', courtName: '법원', courtDept: '경매계', courtPhone: '경매계 전화',
  address: '주소', roadAddress: '도로명 주소', propertyType: '물건 종류', auctionRound: '회차',
  eventDate: '매각기일', appraisalValue: '감정가', minimumBidValue: '최저가', depositValue: '보증금',
  officialPriceValue: '공시가격', buildingAreaM2: '전용면적', landAreaM2: '대지면적', approvalDate: '사용승인일',
  caseStartDate: '개시결정일', cancellationBaseDate: '말소기준일', distributionRequestDate: '배당요구종기',
  smallAmountBaseDate: '소액기준일', ownerName: '소유자', debtorName: '채무자', creditorName: '채권자',
  registryRows: '건물등기 표', tenantInfoRows: '임차인 표',
};

const cell = { type: 'OBJECT', nullable: true, properties: { value: { type: 'STRING' }, evidence: { type: 'STRING' } }, required: ['value', 'evidence'] };
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...Object.fromEntries(Object.keys(SCALAR_FIELDS).map((k) => [k, cell])),
    registryRows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' }, order: { type: 'STRING' }, kind: { type: 'STRING' }, holder: { type: 'STRING' },
          amount: { type: 'STRING' }, extinct: { type: 'STRING' }, evidence: { type: 'STRING' },
        },
        required: ['date', 'kind', 'evidence'],
      },
    },
    tenantInfoRows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, moveIn: { type: 'STRING' }, fixed: { type: 'STRING' }, distribution: { type: 'STRING' },
          deposit: { type: 'STRING' }, opposition: { type: 'STRING' }, evidence: { type: 'STRING' },
        },
        required: ['name', 'evidence'],
      },
    },
  },
};

const PROMPT = [
  '이 PDF는 한국 법원 부동산 경매 물건 자료다. 아래 칸을 PDF에서 찾아 JSON으로 답하라.',
  '',
  '규칙:',
  '- PDF에 실제로 적힌 것만 쓴다. 없거나 확실하지 않으면 그 칸은 null 로 둔다. 추측하지 않는다.',
  '- 모든 칸에 evidence 를 단다: 그 값을 찾은 PDF 원문 글귀를 고치지 말고 그대로 옮긴다 (20자 안팎).',
  '- 날짜는 YYYY-MM-DD, 금액은 원 단위 숫자만(쉼표 없이), 면적은 ㎡ 숫자만.',
  '- registryRows: 건물 등기부의 권리 목록 한 줄씩 (접수일 date, 순위 order, 권리종류 kind, 권리자 holder, 채권금액 amount, 말소 여부 extinct 는 "소멸"/"인수"/빈칸).',
  '- tenantInfoRows: 임차인 현황 한 사람씩 (이름, 전입일 moveIn, 확정일자 fixed, 배당요구일 distribution, 보증금 deposit, 대항력 opposition).',
  '',
  '칸 설명:',
  ...Object.entries(SCALAR_FIELDS).map(([k, v]) => `- ${k}: ${v}`),
].join('\n');

// === 확인 ===
/** 띄어쓰기·쉼표를 걷어 낸 꼴 — PDF 글자 뽑기에서 띄어쓰기가 흔들려도 맞춰 볼 수 있게 */
const compact = (s: string) => s.replace(/\s+/g, '').replace(/,/g, '');
const dateVariants = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [iso];
  const [, y, mo, d] = m;
  return [`${y}-${mo}-${d}`, `${y}.${mo}.${d}`, `${y}/${mo}/${d}`, `${y}년${mo}월${d}일`, `${y}.${Number(mo)}.${Number(d)}`, `${y}년${Number(mo)}월${Number(d)}일`];
};

/** 이 값이 PDF 글자 안에 정말 있나 — 근거 글귀나 값 자체가 보이면 믿는다 */
export const foundInText = (rawCompact: string, value: string, evidence: string): boolean => {
  if (!rawCompact) return false;
  const cands = [evidence, value, ...dateVariants(value)].map(compact).filter((c) => c.length >= 2);
  return cands.some((c) => rawCompact.includes(c));
};

const toNumber = (v: string): number => {
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toIso = (v: string): string => {
  const m = String(v).match(/(\d{4})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};

type AiCell = { value?: string | null; evidence?: string | null } | null;
type AiRaw = Partial<Record<ScalarKey, AiCell>> & {
  registryRows?: Array<Record<string, string>>;
  tenantInfoRows?: Array<Record<string, string>>;
};

// === 부르기 ===
const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
};

export class GeminiError extends Error {}

const wait = (ms: number) => new Promise((done) => { setTimeout(done, ms); });

/** PDF 를 Gemini 에 보내 칸을 받아 온다 (확인 전의 날것) */
const askGemini = async (key: string, bytes: Uint8Array): Promise<AiRaw> => {
  if (bytes.length === 0) throw new GeminiError('AI 읽기 실패 — PDF 내용이 비어 있습니다');
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: toBase64(bytes) } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });
  type Body = {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  let res: Response | null = null;
  let body: Body = {};
  // 혼잡(503)·잠깐 한도(429)는 잠시 뒤 다시 — 두 번까지
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetch(`${API}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: payload,
    });
    body = await res.json().catch(() => ({})) as Body;
    if (res.status !== 503 && res.status !== 429) break;
    if (attempt < 2) await wait(attempt === 0 ? 3000 : 8000);
  }
  if (!res) throw new GeminiError('AI 읽기 실패');
  if (!res.ok) {
    const why = res.status === 403 || res.status === 401 ? '키를 확인해 주세요'
      : res.status === 429 ? '사용 한도에 걸렸습니다'
      : res.status === 503 ? 'Gemini 서버가 붐빕니다. 잠시 뒤 다시 해 주세요'
      : `오류 ${res.status}`;
    throw new GeminiError(`AI 읽기 실패 — ${why}${body.error?.message ? ` (${body.error.message.slice(0, 80)})` : ''}`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text) as AiRaw;
  } catch {
    throw new GeminiError('AI 응답을 읽지 못했습니다');
  }
};

/** 규칙이 이 칸을 못 읽었나 */
const isBlank = (parsed: ParsedPdfAuction, key: ScalarKey, today: string): boolean => {
  const v = parsed[key as keyof ParsedPdfAuction];
  if (typeof v === 'number') return !v;
  const s = String(v ?? '').trim();
  // 매각기일은 못 찾으면 오늘 날짜로 채워진다 — 그 날짜가 PDF 에 없으면 못 읽은 것이다
  if (key === 'eventDate') return !s || (s === today && !compact(parsed.rawText).includes(compact(s)));
  return !s;
};

export type AiResult = {
  parsed: ParsedPdfAuction;
  /** AI 가 채운 칸 이름 */
  filled: string[];
  /** AI 가 냈지만 PDF 에서 근거를 못 찾아 버린 칸 */
  rejected: string[];
};

/**
 * 규칙으로 읽은 결과에 AI 결과를 덧댄다 — 빈칸만, 근거가 확인된 값만.
 * 키가 없거나 AI 가 실패하면 GeminiError 를 던진다(규칙 결과는 그대로 쓰면 된다).
 */
export const fillWithGemini = async (bytes: Uint8Array, parsed: ParsedPdfAuction, key = getGeminiKey()): Promise<AiResult> => {
  if (!key) throw new GeminiError('Gemini 키가 없습니다');
  const ai = await askGemini(key, bytes);
  const raw = compact(parsed.rawText ?? '');
  const today = new Date().toISOString().slice(0, 10);
  const next: ParsedPdfAuction = { ...parsed };
  const filled: string[] = [];
  const rejected: string[] = [];

  (Object.keys(SCALAR_FIELDS) as ScalarKey[]).forEach((key) => {
    const c = ai[key];
    const value = String(c?.value ?? '').trim();
    if (!value || !isBlank(parsed, key, today)) return;
    if (!foundInText(raw, value, String(c?.evidence ?? ''))) { rejected.push(key); return; }
    const target = next as unknown as Record<string, unknown>;
    if (NUMBER_FIELDS.includes(key)) {
      const n = toNumber(value);
      if (!n) return;
      target[key] = n;
      // 평은 ㎡ 에서 셈한다
      if (key === 'buildingAreaM2') next.buildingAreaPyeong = Math.round((n / 3.305785) * 100) / 100;
      if (key === 'landAreaM2') next.landAreaPyeong = Math.round((n / 3.305785) * 100) / 100;
    } else if (DATE_FIELDS.includes(key)) {
      const iso = toIso(value);
      if (!iso) return;
      target[key] = iso;
    } else if (key === 'courtDept' && /^\d+계$/.test(value)) {
      // '27계' → '경매27계' — 규칙이 읽는 꼴과 맞춘다
      target[key] = `경매${value}`;
    } else {
      target[key] = value;
    }
    filled.push(key);
  });

  // 표는 규칙이 한 줄도 못 읽었을 때만 — 줄마다 근거가 PDF 에 있어야 받는다
  if (parsed.registryRows.length === 0 && ai.registryRows?.length) {
    const rows = ai.registryRows
      .filter((r) => foundInText(raw, toIso(r.date ?? '') || r.date || '', r.evidence ?? ''))
      .map((r) => ({
        date: toIso(r.date ?? '') || String(r.date ?? ''), order: String(r.order ?? ''), kind: String(r.kind ?? ''),
        holder: String(r.holder ?? ''), amount: String(r.amount ?? ''), desc: '', extinct: r.extinct === '소멸' ? '소멸' : '',
      }));
    if (rows.length) { next.registryRows = rows; filled.push('registryRows'); } else rejected.push('registryRows');
  }
  if (parsed.tenantInfoRows.length === 0 && ai.tenantInfoRows?.length) {
    const rows = ai.tenantInfoRows
      .filter((r) => foundInText(raw, String(r.name ?? ''), r.evidence ?? ''))
      .map((r) => ({
        name: String(r.name ?? ''), subName: '', occupationPeriod: '', moveIn: toIso(r.moveIn ?? '') || String(r.moveIn ?? ''),
        fixed: toIso(r.fixed ?? '') || String(r.fixed ?? ''), distribution: toIso(r.distribution ?? '') || String(r.distribution ?? ''),
        deposit: String(r.deposit ?? ''), opposition: String(r.opposition ?? ''), analysis: '', other: '',
      }));
    if (rows.length) { next.tenantInfoRows = rows; filled.push('tenantInfoRows'); } else rejected.push('tenantInfoRows');
  }

  next.aiFilledFields = filled;
  return { parsed: next, filled, rejected };
};
