<script setup lang="ts">
/* 사건 판단 표 — 물건등록 › 관심물건과 매각분석 › 저가매수가 같이 쓰는 한 표(2026-11-20 사용자 '두 표가 달라야 될 이유가 없다').
 * 머리 · 사건 · 주소 | 감정가 · 최저가 | 기일 · 유찰 | 비슷한 물건 평당 감정가 | 대비 | 감정가 대비 이득 | 실거래가 같은평형 | 최저가 대비 이득 | 처리.
 * 줄 꼴 · 칸 폭 · 색은 이 한 곳 — 탭마다 다른 것(분류 · 관심도 · 펼침)은 속성으로 */
import { ref } from 'vue';
import { buildingAgeText } from '../utils/buildingAge';
import { propTypeName } from '../utils/propertyType';
import { LB_REL_MARK as RELMARK, lbMktRel, type LowBuyRow } from '../services/lowBuy';
import { favRound } from '../services/tankFav';

export type JudgeRow = {
  /** 줄 열쇠(탱크 tid · 사건 열쇠) */
  id: string;
  /** 사건 열쇠 '2025-1788(1)' */
  key: string;
  /** 탱크 사건 번호 — 사진 단추(없으면 단추 잠금) */
  tid: string;
  kind: string;
  /** 탱크 분류 · 관심도 — 관심물건만 */
  cat?: string;
  pri?: number;
  caseNo: string;
  /** 물건번호 — 없으면 '' */
  pn: string;
  /** '인천 14계' 처럼 짧게 — 모르면 '' */
  court: string;
  addr: string;
  /** 전용 ㎡ */
  area: number;
  appr: number;
  min: number;
  fails: number;
  /** 다음 기일(진행) 또는 마지막 기일 */
  date: string;
  /** '진행' 이면 판단 칸을 보인다 */
  status: string;
  /** 진행이 아닐 때 기일 칸 아래 글(매각 · 종국 …) */
  stateText: string;
  /** 저가매수 계산 줄 — 없으면 null */
  lb: LowBuyRow | null;
  /** 판단 칸을 못 채울 때 그 자리 글 */
  judgeMsg: string;
  /** 이미 물건목록에 있음 */
  registered: boolean;
};

const props = withDefaults(defineProps<{ rows: JudgeRow[]; busyId?: string; openId?: string; expandable?: boolean; empty?: string }>(), { busyId: '', openId: '', expandable: false, empty: '' });
/** 화면 주소 — 맨 앞 시 · 도('인천광역시' · '인천' · '경기도')는 뺀다 */
const noSido = (a: string) => a.replace(/^\s*(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|충북|충남|전라북|전라남|전북|전남|경상북|경상남|경북|경남|제주)[가-힣]*\s+/, '');
/** 주소 복사 — 괄호 안 도로명 · 외 n필지는 뺀다(낙찰가예측 주소복사와 같은 글) */
const copiedId = ref('');
let copyTimer: ReturnType<typeof setTimeout> | null = null;
const copyAddr = async (r: JudgeRow) => {
  const text = r.addr.replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지\s*$/, '').trim();
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* 그만 */ } ta.remove(); }
  copiedId.value = r.id; if (copyTimer) clearTimeout(copyTimer); copyTimer = setTimeout(() => { copiedId.value = ''; }, 1500);
};
const emit = defineEmits<{ register: [row: JudgeRow]; photo: [row: JudgeRow]; toggle: [row: JudgeRow] }>();

const won = (v: number) => Math.round(v).toLocaleString('ko-KR');
const man = (v: number) => `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
const d8 = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : '—');
const stars = (n: number) => (n > 0 ? '★'.repeat(Math.min(5, n)) : '');
const PY = 3.305785;
const pyOf = (m2: number) => (m2 > 0 ? (m2 / PY).toFixed(2) : '');
const pctSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`;
const gainText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${man(Math.abs(v))}`;
const judged = (r: JudgeRow) => r.status === '진행' && r.lb?.vs != null;
const onRow = (r: JudgeRow) => { if (props.expandable) emit('toggle', r); };
</script>

<template>
  <div class="cjl">
    <p v-if="!rows.length && empty" class="cjl-empty">{{ empty }}</p>
    <div v-if="rows.length" class="it hd" aria-hidden="true"><span>사건 · 주소</span><span class="ctr">감정가 · 최저가</span><span class="ctr">기일 · 유찰</span><span class="ctr">비슷한 물건<br>평당 감정가</span><span class="ctr">비슷한 물건<br>대비</span><span class="ctr">감정가 대비<br>이득</span><span class="ctr">실거래가<br>같은평형</span><span class="ctr">최저가 대비<br>이득</span><span class="ctr">처리</span></div>
    <template v-for="r in rows" :key="r.id">
      <div :class="['it', { hot: r.lb?.hot, on: openId === r.id, click: expandable }]" :role="expandable ? 'button' : undefined" :tabindex="expandable ? 0 : undefined" @click="onRow(r)" @keydown.enter="onRow(r)">
        <div class="addr">
          <div v-if="r.cat || r.pri" class="meta top"><span v-if="r.cat" class="ctg">{{ r.cat }}</span><span v-if="r.pri" class="star">{{ stars(r.pri) }}</span></div>
          <!-- 왼쪽 작은 칸 — 종류 칩(작게) · 그 아래 주소복사(사건 카드처럼, 2026-11-20 사용자) -->
          <div class="lc" @click.stop>
            <span v-if="r.kind" class="type-mark sm">{{ propTypeName(r.kind) }}</span>
            <button v-if="r.addr" type="button" :class="['cpy', { done: copiedId === r.id }]" :data-tip="copiedId === r.id ? '복사됨' : '지번주소 복사'" :aria-label="`${r.caseNo} 주소 복사`" @click="copyAddr(r)"><svg v-if="copiedId !== r.id" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4.5h8.5A2.5 2.5 0 0 1 19 7v11" /><rect x="5" y="7.5" width="11" height="13" rx="2" /></svg><svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>주소</button>
          </div>
          <div class="rc">
          <span class="cno">{{ r.caseNo }}<small v-if="r.pn"> (물번 {{ r.pn }})</small><small v-if="r.court" class="ct">{{ r.court }}</small><span v-if="r.lb?.hot" class="tchip hot cnohot">가격매력</span></span>
          <span class="ad">{{ noSido(r.addr) }}</span>   <!-- 화면엔 시 · 도 빼고(복사는 전체), 2026-11-20 사용자 -->
          <small>전용 {{ r.area > 0 ? `${r.area.toFixed(2)}㎡ / ${pyOf(r.area)}평` : '—' }}<template v-if="r.lb?.year"> · {{ r.lb?.year }}년식 / {{ buildingAgeText(r.lb?.year) }}</template><template v-if="r.lb?.elev != null"> · 엘베 {{ r.lb?.elev ? '있음' : '없음' }}</template></small>
          </div>
        </div>
        <div class="c ctr amtc"><span class="amt"><em class="rd">신건</em><span class="n">{{ r.appr ? won(r.appr) : '미확정' }}</span></span><small>{{ r.appr && r.area ? `평당 ${man(r.appr / (r.area / PY))}` : '' }}</small><span class="amt min"><em class="rd">{{ r.fails + 1 }}차</em><span class="n">{{ r.min ? won(r.min) : '—' }}</span></span><small class="minpy">{{ r.min && r.area ? `평당 ${man(r.min / (r.area / PY))}` : '' }}</small></div>
        <div class="c ctr"><span class="nx">{{ d8(r.date) }}</span>{{ favRound(r).label }}<small v-if="favRound(r).pct">({{ favRound(r).pct }})</small><small v-if="r.status !== '진행'">{{ r.stateText }}</small></div>
        <template v-if="judged(r)">
          <div class="c ctr"><b>{{ man(r.lb!.peerPpy!) }}</b><small>{{ r.lb!.peerN.toLocaleString('ko-KR') }}건</small></div>
          <div class="c ctr"><b :class="r.lb!.vs! < 0 ? 'good' : 'bad'">{{ pctSigned(r.lb!.vs!) }}</b></div>
          <div class="c ctr"><b :class="r.lb!.gain! > 0 ? 'good' : 'bad'">{{ gainText(r.lb!.gain!) }}</b></div>
          <div class="c ctr mk">
            <template v-if="r.lb!.mkt"><b>{{ won(r.lb!.mkt!.price) }}</b><small :class="lbMktRel(r.lb!) === '높음' ? 'rise' : lbMktRel(r.lb!) === '낮음' ? 'fall' : ''">{{ RELMARK[lbMktRel(r.lb!)] }}감정가의 {{ Math.round(r.lb!.mkt!.price / r.lb!.appr * 100) }}%</small><small>{{ r.lb!.mkt!.n }}건 · {{ d8(r.lb!.mkt!.last) }}</small>   <!-- 실거래가가 감정가의 몇 % — ▲ 빨강 100% 위 · ▼ 파랑 아래(2026-11-20 사용자) --></template>
            <span v-else class="mu">—</span>
          </div>
          <div class="c ctr"><b v-if="r.lb!.gainMin != null" :class="r.lb!.gainMin > 0 ? 'good' : 'bad'">{{ gainText(r.lb!.gainMin) }}</b><span v-else class="mu">—</span></div>   <!-- 감정가 대비 → 실거래 → 최저가 대비 순으로 읽히게(2026-11-20 사용자) -->
        </template>
        <div v-else class="c span5 mu">{{ r.judgeMsg }}</div>
        <div class="act" @click.stop>
          <span v-if="r.registered" class="tchip reg">사건등록됨</span>
          <button v-else type="button" class="tfp-btn" :disabled="!!busyId" @click="emit('register', r)">{{ busyId === r.id ? '등록 중' : '사건등록하기' }}</button>
          <button type="button" class="tfp-btn sub" :disabled="!r.tid" @click="emit('photo', r)">사진 ↗</button>
          <button type="button" class="tfp-btn sub" disabled title="매각물건명세서 받기는 준비 중입니다">매물명세 준비중</button>
        </div>
      </div>
      <slot v-if="openId === r.id" name="detail" :row="r" />
    </template>
  </div>
</template>

<style scoped>
.cjl { display: grid; border: 1px solid #e3e7ee; border-radius: 8px; overflow: hidden; background: #fff; }
.cjl-empty { margin: 0; padding: 28px 12px; text-align: center; font-size: 13px; color: #6b7280; }
.it { display: grid; grid-template-columns: minmax(0, 1fr) 124px 80px 80px 72px 76px 132px 76px 104px;   /* 숫자 칸 폭 고르게 · 머리 · 값 모두 가운데(2026-11-20 사용자) */ gap: 10px; align-items: center; padding: 12px; border-bottom: 1px solid #e3e7ee; font-size: 13px; color: #111827; }
.it.click { cursor: pointer; }
.it:last-child { border-bottom: 0; }
.it.hot { background: #fff5f5; }
.it.on { background: #eef3fe; box-shadow: inset 3px 0 0 #2b6df3; }
.meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 3px; }
.type-mark { display: inline-flex; align-items: center; justify-content: center; height: 22px; padding: 0 8px; border-radius: 11px; background: #2b6df3; color: #fff; font-size: 14px; font-weight: 700; line-height: 1; letter-spacing: -0.2px; white-space: nowrap; }   /* 종류 칩 — 선정물건 목록 type-mark 와 같은 꼴 */
.ctg { font-size: 12px; color: #6b7280; border: 1px solid #e3e7ee; border-radius: 4px; padding: 0 5px; line-height: 17px; }
.star { color: #f59e0b; letter-spacing: -1px; }
.cno { display: block; font-size: 15px; font-weight: 800; }
.cno .ct, .addr .cno .ct { margin-left: 8px; color: #4b5563; }
.addr { word-break: keep-all; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; align-items: start; }
.addr .meta.top { grid-column: 1 / -1; }   /* 분류 · 관심도는 맨 위 한 줄 — 종류 칩이 사건번호와 같은 줄에 */
.addr .lc { display: grid; gap: 6px; justify-items: center; padding-top: 1px; }
.type-mark.sm { height: 20px; padding: 0 7px; border-radius: 10px; font-size: 12px; }   /* 작은 종류 칩 — 사건번호 왼쪽 */
.addr .lc .type-mark.sm, .addr .lc .cpy { box-sizing: border-box; width: 56px; min-width: 56px; padding: 0; margin: 0; height: 20px; justify-content: center; vertical-align: top; }   /* 종류 칩 · 주소 칩 같은 폭 — 시작 · 끝 줄 맞춤 */   /* 고정카드처럼 종류 칩 · 주소 칩 같은 크기, 위아래 줄 맞춤 */
.cpy { display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 0 8px; border: 1px solid #c7d7f7; border-radius: 999px; background: #fff; color: #2a5fbf; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }   /* 고정카드 주소 칩(.ih-copy)과 같은 꼴 · 같은 그림 */
.cpy:hover { border-color: #2b6df3; }
.cpy.done { border-color: #15803d; color: #15803d; }
.cno small, .addr .cno small { display: inline; margin-left: 4px; font-size: 12px; font-weight: 400; color: #6b7280; }   /* 물건번호는 사건번호 옆 */
.ad { display: block; line-height: 1.45; }
.addr small, .c small { display: block; color: #6b7280; font-size: 12px; }
.c { font-variant-numeric: tabular-nums; }
.ctr { text-align: center; }
.amt { display: block; font-weight: 700; }
.amt.min { color: #2b6df3; }
.tchip { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: 20px; font-size: 12px; border-radius: 4px; padding: 0 6px; line-height: 1; vertical-align: middle; }   /* 글이 상자 가운데 */
.tchip.hot { background: #fdecec; color: #dc2626; }
.tchip.reg { background: #eef3fe; color: #2b6df3; }
.amt .rd { display: inline-block; text-align: right; font-style: normal; font-size: 12px; font-weight: 400; color: #6b7280; margin-right: 6px; }   /* 금액 옆 작은 차수 — 신건 · 2차, 금액과 글자 한 칸쯤 떨어짐(2026-11-20 사용자) */
.amt .n { display: inline-block; min-width: 10.5ch; text-align: right; font-variant-numeric: tabular-nums; }   /* 금액 폭을 같게 — 신건 · 2차 글이 세로로 한 줄 */
.c small.minpy { color: #2b6df3; }
.c .nx { display: block; font-weight: 400; color: #111827; margin-bottom: 2px; }   /* 날짜 굵기 없음 */
.it.hd { background: #f6f8fb; color: #6b7280; font-size: 12px; font-weight: 600; padding-top: 9px; padding-bottom: 9px; cursor: default; line-height: 1.35; }
.it.hd .ctr { text-align: center; }
.c.amtc { display: grid; justify-content: center; }   /* 금액 묶음은 칸 가운데, 안에서는 끝자리 맞춤 */
.c.amtc .amt, .c.amtc small { text-align: right; }
.c.span5 { grid-column: span 5; text-align: center; font-size: 12px; }
.c.mk small { display: block; white-space: nowrap; }
.c em.apr { font-style: normal; color: #db2777; }
.cno .cnohot { margin-left: 8px; vertical-align: 2px; }
.c b { font-weight: 700; color: #111827; white-space: nowrap; }
.c b.good { color: #16a34a; }
.c b.bad { color: #dc2626; }
.c small.rise { color: #dc2626; }   /* ▲ 실거래가가 감정가보다 높음(감정이 쌈) — 시세표처럼 빨강 */
.c small.fall { color: #2b6df3; }   /* ▼ 낮음(감정이 비쌈) — 파랑 */
.mu { color: #9ca3af; }
.act { display: grid; gap: 6px; justify-items: center; align-self: center; align-content: center; }
.act .tfp-btn, .act .tchip.reg { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: 28px; width: 104px; padding: 0; border-radius: 8px; font-size: 12px; line-height: 1; }   /* 등록됨도 등록하기와 같은 크기 */
.act .tchip.reg { border: 1px solid #c9d6f5; font-weight: 700; }
.tfp-btn { border: 1px solid #d5dbe5; background: #fff; color: #111827; border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tfp-btn:disabled { color: #c2c8d3; cursor: default; }
.act .tfp-btn.sub { font-weight: 400; color: #2b6df3; }
.act .tfp-btn.sub:disabled { color: #9ca3af; background: #f6f8fb; cursor: default; }
@media (max-width: 900px) { .it { grid-template-columns: minmax(0, 1fr); } }
</style>
