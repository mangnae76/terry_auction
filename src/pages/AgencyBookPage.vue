<script setup lang="ts">
// 중개업소 관리 — 늘 도는 부동산을 사용자가 직접 더하고 빼는 자리.
//
// 상담표의 상호 드롭다운이 이 목록을 그대로 쓴다. 여기서 한 줄을 더하면
// 모든 물건의 유선·현장 상담표에 같이 나타나고, 상호를 고르면 여기 적어 둔
// 전화번호가 따라 들어간다. 목록은 사용자별로 따로 저장된다.
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import {
  newAgencyId, telDigits, useAgencyBook, type AgencyPreset,
} from '../services/agencyBook';

const router = useRouter();
const auth = useAuthStore();
const book = useAgencyBook();

/** 화면에서 고치는 동안 들고 있을 사본 — 저장을 눌러야 목록에 들어간다 */
const rows = ref<AgencyPreset[]>([]);
const dirty = ref(false);

const syncFromBook = () => {
  rows.value = book.agencies.value.map((a) => ({ ...a }));
  dirty.value = false;
};
onMounted(async () => {
  await book.load(auth.uid);
  syncFromBook();
});
watch(() => auth.uid, async (uid) => {
  await book.load(uid);
  syncFromBook();
});

const toastText = ref('');
const toastTone = ref<'info' | 'success' | 'error'>('success');
const toast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  toastTone.value = tone;
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

const touch = () => { dirty.value = true; };
const addRow = () => {
  rows.value.push({ id: newAgencyId(), name: '', phone: '', rating: '' });
  touch();
};

const confirmBox = ref<ConfirmBox | null>(null);
const removeRow = (idx: number) => {
  const target = rows.value[idx];
  if (skipsToday('agencyBook.removeSkip')) {
    rows.value.splice(idx, 1);
    touch();
    return;
  }
  confirmBox.value = {
    title: '중개업소 빼기',
    desc: `${target?.name || '이 줄'}을 목록에서 뺍니다.\n물건에 이미 적어 둔 상담 내용은 그대로 남습니다.`,
    okLabel: '빼기',
    // 저장을 눌러야 굳으므로 되돌릴 수 있다 — '오늘 하루 보지 않기'를 둔다
    skipKey: 'agencyBook.removeSkip',
    run: () => {
      rows.value.splice(idx, 1);
      touch();
    },
  };
};

const save = async () => {
  const cleaned = rows.value
    .map((r) => ({ ...r, name: r.name.trim(), phone: r.phone.trim(), rating: (r.rating ?? '').trim() }))
    .filter((r) => r.name || r.phone);
  if (!auth.uid) {
    toast('로그인한 뒤에 저장됩니다.', 'error');
    return;
  }
  await book.save(auth.uid, cleaned);
  rows.value = cleaned.map((r) => ({ ...r }));
  dirty.value = false;
  toast(`${cleaned.length}곳을 저장했습니다.`);
};

const telHref = (phone: string) => {
  const d = telDigits(phone);
  return d.length >= 8 ? `tel:${d}` : '';
};
</script>

<template>
  <section class="agb-shell">
    <header class="agb-header">
      <button type="button" class="agb-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="agb-title">중개업소 관리</h1>
      <span class="agb-eyebrow">{{ rows.length }}곳</span>
      <button type="button" class="agb-save" :class="{ on: dirty }" @click="save">💾 저장</button>
    </header>

    <p class="agb-note">
      여기 적어 둔 업소가 물건마다의 <b>부동산 유선 상담 · 현장 상담</b> 상호 목록에 그대로 섭니다.
      상호를 고르면 전화번호도 따라 들어갑니다.
    </p>

    <div class="agb-list">
      <article v-for="(row, i) in rows" :key="row.id" class="agb-card">
        <div class="agb-line">
          <label class="agb-fld name">
            <small>상호</small>
            <input v-model="row.name" class="agb-input" placeholder="상호 입력" @input="touch" />
          </label>
          <label class="agb-fld">
            <small>연락처</small>
            <span class="agb-tel">
              <input
                v-model="row.phone"
                class="agb-input"
                :class="{ dial: telHref(row.phone) }"
                inputmode="tel"
                placeholder="010-0000-0000"
                @input="touch"
              />
              <a v-if="telHref(row.phone)" class="agb-call" :href="telHref(row.phone)" aria-label="전화 걸기">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
              </a>
            </span>
          </label>
          <button type="button" class="agb-del" aria-label="업소 빼기" @click="removeRow(i)">×</button>
        </div>
        <label class="agb-fld wide">
          <small>평가</small>
          <input v-model="row.rating" class="agb-input" placeholder="써 보고 남길 말 — 응대·매물 수준 등" @input="touch" />
        </label>
      </article>

      <p v-if="rows.length === 0" class="agb-empty">적어 둔 업소가 없습니다. 아래에서 더하세요.</p>

      <button type="button" class="agb-add" @click="addRow">＋ 업소 추가</button>
    </div>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />
    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" :tone="toastTone" />
  </section>
</template>

<style scoped>
.agb-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 86px; }
.agb-header {
  padding: 14px 12px 8px;
  display: flex; align-items: baseline; gap: 8px;
}
.agb-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.agb-title { margin: 0; flex: 0 0 auto; font-size: 20px; font-weight: 800; color: #111827; }
.agb-eyebrow { font-size: 10.5px; font-weight: 700; color: #2b6df3; white-space: nowrap; }
.agb-save {
  margin-left: auto; align-self: center;
  box-sizing: border-box; height: 26px; padding: 0 10px;
  border: 1px solid #c7d7f8; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
/* 고친 것이 있을 때만 눈에 띄게 — 누를 까닭이 있는지 바로 보인다 */
.agb-save.on { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.agb-note {
  margin: 0 12px 10px; padding: 8px 10px;
  background: #eef4ff; border-radius: 8px;
  font-size: 11.5px; line-height: 1.6; color: #35507f;
}
.agb-note b { color: #1d3d75; }
.agb-list { padding: 0 12px; display: flex; flex-direction: column; gap: 8px; }
.agb-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 7px;
}
.agb-line { display: flex; align-items: flex-end; gap: 6px; }
.agb-fld { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.agb-fld.name { flex: 0 0 34%; }
.agb-fld.wide { flex: 1 1 100%; }
.agb-fld small { font-size: 10px; font-weight: 700; color: #6b7280; }
.agb-input {
  width: 100%; box-sizing: border-box; height: 28px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 7px; font-family: inherit; font-size: 12px; color: #111827;
}
.agb-input:focus { outline: none; border-color: #2b6df3; }
.agb-input::placeholder { color: #9ca3af; }
.agb-tel { position: relative; display: block; }
.agb-tel .agb-input.dial { padding-right: 26px; }
.agb-call {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 5px; background: #eaf1ff; color: #2b6df3;
}
.agb-del {
  flex: 0 0 28px; height: 28px; padding: 0;
  border: 1px solid #f0d4d0; border-radius: 6px; background: #fdecea;
  color: #e0574a; font-size: 15px; line-height: 26px; cursor: pointer;
}
.agb-empty { text-align: center; color: #9ca3af; padding: 24px 0; font-size: 13px; }
.agb-add {
  border: 1px dashed #c7d2e3; border-radius: 10px; background: #fff;
  padding: 10px 0; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #2b6df3; cursor: pointer;
}
</style>
