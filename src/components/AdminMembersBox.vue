<script setup lang="ts">
// 운영 › 회원 관리 — 가입한 회원 목록 · 찾기(DB users, 운영자만 읽는다).
import { computed, onMounted, ref } from 'vue';
import { userMessage } from '../services/userMessage';
import { loadMembers, type MemberRow } from '../services/adminMembersRepository';
import { EMPTY_STATUS, daysLeft, loadAllStatus, saveStatus, stateOf, todayYmd, type MemberStatus } from '../services/memberStatus';
import { isAdminEmail } from '../services/accessControl';
import { useAuthStore } from '../stores/authStore';

const rows = ref<MemberRow[]>([]);
/** 회원마다 이용 상태(차단 · 이용 기한) — 문서가 없으면 이용 중(기한 없음) */
const statusMap = ref<Record<string, MemberStatus>>({});
const auth = useAuthStore();
const statusOf = (uid: string) => statusMap.value[uid] ?? EMPTY_STATUS;
const isOp = (r: MemberRow) => isAdminEmail(r.email);
const today = todayYmd();
/** 상태 글 · 색 — 운영자는 늘 이용 중 */
const stateText = (r: MemberRow) => {
  if (isOp(r)) return ['이용 중', 'ok'];
  const s = statusOf(r.uid); const st = stateOf(s, today); const left = daysLeft(s, today);
  if (st === 'blocked') return ['차단', 'bad'];
  if (st === 'expired') return ['기한 만료', 'bad'];
  if (left != null && left <= 7) return [`${left}일 남음`, 'warn'];
  return ['이용 중', 'ok'];
};
const loading = ref(false);
const loadErr = ref('');
const loadedAt = ref('');
const load = async () => {
  loading.value = true;
  try {
    const [m, st] = await Promise.all([loadMembers(), loadAllStatus().catch(() => ({} as Record<string, MemberStatus>))]);
    rows.value = m; statusMap.value = st;
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
/** 상태 거르기 — 전체 · 차단 · 기한 만료 · 7일 안 만료 */
const stFilter = ref<'all' | 'blocked' | 'expired' | 'soon'>('all');
const stPass = (r: MemberRow) => {
  if (stFilter.value === 'all') return true;
  if (isOp(r)) return false;
  const s = statusOf(r.uid); const st = stateOf(s, today); const left = daysLeft(s, today);
  return stFilter.value === 'blocked' ? st === 'blocked' : stFilter.value === 'expired' ? st === 'expired' : st === 'active' && left != null && left <= 7;
};
const paths = computed(() => [...new Set(rows.value.map((r) => r.joinPath).filter(Boolean))]);
const since = computed(() => (period.value === 'all' ? '' : new Date(Date.now() - Number(period.value) * 86400000).toISOString()));
const shown = computed(() => {
  const k = q.value.trim().toLowerCase();
  return rows.value.filter((r) => stPass(r) && (!path.value || r.joinPath === path.value)
    && (!since.value || r.createdAt >= since.value)
    && (!k || [r.email, r.nickname, r.realName, r.phone].some((v) => v.toLowerCase().includes(k))));
});
const PAGE = 100;
const limit = ref(PAGE);
const page = computed(() => shown.value.slice(0, limit.value));

const day = (iso: string) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-');

/* ===== 관리 — 줄 아래 펼침: 차단(사유) · 이용 기한(+30 · +90 · +1년 · 날짜 · 기한 없음) ===== */
const editUid = ref('');
const draft = ref<MemberStatus>({ ...EMPTY_STATUS });
const saving = ref(false);
const saveErr = ref('');
const openEdit = (r: MemberRow) => {
  if (editUid.value === r.uid) { editUid.value = ''; return; }
  editUid.value = r.uid; draft.value = { ...statusOf(r.uid) }; saveErr.value = '';
};
const addDays = (n: number) => {
  const base = draft.value.until && draft.value.until >= today ? new Date(`${draft.value.until}T00:00:00`) : new Date(`${today}T00:00:00`);
  base.setDate(base.getDate() + n); draft.value.until = todayYmd(base);
};
const saveEdit = async (r: MemberRow) => {
  saving.value = true; saveErr.value = '';
  try {
    const next: MemberStatus = { ...draft.value, reason: draft.value.blocked ? draft.value.reason.trim() : '' };
    await saveStatus(r.uid, next, auth.email || '');
    statusMap.value = { ...statusMap.value, [r.uid]: { ...next, by: auth.email || '' } };
    editUid.value = '';
  } catch (e) {
    saveErr.value = userMessage(e, '저장하지 못했습니다. 운영자 계정인지 확인해 주세요.');
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <section class="adb-card amb">
    <div class="amb-tools">
      <input v-model="q" type="search" placeholder="메일 · 닉네임 · 이름 · 연락처 찾기" @input="limit = PAGE" />
      <select v-model="path" @change="limit = PAGE"><option value="">가입경로 전체</option><option v-for="p in paths" :key="p" :value="p">{{ p }}</option></select>
      <div class="amb-seg">
        <button v-for="[v, t] in [['all', '전체'], ['7', '7일'], ['30', '30일']]" :key="v" type="button" :class="{ on: period === v }" @click="period = v as 'all' | '7' | '30'; limit = PAGE">{{ t }}</button>
      </div>
      <div class="amb-seg">
        <button v-for="[v, t] in [['all', '상태 전체'], ['blocked', '차단'], ['expired', '기한 만료'], ['soon', '7일 안 만료']]" :key="v" type="button" :class="{ on: stFilter === v }" @click="stFilter = v as 'all' | 'blocked' | 'expired' | 'soon'; limit = PAGE">{{ t }}</button>
      </div>
      <button type="button" class="amb-reload" :disabled="loading" @click="load">{{ loading ? '불러오는 중' : '새로고침' }}</button>
    </div>
    <p class="amb-count">회원 <b>{{ rows.length.toLocaleString('ko-KR') }}</b>명<template v-if="shown.length !== rows.length"> · 찾은 회원 <b>{{ shown.length.toLocaleString('ko-KR') }}</b>명</template><small v-if="loadedAt"> · {{ loadedAt }} 기준</small></p>
    <p v-if="loadErr" class="amb-err">{{ loadErr }}</p>
    <div v-else class="amb-table-wrap">
      <table class="amb-table">
        <thead><tr><th>가입일</th><th>메일</th><th>닉네임</th><th>이름</th><th>연락처</th><th>지역</th><th>가입경로</th><th>추천코드</th><th>구분</th><th>상태</th><th>이용 기한</th><th>최근 접속</th><th>관리</th></tr></thead>
        <tbody>
          <tr v-if="!page.length"><td colspan="13" class="amb-empty">{{ loading ? '불러오는 중입니다' : '맞는 회원이 없습니다' }}</td></tr>
          <template v-for="r in page" :key="r.uid">
          <tr :class="{ editing: editUid === r.uid }">
            <td>{{ day(r.createdAt) }}</td>
            <td class="l cut" :title="r.email || undefined">{{ r.email || '(메일 없음)' }}</td>
            <td class="cut nick" :title="r.nickname || undefined">{{ r.nickname || '-' }}</td>
            <td>{{ r.realName || '-' }}</td>
            <td>{{ r.phone || '-' }}</td>
            <td>{{ r.region || '-' }}</td>
            <td :title="r.joinPathDetail">{{ r.joinPath || '-' }}</td>
            <td>{{ r.referralCode || '-' }}</td>
            <td><span :class="['amb-kind', { op: isOp(r) }]">{{ isOp(r) ? '운영자' : '회원' }}</span></td>
            <td><span :class="['amb-st', stateText(r)[1]]" :title="statusOf(r.uid).reason || undefined">{{ stateText(r)[0] }}</span></td>
            <td>{{ isOp(r) ? '-' : statusOf(r.uid).until ? day(statusOf(r.uid).until) : '기한 없음' }}</td>
            <td>{{ r.lastSeenAt ? day(r.lastSeenAt) : '-' }}</td>
            <td><button v-if="!isOp(r)" type="button" class="amb-edit" :aria-expanded="editUid === r.uid" @click="openEdit(r)">{{ editUid === r.uid ? '닫기' : '관리' }}</button><span v-else class="amb-dim">-</span></td>
          </tr>
          <!-- 관리 펼침 — 차단 · 이용 기한. 저장하면 그 회원이 다음에 웹 · 앱을 열 때부터 막힌다 -->
          <tr v-if="editUid === r.uid" class="amb-edit-row">
            <td colspan="13">
              <div class="amb-ed">
                <label class="amb-blk"><input v-model="draft.blocked" type="checkbox" />차단<small>웹 · 앱을 쓰지 못하게 합니다</small></label>
                <input v-if="draft.blocked" v-model="draft.reason" class="amb-reason" maxlength="120" placeholder="차단 사유(회원에게 보입니다)" />
                <span class="amb-sep" aria-hidden="true" />
                <span class="amb-lab">이용 기한</span>
                <input v-model="draft.until" type="date" class="amb-date" />
                <button type="button" @click="addDays(30)">+30일</button>
                <button type="button" @click="addDays(90)">+90일</button>
                <button type="button" @click="addDays(365)">+1년</button>
                <button type="button" @click="draft.until = ''">기한 없음</button>
                <span class="amb-grow" />
                <button type="button" class="amb-save" :disabled="saving" @click="saveEdit(r)">{{ saving ? '저장 중…' : '저장하기' }}</button>
              </div>
              <p v-if="saveErr" class="amb-err">{{ saveErr }}</p>
            </td>
          </tr>
          </template>
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
.amb-table th { padding: 10px 6px; background: #f6f8fc; color: #4b5563; font-weight: 700; white-space: nowrap; text-align: center; }
.amb-table td { padding: 9px 6px; border-top: 1px solid #eef1f6; color: #1f2937; text-align: center; white-space: nowrap; }
.amb-table td.l { text-align: left; }
.amb-table td.cut { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }   /* 긴 메일 · 닉네임은 말줄임(마우스 올리면 전체) — 표가 가로로 넘치지 않게 */
.amb-table td.cut.nick { max-width: 110px; }
.amb-empty { padding: 28px 0 !important; color: #9aa6c4 !important; }
.amb-kind { display: inline-block; padding: 1px 7px; border-radius: 5px; background: #f1f3f8; color: #4b5563; font-size: 12px; font-weight: 700; }
.amb-kind.op { background: #fff1e6; color: #e8590c; }
.amb-st { display: inline-block; padding: 1px 7px; border-radius: 5px; font-size: 12px; font-weight: 700; }
.amb-st.ok { background: #e8f6ee; color: #1f7a45; }
.amb-st.warn { background: #fff4e5; color: #b45309; }
.amb-st.bad { background: #fdecec; color: #c22e2e; }
.amb-edit { height: 28px; padding: 0 10px; border: 1px solid #c9d6f5; border-radius: 7px; background: #fff; color: #2b6df3; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.amb-dim { color: #c3c9d4; }
.amb-table tr.editing td { background: #f5f8ff; }
.amb-edit-row td { background: #f5f8ff; text-align: left; white-space: normal; }
.amb-ed { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.amb-ed button { height: 32px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 7px; background: #fff; color: #374151; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.amb-blk { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: #c22e2e; }
.amb-blk small { font-size: 12px; font-weight: 400; color: #6b7280; }
.amb-reason { flex: 1 1 220px; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 7px; font: inherit; font-size: 13px; }
.amb-sep { width: 1px; height: 22px; background: #dde3ee; }
.amb-lab { font-size: 13px; font-weight: 700; color: #374151; }
.amb-date { height: 32px; padding: 0 8px; border: 1px solid #dde3ee; border-radius: 7px; font: inherit; font-size: 13px; }
.amb-grow { flex: 1 1 auto; }
.amb-ed .amb-save { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.amb-more { justify-self: center; height: 34px; padding: 0 18px; border: 1px solid #dbe3f7; border-radius: 999px; background: #fff; color: #2b6df3; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
