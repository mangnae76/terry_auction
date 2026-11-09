<script setup lang="ts">
// 앱 물건상세 › 권리분석 맨 위 — 서류 올리기(매각물건명세서 PDF 하나) · 권리분석 결과(요약 · 권리·세입자 · 확인할일).
// 웹 권리분석 결과(selected.src.html rtResultHtml)와 같은 내용을 앱 폭에 맞춰 위아래로 쌓았다(시안 rights-mock, 2026-11-09).
// 파일 올리기 · AI 분석 · 저장은 물건상세(AuctionDetailPage)가 하던 그대로 — 여기서는 그리고 단추만 알린다.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RIGHTS_STAGE_EVENT, type RightsAi } from '../services/geminiRights';

const props = defineProps<{
  ai: RightsAi | null;
  /** 올려 둔 매각물건명세서 — 없으면 '' */
  specEntry: string;
  specName: string;
  specIsPdf: boolean;
  busy: boolean;
  sec: number;
  err: string;
  /** '1장으로 분석 · 26.11.05 15:49' — 분석한 적 없으면 '' */
  usedText: string;
}>();
const emit = defineEmits<{
  (e: 'pick'): void;
  (e: 'drop', ev: DragEvent): void;
  (e: 'remove'): void;
  (e: 'open'): void;
  (e: 'start'): void;
  (e: 'cancel'): void;
}>();

const over = ref(false);
const onDrop = (ev: DragEvent) => { over.value = false; emit('drop', ev); };

/* 분석하는 동안 — 공통 코드(geminiRights)가 알려 주는 '지금 쓰는 칸'으로 단계 번호를 켠다(웹과 같다) */
const STEPS: Array<[string, string[]]> = [
  ['서류 글자 읽기', ['collect', 'send', 'read']],
  ['이 물건 서류인지 확인', ['docCheck']],
  ['말소기준권리 정리', ['baseRight', 'claimDeadline']],
  ['표를 칸별로 나누기', ['rows']],
  ['세입자 대항력 계산', ['tenants', 'takeoverSummary', 'extinguishSummary']],
  ['주의할 항목 점검', ['risk', 'checks', 'evict', 'conclusion', 'headline', 'compare', 'remarks', 'missingDocs']],
];
const stage = ref('collect');
const onStage = (e: Event) => { const s = (e as CustomEvent<{ stage?: string }>).detail?.stage; if (s) stage.value = s; };
window.addEventListener(RIGHTS_STAGE_EVENT, onStage);
onBeforeUnmount(() => window.removeEventListener(RIGHTS_STAGE_EVENT, onStage));
watch(() => props.busy, (b) => { if (b) stage.value = 'collect'; });
const stepAt = computed(() => Math.max(0, STEPS.findIndex(([, ks]) => ks.includes(stage.value))));

/* 결과 탭 — 고른 탭은 다른 물건 · 새로고침에도 그대로 */
const TABS = [['sum', '요약'], ['rights', '권리·세입자'], ['todo', '확인할일']] as const;
type Tab = (typeof TABS)[number][0];
const TAB_KEY = 'ta.app.rightsTab';
const readTab = (): Tab => { try { const v = localStorage.getItem(TAB_KEY); return v === 'rights' || v === 'todo' ? v : 'sum'; } catch { return 'sum'; } };
const tab = ref<Tab>(readTab());
watch(tab, (t) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* 그만 */ } });

/** 결과가 섰나 — 말소기준권리가 있어야 결과로 본다(웹과 같다) */
const res = computed(() => (props.ai && props.ai.baseRight?.kind !== undefined && (props.ai.baseRight.kind || props.ai.rows.length) ? props.ai : null));
const dot = (d?: string) => String(d || '').slice(0, 10).replace(/-/g, '.');
const won = (v?: string) => { const s = String(v || ''); const n = Number(s.replace(/[^\d]/g, '')); return /\d/.test(s) && Number.isFinite(n) ? n : null; };
const toneOf = (st: string) => (st === '서류상 해당 없음' ? 'ok' : st === '전문가 검토' ? 'bad' : 'warn');

const base = computed(() => res.value?.baseRight ?? { kind: '', date: '', holder: '', rank: '', evidence: '' });
const isBase = (r: { kind: string; date: string }) => !!base.value.kind && r.kind === base.value.kind && dot(r.date) === dot(base.value.date);
const baseRow = computed(() => res.value?.rows.find(isBase));
const verdict = computed(() => res.value?.conclusion.verdict || '주의');
const tone = computed(() => (verdict.value === '입찰 추천' ? 'ok' : verdict.value === '비추천' ? 'bad' : 'warn'));
const tenants = computed(() => res.value?.tenants);
const opp = computed(() => (tenants.value ?? []).filter((t) => t.opposable === '대항력 있음').length);
const noReg = computed(() => !(res.value?.usedDocs ?? []).some((u) => /등기/.test(u)));
const evidence = computed(() => {
  const ev = String(base.value.evidence || '').trim();
  let line = /매각물건명세서|등기/.test(ev) && ev.length > 20 ? ev
    : `매각물건명세서의 '최선순위 설정'(${dot(base.value.date)} ${base.value.kind}${ev ? `, ${ev}` : ''}) 기준.`;
  if (noReg.value && !/등기사항전부증명서로/.test(line)) line += ' 등기사항전부증명서로 권리자와 금액을 확인해 주세요.';
  return line;
});
const checks = computed(() => res.value?.checks);
const needN = computed(() => (checks.value ? checks.value.filter((c) => c.status === '확인 필요').length : null));
const expertN = computed(() => (checks.value ? checks.value.filter((c) => c.status === '전문가 검토').length : null));
const takeRows = computed(() => (res.value?.rows ?? []).filter((r) => r.status === '인수'));
const takeSum = computed(() => {
  const t = takeRows.value;
  if (!t.length) return '0원';
  const ns = t.map((r) => won(r.amount));
  return ns.every((n) => n != null) ? `${ns.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)!.toLocaleString('ko-KR')}원` : '금액 일부 미상';
});
const evLevelTone = computed(() => { const l = res.value?.evict.level; return l === '쉬움' ? 'ok' : l === '높음' ? 'bad' : 'warn'; });
</script>

<template>
  <div class="rp">
    <p class="rp-lead">매각물건명세서 PDF 하나로 권리분석을 보여 드립니다.</p>

    <!-- 서류 올리기 — 매각물건명세서 하나 -->
    <section class="rp-card">
      <div class="rp-h">
        <h2><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M12 11v6M9 14l3-3 3 3" /></svg>서류 올리기</h2>
        <small v-if="usedText && !busy">{{ usedText }}</small>
      </div>
      <div class="rp-doc">
        <div class="rp-doc-h">
          <b>매각물건명세서<small>{{ specEntry && !specIsPdf ? '사진' : 'PDF' }}</small></b>
          <span v-if="specEntry" class="rp-tag ok">올림</span>
          <span class="rp-tag must">필수</span>
        </div>
        <div v-if="specEntry" class="rp-file">
          <button type="button" class="rp-name" @click="emit('open')">{{ specName }}</button>
          <button type="button" class="rp-x" aria-label="매각물건명세서 지우기" :disabled="busy" @click="emit('remove')">×</button>
        </div>
      </div>
      <div
        v-if="!specEntry"
        :class="['rp-drop', { over }]"
        role="button"
        tabindex="0"
        aria-label="매각물건명세서 파일 고르기"
        @click="emit('pick')"
        @keydown.enter.prevent="emit('pick')"
        @dragover.prevent="over = true"
        @dragleave="over = false"
        @drop.prevent="onDrop"
      >
        <span class="ic" aria-hidden="true">📂</span>
        <b>PDF 파일 선택하기</b>
      </div>
      <p v-if="err" class="rp-err">{{ err }}</p>
      <div v-if="busy" class="rp-busy">서류가 많으면 2~3분 걸립니다 · {{ sec }}초<button type="button" @click="emit('cancel')">취소</button></div>
      <button
        type="button"
        :class="['rp-go', { done: !!ai && !busy }]"
        :disabled="busy || !specEntry"
        @click="emit('start')"
      >{{ busy ? '분석 중…' : ai ? '분석 완료' : '권리분석 시작하기' }}</button>
    </section>

    <!-- 권리분석 결과 — 분석 전엔 알 수 있는 것, 분석 중엔 단계, 끝나면 탭 셋 -->
    <section class="rp-card">
      <div class="rp-h">
        <h2><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></svg>{{ busy ? '올린 서류를 읽고 있습니다' : '권리분석 결과' }}</h2>
      </div>

      <template v-if="busy">
        <ul class="rp-steps">
          <li v-for="([t], i) in STEPS" :key="t" :class="i < stepAt ? 'done' : i === stepAt ? 'on' : ''">
            <i>{{ i < stepAt ? '✓' : i + 1 }}</i>{{ t }}<em>{{ i < stepAt ? '완료' : i === stepAt ? '진행 중' : '대기' }}</em>
          </li>
        </ul>
        <div class="rp-tip"><b>잠깐, 알고 가세요</b>말소기준권리는 '낙찰되면 이 권리부터 아래는 지워지는 선'입니다. 이 권리보다 먼저 전입한 세입자가 있는지가 가장 중요합니다.</div>
      </template>

      <template v-else-if="!res">
        <p class="rp-sub0">이 도구로 알 수 있는 것</p>
        <ol class="rp-know">
          <li><b>말소기준권리</b><span>낙찰되면 지워지는 권리와 남는 권리의 경계입니다.</span></li>
          <li><b>세입자 보증금을 물어줘야 하는지</b><span>전입일과 말소기준권리 날짜를 비교해 대항력을 계산합니다.</span></li>
          <li><b>다른 인수 권리</b><span>지분 매각, 대지권, 유치권처럼 서류에 적힌 주의 사항을 골라 드립니다.</span></li>
        </ol>
        <div class="rp-not"><b>이 도구가 하지 않는 것</b>입찰 여부를 대신 정하지 않습니다. 특수한 조건이 보이면 전문가 검토가 필요하다고 알려 드립니다.</div>
      </template>

      <template v-else>
        <div class="rp-tabs" role="tablist">
          <button v-for="[k, t] in TABS" :key="k" type="button" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="tab = k">{{ t }}</button>
        </div>

        <!-- 요약 -->
        <div v-if="tab === 'sum'" class="rp-sec">
          <div :class="['rp-box', 'rp-verdict', tone]">
            <span :class="['rp-tag', tone]">{{ tone === 'ok' ? '✓ ' : '! ' }}{{ verdict }}</span>
            <h4>{{ res.headline || res.conclusion.text || '권리분석을 마쳤습니다.' }}</h4>
            <p>{{ base.kind ? `말소기준권리는 ${dot(base.date)} ${base.kind}입니다.` : '말소기준권리를 서류에서 찾지 못했습니다.' }}<template v-if="tenants"> 세입자 {{ tenants.length }}명 중 대항력 있음 {{ opp }}명입니다.</template></p>
            <p v-if="res.headline && res.conclusion.text" class="con">{{ res.conclusion.text }}</p>
          </div>
          <div class="rp-kpis">
            <div class="rp-kpi"><span>확인 필요</span><b>{{ needN == null ? '-' : `${needN}건` }}</b><small>점검 항목 중 개수</small></div>
            <div class="rp-kpi"><span>전문가 검토</span><b>{{ expertN == null ? '-' : `${expertN}건` }}</b><small>특수 조건 · 위험</small></div>
            <div class="rp-kpi"><span>세입자</span><b>{{ tenants ? `${tenants.length}명` : '-' }}</b><small>{{ tenants ? `대항력 있음 ${opp}명` : '다시 분석하면 채워집니다' }}</small></div>
          </div>
          <div class="rp-box">
            <h4>말소기준권리</h4>
            <p class="rp-sub">낙찰되면 이 권리와 그 아래 권리는 원칙적으로 모두 지워집니다.</p>
            <div class="rp-base">
              <b>{{ base.kind ? `${dot(base.date)} · ${base.kind}` : '찾지 못했습니다' }}</b>
              <span>{{ base.holder ? `${base.holder}${baseRow?.amount ? ` · ${baseRow.amount}` : ''}` : '권리자 · 금액은 등기사항전부증명서에서 확인' }}</span>
            </div>
            <div v-if="base.kind" class="rp-lab"><span class="rp-tag gray">근거</span><span>{{ evidence }}</span></div>
            <div v-if="res.claimDeadline" class="rp-lab"><span class="rp-tag gray">배당요구종기</span><span>{{ dot(res.claimDeadline) }}</span></div>
          </div>
          <div v-if="res.evict.level" class="rp-box">
            <h4>명도 난이도 <span :class="['rp-tag', evLevelTone]">{{ res.evict.level }}</span></h4>
            <p v-if="res.evict.reason" class="rp-txt">{{ res.evict.reason }}</p>
            <p v-if="res.evict.advice" class="rp-txt">{{ res.evict.advice }}</p>
          </div>
          <div class="rp-used">
            <b>분석에 쓴 서류 {{ res.usedDocs.join(' · ') || '-' }}</b>
            <p v-if="noReg">등기사항전부증명서 없이 분석한 결과입니다. 말소기준권리의 권리자 · 금액과 그보다 앞선 권리는 등기부로 꼭 확인해 주세요.</p>
            <p v-if="res.missingDocs.length">따로 떼어 확인하면 좋은 서류 — {{ res.missingDocs.join(' · ') }}</p>
          </div>
        </div>

        <!-- 권리·세입자 -->
        <div v-else-if="tab === 'rights'" class="rp-sec">
          <div class="rp-box">
            <h4>지워지는 권리와 떠안는 권리</h4>
            <p class="rp-sub">매각물건명세서 기준, 말소기준권리와 '매각으로 소멸되지 않는 권리' 칸</p>
            <div v-if="res.rows.length" class="rp-rows">
              <div v-for="(r, i) in res.rows" :key="i" :class="['rp-row', { take: r.status === '인수', base: isBase(r) }]">
                <div class="t"><b>{{ r.kind }}</b><span v-if="isBase(r)" class="rp-tag base">말소기준권리</span><span :class="['rp-tag', r.status === '인수' ? 'bad' : 'ok']">{{ r.status }}</span></div>
                <div class="d">{{ [dot(r.date), r.holder, r.rank].filter(Boolean).join(' · ') }}</div>
                <div class="a">{{ r.amount || '금액 미상' }}</div>
                <p v-if="r.note">{{ r.note }}</p>
              </div>
            </div>
            <p v-else class="rp-again">서류에서 읽은 권리가 없습니다.</p>
            <div class="rp-sumline"><b>낙찰자가 떠안는 권리</b><b :class="['v', { bad: takeRows.length }]">{{ takeRows.length }}건 · {{ takeSum }}</b></div>
          </div>
          <div class="rp-box">
            <h4>세입자 확인</h4>
            <p class="rp-sub">매각물건명세서의 점유자 표 기준 · 점유자 성명 칸 하나가 한 명입니다</p>
            <p v-if="!tenants" class="rp-again">다시 분석하면 세입자 카드가 채워집니다.</p>
            <p v-else-if="!tenants.length" class="rp-again">점유자 표에 세입자가 없습니다.</p>
            <div v-for="(t, i) in tenants ?? []" :key="i" class="rp-ten">
              <div class="h"><b>{{ t.name }}</b><span :class="['rp-tag', t.opposable === '대항력 있음' ? 'bad' : t.opposable === '대항력 없음' ? 'ok' : 'warn']">{{ t.opposable }}</span></div>
              <p v-if="[t.part, t.kind, t.source].filter(Boolean).length" class="meta">{{ [t.part, t.kind, t.source].filter(Boolean).join(' · ') }}</p>
              <dl>
                <div><dt>전입일</dt><dd>{{ dot(t.moveIn) || '-' }}</dd></div>
                <div><dt>확정일자</dt><dd>{{ dot(t.fixed) || '-' }}</dd></div>
                <div><dt>배당요구</dt><dd>{{ t.claim || '-' }}</dd></div>
                <div><dt>보증금</dt><dd>{{ t.deposit || '-' }}</dd></div>
              </dl>
              <div class="pay"><b>내가 물어줄 수 있는 돈</b><b class="v">{{ t.payBack || '-' }}</b></div>
              <div v-if="t.why" class="rp-gray"><b>왜 그런가요?</b><p>{{ t.why }}</p></div>
            </div>
            <div v-if="res.compare" class="rp-gray"><b>서류 칸끼리 비교</b><p>{{ res.compare }}</p></div>
            <div v-if="res.remarks" class="rp-gray"><b>비고란 원문</b><p>{{ res.remarks }}</p></div>
          </div>
        </div>

        <!-- 확인할일 -->
        <div v-else class="rp-sec">
          <div class="rp-box">
            <h4>주의 항목 점검</h4>
            <p class="rp-sub">올린 서류에서 찾은 내용 기준입니다. 서류에 없다고 문제가 없다는 뜻은 아닙니다.</p>
            <p v-if="!checks || !checks.length" class="rp-again">다시 분석하면 확인할 일 여섯 가지가 채워집니다.</p>
            <ul v-else class="rp-checks">
              <li v-for="(c, i) in checks" :key="i" :class="toneOf(c.status)">
                <div><b>{{ c.item }}</b><p>{{ c.text }}</p></div>
                <span :class="['rp-tag', toneOf(c.status)]">{{ c.status }}</span>
              </li>
            </ul>
            <div v-if="res.risk.items.length" class="rp-gray"><b>그 밖에 걸리는 것</b><ul><li v-for="(t, i) in res.risk.items" :key="i">{{ t }}</li></ul></div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.rp { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.rp-lead { margin: 0; background: #eef3ff; border-radius: 10px; padding: 9px 11px; font-size: 12.5px; font-weight: 700; color: #1f3a72; line-height: 1.5; }
.rp-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px; }
.rp-h { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; }
.rp-h h2 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; display: inline-flex; align-items: center; gap: 5px; }
.rp-h h2 svg { color: #2a3f8f; flex: 0 0 auto; }
.rp-h small { margin-left: auto; font-size: 11px; color: #9ca3af; white-space: nowrap; }
.rp-tag { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; font-size: 11px; font-weight: 700; white-space: nowrap; background: #eef1f8; color: #374151; }
.rp-tag.ok { background: #e6f4ea; color: #1b7f3b; }
.rp-tag.warn { background: #fff4e5; color: #b45309; }
.rp-tag.bad { background: #fde8e8; color: #dc2626; }
.rp-tag.base { background: #2a3f8f; color: #fff; }
.rp-tag.must { margin-left: auto; color: #ff0000; box-shadow: inset 0 0 0 1px #ff0000; background: #fff5f5; }

/* 서류 올리기 */
.rp-doc { background: #f7f9fd; border: 1px solid #e8ebf1; border-radius: 10px; padding: 9px 10px; }
.rp-doc-h { display: flex; align-items: center; gap: 6px; }
.rp-doc-h b { font-size: 13px; font-weight: 800; color: #111827; }
.rp-doc-h b small { margin-left: 3px; font-size: 11px; font-weight: 500; color: #6b7280; }
.rp-file { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.rp-name { flex: 1 1 auto; min-width: 0; border: 0; background: none; padding: 0; text-align: left; font-family: inherit; font-size: 12px; color: #2b6df3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.rp-x { flex: 0 0 20px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 20px; min-width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #6b7280; color: #fff; font-size: 13px; line-height: 1; cursor: pointer; }
.rp-x:disabled { opacity: .45; }
.rp-drop { margin-top: 8px; border: 1.5px dashed #c9d3ea; border-radius: 10px; padding: 12px 10px; text-align: center; background: #fbfcff; cursor: pointer; }
.rp-drop.over { border-color: #2b6df3; background: #eef3ff; }
.rp-drop .ic { display: block; font-size: 20px; line-height: 1; }
.rp-drop b { display: block; margin-top: 3px; font-size: 13px; font-weight: 800; color: #111827; }
.rp-err { margin: 8px 0 0; font-size: 12px; color: #dc2626; line-height: 1.5; }
.rp-busy { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: #6b7280; }
.rp-busy button { margin-left: auto; height: 26px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #374151; cursor: pointer; }
.rp-go { display: block; width: 100%; height: 42px; margin-top: 8px; border: 0; border-radius: 8px; background: #2a3f8f; color: #fff; font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.rp-go.done { background: #eef1f8; color: #374151; }
.rp-go:disabled { background: #c7cedd; color: #fff; cursor: default; }

/* 분석 전 · 분석 중 */
.rp-sub0 { margin: 0 0 8px; font-size: 12px; color: #6b7280; }
.rp-know { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; counter-reset: k; }
.rp-know li { position: relative; padding-left: 30px; counter-increment: k; }
.rp-know li::before { content: counter(k); position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: #eef3ff; color: #2b6df3; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
.rp-know b { display: block; font-size: 13px; font-weight: 800; color: #111827; }
.rp-know span { display: block; margin-top: 1px; font-size: 11.5px; color: #6b7280; line-height: 1.5; }
.rp-not { margin-top: 10px; background: #f6f7fa; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: #6b7280; line-height: 1.55; }
.rp-not b { display: block; margin-bottom: 2px; font-size: 12px; color: #374151; }
.rp-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.rp-steps li { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid #e8ebf1; border-radius: 8px; font-size: 12.5px; color: #374151; }
.rp-steps li i { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; font-style: normal; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; background: #eef1f8; color: #6b7280; }
.rp-steps li em { margin-left: auto; font-style: normal; font-size: 11px; color: #9ca3af; }
.rp-steps li.done i { background: #1b7f3b; color: #fff; }
.rp-steps li.done em { color: #1b7f3b; }
.rp-steps li.on { border-color: #b9c6ee; background: #f6f8ff; font-weight: 700; color: #111827; }
.rp-steps li.on i { background: #2b6df3; color: #fff; }
.rp-steps li.on em { color: #2b6df3; font-weight: 700; }
.rp-tip { margin-top: 8px; background: #fff4e5; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: #6b4a12; line-height: 1.55; }
.rp-tip b { display: block; margin-bottom: 2px; font-size: 12px; }

/* 결과 탭 */
.rp-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid #d6dbe6; }
.rp-tabs button { flex: 1; padding: 7px 0; border: 0; border-radius: 8px 8px 0 0; background: #e6eaf2; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; }
.rp-tabs button.on { background: #fff; color: #2b6df3; box-shadow: inset 0 1px 0 #d6dbe6, inset 1px 0 0 #d6dbe6, inset -1px 0 0 #d6dbe6; margin-bottom: -1px; }
.rp-sec { display: flex; flex-direction: column; gap: 8px; }
.rp-box { border: 1px solid #e8ebf1; border-radius: 10px; padding: 10px; }
.rp-box h4 { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #111827; }
.rp-sub { margin: 3px 0 0; font-size: 11.5px; color: #6b7280; line-height: 1.5; }
.rp-verdict h4 { display: block; margin-top: 7px; font-size: 14px; line-height: 1.45; }
.rp-verdict.ok { border-color: #cfe8d6; }
.rp-verdict.ok h4 { color: #1b7f3b; }
.rp-verdict.warn h4 { color: #b45309; }
.rp-verdict.bad h4 { color: #dc2626; }
.rp-verdict p { margin: 5px 0 0; font-size: 12px; color: #374151; line-height: 1.6; }
.rp-verdict p.con { color: #6b7280; }
.rp-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.rp-kpi { border: 1px solid #e8ebf1; border-radius: 10px; padding: 8px; }
.rp-kpi span { font-size: 11px; font-weight: 700; color: #374151; }
.rp-kpi b { display: block; margin-top: 2px; font-size: 18px; font-weight: 800; color: #111827; font-variant-numeric: tabular-nums; }
.rp-kpi small { display: block; margin-top: 2px; font-size: 10.5px; color: #6b7280; line-height: 1.4; }
.rp-base { margin-top: 8px; background: #fff6ef; border: 1px solid #f6cfae; border-radius: 8px; padding: 9px 10px; }
.rp-base b { display: block; font-size: 14px; font-weight: 800; color: #111827; }
.rp-base span { display: block; margin-top: 3px; font-size: 12px; color: #374151; }
.rp-lab { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px; align-items: start; margin-top: 7px; font-size: 11.5px; color: #374151; line-height: 1.5; }
.rp-lab .rp-tag { justify-content: center; }
.rp-txt { margin: 6px 0 0; font-size: 12px; color: #374151; line-height: 1.6; }
.rp-used { background: #fff6ef; border: 1px solid #f6cfae; border-radius: 10px; padding: 9px 10px; font-size: 11.5px; color: #374151; line-height: 1.55; }
.rp-used b { color: #8a4b12; font-weight: 800; }
.rp-used p { margin: 4px 0 0; }
.rp-again { margin: 8px 0 0; font-size: 12px; color: #9ca3af; }
.rp-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.rp-row { border: 1px solid #e8ebf1; border-radius: 8px; padding: 7px 9px; }
.rp-row.take { border-color: #f5c2c2; background: #fff8f8; }
.rp-row.base { border-color: #b9c6ee; background: #f6f8ff; }
.rp-row .t { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.rp-row .t b { font-size: 13px; font-weight: 800; color: #111827; }
.rp-row .d { margin-top: 3px; font-size: 11.5px; color: #6b7280; }
.rp-row .a { margin-top: 2px; font-size: 12px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
.rp-row p { margin: 3px 0 0; font-size: 11.5px; color: #6b7280; line-height: 1.5; }
.rp-sumline { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #eef1f6; font-size: 12.5px; }
.rp-sumline .v { color: #1b7f3b; }
.rp-sumline .v.bad { color: #dc2626; }
.rp-ten { margin-top: 8px; padding-top: 8px; border-top: 1px solid #eef1f6; }
.rp-ten .h { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rp-ten .h b { font-size: 13px; font-weight: 800; color: #111827; }
.rp-ten .meta { margin: 3px 0 0; font-size: 11.5px; color: #6b7280; }
.rp-ten dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 7px 0 0; }
.rp-ten dl div { background: #f7f9fd; border-radius: 6px; padding: 6px 8px; min-width: 0; }
.rp-ten dt { font-size: 10.5px; color: #6b7280; }
.rp-ten dd { margin: 1px 0 0; font-size: 12.5px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.rp-ten .pay { display: flex; justify-content: space-between; align-items: center; margin-top: 7px; background: #e6f4ea; border-radius: 6px; padding: 7px 9px; font-size: 12.5px; }
.rp-ten .pay .v { color: #1b7f3b; font-size: 14px; }
.rp-gray { margin-top: 8px; background: #f6f7fa; border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #374151; line-height: 1.55; }
.rp-gray b { display: block; font-size: 12px; font-weight: 800; color: #111827; }
.rp-gray p { margin: 3px 0 0; }
.rp-gray ul { margin: 4px 0 0; padding-left: 18px; }
.rp-checks { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.rp-checks li { display: flex; align-items: flex-start; gap: 8px; border: 1px solid #e8ebf1; border-radius: 8px; padding: 8px 9px; }
.rp-checks li > div { flex: 1 1 auto; min-width: 0; }
.rp-checks b { font-size: 12.5px; font-weight: 800; color: #111827; }
.rp-checks p { margin: 2px 0 0; font-size: 11.5px; color: #6b7280; line-height: 1.5; }
</style>
