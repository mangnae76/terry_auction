<script setup lang="ts">
// 칸별 걸러내기 창 — useColumnFilters 가 들고 있는 상태를 그려 준다.
// 표에 잘리지 않게 글(body) 위로 띄우고, 화면을 굴리면 머리 칸과 같이 움직인다.
import type { ColumnFilterCtl } from '../composables/useColumnFilters';

const props = defineProps<{ ctl: ColumnFilterCtl }>();
const c = props.ctl;
</script>

<template>
  <Teleport to="body">
    <div v-if="c.openKey.value" class="adm-flt-veil" @click="c.close()"></div>
    <div
      v-if="c.openKey.value"
      class="adm-flt-panel"
      :style="{ left: `${c.pos.value.left}px`, top: `${c.pos.value.top}px` }"
      @click.stop
    >
      <div class="adm-flt-top">
        <strong>{{ c.label.value }}</strong>
        <span>{{ c.draft.value.length }}/{{ c.options.value.length }}</span>
      </div>
      <input v-model="c.query.value" class="adm-flt-search" placeholder="값 찾기" />
      <div class="adm-flt-acts">
        <button type="button" @click="c.selectAll()">전체 선택</button>
        <button type="button" @click="c.selectNone()">전체 해제</button>
      </div>
      <div class="adm-flt-list" :style="{ maxHeight: `${c.pos.value.listMax}px` }">
        <label v-for="t in c.shown.value" :key="t" class="adm-flt-item">
          <input type="checkbox" :checked="c.draft.value.includes(t)" @change="c.toggle(t)" />
          <span>{{ t }}</span>
        </label>
        <p v-if="c.shown.value.length === 0" class="adm-flt-empty">값이 없습니다.</p>
      </div>
      <div class="adm-flt-foot">
        <button type="button" class="ghost" @click="c.close()">닫기</button>
        <button type="button" class="go" @click="c.apply()">적용</button>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* 창은 body 로 옮겨 가므로 scoped 를 쓰지 않는다 */
.adm-flt-veil { position: fixed; inset: 0; z-index: 9998; background: transparent; }
.adm-flt-panel {
  position: absolute; z-index: 9999; width: 240px;
  background: #fff; border: 1px solid #dfe5ef; border-radius: 12px;
  box-shadow: 0 14px 34px rgba(17, 24, 39, 0.16);
  padding: 10px; display: flex; flex-direction: column; gap: 8px;
  font-family: inherit; color: #111827;
}
.adm-flt-top { display: flex; align-items: baseline; gap: 6px; }
.adm-flt-top strong { font-size: 12.5px; font-weight: 800; }
.adm-flt-top span { margin-left: auto; font-size: 11px; font-weight: 700; color: #9ca3af; }
.adm-flt-search {
  width: 100%; box-sizing: border-box; height: 28px;
  border: 1px solid #e3e8f0; border-radius: 7px; padding: 0 8px;
  font-family: inherit; font-size: 12px; color: #111827;
}
.adm-flt-search:focus { outline: none; border-color: #2b6df3; }
.adm-flt-acts { display: flex; gap: 6px; }
.adm-flt-acts button {
  flex: 1 1 0; border: 1px solid #e3e8f0; border-radius: 7px; background: #f8fafc;
  padding: 5px 0; font-family: inherit; font-size: 11.5px; font-weight: 700;
  color: #4b5563; cursor: pointer;
}
.adm-flt-acts button:hover { border-color: #c7d7f8; color: #2b6df3; background: #fff; }
.adm-flt-list { max-height: 420px; overflow: auto; display: flex; flex-direction: column; }
.adm-flt-item {
  display: flex; align-items: center; gap: 7px; padding: 4px 4px;
  font-size: 12px; cursor: pointer; border-radius: 6px;
}
.adm-flt-item:hover { background: #f5f8ff; }
.adm-flt-item input { width: 14px; height: 14px; accent-color: #2b6df3; cursor: pointer; }
.adm-flt-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-flt-empty { margin: 8px 0; text-align: center; font-size: 11.5px; color: #9ca3af; }
.adm-flt-foot { display: flex; gap: 6px; }
.adm-flt-foot button {
  flex: 1 1 0; border-radius: 8px; padding: 7px 0;
  font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
}
.adm-flt-foot .ghost { border: 1px solid #e3e8f0; background: #fff; color: #6b7280; }
.adm-flt-foot .go { border: 1px solid #2b6df3; background: #2b6df3; color: #fff; }

/* 칸 머리의 걸러내기 단추 — 표를 쓰는 화면들이 같이 쓴다 */
.adm-table th .th-in { display: inline-flex; align-items: center; gap: 4px; }
.adm-flt {
  width: 18px; height: 18px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 5px; background: transparent;
  color: #b4bcca; cursor: pointer;
}
.adm-flt:hover { border-color: #c7d7f8; color: #2b6df3; background: #fff; }
.adm-flt.on { color: #2b6df3; background: #e8f0ff; border-color: #c7d7f8; }
.adm-flt.open { border-color: #2b6df3; color: #2b6df3; }
.adm-flt-clear {
  border: 1px solid #c7d7f8; border-radius: 999px; background: #fff;
  padding: 4px 10px; font-family: inherit; font-size: 11.5px; font-weight: 700;
  color: #2b6df3; cursor: pointer;
}
</style>
