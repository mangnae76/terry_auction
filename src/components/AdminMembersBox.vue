<script setup lang="ts">
// 운영 › 회원 관리 — 가입한 회원 목록 · 찾기(DB users, 운영자만 읽는다).
import { computed, onMounted, ref } from 'vue';
import { userMessage } from '../services/userMessage';
import { loadMembers, type MemberRow } from '../services/adminMembersRepository';

const rows = ref<MemberRow[]>([]);
const loading = ref(false);
const loadErr = ref('');
const loadedAt = ref('');
const load = async () => {
  loading.value = true;
  try {
    rows.value = await loadMembers();
    loadErr.value = '';
    const d = new Date();
    loadedAt.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) {
    loadErr.value = userMessage(e, '회원 목록을 불러오지 못했습니다. 운영자 계정인지 확인해 주세요.');
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const q = ref('');
const path = ref('');
const period = ref<'all' | '7' | '30'>('all');
const paths = computed(() => [...new Set(rows.value.map((r) => r.joinPath).filter(Boolean))]);
const since = computed(() => (period.value === 'all' ? '' : new Date(Date.now() - Number(period.value) * 86400000).toISOString()));
const shown = computed(() => {
  const k = q.value.trim().toLowerCase();
  return rows.value.filter((r) => (!path.value || r.joinPath === path.value)
    && (!since.value || r.createdAt >= since.value)
    && (!k || [r.email, r.nickname, r.realName, r.phone].some((v) => v.toLowerCase().includes(k))));
});
const PAGE = 100;
const limit = ref(PAGE);
const page = computed(() => shown.value.slice(0, limit.value));

const day = (iso: string) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-');
</script>

<template>
  <section class="adb-card amb">
    <div class="amb-tools">
      <input v-model="q" type="search" placeholder="메일 · 닉네임 · 이름 · 연락처 찾기" @input="limit = PAGE" />
      <select v-model="path" @change="limit = PAGE"><option value="">가입경로 전체</option><option v-for="p in paths" :key="p" :value="p">{{ p }}</option></select>
      <div class="amb-seg">
        <button v-for="[v, t] in [['all', '전체'], ['7', '7일'], ['30', '30일']]" :key="v" type="button" :class="{ on: period === v }" @click="period = v as 'all' | '7' | '30'; limit = PAGE">{{ t }}</button>
      </div>
      <button type="button" class="amb-reload" :disabled="loading" @click="load">{{ loading ? '불러오는 중' : '새로고침' }}</button>
    </div>
    <p class="amb-count">회원 <b>{{ rows.length.toLocaleString('ko-KR') }}</b>명<template v-if="shown.length !== rows.length"> · 찾은 회원 <b>{{ shown.length.toLocaleString('ko-KR') }}</b>명</template><small v-if="loadedAt"> · {{ loadedAt }} 기준</small></p>
    <p v-if="loadErr" class="amb-err">{{ loadErr }}</p>
    <div v-else class="amb-table-wrap">
      <table class="amb-table">
        <thead><tr><th>가입일</th><th>메일</th><th>닉네임</th><th>이름</th><th>연락처</th><th>지역</th><th>가입경로</th><th>추천코드</th></tr></thead>
        <tbody>
          <tr v-if="!page.length"><td colspan="8" class="amb-empty">{{ loading ? '불러오는 중입니다' : '맞는 회원이 없습니다' }}</td></tr>
          <tr v-for="r in page" :key="r.uid">
            <td>{{ day(r.createdAt) }}</td>
            <td class="l">{{ r.email || '(메일 없음)' }}</td>
            <td>{{ r.nickname || '-' }}</td>
            <td>{{ r.realName || '-' }}</td>
            <td>{{ r.phone || '-' }}</td>
            <td>{{ r.region || '-' }}</td>
            <td :title="r.joinPathDetail">{{ r.joinPath || '-' }}</td>
            <td>{{ r.referralCode || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="shown.length > limit" type="button" class="amb-more" @click="limit += PAGE">더보기 ({{ (shown.length - limit).toLocaleString('ko-KR') }})</button>
  </section>
</template>

<style scoped>
.amb { display: grid; gap: 12px; }
.amb-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.amb-tools input { flex: 1 1 260px; height: 38px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; min-width: 0; }
.amb-tools select { height: 38px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; background: #fff; }
.amb-seg { display: inline-flex; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }
.amb-seg button { height: 36px; padding: 0 14px; border: 0; background: #fff; color: #6b7280; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.amb-seg button.on { background: #2b6df3; color: #fff; }
.amb-reload { height: 38px; padding: 0 14px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.amb-count { margin: 0; font-size: 14px; color: #374151; }
.amb-count b { color: #2b6df3; }
.amb-count small { font-size: 12px; color: #9aa6c4; }
.amb-err { margin: 0; color: #dc2626; font-size: 14px; }
.amb-table-wrap { overflow-x: auto; border: 1px solid #e8ebf1; border-radius: 8px; }
.amb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.amb-table th { padding: 10px 8px; background: #f6f8fc; color: #4b5563; font-weight: 700; white-space: nowrap; text-align: center; }
.amb-table td { padding: 9px 8px; border-top: 1px solid #eef1f6; color: #1f2937; text-align: center; white-space: nowrap; }
.amb-table td.l { text-align: left; }
.amb-empty { padding: 28px 0 !important; color: #9aa6c4 !important; }
.amb-more { justify-self: center; height: 34px; padding: 0 18px; border: 1px solid #dbe3f7; border-radius: 999px; background: #fff; color: #2b6df3; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
