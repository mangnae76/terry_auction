<script setup lang="ts">
import { ref, watch } from 'vue';
import { rememberSkip, type ConfirmBox } from '../services/confirmBox';

const props = defineProps<{ box: ConfirmBox | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const skipToday = ref(false);
// 창이 새로 뜰 때마다 체크는 풀고 시작한다
watch(() => props.box, (b) => { if (b) skipToday.value = false; });

const onOk = async () => {
  const box = props.box;
  emit('close');
  if (!box) return;
  if (skipToday.value) rememberSkip(box.skipKey);
  await box.run();
};
</script>

<template>
  <div v-if="box" class="acf-wrap">
    <div class="acf-backdrop" @click="emit('close')" />
    <div class="acf-box" role="dialog" aria-modal="true">
      <p class="acf-title">{{ box.title }}</p>
      <p class="acf-desc">{{ box.desc }}</p>
      <label v-if="box.skipKey" class="acf-skip">
        <input v-model="skipToday" type="checkbox" />
        오늘 하루 보지 않기
      </label>
      <div class="acf-btns">
        <button type="button" class="cancel" @click="emit('close')">취소</button>
        <button type="button" class="ok" @click="onOk">{{ box.okLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acf-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(15, 23, 42, 0.45); }
.acf-box {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 201;
  width: min(88vw, 340px);
  background: #fff; border-radius: 14px; padding: 18px 18px 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28);
}
.acf-title { margin: 0 0 6px; font-size: 15px; font-weight: 800; color: #111827; }
.acf-desc { margin: 0 0 14px; font-size: 12.5px; font-weight: 400; color: #6b7280; line-height: 1.45; }
.acf-skip {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: #4b5563; cursor: pointer; user-select: none;
}
.acf-skip input { width: 16px; height: 16px; }
.acf-btns { display: flex; gap: 8px; margin-top: 16px; }
.acf-btns button {
  flex: 1 1 0; height: 38px; border-radius: 9px; font-size: 13.5px; font-weight: 700;
  font-family: inherit; cursor: pointer;
}
.acf-btns .cancel { border: 1px solid #d5dbe6; background: #fff; color: #4b5563; }
.acf-btns .ok { border: none; background: #d14343; color: #fff; }
</style>
