<script setup lang="ts">
// 표 만들기 — 칸에 바로 적고, 행과 열을 늘리고 줄인다.
// 다 적으면 본문 글자(| 꼴)로 바꿔서 돌려준다. 규칙은 services/boardBody 에 있다.
import { ref, watch } from 'vue';

const props = defineProps<{ head: string[]; rows: string[][] }>();
const emit = defineEmits<{
  (e: 'apply', v: { head: string[]; rows: string[][] }): void;
  (e: 'close'): void;
}>();

const useHead = ref(true);
const head = ref<string[]>([]);
const rows = ref<string[][]>([]);

const load = () => {
  const width = Math.max(props.head.length, ...props.rows.map((r) => r.length), 2);
  const fit = (cells: string[]) => Array.from({ length: width }, (_, i) => cells[i] ?? '');
  useHead.value = props.head.length > 0;
  head.value = fit(props.head);
  rows.value = props.rows.length ? props.rows.map(fit) : [fit([]), fit([])];
};
load();
watch(() => [props.head, props.rows], load);

const addCol = () => {
  head.value.push('');
  rows.value.forEach((r) => r.push(''));
};
const delCol = () => {
  if (head.value.length <= 1) return;
  head.value.pop();
  rows.value.forEach((r) => r.pop());
};
const addRow = () => rows.value.push(Array.from({ length: head.value.length }, () => ''));
const delRow = () => { if (rows.value.length > 1) rows.value.pop(); };

const apply = () => {
  emit('apply', {
    head: useHead.value ? [...head.value] : [],
    rows: rows.value.map((r) => [...r]),
  });
};
</script>

<template>
  <div class="te">
    <div class="te-bar">
      <strong>표</strong>
      <label class="te-chk"><input v-model="useHead" type="checkbox" /> 머리글</label>
      <span class="te-grp">
        <small>열 {{ head.length }}</small>
        <button type="button" @click="delCol">−</button>
        <button type="button" @click="addCol">＋</button>
      </span>
      <span class="te-grp">
        <small>행 {{ rows.length }}</small>
        <button type="button" @click="delRow">−</button>
        <button type="button" @click="addRow">＋</button>
      </span>
    </div>

    <div class="te-grid">
      <table>
        <thead v-if="useHead">
          <tr>
            <th v-for="(_c, i) in head" :key="`h${i}`">
              <input v-model="head[i]" placeholder="머리글" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, ri) in rows" :key="`r${ri}`">
            <td v-for="(_c, ci) in r" :key="`c${ri}-${ci}`">
              <input v-model="rows[ri][ci]" placeholder="내용" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="te-foot">
      <button type="button" class="te-cancel" @click="emit('close')">그만두기</button>
      <button type="button" class="te-ok" @click="apply">본문에 넣기</button>
    </div>
  </div>
</template>

<style scoped>
.te { border: 1px solid #c7d2ea; border-radius: 10px; background: #f9fbff; padding: 10px; }
.te-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.te-bar strong { font-size: 12.5px; font-weight: 800; color: #2a3f8f; }
.te-chk { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #4b5563; cursor: pointer; }
.te-chk input { width: 14px; height: 14px; accent-color: #2a3f8f; }
.te-grp { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.te-grp + .te-grp { margin-left: 0; }
.te-grp small { font-size: 11px; color: #6b7280; font-weight: 700; }
.te-grp button {
  width: 22px; height: 22px; padding: 0; border: 1px solid #c7d2ea; border-radius: 5px;
  background: #fff; font-family: inherit; font-size: 12px; font-weight: 800; color: #2a3f8f; cursor: pointer;
}
.te-grid { overflow-x: auto; }
.te-grid table { width: 100%; border-collapse: collapse; }
.te-grid th, .te-grid td { border: 1px solid #dfe5f0; padding: 0; }
.te-grid th { background: #eef2fb; }
.te-grid input {
  width: 100%; box-sizing: border-box; min-width: 70px; height: 32px;
  border: none; background: transparent; padding: 0 7px;
  font-family: inherit; font-size: 12px; color: #111827;
}
.te-grid th input { font-weight: 800; }
.te-grid input:focus { outline: 2px solid #c7d2ea; outline-offset: -2px; }
.te-foot { display: flex; gap: 7px; margin-top: 9px; }
.te-foot button { flex: 1 1 0; height: 32px; border-radius: 7px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.te-cancel { border: 1px solid #d8def0; background: #fff; color: #4b5563; }
.te-ok { border: none; background: #2a3f8f; color: #fff; }
</style>
