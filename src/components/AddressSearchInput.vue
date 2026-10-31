<script setup lang="ts">
// 주소 찾기 칸 — 적는 동안 후보를 아래에 띄우고, 고르면 그 주소로 채운다. 후보가 없으면 적은 글 그대로 둔다
import { onBeforeUnmount, ref } from 'vue';
import { searchAddress, type AddressHit } from '../services/addressSearch';

const props = defineProps<{ modelValue: string; placeholder?: string; inputClass?: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const hits = ref<AddressHit[]>([]);
const open = ref(false);
const busy = ref(false);
const cur = ref(-1);
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

const find = (q: string) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const my = ++seq;
    if (q.trim().length < 2) { hits.value = []; open.value = false; return; }
    busy.value = true;
    const r = await searchAddress(q);
    if (my !== seq) return;
    busy.value = false; hits.value = r; cur.value = -1; open.value = true;
  }, 250);
};
const onInput = (e: Event) => { const v = (e.target as HTMLInputElement).value; emit('update:modelValue', v); find(v); };
const pick = (h: AddressHit) => { emit('update:modelValue', h.address); open.value = false; hits.value = []; };
const onKey = (e: KeyboardEvent) => {
  if (!open.value || !hits.value.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); cur.value = (cur.value + 1) % hits.value.length; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cur.value = (cur.value - 1 + hits.value.length) % hits.value.length; }
  else if (e.key === 'Enter' && cur.value >= 0) { e.preventDefault(); pick(hits.value[cur.value]); }
  else if (e.key === 'Escape') open.value = false;
};
const onBlur = () => { setTimeout(() => { open.value = false; }, 150); };
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>

<template>
  <div class="asi">
    <span class="asi-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        :value="props.modelValue"
        :class="props.inputClass"
        :placeholder="props.placeholder"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        autocomplete="off"
        @input="onInput"
        @keydown="onKey"
        @focus="hits.length && (open = true)"
        @blur="onBlur"
      />
    </span>
    <ul v-if="open" class="asi-list" role="listbox">
      <li v-if="busy" class="asi-empty">찾는 중…</li>
      <li v-else-if="!hits.length" class="asi-empty">찾는 주소가 없습니다 — 그대로 적어도 됩니다</li>
      <li v-for="(h, i) in hits" v-else :key="h.address" :class="{ on: i === cur }" role="option" :aria-selected="i === cur" @mousedown.prevent="pick(h)">
        <b>{{ h.address }}</b><small v-if="h.sub">{{ h.sub }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.asi { position: relative; }
.asi-box { position: relative; display: block; }
.asi-box svg { position: absolute; left: 12px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); color: #9aa3b2; pointer-events: none; }
.asi-box input { width: 100%; box-sizing: border-box; padding-left: 36px !important; }
.asi-list { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); max-height: 300px; overflow-y: auto; margin: 0; padding: 4px; list-style: none; border: 1px solid #dfe4ec; border-radius: 10px; background: #fff; box-shadow: 0 12px 28px -12px rgba(15, 23, 42, .35); }
.asi-list li { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px; border-radius: 7px; cursor: pointer; }
.asi-list li:hover, .asi-list li.on { background: #f3f6fd; }
.asi-list b { font-size: 14px; font-weight: 600; color: #111827; }
.asi-list small { font-size: 12px; color: #6b7280; }
.asi-list .asi-empty { cursor: default; font-size: 13px; color: #9aa3b2; }
.asi-list .asi-empty:hover { background: none; }
</style>
