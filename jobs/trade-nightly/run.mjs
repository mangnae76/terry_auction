// 새벽 실거래 적재 — 매일 새벽 1시(한국)에 GitHub Actions 가 돌린다 (.github/workflows/trade-nightly.yml).
//
//  1) 대상: 지금까지 누군가 조회해서 DB(cacheTradeMonth)에 남은 지역 · 종류 전부 (+ EXTRA_TARGETS 로 손으로 더한 것)
//  2) 최근 3달: 날마다 새로 받아 덮어쓴다 — 신고 기한 30일 · 계약해제가 늦게 붙어 계속 바뀐다
//  3) 그 전 달(4년치까지): 없거나 1년 가까이 된 달만 받는다 — 하룻밤 BACKFILL_BUDGET 번까지, 최근 달부터
//  화면은 이 문서를 먼저 읽으므로, 여기서 채워 둔 달은 국토부를 부르지 않는다.
//
// 환경변수
//  FIREBASE_SERVICE_ACCOUNT  서비스 계정 JSON (GitHub 비밀값)
//  DATA_GO_KR_KEY            공공데이터포털 서비스키 (GitHub 비밀값)
//  EXTRA_TARGETS             손으로 더할 지역 — '28260:villa,11200:apt' (종류 apt · villa · officetel · single · commercial)
//  BACKFILL_BUDGET           하룻밤 지난 달 채우기에 쓸 최대 호출 수 (기본 1500)
//  DRY_RUN=1                 DB 없이 EXTRA_TARGETS 의 최근 3달만 받아 건수만 찍는다 (시험용)
import { COLLECTION, KIND_PATHS, QuotaError, docId, fetchMonth, parseDocId, ymdAgo } from './rtms.mjs';

const RECENT_MONTHS = 3;          // 0 · 1 · 2 달 전 — 화면이 하루만 믿는 달(publicDataApi.ts monthCacheTtl)
const HISTORY_MONTHS = 49;        // 손품조사 4년치 = 4년 전 그달부터 이번 달까지
const REFILL_AGE_MS = 330 * 24 * 3600 * 1000; // 지난 달은 화면이 1년 믿는다 — 그 전에 새로
const MAX_DOC_BYTES = 1_000_000;  // Firestore 문서 한도(1MiB) 안쪽
const CONCURRENCY = 4;

const DRY = process.env.DRY_RUN === '1';
const serviceKey = process.env.DATA_GO_KR_KEY ?? '';
const budget = Number(process.env.BACKFILL_BUDGET ?? 1500) || 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!serviceKey) { console.error('DATA_GO_KR_KEY 가 없습니다'); process.exit(1); }

/** 'lawd:kind,…' → [{ lawdCd5, path }] */
const extraTargets = () => (process.env.EXTRA_TARGETS ?? '').split(',').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
  const [lawdCd5, kind] = s.split(':');
  const paths = KIND_PATHS[kind];
  if (!/^\d{5}$/.test(lawdCd5) || !paths) { console.warn(`모르는 대상 건너뜀: ${s}`); return []; }
  return paths.map((path) => ({ lawdCd5, path }));
});

/** 여럿을 n 개씩 나눠 돌린다 */
const pool = async (jobs, n) => {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) { const j = jobs[i]; i += 1; await j(); }
  }));
};

const main = async () => {
  let db = null; let FieldValue = null;
  /** 문서 이름 → 적어 둔 시각(ms) */
  const saved = new Map();
  if (!DRY) {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const fs = await import('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}')) });
    db = fs.getFirestore(); FieldValue = fs.FieldValue;
    const snap = await db.collection(COLLECTION).select('savedAt').get();
    snap.docs.forEach((d) => saved.set(d.id, Number(d.get('savedAt')) || 0));
    log(`DB 에 있는 달 문서 ${saved.size.toLocaleString()}개`);
  }

  // 대상 지역 · 종류
  const targets = new Map();
  const add = (t) => targets.set(`${t.lawdCd5}|${t.path}`, t);
  for (const id of saved.keys()) { const p = parseDocId(id); if (p) add(p); }
  extraTargets().forEach(add);
  const list = [...targets.values()];
  log(`대상 ${list.length}개 (지역 × 종류)`);
  if (!list.length) { log('대상이 없습니다 — 끝'); return; }

  const blocked = new Set();   // 오늘 한도에 걸린 주소
  const stat = { written: 0, empty: 0, tooBig: 0, failed: 0, calls: 0, quota: 0 };
  const failures = [];

  const one = async ({ lawdCd5, path }, ymd) => {
    if (blocked.has(path)) return;
    const id = docId(lawdCd5, path, ymd);
    try {
      const { result, calls } = await fetchMonth({ path, lawdCd5, ymd, serviceKey });
      stat.calls += calls;
      if (!result.rows.length) stat.empty += 1;
      if (DRY) { log(`${id} ${result.rows.length}건`); return; }
      const payload = JSON.parse(JSON.stringify(result));   // undefined 없애기 (Firestore 는 못 받는다)
      if (Buffer.byteLength(JSON.stringify(payload)) > MAX_DOC_BYTES) { stat.tooBig += 1; return; }
      await db.collection(COLLECTION).doc(id).set({ savedAt: Date.now(), updatedAt: FieldValue.serverTimestamp(), payload });
      stat.written += 1;
    } catch (err) {
      stat.calls += 1;
      if (err instanceof QuotaError) {
        stat.quota += 1;
        if (!blocked.has(path)) log(`${err.message} — 오늘은 그만: ${path}`);
        blocked.add(path);
        return;
      }
      stat.failed += 1;
      if (failures.length < 20) failures.push(`${id} ${err instanceof Error ? err.message : err}`);
    }
  };

  // 1) 최근 3달 — 모두 새로
  const recent = [];
  for (let age = 0; age < RECENT_MONTHS; age += 1) for (const t of list) recent.push(() => one(t, ymdAgo(age)));
  await pool(recent, CONCURRENCY);
  log(`최근 ${RECENT_MONTHS}달 끝 — 호출 ${stat.calls}`);

  // 2) 지난 달 — 없거나 오래된 것만, 최근 달부터, 정한 호출 수까지
  if (!DRY && budget > 0) {
    const start = stat.calls;
    const older = [];
    const now = Date.now();
    for (let age = RECENT_MONTHS; age < HISTORY_MONTHS; age += 1) {
      for (const t of list) {
        const ymd = ymdAgo(age);
        const at = saved.get(docId(t.lawdCd5, t.path, ymd));
        if (at && now - at < REFILL_AGE_MS) continue;
        older.push(() => (stat.calls - start >= budget ? undefined : one(t, ymd)));
      }
    }
    log(`채울 지난 달 ${older.length}개 (오늘 최대 호출 ${budget})`);
    await pool(older, CONCURRENCY);
  }

  log(`끝 — 저장 ${stat.written} · 0건 ${stat.empty} · 너무 커서 못 담음 ${stat.tooBig} · 실패 ${stat.failed} · 한도 · 미신청 ${stat.quota} · 국토부 호출 ${stat.calls}`);
  failures.forEach((f) => log(`실패 ${f}`));
  // 하나도 못 받았으면 실패로 끝내 GitHub 가 알리게 한다
  if (stat.written === 0 && !DRY && stat.failed + stat.quota > 0) process.exit(1);
};

main().catch((err) => { console.error(err); process.exit(1); });
