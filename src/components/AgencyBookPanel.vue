<script setup lang="ts">
// 중개업체 목록을 고치는 자리 — '중개업체 관리' 화면과 상담표의 팝업이 같이 쓴다.
// 목록 자체는 services/agencyBook 한곳에 있고, 여기서 저장하면 상담표의 상호
// 드롭다운이 바로 따라 바뀐다.
import { inject, onMounted, ref, watch } from 'vue';
import AppConfirm from './AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { newAgencyId, telDigits, useAgencyBook, type AgencyPreset } from '../services/agencyBook';
import { formatPhone } from '../utils/phone';

const emit = defineEmits<{ (e: 'saved', count: number): void }>();
/** 웹 — 업체마다 '협의' 칸을 더 두고, 글자 · 칸을 웹 규격(글자 14 · 칸 40 · 모서리 8)으로 */
const webEmbed = inject<boolean>('webEmbed', false);

const auth = useAuthStore();
const book = useAgencyBook();

/** 고치는 동안 들고 있을 사본 — 저장을 눌러야 목록에 들어간다 */
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

const touch = () => { dirty.value = true; };

/** 차례 바꾸기 — 상호(가나다) 또는 지역으로. 바꾼 차례는 저장하면 그대로 남는다 */
const sortKey = ref<'' | 'name' | 'region'>('');
const sortBy = (key: 'name' | 'region') => {
  sortKey.value = key;
  rows.value = [...rows.value].sort((a, b) => {
    const first = (a[key] ?? '').localeCompare(b[key] ?? '', 'ko');
    // 지역이 같으면 상호로 한 번 더 가른다
    return first !== 0 ? first : (a.name ?? '').localeCompare(b.name ?? '', 'ko');
  });
  touch();
};
const addRow = () => {
  rows.value.push({ id: newAgencyId(), name: '', phone: '', region: '', rating: '', deal: '' });
  touch();
};
const setPhone = (row: AgencyPreset, el: HTMLInputElement) => {
  const next = formatPhone(el.value);
  row.phone = next;
  if (el.value !== next) el.value = next;
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
    title: '중개업체 빼기',
    desc: `${target?.name || '이 줄'}을 목록에서 뺍니다.\n물건에 이미 적어 둔 상담 내용은 그대로 남습니다.`,
    okLabel: '빼기',
    skipKey: 'agencyBook.removeSkip',
    run: () => { rows.value.splice(idx, 1); touch(); },
  };
};

const save = async () => {
  const cleaned = rows.value
    .map((r) => ({ ...r, name: r.name.trim(), phone: r.phone.trim(), rating: (r.rating ?? '').trim() }))
    .filter((r) => r.name || r.phone);
  await book.save(auth.uid, cleaned);
  rows.value = cleaned.map((r) => ({ ...r }));
  dirty.value = false;
  emit('saved', cleaned.length);
};

const telHref = (phone: string) => {
  const d = telDigits(phone);
  return d.length >= 8 ? `tel:${d}` : '';
};

defineExpose({ save, dirty });
</script>

<template>
  <div :class="['agb-panel', { web: webEmbed }]">
    <div class="agb-tools">
      <span class="agb-eyebrow">{{ rows.length }}곳</span>
      <button type="button" class="agb-add" @click="addRow">＋ 업체 추가</button>
      <!-- 많아지면 찾기 어렵다 — 상호나 지역으로 줄을 세운다 -->
      <button type="button" :class="['agb-sort', { on: sortKey === 'name' }]" @click="sortBy('name')">가나다순</button>
      <button type="button" :class="['agb-sort', { on: sortKey === 'region' }]" @click="sortBy('region')">지역순</button>
      <button type="button" class="agb-save" :class="{ on: dirty }" @click="save">💾 저장</button>
    </div>

    <div class="agb-list">
      <article v-for="(row, i) in rows" :key="row.id" class="agb-card">
        <div class="agb-line">
          <label class="agb-fld region">
            <small>지역</small>
            <input v-model="row.region" class="agb-input" :placeholder="webEmbed ? '지역' : '동네'" @input="touch" />
          </label>
          <label class="agb-fld name">
            <small>상호</small>
            <input v-model="row.name" class="agb-input" :placeholder="webEmbed ? '상호' : '상호 입력'" @input="touch" />
          </label>
          <label class="agb-fld">
            <small>연락처</small>
            <span class="agb-tel">
              <input
                :value="row.phone"
                class="agb-input"
                :class="{ dial: telHref(row.phone) }"
                inputmode="tel"
                placeholder="010-0000-0000"
                @input="setPhone(row, $event.target as HTMLInputElement)"
              />
              <a v-if="telHref(row.phone)" class="agb-call" :href="telHref(row.phone)" aria-label="전화 걸기">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
              </a>
            </span>
          </label>
          <button type="button" class="agb-del" aria-label="업체 빼기" @click="removeRow(i)">×</button>
        </div>
        <label class="agb-fld wide">
          <small>평가</small>
          <input v-model="row.rating" class="agb-input" :placeholder="webEmbed ? '평가 — 써 보고 남길 말(응대 · 매물 수준 등)' : '써 보고 남길 말 — 응대·매물 수준 등'" @input="touch" />
        </label>
        <label v-if="webEmbed" class="agb-fld wide">
          <small>협의</small>
          <input v-model="row.deal" class="agb-input" placeholder="협의 — 이 업체와 협의한 내용(입금 · 매도 조건 등)" @input="touch" />
        </label>
      </article>

      <p v-if="rows.length === 0" class="agb-empty">적어 둔 업체가 없습니다. 위의 <b>＋ 업체 추가</b>를 누르세요.</p>
    </div>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />
  </div>
</template>

<style scoped>
.agb-panel { display: flex; flex-direction: column; gap: 8px; }
.agb-tools { display: flex; align-items: center; gap: 6px; }
.agb-eyebrow { font-size: 10.5px; font-weight: 700; color: #2b6df3; white-space: nowrap; margin-right: auto; }
.agb-add, .agb-save {
  flex: 0 0 auto; height: 26px; padding: 0 10px;
  border: 1px solid #c7d7f8; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.agb-save.on { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.agb-list { display: flex; flex-direction: column; gap: 8px; }
.agb-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 7px;
}
.agb-line { display: flex; align-items: flex-end; gap: 6px; }
/* 차례 바꾸기 단추 — 업체 추가 옆에 */
.agb-sort {
  border: 1px solid #dde3ee; border-radius: 999px; background: #fff;
  padding: 4px 10px; font-family: inherit; font-size: 11px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.agb-sort.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }
.agb-fld { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.agb-fld.name { flex: 0 0 30%; }
.agb-fld.region { flex: 0 0 22%; }
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
.agb-empty { text-align: center; color: #9ca3af; padding: 18px 0; font-size: 13px; }
/* 웹 규격 — 글자 하한 12, 이름표 14 굵게, 칸 40 · 모서리 8, 상자 안쪽 14 · 사이 10 */
.agb-panel.web { gap: 12px; }
.agb-panel.web .agb-eyebrow { font-size: 13px; }
.agb-panel.web :is(.agb-add, .agb-save) { height: 34px; padding: 0 14px; font-size: 14px; }
.agb-panel.web .agb-sort { padding: 6px 12px; font-size: 13px; }
.agb-panel.web .agb-list { gap: 10px; }
.agb-panel.web .agb-card { padding: 14px; gap: 10px; border-radius: 10px; }
.agb-panel.web .agb-line { gap: 10px; }
.agb-panel.web .agb-fld { gap: 0; }
.agb-panel.web .agb-line { align-items: center; }   /* 이름표를 뺀 뒤 — 줄마다 칸 40, 줄 사이 10, 상자 안쪽 14 로 고르게 */
.agb-panel.web .agb-fld small { display: none; }   /* 웹 — 칸 이름(지역 · 상호 · 연락처 · 평가 · 협의)은 빼고 칸 안 안내 글로 */
.agb-panel.web .agb-input { height: 40px; padding: 0 12px; border-radius: 8px; font-size: 14px; }
.agb-panel.web .agb-del { flex-basis: 40px; height: 40px; border-radius: 8px; font-size: 18px; line-height: 38px; }
.agb-panel.web .agb-call { width: 26px; height: 26px; right: 7px; }
.agb-panel.web .agb-empty { font-size: 14px; }
</style>
