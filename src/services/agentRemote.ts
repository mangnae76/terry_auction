// 집 PC 수집 도우미(관리자만) — 웹 시장분석 › 경매사례에서 명령을 보내고, 집 PC agent.py 가 옥션원 · 탱크옥션을 모은다.
// auction-web(src/services/data.ts)과 같은 문서 모양을 쓴다 — 도우미 쪽 코드를 고치지 않고 그대로 붙이려고.
//   users/{uid}/agent/control        웹 → 도우미 {cmd:{id,name,args,at}, stop:{id,at}, webSeenAt}
//   users/{uid}/agent/status         도우미 → 웹 {at, ready, busy, enriching, prog, message, …}
//   users/{uid}/agent/queue          웹 ↔ 도우미 모을 물건 대기열 {items: [{case, addr, at}]} (도우미가 끝난 사건을 뺀다)
//   users/{uid}/agent/coverage       도우미 → 웹 모은 동네 {dongs: {'인천 서구 검암동': {at(ms), n, site, src, months}}}
//   users/{uid}/datasets/main        {count, chunks, version, by, updatedAt}
//   users/{uid}/datasets/main/chunks/{i}  {i, data: 레코드 JSON 글자, v}
// 읽고 쓰기는 운영자 본인만(firestore.rules isAgentOwner). 앱 화면은 쓰지 않는다.
import { collection, doc, getDoc, getDocFromServer, getDocs, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
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
const controlRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'control');
const statusRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'status');
const queueRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'queue');
const coverageRef = (uid: string) => doc(db(), 'users', uid, 'agent', 'coverage');
const metaRef = (uid: string) => doc(db(), 'users', uid, 'datasets', 'main');

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
    : { case: x.case, addr: x.addr ?? '', at: x.at })) });
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
  const snaps = await getDocs(collection(db(), 'users', uid, 'datasets', 'main', 'chunks'));
  const parts = snaps.docs.map((d) => d.data() as { i?: number; data?: string })
    .filter((d) => typeof d.i === 'number' && d.i < meta.chunks)
    .sort((a, b) => (a.i ?? 0) - (b.i ?? 0));
  return { recs: parts.flatMap((p) => parseSaleChunk(p.data)), meta };
};
