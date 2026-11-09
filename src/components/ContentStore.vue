<script setup lang="ts">
// 앱 더보기 › 콘텐츠 — 웹 콘텐츠 화면(전체 · 전자책 · 리포트 · 매뉴얼 · 내콘텐츠)을 폰 폭으로 (2026-11-09 시안 contents-mock).
// 상품은 웹과 같은 자료(운영자가 올린 ebooks). 모바일앱 · 관리 탭은 앱에 두지 않는다.
import { computed, onUnmounted, ref } from 'vue';
import MyContentsPage from '../pages/MyContentsPage.vue';
import whiteLogo from '../assets/icones/log/LOGO_AUCTION_WHITE.png';
import { userMessage } from '../services/userMessage';
import {
  downloadEbook, ebookBodyHtml, ebookReleaseText, ebookSummary, isPaidEbook, isUpcomingEbook,
  subscribeEbooks, subscribeMyReceipts, type Ebook,
} from '../services/ebookRepository';

type Tab = 'all' | 'ebook' | 'report' | 'manual' | 'mine';
const TABS: [Tab, string][] = [['all', '전체'], ['ebook', '전자책'], ['report', '리포트'], ['manual', '매뉴얼'], ['mine', '내콘텐츠']];
const KIND_LABEL: Record<string, string> = { ebook: '전자책', report: '리포트', manual: '매뉴얼', mobile: '모바일앱' };
const TAB_KEY = 'ta.app.storeTab';
const readTab = (): Tab => { try { const v = localStorage.getItem(TAB_KEY) as Tab; return TABS.some(([k]) => k === v) ? v : 'all'; } catch { return 'all'; } };
const tab = ref<Tab>(readTab());
const pickTab = (k: Tab) => { tab.value = k; try { localStorage.setItem(TAB_KEY, k); } catch { /* 고른 탭만 안 남는다 */ } };

const books = ref<Ebook[]>([]);
const err = ref('');
const loaded = ref(false);
const stopBooks = subscribeEbooks((r) => { books.value = r; loaded.value = true; err.value = ''; }, (m) => { err.value = m; loaded.value = true; });
const mineCount = ref(0);
const stopMine = subscribeMyReceipts((r) => { mineCount.value = r.length; }, () => { /* 개수만 안 보인다 */ });
onUnmounted(() => { stopBooks(); stopMine(); });

/** 분류가 없던 책은 전자책 — 모바일앱 상품은 앱에서 보이지 않는다 */
const kindOf = (b: Ebook) => (b.kind === 'report' || b.kind === 'manual' || b.kind === 'mobile' ? b.kind : 'ebook');
const shown = computed(() => books.value.filter((b) => kindOf(b) !== 'mobile' && (tab.value === 'all' || kindOf(b) === tab.value)));

// === 매뉴얼 HTML 표지 — 관리 › 내용 끝의 [표지] … [/표지] (웹 ebCoverSpec 과 같은 규칙) ===
const COVER_RE = /\n*\[표지\]([\s\S]*?)\[\/표지\]\s*$/;
const descOf = (b: Ebook) => String(b.desc || '').replace(COVER_RE, '');
type Cover = { no: string; eyebrow: string; title: string[]; sub: string; steps: [string, string][]; xs: number[]; mark: [number, number, string] | null; chips: string[]; basis: string; asOf: string };
const coverOf = (b: Ebook): Cover | null => {
  const m = String(b.desc || '').match(COVER_RE);
  if (!m) return null;
  const o: Record<string, string> = {};
  m[1].split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  const steps = (o['일정'] || '').split('>').map((s) => s.trim()).filter(Boolean)
    .map((s): [string, string] => { const x = s.match(/^(.*?)\s*\((.*)\)$/); return x ? [x[1], x[2]] : [s, '']; });
  const n = steps.length;
  const xs = steps.map((_, i) => (n > 1 ? 17.17 + (65.66 * i) / (n - 1) : 50));
  const mk = (o['강조'] || '').match(/^(\d+)\s*-\s*(\d+)\s*(.*)$/);
  const mark: Cover['mark'] = mk ? [Number(mk[1]) - 1, Number(mk[2]) - 1, mk[3]] : null;
  return {
    no: o['번호'] || '', eyebrow: o['머리글'] || '', title: (o['제목'] || b.title || '').split('/').map((s) => s.trim()), sub: o['부제'] || '',
    steps, xs, mark: mark && xs[mark[0]] != null && xs[mark[1]] != null ? mark : null,
    chips: (o['칩'] || '').split('·').map((s) => s.trim()).filter(Boolean), basis: o['근거'] || '', asOf: o['기준'] || '',
  };
};

// === 받기 · 보기 ===
/** 링크로 올린 웹 콘텐츠(매뉴얼 등)는 받기 대신 보기. 구글드라이브 링크 · 올린 파일은 받기 */
const isView = (b: Ebook) => !!(b.link && !/(?:drive|docs)\.google\.com/.test(b.link));
const sameSite = (u: string) => { try { return new URL(u, location.href).origin === location.origin; } catch { return false; } };
/** 무료로받기를 누른 책 — 단추가 다운로드로 바뀐다(웹과 같은 두 걸음) */
const ready = ref(new Set<string>());
const busy = ref('');
const toast = ref('');
const say = (m: string) => { toast.value = m; window.setTimeout(() => { if (toast.value === m) toast.value = ''; }, 2600); };
const actLabel = (b: Ebook) => (isUpcomingEbook(b) ? ebookReleaseText(b)
  : isPaidEbook(b) ? `${isView(b) ? '유료보기' : '구매하기'} · ${Number(b.price).toLocaleString('ko-KR')}원`
  : busy.value === b.id ? '받는 중'
  : ready.value.has(b.id) ? (isView(b) ? '보기' : '다운로드')
  : isView(b) ? '무료보기' : '무료로받기');
const failMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message === 'login' ? '로그인하면 받을 수 있습니다.' : userMessage(e, fallback));
/** 보기 창 — 우리 사이트 콘텐츠는 이 화면 위 창으로, 다른 사이트는 새 창 */
const viewing = ref<Ebook | null>(null);
const viewSrc = computed(() => (viewing.value ? `${viewing.value.link}${viewing.value.link.includes('?') ? '&' : '?'}embed=1` : ''));
const openView = async (b: Ebook) => {
  const same = sameSite(b.link);
  const w = same ? null : window.open('', '_blank');
  if (same) viewing.value = b;
  try {
    // 받은 기록(내콘텐츠)을 남긴다 — 창 이동은 여기서 하므로 가짜 창을 넘긴다
    await downloadEbook(b, (w ?? { location: {}, close() { /* 창 없음 */ } }) as unknown as Window);
    ready.value = new Set(ready.value).add(b.id);
  } catch (e) {
    w?.close();
    if (same) viewing.value = null;
    say(failMsg(e, '열지 못했습니다. 잠시 뒤 다시 해 주세요.'));
  }
};
const onAct = async (b: Ebook) => {
  if (isUpcomingEbook(b)) { say('출시예정 콘텐츠입니다. 출시한 뒤 받을 수 있습니다.'); return; }
  if (isPaidEbook(b)) { say('결제는 준비 중입니다 — 결제 연동이 끝나면 열립니다.'); return; }
  if (isView(b)) { await openView(b); return; }
  if (!ready.value.has(b.id)) { ready.value = new Set(ready.value).add(b.id); return; }
  if (busy.value) return;
  busy.value = b.id;
  const w = b.link ? window.open('', '_blank') : null;   // 드라이브 링크면 누른 자리에서 새 창을 먼저 연다
  try {
    await downloadEbook(b, w);
    say('다운로드를 시작했습니다. 콘텐츠 › 내콘텐츠에서 다시 받을 수 있습니다.');
  } catch (e) {
    w?.close();
    say(failMsg(e, '받지 못했습니다. 잠시 뒤 다시 해 주세요.'));
  } finally {
    busy.value = '';
  }
};
const share = async (b: Ebook) => {
  const url = `${location.origin}/web#/store/eb/${encodeURIComponent(b.id)}`;
  if (navigator.share) { try { await navigator.share({ title: b.title, text: ebookSummary(b) || b.title, url }); } catch { /* 닫으면 그만 */ } return; }
  try { await navigator.clipboard.writeText(url); say('링크를 복사했습니다. 붙여 넣어 공유하세요.'); } catch { say('링크를 복사하지 못했습니다.'); }
};

/** 자세히보기 창 */
const info = ref<Ebook | null>(null);
</script>

<template>
  <section class="cs">
    <header class="cs-head">
      <h3>콘텐츠</h3>
      <p>{{ tab === 'mine' ? '다시받기로 언제든 내려받을 수 있습니다.' : '경매 공부와 실전에 바로 쓰는 전자책 · 리포트 · 매뉴얼' }}</p>
    </header>
    <nav class="cs-tabs" role="tablist">
      <button v-for="[k, label] in TABS" :key="k" type="button" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="pickTab(k)">
        {{ label }}<i v-if="k === 'mine' && mineCount">({{ mineCount.toLocaleString('ko-KR') }})</i>
      </button>
    </nav>

    <MyContentsPage v-if="tab === 'mine'" bare />
    <template v-else>
      <p v-if="err" class="cs-empty">{{ err }}</p>
      <p v-else-if="loaded && !shown.length" class="cs-empty">아직 올라온 콘텐츠가 없습니다.</p>
      <div v-else class="cs-grid">
        <article v-for="b in shown" :key="b.id" class="cs-card">
          <button type="button" class="cs-cv" :aria-label="`${b.title} 자세히보기`" @click="info = b">
            <div v-if="coverOf(b)" class="mc" role="img" :aria-label="`${coverOf(b)!.title.join(' ')} 표지`">
              <img class="lg" :src="whiteLogo" alt="" />
              <span v-if="coverOf(b)!.no" class="no">MANUAL {{ coverOf(b)!.no }}</span>
              <span class="eb">{{ coverOf(b)!.eyebrow }}</span>
              <span class="t1">{{ coverOf(b)!.title[0] }}</span>
              <span v-if="coverOf(b)!.title[1]" class="t2">{{ coverOf(b)!.title[1] }}</span>
              <span class="sb">{{ coverOf(b)!.sub }}</span>
              <template v-if="coverOf(b)!.steps.length">
                <i class="bx" /><i class="ln" />
                <template v-if="coverOf(b)!.mark">
                  <i class="bd" :style="{ left: `${coverOf(b)!.xs[coverOf(b)!.mark![0]]}cqw`, width: `${coverOf(b)!.xs[coverOf(b)!.mark![1]] - coverOf(b)!.xs[coverOf(b)!.mark![0]]}cqw` }" />
                  <span class="mk" :style="{ left: `${(coverOf(b)!.xs[coverOf(b)!.mark![0]] + coverOf(b)!.xs[coverOf(b)!.mark![1]]) / 2}cqw` }">{{ coverOf(b)!.mark![2] }}</span>
                </template>
                <template v-for="(x, i) in coverOf(b)!.xs" :key="i">
                  <i :class="['dt', { on: coverOf(b)!.mark && i === coverOf(b)!.mark![0] }]" :style="{ left: `${x}cqw` }" />
                  <span class="lb" :style="{ left: `${x}cqw` }">{{ coverOf(b)!.steps[i][0] }}<small>{{ coverOf(b)!.steps[i][1] }}</small></span>
                </template>
              </template>
              <span v-if="coverOf(b)!.chips.length" class="ch"><b v-for="c in coverOf(b)!.chips" :key="c">{{ c }}</b></span>
              <span class="bs">{{ coverOf(b)!.basis }}</span><span class="ao">{{ coverOf(b)!.asOf }}</span>
            </div>
            <img v-else-if="b.coverUrl" class="cs-img" :src="b.coverUrl" alt="" loading="lazy" />
            <div v-else class="cs-navy"><strong>{{ b.title }}</strong></div>
          </button>
          <div class="cs-body">
            <h4 @click="info = b"><em v-if="b.tag">[{{ b.tag }}]</em> {{ b.title }}</h4>
            <p>{{ ebookSummary(b) }}</p>
            <div class="cs-meta">
              <span class="k">{{ KIND_LABEL[kindOf(b)] }}</span>
              <span :class="isPaidEbook(b) ? 'p' : 'f'">{{ isPaidEbook(b) ? '유료' : '무료' }}</span>
              <span v-if="isUpcomingEbook(b)" class="s">출시예정</span>
              <!-- 칩과 한 줄 — 오른쪽 끝 -->
              <button v-if="descOf(b).trim()" type="button" class="cs-more" @click="info = b">자세히 ›</button>
            </div>
            <div class="cs-act">
              <button type="button" :class="['cs-go', { soon: isUpcomingEbook(b) }]" :disabled="busy === b.id" @click="onAct(b)">{{ actLabel(b) }}</button>
              <button type="button" class="cs-share" aria-label="공유하기" @click="share(b)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
              </button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <Teleport to="body">
      <!-- 자세히보기 — 제목 · 칩 · 한줄설명 · 내용(줄바꿈 그대로, **굵게**) · 받기 -->
      <div v-if="info" class="cs-veil" @click.self="info = null">
        <div class="cs-dlg" role="dialog" aria-modal="true">
          <header>
            <h3><em v-if="info.tag">[{{ info.tag }}]</em> {{ info.title }}</h3>
            <button type="button" class="x" aria-label="닫기" @click="info = null">✕</button>
          </header>
          <div class="cs-meta">
            <span class="k">{{ KIND_LABEL[kindOf(info)] }}</span>
            <span :class="isPaidEbook(info) ? 'p' : 'f'">{{ isPaidEbook(info) ? '유료' : '무료' }}</span>
            <span v-if="isUpcomingEbook(info)" class="s">출시예정</span>
          </div>
          <p v-if="ebookSummary(info)" class="cs-sum">{{ ebookSummary(info) }}</p>
          <!-- eslint-disable-next-line vue/no-v-html -- ebookBodyHtml 이 글을 막고(escape) **굵게** 만 살린다 -->
          <div v-if="descOf(info).trim()" class="cs-desc" v-html="ebookBodyHtml(descOf(info))" />
          <div class="cs-act">
            <button type="button" :class="['cs-go', { soon: isUpcomingEbook(info) }]" :disabled="busy === info.id" @click="onAct(info)">{{ actLabel(info) }}</button>
            <button type="button" class="cs-share" aria-label="공유하기" @click="share(info)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
            </button>
          </div>
          <small class="cs-note">회원가입 후 로그인한 회원만 {{ isView(info) ? '볼' : '받을' }} 수 있습니다.</small>
        </div>
      </div>
      <!-- 보기 — 우리 사이트 콘텐츠(머리띠 숨김 embed=1) -->
      <div v-if="viewing" class="cs-view">
        <header>
          <h3><em v-if="viewing.tag">[{{ viewing.tag }}]</em> {{ viewing.title }}</h3>
          <button type="button" class="x" aria-label="닫기" @click="viewing = null">✕</button>
        </header>
        <iframe :src="viewSrc" :title="viewing.title" />
      </div>
      <p v-if="toast" class="cs-toast">{{ toast }}</p>
    </Teleport>
  </section>
</template>

<style scoped>
.cs { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 16px 14px; display: grid; gap: 10px; }
.cs-head h3 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.cs-head p { margin: 4px 0 0; font-size: 12.5px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 하위 탭 — 밑줄은 ::after 막대(전역 button 둥근모서리로 U자가 되지 않게) */
.cs-tabs { display: flex; justify-content: space-between; border-bottom: 1px solid #e8ebf1; }
.cs-tabs button { position: relative; min-height: 0; padding: 6px 2px 9px; border: 0; border-radius: 0; background: none; font: inherit; font-size: 13.5px; font-weight: 700; color: #6b7280; white-space: nowrap; cursor: pointer; }
.cs-tabs button.on { color: #111827; }
.cs-tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px; background: #f4700a; }
.cs-tabs i { margin-left: 1px; font-style: normal; font-size: 11px; color: #2b6df3; }
.cs-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 13px; color: #9aa6c4; }
.cs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.cs-card { border: 1px solid #e8ebf1; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.cs-cv { display: flex; justify-content: center; padding: 10px 18px; border: 0; border-radius: 0; background: #f3f5f9; cursor: pointer; }
.cs-cv > * { width: 100%; }
.cs-img { aspect-ratio: 600 / 888; object-fit: cover; border-radius: 4px; box-shadow: 0 4px 12px rgba(15, 23, 42, .2); }
.cs-navy { aspect-ratio: 600 / 888; display: grid; place-items: center; padding: 8px; border-radius: 4px; background: linear-gradient(135deg, #24386f, #1c2b58); color: #fff; font-size: 13px; text-align: center; }
.cs-body { flex: 1; display: flex; flex-direction: column; gap: 5px; padding: 8px; min-width: 0; }
.cs-body h4 { margin: 0; font-size: 12.5px; font-weight: 800; line-height: 1.35; color: #111827; cursor: pointer; }
.cs-body h4 em, .cs-dlg h3 em, .cs-view h3 em { font-style: normal; color: #2b6df3; }
.cs-body p { margin: 0; font-size: 11px; line-height: 1.4; color: #6b7280; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cs-meta { display: flex; flex-wrap: nowrap; align-items: center; gap: 2px; white-space: nowrap; min-width: 0; }
.cs-meta span { flex: 0 1 auto; min-width: 0; overflow: hidden; padding: 1px 3px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: -0.3px; }
.cs-meta .k { background: #fff1e6; color: #c2410c; }
.cs-meta .f { background: #e9f6ee; color: #1b7f3b; }
.cs-meta .p { background: #eaf1ff; color: #1d4ed8; }
.cs-meta .s { background: #fdeeee; color: #dc2626; }
.cs-more { flex: none; margin-left: auto; min-height: 0; padding: 0 0 0 3px; border: 0; background: none; font: inherit; font-size: 10.5px; font-weight: 700; color: #2b6df3; cursor: pointer; }
.cs-act { display: flex; gap: 4px; margin-top: auto; }
.cs-go { flex: 1; min-width: 0; min-height: 0; height: 30px; padding: 0 4px; border: 1px solid #2b6df3; border-radius: 6px; background: #2b6df3; color: #fff; font: inherit; font-size: 11.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.cs-go.soon { border-color: #d0d5dd; background: #f6f7f9; color: #9ca3af; }
.cs-go:disabled { opacity: .6; }
.cs-share { flex: 0 0 30px; min-height: 0; height: 30px; padding: 0; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; display: grid; place-items: center; cursor: pointer; }
/* 자세히보기 창 */
.cs-veil { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .45); }
.cs-dlg { width: 100%; max-width: 440px; max-height: 86vh; overflow-y: auto; display: grid; gap: 10px; padding: 16px; border-radius: 14px; background: #fff; }
.cs-dlg header, .cs-view header { display: flex; align-items: flex-start; gap: 8px; }
.cs-dlg h3, .cs-view h3 { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 800; line-height: 1.35; color: #111827; }
.cs-dlg .x, .cs-view .x { flex: none; min-height: 0; width: 28px; height: 28px; padding: 0; border: 0; background: none; font-size: 18px; color: #6b7280; cursor: pointer; }
.cs-sum { margin: 0; font-size: 13px; font-weight: 700; color: #374151; }
.cs-desc { font-size: 13px; line-height: 1.65; color: #4b5563; white-space: pre-line; }
.cs-dlg .cs-act { margin-top: 4px; }
.cs-dlg .cs-go { height: 36px; font-size: 13px; }
.cs-dlg .cs-share { flex-basis: 36px; height: 36px; }
.cs-note { font-size: 11.5px; color: #9ca3af; }
/* 보기 창 — 화면 가득 */
.cs-view { position: fixed; inset: 0; z-index: 1150; display: flex; flex-direction: column; background: #fff; }
.cs-view header { align-items: center; padding: 12px 14px; border-bottom: 1px solid #e8ebf1; }
.cs-view iframe { flex: 1; width: 100%; border: 0; }
.cs-toast { position: fixed; left: 50%; bottom: 90px; z-index: 1200; transform: translateX(-50%); max-width: calc(100vw - 32px); margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 13px; }

/* 매뉴얼 HTML 표지 — 웹 .mc 와 같은 꼴(글자 크기는 표지 폭 기준 cqw) */
.mc { position: relative; container-type: inline-size; aspect-ratio: 600 / 888; overflow: hidden; border-radius: 4px; box-shadow: 0 4px 12px rgba(15, 23, 42, .22); color: #fff; text-align: left; background: radial-gradient(circle at 85% 12%, rgba(80, 195, 252, .2), transparent 50%), radial-gradient(circle at 10% 95%, rgba(244, 112, 10, .18), transparent 50%), linear-gradient(135deg, #24386f, #1c2b58); }
.mc > * { position: absolute; margin: 0; line-height: 1; white-space: nowrap; font-style: normal; }
.mc .lg { left: 8cqw; top: 7.33cqw; height: 6.5cqw; width: auto; }
.mc .no { right: 8cqw; top: 8.17cqw; height: 4.83cqw; padding: 0 2.17cqw; display: flex; align-items: center; border: .17cqw solid rgba(255, 255, 255, .3); border-radius: 99px; font-size: 2.5cqw; font-weight: 700; color: #c3cde6; }
.mc .eb { left: 8cqw; top: 26.4cqw; font-size: 3.17cqw; font-weight: 900; letter-spacing: .5cqw; color: #f4700a; }
.mc .t1, .mc .t2 { left: 7.17cqw; font-size: 16.33cqw; font-weight: 900; letter-spacing: -.75cqw; }
.mc .t1 { top: 35.2cqw; }
.mc .t2 { top: 53.1cqw; color: #f0a35e; }
.mc .sb { left: 8cqw; top: 75.6cqw; font-size: 4.17cqw; font-weight: 700; letter-spacing: -.08cqw; color: #e3e8f2; }
.mc .bx { left: 8cqw; top: 92.5cqw; width: 84cqw; height: 20.83cqw; border-radius: 2.33cqw; background: rgba(255, 255, 255, .07); border: .17cqw solid rgba(255, 255, 255, .15); }
.mc .ln { left: 17.17cqw; top: 100.67cqw; width: 65.67cqw; height: .67cqw; border-radius: 1cqw; background: rgba(255, 255, 255, .28); }
.mc .bd { top: 100.17cqw; height: 1.67cqw; border-radius: 1cqw; background: #f4700a; }
.mc .mk { top: 95.4cqw; transform: translateX(-50%); font-size: 2.17cqw; font-weight: 800; color: #f0a35e; }
.mc .dt { top: 99.17cqw; width: 3.67cqw; height: 3.67cqw; margin-left: -1.83cqw; box-sizing: border-box; border-radius: 50%; background: #22336a; border: .58cqw solid #fff; }
.mc .dt.on { background: #f4700a; border-color: #f4700a; }
.mc .lb { top: 105.7cqw; transform: translateX(-50%); font-size: 2.5cqw; font-weight: 800; text-align: center; }
.mc .lb small { display: block; margin-top: .9cqw; font-size: 2cqw; font-weight: 600; color: #c3cde6; }
.mc .ch { left: 8cqw; top: 135.5cqw; display: flex; gap: 1.17cqw; }
.mc .ch b { height: 4.5cqw; padding: 0 1.83cqw; display: flex; align-items: center; border-radius: 1cqw; background: rgba(255, 255, 255, .11); font-size: 2.33cqw; font-weight: 800; }
.mc .bs { right: 8cqw; top: 134.6cqw; font-size: 2.5cqw; font-weight: 700; color: #c3cde6; }
.mc .ao { right: 8cqw; top: 137.9cqw; font-size: 2.83cqw; font-weight: 700; }
</style>
