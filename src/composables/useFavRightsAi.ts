/* 관심물건 AI 권리분석 자동 줄(2026-11-20 사용자 '자동으로 돌리기').
 * 1) 마이가 법원에서 받은 매각물건명세서 PDF(saleData/dayList/spec)를 등록한 물건의 '매물명세' 칸에 붙인다.
 * 2) 매물명세가 있고 분석 안 한 물건을 이 브라우저에서 내 제미나이 키로 한 건씩 분석해 물건에 저장한다.
 * 한도에 걸리면 그 자리에서 멈추고 오늘은 쉰다('한도 · 내일 다시'). '지금이어하기'로 바로 다시 돌릴 수 있다 */
import { computed, ref, watch, type Ref } from 'vue';
import { loadSpecFile, loadSpecHeads, sendAgentCommand, type SpecHead, type TankFav } from '../services/agentRemote';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { caseKey } from '../services/bidPredict';
import { saveSitePdf } from '../services/sitePhotoRepository';
import { collectRightsParts } from '../services/rightsDocParts';
import { askRightsAnalysis } from '../services/geminiRights';
import { buildRightsFacts } from '../services/rightsFacts';
import { getGeminiKey, isGeminiOn, loadGeminiPrefs } from '../services/geminiPdf';
import { aiErrorText } from '../services/userMessage';
import type { AuctionDetail } from '../types/auction';

export type FavAiState = 'done' | 'run' | 'wait' | 'limit' | 'closed' | 'before' | 'miss';
/** 칩 이름 — 분석됨 · 분석 중 · 대기 · 한도 걸림 · 공개 전 · 받기 전 · 못 찾음 */
export const FAV_AI_LABEL: Record<FavAiState, string> = { done: '분석됨', run: '분석 중', wait: '대기', limit: '한도 걸림', closed: '공개 전', before: '받기 전', miss: '못 찾음' };

const AUTO_KEY = 'favai.auto.v1';
const LIMIT_KEY = 'favai.limit.v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const readLs = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeLs = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* 그만 */ } };
const hasSpecDoc = (a: AuctionDetail | undefined) => !!a?.extraPhotos?.['doc.saleSpec']?.[0];

export const useFavRightsAi = (items: Ref<TankFav[]>) => {
  const auctions = useAuctionStore();
  const auth = useAuthStore();
  const heads = ref<Record<string, SpecHead>>({});
  const auto = ref(readLs(AUTO_KEY) !== 'off');
  const limitDay = ref(readLs(LIMIT_KEY));
  const limited = computed(() => limitDay.value === today());
  const runId = ref('');
  const note = ref('');
  const failed = ref(new Set<string>());

  const reloadHeads = async () => { try { heads.value = await loadSpecHeads(); } catch { /* 규칙 배포 전 · 망 — 그만 */ } };

  /** 등록한 관심물건 — 사건 열쇠 → 물건 */
  const byKey = computed(() => { const m = new Map<string, AuctionDetail>(); auctions.auctions.forEach((a) => { const k = caseKey(a.caseNumber); if (k) m.set(k, a); }); return m; });
  const mineFav = computed(() => items.value.filter((f) => byKey.value.has(f.key)));
  const stateOf = (f: TankFav): FavAiState => {
    const a = byKey.value.get(f.key); const h = heads.value[f.key];
    if (a?.rightsAi) return 'done';
    if (a && runId.value === a.id) return 'run';
    if (hasSpecDoc(a) || h?.state === 'ok') return limited.value ? 'limit' : 'wait';
    if (h?.state === 'none') return 'closed';
    if (h && h.state !== 'ok') return 'miss';
    return 'before';
  };
  /** 줄에 셀 물건 — 등록한 진행 · 예정만(매각 · 종국은 분석할 까닭이 없다) */
  const liveFav = computed(() => mineFav.value.filter((f) => f.status === '진행' || f.status === '예정'));
  const counts = computed(() => { const c: Record<FavAiState, number> = { done: 0, run: 0, wait: 0, limit: 0, closed: 0, before: 0, miss: 0 }; liveFav.value.forEach((f) => { c[stateOf(f)] += 1; }); return c; });

  /** 법원에서 받을 사건 — 등록한 진행 · 예정 물건 중 매물명세가 없고 받은 PDF 도 없는 것(공개 전은 다시 물어본다) */
  const toFetch = computed(() => mineFav.value.filter((f) => (f.status === '진행' || f.status === '예정') && !hasSpecDoc(byKey.value.get(f.key)) && heads.value[f.key]?.state !== 'ok' && !byKey.value.get(f.key)?.rightsAi));
  /** 명세서받기 진행 — sending(보내는 중) · sentId(보낸 명령 id, 마이가 받으면 상태 lastCmd 가 같아진다) */
  const sending = ref(false);
  const sentId = ref('');
  const fetchSpecs = async () => {
    const cases = toFetch.value.slice(0, 30).map((f) => { const m = f.key.match(/^(\d{4})-(\d+)(?:\((\d+)\))?$/); return m ? `${f.court}|${m[1]}타경${m[2]}|${m[3] ?? ''}|${f.key}` : ''; }).filter(Boolean);
    if (!cases.length) { note.value = '법원에서 받을 사건이 없습니다(등록한 진행 물건 모두 매물명세가 있습니다).'; return; }
    sending.value = true; note.value = ''; sentId.value = '';
    try { sentId.value = await sendAgentCommand('', 'spec', { cases }); }
    catch { note.value = '명령을 보내지 못했습니다. 다시 해 주세요.'; }
    finally { sending.value = false; }
  };

  let pumping = false;
  const pump = async () => {
    if (pumping || !auto.value || !auth.uid) return;
    pumping = true;
    try {
      /* 1) 받은 PDF 를 매물명세 칸에 붙인다 */
      for (const f of liveFav.value) {
        const a = byKey.value.get(f.key); const h = heads.value[f.key];
        if (!a || hasSpecDoc(a) || a.rightsAi || h?.state !== 'ok') continue;
        const file = await loadSpecFile(h).catch(() => null); if (!file) continue;
        const entry = await saveSitePdf(a.id, auth.uid, file);
        const fresh = byKey.value.get(f.key) ?? a;
        await auctions.saveAuction({ ...fresh, extraPhotos: { ...(fresh.extraPhotos ?? {}), 'doc.saleSpec': [entry, ...(fresh.extraPhotos?.['doc.saleSpec'] ?? [])] } }, { silent: true });
      }
      /* 2) 분석 — 한 건씩 */
      if (limited.value) return;
      for (const f of liveFav.value) {
        if (!auto.value || limited.value) break;
        const a = byKey.value.get(f.key);
        if (!a || a.rightsAi || !hasSpecDoc(a) || failed.value.has(a.id)) continue;
        if (!isGeminiOn()) await loadGeminiPrefs(auth.uid).catch(() => undefined);
        if (!isGeminiOn()) { note.value = getGeminiKey() ? 'AI 자동 분석이 꺼져 있습니다 — 더보기 > AI 자동 분석에서 켜 주세요.' : 'AI 키가 없습니다 — 더보기 > AI 자동 분석에서 등록해 주세요.'; return; }
        runId.value = a.id;
        try {
          const parts = await collectRightsParts(a.extraPhotos);
          if (!parts.length) { failed.value.add(a.id); continue; }
          const result = await askRightsAnalysis(getGeminiKey(), parts, buildRightsFacts(a));
          const fresh = byKey.value.get(f.key) ?? a;
          await auctions.saveAuction({ ...fresh, rightsAi: result }, { silent: true });
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          if (/quota|exhaust|rate.?limit|429|한도/i.test(raw)) { limitDay.value = today(); writeLs(LIMIT_KEY, limitDay.value); note.value = 'AI 사용 한도에 걸려 멈췄습니다 — 내일 화면을 열면 이어서 합니다.'; break; }
          failed.value = new Set([...failed.value, a.id]);
          note.value = `${f.key.replace('-', '타경')} — ${aiErrorText(raw)}`;
        } finally { runId.value = ''; }
      }
    } catch { note.value = '자동 분석 중 오류가 났습니다. 새로고침해 주세요.'; }
    finally { pumping = false; }
  };
  const setAuto = (on: boolean) => { auto.value = on; writeLs(AUTO_KEY, on ? '' : 'off'); if (on) void pump(); };
  /** 지금이어하기 — 한도 표시를 지우고 바로 다시 */
  const resume = () => { limitDay.value = ''; writeLs(LIMIT_KEY, ''); failed.value = new Set(); void pump(); };

  /* 등록 물건 · 받은 명세서가 바뀌면 다시 돈다(돌고 있으면 그대로) */
  let t: ReturnType<typeof setTimeout> | null = null;
  watch([() => mineFav.value.map((f) => f.key).join(','), heads], () => { if (t) clearTimeout(t); t = setTimeout(() => { void pump(); }, 1500); });

  return { liveFav, heads, reloadHeads, counts, stateOf, toFetch, fetchSpecs, sending, sentId, auto, setAuto, limited, resume, runId, note, pump };
};
