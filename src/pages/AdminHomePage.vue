<script setup lang="ts">
// 관리자 도구 — 웹에서만 쓰는 화면이다.
//
// 앱(손전화)에서 쓰는 화면들과 달리 가로를 꽉 쓴다. 한 번에 여러 분석을
// 펼쳐 놓고 견주는 일이 많아, 폭을 가둬 두면 되레 불편하다.
// 그래서 .page-content 의 가운데 정렬(--shell-w)에서 빼 뒀다(style.css).
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo.vue';

type Tool = {
  title: string;
  sub?: string;
  desc: string;
  /** 빈 값이면 아직 화면이 없다 — 누르면 '준비 중' 이라고 알린다 */
  path: string;
  icon: 'trade' | 'filter' | 'near' | 'lot' | 'bid' | 'money';
};
type Group = { title: string; hint: string; tone: 'blue' | 'violet' | 'green' | 'amber'; tools: Tool[] };

const GROUPS: Group[] = [
  {
    // 앱 하단 메뉴에 있던 '시장정보' — 제 묶음으로 떼어 맨 앞에 둔다
    title: '부동산 시장정보',
    hint: '시장에 지금 무슨 일이 벌어지고 있나',
    tone: 'amber',
    tools: [
      {
        title: '지역별 거래량 랭킹',
        sub: '시군구 · 읍면동',
        desc: '시도·시군구를 골라 거래량 많은 곳부터 줄 세워 지도와 함께 본다.',
        path: '/trade-stats',
        icon: 'trade',
      },
      {
        title: 'KB 주택가격지수',
        sub: '전국 · 서울',
        desc: '한국은행 ECOS의 KB 주택가격지수로 시장 흐름을 본다.',
        path: '/admin/housing-index',
        icon: 'trade',
      },
    ],
  },
  {
    title: '실거래가 분석',
    hint: '실거래 통계로 수요공급을 분석한다',
    tone: 'blue',
    tools: [
      {
        title: '실거래 분석',
        sub: '지역 단위',
        desc: '지역 세부 단위(읍면동)의 거래량·평균가를 통해 수요공급을 분석한다.',
        path: '/admin/region-demand',
        icon: 'trade',
      },
      {
        title: '실거래가 조건 분석',
        sub: '해당 읍 · 면 · 동',
        desc: '해당 읍면동에 세부 개별성을 걸러 비교 데이터를 알아본다.',
        path: '/admin/dong-trades',
        icon: 'filter',
      },
      {
        title: '경매지번 공동주택가 및 실거래가',
        sub: '지번 · 단지',
        desc: '주소를 입력하여 공동주택가와 실거래가 데이터를 분석한다.',
        path: '/admin/case-trades',
        icon: 'lot',
      },
    ],
  },
  {
    title: '낙찰가율 분석',
    hint: '남들이 얼마에 받아 갔는지로 가늠한다',
    tone: 'violet',
    tools: [
      {
        title: '인근 매각 물건 분석',
        desc: '인근 매각 물건의 낙찰가율을 분석한다.',
        path: '',
        icon: 'near',
      },
      {
        title: '동일 지번 매각 물건 분석',
        desc: '동일 번지 매각 물건 분석을 통해 낙찰가율을 분석한다.',
        path: '',
        icon: 'lot',
      },
    ],
  },
  {
    title: '수익분석',
    hint: '얼마를 쓰고 얼마가 남는지 센다',
    tone: 'green',
    tools: [
      {
        title: '경매 입찰가산정',
        desc: '비용과 세금을 넣어 입찰가와 세후 순이익을 맞춰 본다.',
        path: '',
        icon: 'bid',
      },
      {
        title: '자금관리 · 세금',
        desc: '들어간 돈과 내야 할 세금을 한곳에서 들여다본다.',
        path: '',
        icon: 'money',
      },
    ],
  },
];

const router = useRouter();
const auth = useAuthStore();
const who = computed(() => auth.email || '관리자');

const toast = ref('');
const openTool = (tool: Tool) => {
  if (!tool.path) {
    toast.value = `${tool.title} — 아직 만드는 중입니다.`;
    window.setTimeout(() => { toast.value = ''; }, 1800);
    return;
  }
  router.push(tool.path);
};
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <div class="adm-brand">
          <BrandLogo :size="36" tone="white" />
          <small class="adm-brand-tag">관리자 도구</small>
        </div>
        <nav class="adm-top-nav">
          <button type="button" class="adm-top-link" @click="router.push('/auctions/watchlist')">선정물건</button>
          <button type="button" class="adm-top-link ops" @click="router.push('/admin/board')">운영</button>
          <span class="adm-who">{{ who }}</span>
        </nav>
      </div>
    </header>

    <div class="adm-body">
      <div class="adm-head">
        <h1>분석 도구</h1>
        <p>물건 상세 분석 전에 지역과 시세를 알아봅니다.</p>
      </div>

      <div class="adm-groups">
        <section v-for="g in GROUPS" :key="g.title" :class="['adm-group', g.tone]">
          <div class="adm-group-head">
            <h2>{{ g.title }}</h2>
            <p>{{ g.hint }}</p>
          </div>
          <div class="adm-cards">
            <button
              v-for="t in g.tools"
              :key="t.title"
              type="button"
              :class="['adm-card', { soon: !t.path }]"
              @click="openTool(t)"
            >
              <span class="adm-card-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <template v-if="t.icon === 'trade'">
                    <path d="M3 17 9.5 10.5l4 4L21 7" /><path d="M15 7h6v6" />
                  </template>
                  <template v-else-if="t.icon === 'filter'">
                    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
                  </template>
                  <template v-else-if="t.icon === 'near'">
                    <circle cx="12" cy="11" r="2.6" /><path d="M12 21s7-5.6 7-10.4A7 7 0 0 0 5 10.6C5 15.4 12 21 12 21z" />
                  </template>
                  <template v-else-if="t.icon === 'lot'">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                  </template>
                  <template v-else-if="t.icon === 'bid'">
                    <path d="M4 20h10" /><path d="m7 13 7-7" /><path d="m11 3 6 6" /><path d="m14 6 4 4" /><path d="M9 11 5 15" />
                  </template>
                  <template v-else>
                    <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v4M18 10v4" />
                  </template>
                </svg>
              </span>
              <span class="adm-card-txt">
                <strong>{{ t.title }}<em v-if="t.sub">{{ t.sub }}</em></strong>
                <small>{{ t.desc }}</small>
              </span>
              <span class="adm-card-go">
                <span v-if="!t.path" class="adm-soon">준비 중</span>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <p v-if="toast" class="adm-toast">{{ toast }}</p>
  </section>
</template>

<style scoped>
.adm-shell {
  min-height: 100vh;
  background: #f5f7fb;
  color: #111827;
  display: flex;
  flex-direction: column;
}

/* ===== 위쪽 띠 ===== */
/* 앱 머리글과 같은 남색 띠 — 로고는 흰 판을 쓴다 */
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  border-bottom: 1px solid #16265280;
}
.adm-top-in {
  max-width: 1480px; margin: 0 auto; padding: 12px 28px;
  display: flex; align-items: center; gap: 16px;
}
/* 앱과 같은 로고를 쓴다 — 같은 서비스라는 게 한눈에 보이게.
   'AUCTION' 은 로고 아래, MYTURN 의 N 끝에 맞춰 오른쪽으로 붙인다 */
.adm-brand { display: flex; align-items: center; gap: 12px; }

.adm-brand-tag {
  font-size: 11.5px; font-weight: 700; color: #c7d2ea;
  padding-left: 12px; border-left: 1px solid #ffffff33; line-height: 1.2;
}
.adm-top-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.adm-top-link {
  border: 1px solid #ffffff4d; background: #ffffff1a; border-radius: 8px;
  padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #fff; cursor: pointer;
}
.adm-top-link:hover { border-color: #b9cdf7; color: #2b6df3; }
/* 운영 — 글을 올리는 자리라 눈에 띄게 */
.adm-top-link.ops { background: #ffffff; border-color: #ffffff; color: #1f3a72; }
.adm-who { font-size: 12px; color: #c7d2ea; font-weight: 600; }

/* ===== 본문 ===== */
.adm-body { flex: 1 1 auto; width: 100%; max-width: 1480px; margin: 0 auto; padding: 34px 28px 60px; }
.adm-head { margin-bottom: 26px; }
.adm-head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
.adm-head p { margin: 0; font-size: 13.5px; color: #6b7280; }

/* 세 묶음을 가로로 — 좁아지면 둘, 하나로 접힌다 */
.adm-groups { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 1480px) { .adm-groups { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1180px) { .adm-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .adm-groups { grid-template-columns: minmax(0, 1fr); }
  .adm-top-in, .adm-body { padding-left: 16px; padding-right: 16px; }
}

.adm-group-head { padding: 0 2px 12px; }
.adm-group-head h2 {
  margin: 0 0 3px; font-size: 15px; font-weight: 800; letter-spacing: -0.2px;
  display: flex; align-items: center; gap: 7px;
}
/* 묶음마다 색 띠 하나 — 제목 줄을 세로로 긋는다 */
.adm-group-head h2::before {
  content: ''; width: 3px; height: 14px; border-radius: 2px; background: #2b6df3;
}
.adm-group.violet .adm-group-head h2::before { background: #7c5cf0; }
.adm-group.green .adm-group-head h2::before { background: #0f9d7a; }
.adm-group.amber .adm-group-head h2::before { background: #d97706; }
.adm-group-head p { margin: 0; padding-left: 10px; font-size: 12px; color: #9ca3af; font-weight: 600; }

.adm-cards { display: flex; flex-direction: column; gap: 12px; }
.adm-card {
  display: flex; align-items: flex-start; gap: 13px; text-align: left;
  background: #fff; border: 1px solid #e8ecf3; border-radius: 14px;
  padding: 18px 16px; cursor: pointer; font-family: inherit;
  transition: border-color 0.14s, box-shadow 0.14s, transform 0.14s;
}
.adm-card:hover {
  border-color: #c7d7f8;
  box-shadow: 0 8px 22px rgba(17, 24, 39, 0.07);
  transform: translateY(-1px);
}
.adm-card:active { transform: translateY(0); }
.adm-card-ico {
  flex: 0 0 38px; width: 38px; height: 38px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #eef4ff; color: #2b6df3;
}
.adm-group.violet .adm-card-ico { background: #f2eeff; color: #7c5cf0; }
.adm-group.green .adm-card-ico { background: #e8f7f1; color: #0f9d7a; }
.adm-group.amber .adm-card-ico { background: #fdf0dd; color: #d97706; }
.adm-card-ico svg { width: 19px; height: 19px; }
.adm-card-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.adm-card-txt strong {
  font-size: 14.5px; font-weight: 800; letter-spacing: -0.2px; color: #111827;
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
}
.adm-card-txt strong em {
  font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af;
}
/* 설명 줄 수가 달라 카드 키가 들쑥날쑥했다 — 두 줄 자리를 늘 잡아 두면
   세 묶음의 둘째 카드가 같은 높이에서 시작한다 */
.adm-card-txt small {
  font-size: 12.5px; line-height: 1.55; color: #6b7280; word-break: keep-all;
  min-height: calc(12.5px * 1.55 * 2);
}
.adm-card-go {
  flex: 0 0 auto; align-self: center;
  display: inline-flex; align-items: center; color: #c3c9d4;
}
.adm-card-go svg { width: 18px; height: 18px; }
.adm-soon {
  font-size: 10.5px; font-weight: 700; color: #9ca3af;
  background: #f3f4f6; border-radius: 999px; padding: 3px 8px; white-space: nowrap;
}
/* 아직 안 만든 자리는 한 단 옅게 — 그래도 무엇이 올지는 읽힌다 */
.adm-card.soon { background: #fcfcfd; }

.adm-toast {
  position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%);
  margin: 0; padding: 11px 18px; border-radius: 10px; z-index: 50;
  background: rgba(17, 24, 39, 0.92); color: #fff;
  font-size: 13px; font-weight: 600; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28);
}
</style>
