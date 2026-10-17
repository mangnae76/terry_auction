<script setup lang="ts">
// 사진 칸 — 한 줄에 넷, 정사각형. 빈자리는 '+' 로 둔다.
// 물건상세의 모든 사진 자리가 이 한 벌을 쓴다 (규칙이 갈라지지 않게).
const props = withDefaults(defineProps<{
  /** 사진 목록 (photoId 거나 URL) */
  items: string[];
  /** 몇 장까지 받을지 */
  max?: number;
  /** 보여 줄 주소로 바꾸는 함수 */
  src: (entry: string) => string;
  /** 못 읽은 사진 표시 */
  broken?: Record<string, boolean>;
  /** 읽기 전용이면 '+' 와 지우기를 내지 않는다 */
  readonly?: boolean;
  alt?: string;
}>(), { max: 4, broken: () => ({}), readonly: false, alt: '사진' });

const emit = defineEmits<{
  (e: 'open', src: string): void;
  (e: 'remove', index: number): void;
  (e: 'add'): void;
  (e: 'error', entry: string): void;
}>();

/** 빈자리 수 — 꽉 찼으면 없다 */
const blanks = () => Math.max(0, props.max - props.items.length);
</script>

<template>
  <div class="pg">
    <div v-for="(entry, i) in items.slice(0, max)" :key="entry" class="pg-cell">
      <img
        :src="src(entry)"
        :alt="alt"
        class="pg-img"
        @click="emit('open', src(entry))"
        @error="emit('error', entry)"
      />
      <button
        v-if="!readonly"
        type="button"
        class="pg-del"
        :aria-label="`${alt} 삭제`"
        @click.stop="emit('remove', i)"
      >×</button>
      <span v-if="broken[entry]" class="pg-bad" title="이미지를 읽지 못했습니다">!</span>
    </div>
    <button
      v-for="n in (readonly ? 0 : blanks())"
      :key="`blank-${n}`"
      type="button"
      class="pg-cell pg-add"
      :aria-label="`${alt} 추가`"
      @click="emit('add')"
    >+</button>
  </div>
</template>

<style scoped>
.pg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.pg-cell {
  position: relative; aspect-ratio: 1 / 1; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #f3f4f6;
}
.pg-img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.pg-del {
  position: absolute; top: 3px; right: 3px;
  width: 18px; height: 18px; padding: 0; border: none; border-radius: 50%;
  background: rgba(17, 24, 39, 0.55); color: #fff;
  font-size: 12px; line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.pg-bad {
  position: absolute; left: 3px; bottom: 3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #dc2626; color: #fff; font-size: 11px; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
/* 빈자리 — 눌러서 사진을 고른다 */
.pg-add {
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed #cbd5e1; background: #fafbfd;
  font-family: inherit; font-size: 22px; font-weight: 300; color: #9aa4b2; cursor: pointer;
}
.pg-add:active { background: #f1f5f9; }
</style>
