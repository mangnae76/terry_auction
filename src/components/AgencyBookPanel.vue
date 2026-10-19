<script setup lang="ts">
// 중개업체 목록을 고치는 자리 — '중개업체 관리' 화면과 상담표의 팝업이 같이 쓴다.
// 목록 자체는 services/agencyBook 한곳에 있고, 여기서 저장하면 상담표의 상호
// 드롭다운이 바로 따라 바뀐다.
import { onMounted, ref, watch } from 'vue';
import AppConfirm from './AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { newAgencyId, telDigits, useAgencyBook, type AgencyPreset } from '../services/agencyBook';
import { formatPhone } from '../utils/phone';

const emit = defineEmits<{ (e: 'saved', count: number): void }>();

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
const addRow = () => {
  rows.value.push({ id: newAgencyId(), name: '', phone: '', region: '', rating: '' });
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
  <div class="agb-panel">
    <div class="agb-tools">
      <span class="agb-eyebrow">{{ rows.length }}곳</span>
      <button type="button" class="agb-add" @click="addRow">＋ 업체 추가</button>
      <button type="button" class="agb-save" :class="{ on: dirty }" @click="save">💾 저장</button>
    </div>

    <div class="agb-list">
      <article v-for="(row, i) in rows" :key="row.id" class="agb-card">
        <div class="agb-line">
          <label class="agb-fld name">
            <small>상호</small>
            <input v-model="row.name" class="agb-input" placeholder="상호 입력" @input="touch" />
          </label>
          <label class="agb-fld region">
            <small>지역</small>
            <input v-model="row.region" class="agb-input" placeholder="동네" @input="touch" />
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
          <input v-model="row.rating" class="agb-input" placeholder="써 보고 남길 말 — 응대·매물 수준 등" @input="touch" />
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
</style>
