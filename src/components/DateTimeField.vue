<script setup lang="ts">
// 날짜·시각 한 칸 — 'YYYY-MM-DDTHH:mm' 한 값을 날짜 칸과 시각 칸으로 나눠 받는다.
//
// datetime-local 한 칸으로 받으면 날짜만 고르고 시각을 비워 둔 동안 값이 아예 서지 않는다.
// 그래서 둘로 나누고, 날짜를 고르면 시각은 00:00(밤 12시)로 맞춰 둔다.
import { computed } from 'vue';

const props = defineProps<{ modelValue?: string; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const date = computed(() => (props.modelValue ?? '').slice(0, 10));
const time = computed(() => (props.modelValue ?? '').slice(11, 16));

const onDate = (ev: Event) => {
  const v = (ev.target as HTMLInputElement).value;
  emit('update:modelValue', v ? `${v}T${time.value || '00:00'}` : '');
};
const onTime = (ev: Event) => {
  const v = (ev.target as HTMLInputElement).value;
  if (!date.value) { emit('update:modelValue', ''); return; }
  emit('update:modelValue', `${date.value}T${v || '00:00'}`);
};
</script>

<template>
  <span class="dtf">
    <input type="date" class="dtf-date" :value="date" :disabled="disabled" @change="onDate" @input="onDate" />
    <input
      type="time"
      class="dtf-time"
      :value="time"
      :disabled="disabled || !date"
      @change="onTime"
      @input="onTime"
    />
  </span>
</template>

<style scoped>
/* 좁은 칸 둘이 한 줄에 — 자리가 모자라면 시각 칸이 아랫줄로 내려간다 (글자가 잘리지 않게) */
.dtf { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.dtf input {
  box-sizing: border-box; height: 38px;
  min-width: 0; border: 1px solid #e3e8f0; border-radius: 8px; padding: 2px 5px;
  font-family: inherit; font-size: 11.5px; color: #111827; background: #fff;
}
.dtf input:focus { outline: none; border-color: #2a3f8f; }
.dtf input:disabled { background: #f7f8fb; color: #9ca3af; }
/* 날짜는 '2026. 10. 01.' 만큼만, 남는 자리는 시각 칸이 가져간다 */
.dtf-date { flex: 1 1 124px; min-width: 110px; }
.dtf-time { flex: 1 1 104px; min-width: 100px; }
</style>
