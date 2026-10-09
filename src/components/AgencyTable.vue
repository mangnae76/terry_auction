<script setup lang="ts">
// 부동산 상담표 — 유선 상담과 현장 상담이 같은 표를 쓴다.
//
// 예전에는 두 곳에 같은 마크업이 복사돼 있어, 한쪽만 고치면 서로 어긋났다.
// 칸 구성·안내글·삭제 버튼을 여기 한곳에서만 고치면 두 화면이 같이 바뀐다.
import { ref } from 'vue';
import FormattedNumberInput from './FormattedNumberInput.vue';
import type { AgencyRow } from '../types/auction';

const props = withDefaults(defineProps<{
  rows: AgencyRow[];
  /** 편집 중인가 — 아니면 적어 둔 값만 보여 준다 */
  editing?: boolean;
  /** 이 수보다 많을 때만 줄마다 × 를 보여 준다 */
  minRows?: number;
}>(), { editing: true, minRows: 1 });

const emit = defineEmits<{
  /** 값이 바뀌었다 — 저장은 부르는 쪽이 한다 */
  (e: 'change'): void;
  /** 그 줄을 지워 달라 */
  (e: 'remove', index: number): void;
}>();

const INFO_OPTIONS = ['친절', '불친절', '적극', '비적극'];
/** 열려 있는 '정보' 드롭다운 — 표마다 따로 센다 */
const infoOpen = ref(-1);

const infoList = (row: AgencyRow) =>
  (row.info ?? '').split(',').map((v) => v.trim()).filter(Boolean);

const toggleInfo = (row: AgencyRow, opt: string) => {
  const picked = infoList(row);
  const at = picked.indexOf(opt);
  if (at >= 0) picked.splice(at, 1);
  else picked.push(opt);
  row.info = picked.join(', ');
  emit('change');
};

/** 보기 모드의 금액 — 천 단위 쉼표, 없으면 '-' */
const moneyText = (raw: string | undefined) => {
  const n = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString('ko-KR') : '-';
};

/** 칸 하나하나를 여기 적어 둔다 — 안내글을 바꾸려면 이 표만 고치면 된다 */
const MONEY_FIELDS: Array<{ key: 'jeonse' | 'real' | 'urgent'; placeholder: string }> = [
  { key: 'jeonse', placeholder: '전세가 입력' },
  { key: 'real', placeholder: '매매가 입력' },
  { key: 'urgent', placeholder: '급매가 입력' },
];
</script>

<template>
  <div class="agency-table adp-agency-list consult">
    <div v-for="(row, i) in props.rows" :key="i" class="adp-agency-item">
      <div class="adp-agency-line">
        <label class="adp-agency-fld">
          <input
            v-if="props.editing"
            v-model="row.name"
            class="adp-mkt-input left"
            placeholder="상호입력"
            @change="emit('change')"
          />
          <span v-else>{{ row.name || '-' }}</span>
        </label>
        <label class="adp-agency-fld">
          <input
            v-if="props.editing"
            v-model="row.phone"
            class="adp-mkt-input left"
            placeholder="연락처 입력"
            @change="emit('change')"
          />
          <span v-else>{{ row.phone || '-' }}</span>
        </label>
        <div class="adp-agency-fld">
          <div v-if="props.editing" class="adp-agency-multi">
            <button
              type="button"
              class="adp-mkt-input left adp-agency-trigger"
              @click="infoOpen = infoOpen === i ? -1 : i"
            >
              <span :class="['txt', { ph: !row.info }]">{{ row.info || '선택' }}</span>
              <span class="caret">▾</span>
            </button>
            <template v-if="infoOpen === i">
              <div class="adp-agency-backdrop" @click="infoOpen = -1" />
              <ul class="adp-agency-options">
                <li
                  v-for="opt in INFO_OPTIONS"
                  :key="opt"
                  :class="['adp-agency-option', { on: infoList(row).includes(opt) }]"
                  @click="toggleInfo(row, opt)"
                >
                  <span>{{ opt }}</span>
                  <span v-if="infoList(row).includes(opt)" class="ck">✓</span>
                </li>
              </ul>
            </template>
          </div>
          <span v-else>{{ row.info || '-' }}</span>
        </div>
        <button
          v-if="props.editing && props.rows.length > props.minRows"
          type="button"
          class="adp-agency-del"
          aria-label="업체 삭제"
          @click="emit('remove', i)"
        >×</button>
      </div>
      <div class="adp-agency-line">
        <label v-for="f in MONEY_FIELDS" :key="f.key" class="adp-agency-fld">
          <FormattedNumberInput
            v-if="props.editing"
            v-model="row[f.key]"
            mode="string"
            class="adp-mkt-input left"
            :placeholder="f.placeholder"
            @update:model-value="emit('change')"
          />
          <span v-else>{{ moneyText(row[f.key]) }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 쓰는 쪽(AuctionDetailPage)의 scoped 스타일은 이 안까지 닿지 않는다 —
   상담표에 필요한 모양만 여기에 따로 적어 둔다 */
.agency-table { display: flex; flex-direction: column; gap: 8px; padding: 0 2px; }
.adp-agency-item {
  background: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px 8px;
}
.adp-agency-line { display: flex; align-items: flex-end; gap: 6px; }
.adp-agency-line + .adp-agency-line {
  margin-top: 6px; padding-top: 6px; border-top: 1px solid #eef1f6;
}
.adp-agency-fld {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1px; text-align: left;
}
.adp-agency-fld > span {
  font-size: 13.5px; font-weight: 700; color: #111827; line-height: 26px; height: 26px;
  text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.adp-mkt-input {
  width: 100%; box-sizing: border-box; height: 26px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 6px; font-family: inherit; font-size: 11.5px; color: #111827; text-align: center;
}
.adp-mkt-input:focus { outline: none; border-color: #2b6df3; }
.adp-mkt-input.left { text-align: left; }
.adp-mkt-input::placeholder { color: #9ca3af; }

.adp-agency-multi { position: relative; }
.adp-agency-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 3px;
  width: 100%; cursor: pointer; font-size: 11.5px;
}
.adp-agency-trigger .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adp-agency-trigger .txt.ph { color: #9ca3af; font-weight: 400; }
.adp-agency-trigger .caret { flex: 0 0 auto; color: #9ca3af; font-size: 9px; }
.adp-agency-backdrop { position: fixed; inset: 0; z-index: 30; }
.adp-agency-options {
  position: absolute; top: calc(100% + 3px); left: 0; right: 0; z-index: 31;
  margin: 0; padding: 4px; list-style: none; min-width: 92px;
  background: #fff; border: 1px solid #e3e8f0; border-radius: 8px;
  box-shadow: 0 6px 16px rgba(17, 24, 39, 0.12);
}
.adp-agency-option {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 6px 7px; border-radius: 6px; font-size: 11px; color: #374151; cursor: pointer;
}
.adp-agency-option.on { background: #eaf1ff; color: #2b6df3; font-weight: 700; }
.adp-agency-option .ck { font-size: 10px; }
.adp-agency-del {
  flex: 0 0 26px; align-self: flex-end;
  border: 1px solid #f0d4d0; background: #fdecea; color: #e0574a;
  border-radius: 6px; height: 26px; padding: 0; line-height: 24px; font-size: 14px; cursor: pointer;
}
</style>
