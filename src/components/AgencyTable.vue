<script setup lang="ts">
// 부동산 상담표 — 유선 상담과 현장 상담이 같은 표를 쓴다.
//
// 예전에는 두 곳에 같은 마크업이 복사돼 있어, 한쪽만 고치면 서로 어긋났다.
// 칸 구성·안내글·삭제 버튼을 여기 한곳에서만 고치면 두 화면이 같이 바뀐다.
import { ref } from 'vue';
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
/** 늘 돌아다니는 중개업소 — 유선·현장 상담표가 같은 목록을 쓴다 */
const NAME_OPTIONS = ['애플', '아이빌', '에이스', '명가'];
/** 열려 있는 드롭다운 — 표마다 따로 센다 */
const infoOpen = ref(-1);
const nameOpen = ref(-1);

/** 고를 수 있는 업체 — 목록에 없는 이름이 이미 적혀 있으면 그것도 같이 보여 준다.
 *  (예전에 손으로 적어 둔 업체가 목록에서 사라지면 안 된다) */
const nameOptions = (row: AgencyRow) => {
  const cur = (row.name ?? '').trim();
  return cur && !NAME_OPTIONS.includes(cur) ? [...NAME_OPTIONS, cur] : NAME_OPTIONS;
};
const pickName = (row: AgencyRow, opt: string) => {
  // 고른 것을 다시 누르면 지운다 — 잘못 고른 줄을 비울 길이 있어야 한다
  row.name = row.name === opt ? '' : opt;
  nameOpen.value = -1;
  emit('change');
};

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

// 금액은 '억'으로 적는다. 2.5억이면 2.5, 1억이면 1 — 숫자만 치면 되니
// 폰에서 한글로 바꿔 '억'을 칠 일이 없다. 단위는 칸 끝에 붙여 보여 준다.
const WON_PER_EOK = 100000000;
/** 칸에 띄울 값. 적은 그대로 돌려주되, 예전에 원 단위로 적어 둔 값은 억으로 환산한다.
 *  (쉼표가 있거나 1000 이 넘으면 원 단위다 — 상담표에 1000억을 적을 일은 없다)
 *  적은 그대로 돌려주는 게 중요하다. '2.' 까지 쳤을 때 숫자로 바꿔 버리면 점이 지워진다. */
const moneyInput = (raw: string | undefined) => {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const n = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (!text.includes(',') && n < 1000) return text;
  return String(Math.round((n / WON_PER_EOK) * 100) / 100);
};
/** 보기 모드의 금액 — '2.5억', 없으면 '-' */
const moneyText = (raw: string | undefined) => {
  const v = moneyInput(raw).replace(/\.$/, '');
  return v ? `${v}억` : '-';
};
/** 숫자와 소수점만 받는다. 점은 하나까지 */
const setMoney = (row: AgencyRow, key: MoneyKey, el: HTMLInputElement) => {
  const cleaned = el.value.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1');
  row[key] = cleaned;
  // 걸러 낸 글자는 칸에서도 지운다. 값만 고치면 화면은 그대로라('2.5.9') 적은 것과
  // 담긴 것이 달라 보인다 — 바뀐 값이 아니라서 화면이 다시 그려지지 않는 탓이다.
  if (el.value !== cleaned) el.value = cleaned;
  emit('change');
};

/** 칸 하나하나를 여기 적어 둔다 — 차례나 이름을 바꾸려면 이 표만 고치면 된다.
 *  'urgent' 는 예전에 급매가였다가 입금가가 된 칸이다. 적어 둔 값을 잃지 않으려고
 *  키 이름은 그대로 두고, 급매가는 'quick' 으로 따로 받는다. */
type MoneyKey = 'real' | 'urgent' | 'quick';
const MONEY_FIELDS: Array<{ key: MoneyKey; placeholder: string }> = [
  { key: 'urgent', placeholder: '입금가' },
  { key: 'real', placeholder: '매매가' },
  { key: 'quick', placeholder: '급매가' },
];
</script>

<template>
  <div class="agency-table adp-agency-list consult">
    <div v-for="(row, i) in props.rows" :key="i" class="adp-agency-item">
      <div class="adp-agency-line">
        <div class="adp-agency-fld">
          <div v-if="props.editing" class="adp-agency-multi">
            <button
              type="button"
              class="adp-mkt-input left adp-agency-trigger"
              @click="nameOpen = nameOpen === i ? -1 : i"
            >
              <span :class="['txt', { ph: !row.name }]">{{ row.name || '상호선택' }}</span>
              <span class="caret">▾</span>
            </button>
            <template v-if="nameOpen === i">
              <div class="adp-agency-backdrop" @click="nameOpen = -1" />
              <ul class="adp-agency-options">
                <li
                  v-for="opt in nameOptions(row)"
                  :key="opt"
                  :class="['adp-agency-option', { on: row.name === opt }]"
                  @click="pickName(row, opt)"
                >
                  <span>{{ opt }}</span>
                  <span v-if="row.name === opt" class="ck">✓</span>
                </li>
              </ul>
            </template>
          </div>
          <span v-else>{{ row.name || '-' }}</span>
        </div>
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
          <span v-if="props.editing" class="adp-agency-money">
            <input
              class="adp-mkt-input left money"
              inputmode="decimal"
              :placeholder="f.placeholder"
              :value="moneyInput(row[f.key])"
              @input="setMoney(row, f.key, $event.target as HTMLInputElement)"
            />
            <em>억</em>
          </span>
          <span v-else>{{ moneyText(row[f.key]) }}</span>
        </label>
      </div>
      <!-- 셋째 줄 — 금액으로는 안 남는 말을 적는 자리. 한 줄을 통으로 쓴다 -->
      <div class="adp-agency-line">
        <label class="adp-agency-fld wide">
          <input
            v-if="props.editing"
            v-model="row.note"
            class="adp-mkt-input left note"
            placeholder="비고"
            @change="emit('change')"
          />
          <span v-else :class="['note-txt', { filled: !!row.note }]">{{ row.note || '비고' }}</span>
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
/* 비고 — 손품+현장의 다른 비고와 같은 규칙: 적은 글씨만 빨갛고 안내문구는 회색 */
.adp-agency-fld.wide { flex: 1 1 100%; }
.adp-mkt-input.note { color: #e0574a; font-weight: 400; }
.adp-mkt-input.note::placeholder { color: #9ca3af; font-weight: 400; }
.adp-agency-fld > span.note-txt { font-size: 11.5px; font-weight: 400; color: #9ca3af; }
.adp-agency-fld > span.note-txt.filled { color: #e0574a; font-weight: 400; }
.adp-mkt-input::placeholder { color: #9ca3af; }
/* 금액 — 단위 '억'을 칸 끝에 붙여 둔다. 적는 쪽은 숫자만 치면 된다 */
.adp-agency-money { position: relative; display: block; }
.adp-agency-money .adp-mkt-input.money { padding-right: 19px; }
.adp-agency-money em {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  font-style: normal; font-size: 11px; font-weight: 700; color: #6b7280; pointer-events: none;
}

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
