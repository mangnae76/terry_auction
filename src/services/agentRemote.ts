// 집 PC 수집 도우미(관리자만) — 웹 시장분석 › 경매사례에서 명령을 보내고, 집 PC agent.py 가 옥션원 · 탱크옥션을 모은다.
// auction-web(src/services/data.ts)과 같은 문서 모양을 쓴다 — 도우미 쪽 코드를 고치지 않고 그대로 붙이려고.
//   users/{uid}/agent/control        웹 → 도우미 {cmd:{id,name,args,at}, stop:{id,at}, webSeenAt}
//   users/{uid}/agent/status         도우미 → 웹 {at, ready, busy, enriching, prog, message, …}
//   users/{uid}/agent/queue          웹 ↔ 도우미 모을 물건 대기열 {items: [{case, addr, at}]} (2026-11-08부터 도우미가 빼지 않는다 — 웹에서 × 로 뺄 때까지 남는다)
// ── 공용 자료 — 관리자 누구든 쌓으면 다 같이 쓴다(계정마다 쌓지 않는다. GitHub Actions 로 쌓는 자료와 같은 공용 자료)
//   saleData/coverage                도우미 → 웹 모은 동네 {dongs: {'인천 서구 검암동': {at(ms), n, site, src, months}}}
//   saleData/main                    {count, chunks, version, by, updatedAt}
//   saleData/main/chunks/{i}         {i, data: 레코드 JSON 글자, v}
// 공용 자료는 관리자 누구나 쓰고 로그인한 모두가 읽는다. 명령 · 상태 · 대기열은 각자 집 PC 라 운영자 본인만(firestore.rules).
// 예전에는 모은 자료도 users/{uid}/datasets · agent/coverage 에 계정마다 쌓였다 — migrateLegacyAgentData 가 한 번 옮긴다.
import { collection, doc, getDoc, getDocFromServer, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { firestore } from './firebase';

export type AgentCmdName = 'open' | 'screen' | 'auto' | 'enrich' | 'queue';
export type AgentCmdArgs = { site?: '옥션원' | '탱크옥션'; months?: 0 | 6 | 12 | 24 | 36; src?: 'near' | 'same'; fresh?: boolean };
export type AgentStatus = {
  at?: { toMillis(): number } | null;
  version?: string;
  ready?: boolean;
  busy?: boolean;
  enriching?: boolean;
  prog?: { i: number; n: number } | null;
  message?: string;
  lastCmd?: string;
  site?: string;
};
/** 모은 동네 하나 — at 은 마지막으로 모은 시각(ms), n 은 그때 그 동네 물건 수 */
export type AgentCoverage = { at: number; n: number; region?: string; kind?: string; site?: string; src?: string; months?: number };
/** 모을 물건 하나 — 사건(case 사건번호 · addr 소재지) 또는 동(dong '인천 서해구 검암동' · lawd 시군구 5자리 · sgg · dongName), at 올린 시각(ms) */
export type AgentQueueItem = { case: string; addr?: string; dong?: string; lawd?: string; sgg?: string; dongName?: string; kind?: string; at: number };
export type AgentDatasetMeta = { count: number; chunks: number; version: number; by?: string; updatedAt?: { toMillis(): number } | null };
/** 도우미가 모은 매각물건 한 줄 — nearby_avg.py FIELDS 그대로(한글 이름) */
export type SaleRecord = Record<string, string | number | null>;

const db = () => {
  if (!firestore) throw new Error('Firestore 가 준비되지 않았습니다.');
  return firestore;
};
// 상태 · 명령 · 대기열도 공용 — 관리자 누구로 로그인해도 같은 집 PC 도우미를 본다(2026-11-05). uid 는 받기만 한다
const controlRef = (_uid?: string) => doc(db(), 'saleData', 'agentControl');
const statusRef = (_uid?: string) => doc(db(), 'saleData', 'agentStatus');
const queueRef = (_uid?: string) => doc(db(), 'saleData', 'agentQueue');
const legacyQueueRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'queue');
// 공용 자료 — uid 는 받기만 하고 쓰지 않는다(부르는 쪽 모양을 그대로 두려고)
const coverageRef = (_uid?: string) => doc(db(), 'saleData', 'coverage');
const metaRef = (_uid?: string) => doc(db(), 'saleData', 'main');
const chunksCol = () => collection(db(), 'saleData', 'main', 'chunks');
// 예전 자리(계정마다) — 옮겨 담을 때만 읽는다
const legacyMetaRef = (uid: string) => doc(db(), 'users', uid, 'datasets', 'main');
const legacyCoverageRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'coverage');

/** 도우미가 마지막 소식을 보낸 지 90초 안이면 연결됨 (도우미는 40초마다 알린다) */
export const AGENT_ONLINE_MS = 90_000;
export const agentOnline = (s: AgentStatus | null, now = Date.now()) =>
  !!s?.at && typeof s.at.toMillis === 'function' && now - s.at.toMillis() < AGENT_ONLINE_MS;

/** 명령 보내기 — id 가 바뀌면 도우미가 새 명령으로 안다 */
export const sendAgentCommand = async (uid: string, name: AgentCmdName, args: AgentCmdArgs): Promise<void> => {
  await setDoc(controlRef(uid), { cmd: { id: crypto.randomUUID(), name, args, at: serverTimestamp() }, webSeenAt: serverTimestamp() }, { merge: true });
};
export const sendAgentStop = async (uid: string): Promise<void> => {
  await setDoc(controlRef(uid), { stop: { id: crypto.randomUUID(), at: serverTimestamp() }, webSeenAt: serverTimestamp() }, { merge: true });
};
/** 웹이 보고 있다고 알린다 — 도우미가 명령을 3초마다 확인한다(안 보면 30초마다).
 *  돌려주는 값 = 서버 시계 − 이 컴퓨터 시계(ms). 컴퓨터 시계가 틀려도 '연결됨'을 맞게 재려고(못 재면 0) */
export const agentHeartbeat = async (uid: string): Promise<number> => {
  const t0 = Date.now();
  await setDoc(controlRef(uid), { webSeenAt: serverTimestamp() }, { merge: true });
  try {
    const s = await getDocFromServer(controlRef(uid));
    const at = (s.data() as { webSeenAt?: { toMillis(): number } } | undefined)?.webSeenAt;
    const t1 = Date.now();
    return at && typeof at.toMillis === 'function' ? at.toMillis() - Math.round((t0 + t1) / 2) : 0;
  } catch {
    return 0;
  }
};

export const watchAgentStatus = (uid: string, cb: (s: AgentStatus | null) => void, err: (e: Error) => void = () => {}): Unsubscribe =>
  onSnapshot(statusRef(uid), (s) => cb(s.exists() ? (s.data() as AgentStatus) : null), err);
export const watchAgentDatasetMeta = (uid: string, cb: (m: AgentDatasetMeta | null) => void, err: (e: Error) => void = () => {}): Unsubscribe =>
  onSnapshot(metaRef(uid), (s) => cb(s.exists() ? (s.data() as AgentDatasetMeta) : null), err);

export const watchAgentQueue = (uid: string, cb: (items: AgentQueueItem[]) => void, err: (e: Error) => void = () => {}): Unsubscribe =>
  onSnapshot(queueRef(uid), (s) => {
    const items = (s.exists() ? (s.data() as { items?: unknown }).items : null);
    cb(Array.isArray(items) ? items.filter((x): x is AgentQueueItem => !!x && typeof x === 'object' && (typeof (x as AgentQueueItem).case === 'string' || typeof (x as AgentQueueItem).dong === 'string')) : []);
  }, err);
/** 대기열 통째로 다시 적기 (200건까지) */
export const saveAgentQueue = async (uid: string, items: AgentQueueItem[]): Promise<void> => {
  await setDoc(queueRef(uid), { items: items.slice(0, 200).map((x) => (x.dong
    ? { case: '', dong: x.dong, lawd: x.lawd ?? '', sgg: x.sgg ?? '', dongName: x.dongName ?? '', kind: x.kind ?? '', at: x.at }
    : { case: x.case, addr: x.addr ?? '', kind: x.kind ?? '', at: x.at })) });   // 사건도 종류(고르면) — 도우미가 사건 종류와 다르면 건너뛴다
};

/** 모은 동네 — 최근에 모은 순 */
export const watchAgentCoverage = (uid: string, cb: (list: Array<AgentCoverage & { key: string }>) => void, err: (e: Error) => void = () => {}): Unsubscribe =>
  onSnapshot(coverageRef(uid), (s) => {
    const dongs = (s.exists() ? (s.data() as { dongs?: Record<string, AgentCoverage> }).dongs : null) ?? {};
    cb(Object.entries(dongs).map(([key, v]) => ({ key, ...v })).sort((a, b) => (b.at || 0) - (a.at || 0)));
  }, err);

/** JSON 조각 하나 → 레코드들 (깨진 조각은 건너뛴다) */
export const parseSaleChunk = (text: unknown): SaleRecord[] => {
  if (typeof text !== 'string') return [];
  try {
    const arr = JSON.parse(text) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is SaleRecord => !!x && typeof x === 'object') : [];
  } catch {
    return [];
  }
};

/** 요약 + 조각을 읽어 모은 물건 전부 */
export const loadAgentDataset = async (uid: string): Promise<{ recs: SaleRecord[]; meta: AgentDatasetMeta | null }> => {
  const m = await getDoc(metaRef(uid));
  if (!m.exists()) return { recs: [], meta: null };
  const meta = m.data() as AgentDatasetMeta;
  const snaps = await getDocs(chunksCol());
  const parts = snaps.docs.map((d) => d.data() as { i?: number; data?: string })
    .filter((d) => typeof d.i === 'number' && d.i < meta.chunks)
    .sort((a, b) => (a.i ?? 0) - (b.i ?? 0));
  return { recs: parts.flatMap((p) => parseSaleChunk(p.data)), meta };
};

/** 레코드를 700KB 이하 JSON 조각으로 — Firestore 문서 1MB 제한(auction-web splitChunks 와 같다) */
const splitSaleChunks = (recs: SaleRecord[], limit = 700_000): string[] => {
  const out: string[] = [];
  let cur: string[] = [];
  let size = 2;
  for (const r of recs) {
    const t = JSON.stringify(r);
    const bytes = new TextEncoder().encode(t).length + 1;
    if (cur.length && size + bytes > limit) { out.push(`[${cur.join(',')}]`); cur = []; size = 2; }
    cur.push(t); size += bytes;
  }
  if (cur.length || !out.length) out.push(`[${cur.join(',')}]`);
  return out;
};

/** 웹(파일 불러오기)에서 공용 매각물건 자료를 통째로 저장 — 그 사이 집 PC 수집 등으로 바뀌었으면(expectVersion 이 다르면) 저장하지 않는다.
 *  auction-web saveDataset 과 같은 모양(by: 'web'). 저장한 새 버전을 돌려준다 */
export const saveSaleDataset = async (recs: SaleRecord[], expectVersion: number | null): Promise<number> => {
  if (recs.length > 20_000) throw new Error('한 번에 20,000건까지 저장할 수 있습니다.');
  const chunks = splitSaleChunks(recs);
  if (chunks.length > 400) throw new Error('자료가 너무 큽니다.');
  return runTransaction(db(), async (tx) => {
    const cur = await tx.get(metaRef());
    const curMeta = cur.exists() ? (cur.data() as AgentDatasetMeta) : null;
    const curVersion = curMeta?.version ?? 0;
    if (expectVersion !== null && curVersion !== expectVersion) throw new Error('그 사이 집 PC 수집 등으로 자료가 바뀌었습니다 — 다시 불러온 뒤 해 주세요.');
    const version = curVersion + 1;
    chunks.forEach((data, i) => tx.set(doc(chunksCol(), String(i)), { i, data, v: version }));
    for (let i = chunks.length; i < (curMeta?.chunks ?? 0); i += 1) tx.delete(doc(chunksCol(), String(i)));
    tx.set(metaRef(), { count: recs.length, chunks: chunks.length, version, by: 'web', updatedAt: serverTimestamp() });
    return version;
  });
};

/** 예전에 이 계정 아래(users/{uid}) 쌓인 모은 물건 · 모은 동네를 공용 자리(saleData)로 한 번 옮긴다.
 *  공용 자리에 이미 있으면 건드리지 않는다. 옮겼으면 true. 예전 자리는 그 계정 본인만 읽을 수 있어, 쌓은 계정으로 열 때 옮겨진다 */
export const migrateLegacyAgentData = async (uid: string): Promise<boolean> => {
  if (!uid) return false;
  let moved = false;
  try {
    const [shared, legacy] = await Promise.all([getDoc(metaRef()), getDoc(legacyMetaRef(uid)).catch(() => null)]);
    if (!shared.exists() && legacy?.exists()) {
      const meta = legacy.data() as AgentDatasetMeta;
      const snaps = await getDocs(collection(db(), 'users', uid, 'datasets', 'main', 'chunks'));
      const parts = snaps.docs.map((d) => d.data() as { i?: number; data?: string; v?: number })
        .filter((d) => typeof d.i === 'number' && d.i < meta.chunks && typeof d.data === 'string');
      if (parts.length) {
        // 조각을 먼저, 요약을 나중에 — 요약이 보이는 순간 조각이 다 있게
        for (const p of parts) await setDoc(doc(chunksCol(), String(p.i)), { i: p.i, data: p.data, v: 1 });
        await setDoc(metaRef(), { count: meta.count, chunks: meta.chunks, version: 1, by: 'web', updatedAt: serverTimestamp() });
        moved = true;
      }
    }
  } catch (e) {
    console.warn('[saleData] 모은 물건 옮기기 실패', e);
  }
  try {
    const [shared, legacy] = await Promise.all([getDoc(coverageRef()), getDoc(legacyCoverageRef(uid)).catch(() => null)]);
    const dongs = legacy?.exists() ? (legacy.data() as { dongs?: Record<string, unknown> }).dongs : null;
    if (!shared.exists() && dongs && Object.keys(dongs).length) { await setDoc(coverageRef(), { dongs }); moved = true; }
  } catch (e) {
    console.warn('[saleData] 모은 동네 옮기기 실패', e);
  }
  try {
    const [shared, legacy] = await Promise.all([getDoc(queueRef()), getDoc(legacyQueueRef(uid)).catch(() => null)]);
    const items = legacy?.exists() ? (legacy.data() as { items?: unknown }).items : null;
    if (!shared.exists() && Array.isArray(items) && items.length) { await setDoc(queueRef(), { items: items.slice(0, 200) }); moved = true; }
  } catch (e) {
    console.warn('[saleData] 대기열 옮기기 실패', e);
  }
  return moved;
};
