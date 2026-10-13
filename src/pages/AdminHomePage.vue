<script setup lang="ts">
// 관리자 도구 — 웹에서만 쓰는 화면이다.
//
// 앱(손전화)에서 쓰는 화면들과 달리 가로를 꽉 쓴다. 한 번에 여러 분석을
// 펼쳐 놓고 견주는 일이 많아, 폭을 가둬 두면 되레 불편하다.
// 그래서 .page-content 의 가운데 정렬(--shell-w)에서 빼 뒀다(style.css).
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';

type Tool = {
  title: string;
  sub?: string;
  desc: string;
  /** 빈 값이면 아직 화면이 없다 — 누르면 '준비 중' 이라고 알린다 */
  path: string;
  icon: 'trade' | 'filter' | 'near' | 'lot' | 'bid' | 'money';
};
type Group = { title: string; hint: string; tone: 'blue' | 'violet' | 'green'; tools: Tool[] };

const GROUPS: Group[] = [
  {
    title: '실거래가 분석',
    hint: '국토부 실거래로 값의 바닥을 잡는다',
    tone: 'blue',
    tools: [
      {
        title: '실거래 분석',
        sub: '시 · 군 · 구',
        desc: '넓게 훑어 지역의 흐름을 본다. 기간과 면적을 바꿔 가며 평균을 낸다.',
        path: '',
        icon: 'trade',
      },
      {
        title: '실거래 조건검색 분석',
        sub: '해당 읍 · 면 · 동',
        desc: '동까지 좁히고 연식·층·면적으로 걸러 견줄 만한 거래만 남긴다.',
        path: '',
        icon: 'filter',
      },
    ],
  },
  {
    title: '낙찰가율 분석',
    hint: '남들이 얼마에 받아 갔는지로 가늠한다',
    tone: 'violet',
    tools: [
      {
        title: '인근매각물건분석',
        desc: '가까운 곳에서 팔린 경매 물건을 모아 낙찰가율의 띠를 본다.',
        path: '',
        icon: 'near',
      },
      {
        title: '동일지번매각물건 분석',
        desc: '같은 번지에서 전에 팔린 물건 — 값을 가늠하는 바로 옆 사례다.',
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
          <span class="adm-mark">MT</span>
          <div class="adm-brand-txt">
            <strong>MYTURN</strong>
            <small>관리자 도구</small>
          </div>
        </div>
        <nav class="adm-top-nav">
          <button type="button" class="adm-top-link" @click="router.push('/auctions/watchlist')">선정물건</button>
          <span class="adm-who">{{ who }}</span>
        </nav>
      </div>
    </header>

    <div class="adm-body">
      <div class="adm-head">
        <h1>분석 도구</h1>
        <p>물건 하나를 들여다보기 전에, 지역과 시세를 먼저 훑는 자리입니다.</p>
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
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(160%) blur(10px);
  border-bottom: 1px solid #e8ecf3;
}
.adm-top-in {
  max-width: 1480px; margin: 0 auto; padding: 12px 28px;
  display: flex; align-items: center; gap: 16px;
}
.adm-brand { display: flex; align-items: center; gap: 10px; }
.adm-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 9px;
  background: linear-gradient(135deg, #2b6df3, #1b3f8f);
  color: #fff; font-size: 12px; font-weight: 800; letter-spacing: -0.3px;
}
.adm-brand-txt { display: flex; flex-direction: column; line-height: 1.15; }
.adm-brand-txt strong { font-size: 14px; font-weight: 800; letter-spacing: -0.2px; }
.adm-brand-txt small { font-size: 11px; color: #6b7280; font-weight: 600; }
.adm-top-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.adm-top-link {
  border: 1px solid #dde3ee; background: #fff; border-radius: 8px;
  padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #374151; cursor: pointer;
}
.adm-top-link:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-who { font-size: 12px; color: #9ca3af; font-weight: 600; }

/* ===== 본문 ===== */
.adm-body { flex: 1 1 auto; width: 100%; max-width: 1480px; margin: 0 auto; padding: 34px 28px 60px; }
.adm-head { margin-bottom: 26px; }
.adm-head h1 { margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
.adm-head p { margin: 0; font-size: 13.5px; color: #6b7280; }

/* 세 묶음을 가로로 — 좁아지면 둘, 하나로 접힌다 */
.adm-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
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
.adm-card-ico svg { width: 19px; height: 19px; }
.adm-card-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.adm-card-txt strong {
  font-size: 14.5px; font-weight: 800; letter-spacing: -0.2px; color: #111827;
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
}
.adm-card-txt strong em {
  font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af;
}
.adm-card-txt small { font-size: 12.5px; line-height: 1.55; color: #6b7280; word-break: keep-all; }
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
