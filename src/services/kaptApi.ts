// K-apt(공동주택관리정보시스템) — 단지마다 지상 · 지하 주차대수 · 승강기 대수 · 세대수.
// 오래된 단지는 건축물대장 총괄표제부가 비어 주차 · 엘베를 몰랐다(2026-11-11). K-apt 는 관리 단지면 다 있다(2026-11-15 사용자 신청).
// 국토교통부_공동주택 단지 목록제공 서비스(AptListService4) · 공동주택 기본 정보제공 서비스(AptBasisInfoServiceV5), 키는 실거래와 같은 공공데이터 키.
// 단지는 잘 바뀌지 않아 이 브라우저에 30일 적어 둔다(한도를 아낀다).
import { requestDataApi } from './publicDataApi';

export type KaptFacts = {
  kaptCode: string;
  name: string;
  /** 세대수 */
  households: number;
  /** 지상 · 지하 주차대수 */
  parkUp: number;
  parkDown: number;
  /** 승강기 대수 */
  elevators: number;
  /** 사용승인일 YYYYMMDD */
  useDate: string;
};
type KaptListItem = { kaptCode: string; kaptName: string; as3: string };

const LIST_PATH = '/1613000/AptListService4/getSigunguAptList4';
const BASIS_PATH = '/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5';
const DETAIL_PATH = '/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5';
const TTL = 30 * 24 * 60 * 60 * 1000;
const LS = 'ta.kapt.';

const num = (v: unknown) => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
const asList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v as Record<string, unknown>] : []);
const memo = new Map<string, Promise<unknown>>();
/** 메모리 → 이 브라우저(localStorage) → 새로 받기. 못 읽어도 화면은 새로 받아 간다 */
const cached = <T>(key: string, load: () => Promise<T>, worth: (v: T) => boolean): Promise<T> => {
  const hit = memo.get(key); if (hit) return hit as Promise<T>;
  const p = (async () => {
    try { const raw = localStorage.getItem(LS + key); if (raw) { const o = JSON.parse(raw) as { at: number; v: T }; if (Date.now() - o.at < TTL) return o.v; } } catch { /* 저장소를 못 써도 받아 온다 */ }
    const v = await load();
    if (worth(v)) { try { localStorage.setItem(LS + key, JSON.stringify({ at: Date.now(), v })); } catch { /* 가득 차도 화면은 간다 */ } }
    return v;
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
};

/** 시군구(5자리) 안 K-apt 단지 목록 */
const listOf = (sigungu5: string) => cached<KaptListItem[]>(`l${sigungu5}`, async () => {
  const json = await requestDataApi(LIST_PATH, { sigunguCode: sigungu5, pageNo: 1, numOfRows: 2000 });
  return asList(json?.response?.body?.items?.item ?? json?.response?.body?.items)
    .map((r) => ({ kaptCode: String(r.kaptCode ?? ''), kaptName: String(r.kaptName ?? ''), as3: String(r.as3 ?? '') }))
    .filter((r) => r.kaptCode);
}, (v) => v.length > 0);

const basisOf = (code: string) => cached<Record<string, unknown> | null>(`b${code}`, async () => {
  const json = await requestDataApi(BASIS_PATH, { kaptCode: code });
  return (json?.response?.body?.item as Record<string, unknown> | undefined) ?? null;
}, (v) => !!v);

const detailOf = (code: string) => cached<Record<string, unknown> | null>(`d${code}`, async () => {
  const json = await requestDataApi(DETAIL_PATH, { kaptCode: code });
  return (json?.response?.body?.item as Record<string, unknown> | undefined) ?? null;
}, (v) => !!v);

/** 이름 맞추기 — 실거래 단지명('주공11')과 K-apt 단지명('성포주공11단지')은 동 이름 · '아파트' · '단지'가 붙고 떨어진다 */
const normName = (s: string, umd: string) => {
  const stem = umd.replace(/\s+/g, '').replace(/[동리가]$/, '').replace(/\d+$/, '');
  let n = s.replace(/\(.*?\)/g, '').replace(/[\s·.,\-_]/g, '').replace(/아파트|단지/g, '');
  if (stem.length >= 2 && n.startsWith(stem) && n.length > stem.length + 1) n = n.slice(stem.length);
  return n;
};
const digitsOf = (s: string) => (s.match(/\d+/g) ?? []).join(',');
const sameName = (a: string, b: string, umd: string) => {
  const x = normName(a, umd); const y = normName(b, umd);
  if (!x || !y) return false;
  if (x === y) return true;
  if (digitsOf(x) !== digitsOf(y)) return false;   // 3단지 ≠ 5단지
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 3 && l.includes(s);
};
const squash = (s: string) => s.replace(/\s+/g, '');

/** 단지 하나 → K-apt 값. sigungu5 = 시군구 코드 5자리, umd = 읍면동 이름, name = 단지명, jibun = '258' · '670-4'.
 *  이름으로 하나가 안 잡히면 그 동 단지들의 주소(kaptAddr)를 지번으로 견준다. 못 찾으면 null */
export const kaptFactsOf = async (sigungu5: string, umd: string, name: string, jibun = ''): Promise<KaptFacts | null> => {
  if (!/^\d{5}$/.test(sigungu5)) return null;
  try {
    const all = await listOf(sigungu5);
    const inDong = all.filter((r) => squash(r.as3) === squash(umd));
    const pool = inDong.length ? inDong : all;
    let hit = name ? pool.filter((r) => sameName(r.kaptName, name, umd)) : [];
    if (hit.length !== 1 && jibun && inDong.length) {
      const j = jibun.replace(/^산\s*/, '');
      const re = new RegExp(`\\s${j.replace(/[-]/g, '\\-')}(\\s|$|,)`);
      const cands = (hit.length > 1 ? hit : inDong).slice(0, 30);
      const bs = await Promise.all(cands.map(async (r) => ({ r, b: await basisOf(r.kaptCode).catch(() => null) })));
      const byAddr = bs.filter(({ b }) => b && re.test(String(b.kaptAddr ?? ''))).map(({ r }) => r);
      if (byAddr.length === 1) hit = byAddr;
    }
    if (hit.length !== 1) return null;
    const code = hit[0].kaptCode;
    const [b, d] = await Promise.all([basisOf(code), detailOf(code)]);
    if (!d) return null;
    return {
      kaptCode: code, name: hit[0].kaptName,
      households: num(b?.kaptdaCnt) || num(b?.hoCnt),
      parkUp: num(d.kaptdPcnt), parkDown: num(d.kaptdPcntu), elevators: num(d.kaptdEcnt),
      useDate: String(b?.kaptUsedate ?? ''),
    };
  } catch {
    return null;
  }
};
/** 세대당 주차 — 지상 + 지하 ÷ 세대수 */
export const kaptParkPerHome = (f: KaptFacts | null) => (f && f.households > 0 && f.parkUp + f.parkDown > 0 ? (f.parkUp + f.parkDown) / f.households : 0);
