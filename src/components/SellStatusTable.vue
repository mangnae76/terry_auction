<script setup lang="ts">
// 부동산 물건 현황 — 낙찰이후 · 매도·임대에서 쓰는 표.
//
// 손품·현장의 상담표(AgencyTable)에서 갈라져 나왔다. 그쪽은 '얼마에 팔리나'를
// 듣는 자리고, 여기는 내 물건을 어떻게 내놓을지 적는 자리라 칸이 다르다 —
// 매도면 입금·매도가, 임대(월세·전세)면 전세가·월세가를 받는다.
import { onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { telDigits, useAgencyBook } from '../services/agencyBook';
import type { AgencyRow } from '../types/auction';
import { formatPhone } from '../utils/phone';

const props = withDefaults(defineProps<{
  rows: AgencyRow[];
  /** 'agency' 는 중개업체 목록, 'direct' 는 직거래 자리(피터팬·당근) */
  mode?: 'agency' | 'direct';
  /** 편집 중인가 — 아니면 적어 둔 값만 보여 준다 */
  editing?: boolean;
  /** 이 수보다 많을 때만 줄마다 × 를 보여 준다 */
  minRows?: number;
}>(), { editing: true, minRows: 1, mode: 'agency' });

const emit = defineEmits<{
  /** 값이 바뀌었다 — 저장은 부르는 쪽이 한다 */
  (e: 'change'): void;
  /** 그 줄을 지워 달라 */
  (e: 'remove', index: number): void;
}>();

const DEAL_OPTIONS = ['매도', '임대'];
/** 임대 쪽이면 전세·월세 칸을 보여 준다 */
const isRent = (row: AgencyRow) => ['임대', '월세', '전세'].includes((row.info ?? '').trim());
/** 열려 있는 드롭다운 — 표마다 따로 센다 */
const infoOpen = ref(-1);
const nameOpen = ref(-1);

// 고를 수 있는 업체는 '중개업소 관리'에서 사용자가 손보는 목록이다 (services/agencyBook)
const auth = useAuthStore();
const book = useAgencyBook();
onMounted(() => { void book.load(auth.uid); });
watch(() => auth.uid, (uid) => { void book.load(uid); });

/** 직거래 자리 — 중개업체 관리와는 다른 목록이다 */
const DIRECT_NAMES = ['피터팬', '당근'];
/** 고를 수 있는 이름. 목록에 없는 이름이 이미 적혀 있으면 그것도 같이 보여 준다 —
 *  예전에 손으로 적어 둔 곳이 사라지면 안 된다 */
const nameOptions = (row: AgencyRow) => {
  const names = props.mode === 'direct' ? [...DIRECT_NAMES] : [...book.names.value];
  const cur = (row.name ?? '').trim();
  return cur && !names.includes(cur) ? [...names, cur] : names;
};
const pickName = (row: AgencyRow, opt: string) => {
  // 고른 것을 다시 누르면 지운다 — 잘못 고른 줄을 비울 길이 있어야 한다
  const off = row.name === opt;
  row.name = off ? '' : opt;
  // 전화번호는 적어 둔 목록에서 따라온다. 손으로 고쳐 둔 번호는 덮지 않는다 —
  // 그 업소의 다른 직통번호를 적어 두는 일이 있다.
  const known = book.findByName(opt);
  const typed = (row.phone ?? '').trim();
  const fromBook = book.agencies.value.some((a) => a.phone === typed);
  if (!off && known && (!typed || fromBook)) row.phone = known.phone;
  nameOpen.value = -1;
  emit('change');
};
/** 걸 수 있는 번호인가 — 숫자가 있어야 전화 단추를 띄운다 */
const telHref = (phone: string | undefined) => {
  const d = telDigits(phone ?? '');
  return d.length >= 8 ? `tel:${d}` : '';
};

/** 구분은 하나만 고른다 — 고른 것을 다시 누르면 비운다 */
const pickDeal = (row: AgencyRow, opt: string) => {
  row.info = row.info === opt ? '' : opt;
  infoOpen.value = -1;
  emit('change');
};

// 금액은 '억'으로 적는다. 2.5억이면 2.5, 1억이면 1 — 숫자만 치면 되니
// 폰에서 한글로 바꿔 '억'을 칠 일이 없다. 단위는 칸 끝에 붙여 보여 준다.
const WON_PER_EOK = 100000000;
/** 칸에 띄울 값. 적은 그대로 돌려주되, 예전에 원 단위로 적어 둔 값은 억으로 환산한다.
 *  (쉼표가 있거나 1000 이 넘으면 원 단위다 — 상담표에 1000억을 적을 일은 없다)
 *  적은 그대로 돌려주는 게 중요하다. '2.' 까지 쳤을 때 숫자로 바꿔 버리면 점이 지워진다. */
const moneyInput = (raw: string | undefined, asIs = false) => {
  if (asIs) return String(raw ?? '').trim();
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const n = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (!text.includes(',') && n < 1000) return text;
  return String(Math.round((n / WON_PER_EOK) * 100) / 100);
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
type MoneyKey = 'real' | 'realTo' | 'urgent' | 'urgentTo' | 'jeonse' | 'jeonseTo' | 'monthly' | 'monthlyTo';
/** 금액은 '얼마에서 얼마' 범위로 듣는다 — 중개업소는 한 값으로 말하지 않는다.
 *  'urgent' 는 예전에 급매가였다가 입금가가 된 칸이다. 적어 둔 값을 잃지
 *  않으려고 키 이름은 그대로 두고, 위쪽 값만 'To' 를 붙여 새로 받는다. */
type MoneyGroup = { label: string; from: MoneyKey; to: MoneyKey; unit: string; single?: boolean };
const SALE_GROUPS: MoneyGroup[] = [
  { label: '입금', from: 'urgent', to: 'urgentTo', unit: '억' },
  { label: '매도', from: 'real', to: 'realTo', unit: '억' },
];
const RENT_GROUPS: MoneyGroup[] = [
  { label: '전세', from: 'jeonse', to: 'jeonseTo', unit: '억' },
  { label: '월세', from: 'monthly', to: 'monthlyTo', unit: '만' },
];
/** 그 줄에 보여 줄 금액 칸 — 매도면 입금·매도, 임대면 전세·월세.
 *  직거래에는 입금가를 두지 않는다 (중개가 끼지 않아 입금가를 따로 셀 일이 없다) */
const groupsFor = (row: AgencyRow): MoneyGroup[] => {
  const base = isRent(row) ? RENT_GROUPS : SALE_GROUPS;
  if (props.mode !== 'direct') return base;
  // 직거래 — 입금가는 두지 않고, 매도가는 한 칸으로 받는다
  return base
    .filter((g) => g.label !== '입금')
    .map((g) => (g.label === '매도' ? { ...g, single: true } : g));
};

/** 매수문의 — 직거래에서 연락 온 사람을 이름·연락처로 적어 둔다 */
const buyersOf = (row: AgencyRow) => {
  if (!row.buyers) row.buyers = [];
  return row.buyers;
};
const addBuyer = (row: AgencyRow) => {
  buyersOf(row).push({ name: '', phone: '' });
  emit('change');
};
const removeBuyer = (row: AgencyRow, i: number) => {
  buyersOf(row).splice(i, 1);
  emit('change');
};
const setBuyerPhone = (row: AgencyRow, i: number, el: HTMLInputElement) => {
  const next = formatPhone(el.value);
  buyersOf(row)[i].phone = next;
  if (el.value !== next) el.value = next;
  emit('change');
};
/** 보기 모드의 범위 — 아래위가 다 있으면 '1.4~1.45억', 하나뿐이면 '1.45억' */
const rangeText = (row: AgencyRow, g: MoneyGroup) => {
  const lo = moneyInput(row[g.from]).replace(/\.$/, '');
  const hi = moneyInput(row[g.to]).replace(/\.$/, '');
  if (lo && hi) return `${lo}~${hi}${g.unit}`;
  const one = lo || hi;
  return one ? `${one}${g.unit}` : '-';
};
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
        <!-- 직거래에는 윗줄 연락처를 두지 않는다 — 연락은 매수문의에 적는다 -->
        <label v-if="props.mode !== 'direct'" class="adp-agency-fld">
          <span v-if="props.editing" class="adp-agency-tel">
            <input
              v-model="row.phone"
              class="adp-mkt-input left"
              :class="{ dial: telHref(row.phone) }"
              inputmode="tel"
              placeholder="연락처 입력"
              @input="emit('change')"
            />
            <a v-if="telHref(row.phone)" class="adp-agency-call" :href="telHref(row.phone)" aria-label="전화 걸기" @click.stop>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
            </a>
          </span>
          <a v-else-if="telHref(row.phone)" class="adp-agency-tel-view" :href="telHref(row.phone)">{{ row.phone }}</a>
          <span v-else>-</span>
        </label>
        <div class="adp-agency-fld">
          <div v-if="props.editing" class="adp-agency-multi">
            <button
              type="button"
              class="adp-mkt-input left adp-agency-trigger"
              @click="infoOpen = infoOpen === i ? -1 : i"
            >
              <span :class="['txt', { ph: !row.info }]">{{ row.info || '매도/임대' }}</span>
              <span class="caret">▾</span>
            </button>
            <template v-if="infoOpen === i">
              <div class="adp-agency-backdrop" @click="infoOpen = -1" />
              <ul class="adp-agency-options">
                <li
                  v-for="opt in DEAL_OPTIONS"
                  :key="opt"
                  :class="['adp-agency-option', { on: row.info === opt }]"
                  @click="pickDeal(row, opt)"
                >
                  <span>{{ opt }}</span>
                  <span v-if="row.info === opt" class="ck">✓</span>
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
      <!-- 둘째 줄 — 금액은 범위로 적는다. 이름과 단위는 칸 바깥에 둔다 -->
      <div class="adp-agency-line money">
        <span v-for="g in groupsFor(row)" :key="g.from" class="adp-agency-range">
          <em class="lab">{{ g.label }}</em>
          <template v-if="props.editing && g.single">
            <span class="rng-wrap">
              <input
                class="rng"
                inputmode="decimal"
                :value="moneyInput(row[g.from], g.unit === '만')"
                @input="setMoney(row, g.from, $event.target as HTMLInputElement)"
              />
              <em class="unit">{{ g.unit }}</em>
            </span>
          </template>
          <template v-else-if="props.editing">
            <input
              class="rng"
              inputmode="decimal"
              :value="moneyInput(row[g.from], g.unit === '만')"
              @input="setMoney(row, g.from, $event.target as HTMLInputElement)"
            />
            <em class="sep">~</em>
            <!-- 단위는 뒤쪽 칸 안에 둔다 — 밖에 두니 칸 폭만 깎아먹었다 -->
            <span class="rng-wrap">
              <input
                class="rng"
                inputmode="decimal"
                :value="moneyInput(row[g.to], g.unit === '만')"
                @input="setMoney(row, g.to, $event.target as HTMLInputElement)"
              />
              <em class="unit">{{ g.unit }}</em>
            </span>
          </template>
          <strong v-else class="val">{{ rangeText(row, g) }}</strong>
        </span>
      </div>
      <!-- 셋째·넷째 줄 — 금액으로는 안 남는 말. 길게 적을 일이 많아 줄을 통으로 쓴다 -->
      <div class="adp-agency-line">
        <label class="adp-agency-fld note-fld wide">
          <em class="lab">의견</em>
          <input
            v-if="props.editing"
            v-model="row.opinion"
            class="adp-mkt-input left note"
            @input="emit('change')"
          />
          <span v-else :class="['note-txt', { filled: !!row.opinion }]">{{ row.opinion || '-' }}</span>
        </label>
      </div>
      <!-- 매수문의 — 직거래에서 연락 온 사람을 줄줄이 적는다 -->
      <div v-if="props.mode === 'direct'" class="adp-agency-line buyers">
        <div class="buyers-wrap">
          <div class="buyers-head">
            <em class="lab">매수문의</em>
            <button v-if="props.editing" type="button" class="buyers-add" @click="addBuyer(row)">＋</button>
          </div>
          <div v-for="(b, bi) in buyersOf(row)" :key="bi" class="buyers-row">
            <template v-if="props.editing">
              <input v-model="b.name" class="adp-mkt-input left" placeholder="이름" @input="emit('change')" />
              <input
                :value="b.phone"
                class="adp-mkt-input left"
                inputmode="tel"
                placeholder="연락처"
                @input="setBuyerPhone(row, bi, $event.target as HTMLInputElement)"
              />
              <a v-if="telHref(b.phone)" class="adp-agency-call" :href="telHref(b.phone)" aria-label="전화 걸기" @click.stop>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
              </a>
              <button type="button" class="adp-agency-del" aria-label="문의 빼기" @click="removeBuyer(row, bi)">×</button>
            </template>
            <span v-else class="buyers-view">{{ b.name || '-' }} · {{ b.phone || '-' }}</span>
          </div>
          <p v-if="buyersOf(row).length === 0" class="buyers-empty">＋ 를 눌러 연락 온 사람을 적어 두세요.</p>
        </div>
      </div>
      <!-- 협의 칸은 중개 쪽에서만 쓴다 — 직거래에는 둘 일이 없다 -->
      <div v-if="props.mode !== 'direct'" class="adp-agency-line">
        <label class="adp-agency-fld note-fld wide">
          <em class="lab">협의</em>
          <input
            v-if="props.editing"
            v-model="row.note"
            class="adp-mkt-input left note"
            @input="emit('change')"
          />
          <span v-else :class="['note-txt', { filled: !!row.note }]">{{ row.note || '-' }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 매수문의 — 이름·연락처를 줄줄이 */
.adp-agency-line.buyers { display: block; }
.buyers-wrap { width: 100%; }
.buyers-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.buyers-head .lab { font-style: normal; font-size: 11px; font-weight: 700; color: #6b7280; }
.buyers-add {
  width: 22px; height: 22px; padding: 0;
  border: 1px solid #dde3ee; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 13px; line-height: 1; color: #2b6df3; cursor: pointer;
}
.buyers-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.buyers-row .adp-mkt-input { flex: 1 1 0; min-width: 0; }
.buyers-view { font-size: 12px; color: #374151; }
.buyers-empty { margin: 0; font-size: 11px; color: #9ca3af; }
/* 쓰는 쪽(AuctionDetailPage)의 scoped 스타일은 이 안까지 닿지 않는다 —
   상담표에 필요한 모양만 여기에 따로 적어 둔다 */
.agency-table { display: flex; flex-direction: column; gap: 6px; padding: 0 2px; }
.adp-agency-item {
  background: #fafbfc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 5px 10px 6px;
}
.adp-agency-line { display: flex; align-items: flex-end; gap: 6px; }
.adp-agency-line + .adp-agency-line {
  margin-top: 4px; padding-top: 4px; border-top: 1px solid #eef1f6;
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
/* 협의·비고 — 이름을 칸 왼쪽에 세우고 칸은 남은 폭을 다 쓴다 */
.adp-agency-fld.note-fld { flex-direction: row; align-items: center; gap: 4px; }

.adp-agency-fld.note-fld > .adp-mkt-input,
.adp-agency-fld.note-fld > span { flex: 1 1 auto; min-width: 0; }
/* 전화번호 — 번호가 있으면 끝에 거는 단추가 선다 */
.adp-agency-tel { position: relative; display: block; }
.adp-agency-tel .adp-mkt-input.dial { padding-right: 24px; }
.adp-agency-call {
  position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 19px; height: 19px; border-radius: 5px;
  background: #eaf1ff; color: #2b6df3;
}
.adp-agency-fld > a.adp-agency-tel-view {
  font-size: 13.5px; font-weight: 700; color: #2b6df3; line-height: 26px; height: 26px;
  text-decoration: underline; text-underline-offset: 2px;
}
.adp-mkt-input.note { color: #e0574a; font-weight: 400; }
.adp-mkt-input.note::placeholder { color: #9ca3af; font-weight: 400; }
.adp-agency-fld > span.note-txt { font-size: 11.5px; font-weight: 400; color: #9ca3af; }
.adp-agency-fld > span.note-txt.filled { color: #e0574a; font-weight: 400; }
.adp-mkt-input::placeholder { color: #9ca3af; }
/* 금액 — '입금가 [ ] ~ [ ] 억'. 이름·물결·단위는 칸 바깥의 글자다 */
.adp-agency-line.money { gap: 8px; }
.adp-agency-range {
  flex: 1 1 0; min-width: 0;
  display: flex; align-items: center; gap: 3px;
}
/* 이름 칸의 폭을 못 박아 둔다 — 아래 '의견'·'협의'와 입력칸이 같은 자리에서
   시작해야 줄이 가지런히 보인다 */
.adp-agency-range .lab,
.adp-agency-fld.note-fld > .lab {
  flex: 0 0 26px; font-style: normal; font-size: 11px; font-weight: 700;
  color: #6b7280; white-space: nowrap;
}
.adp-agency-range .sep {
  flex: 0 0 auto; font-style: normal; font-size: 10.5px; font-weight: 700; color: #9ca3af;
}
/* 뒤쪽 칸 — 단위를 칸 오른쪽 안에 겹쳐 세운다 */
.adp-agency-range .rng-wrap { position: relative; flex: 1 1 0; min-width: 0; display: block; }
/* 칸을 감쌌으니 폭을 다시 일러 준다 — 안 그러면 입력칸이 제 기본 폭(약 177px)을
   고집해 줄 밖으로 밀려난다 */
.adp-agency-range .rng-wrap input.rng {
  width: 100%; box-sizing: border-box; padding-right: 17px; text-align: right;
}
.adp-agency-range .unit {
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  font-style: normal; font-size: 10.5px; font-weight: 700; color: #9ca3af; pointer-events: none;
}
.adp-agency-range input.rng {
  flex: 1 1 0; min-width: 0; box-sizing: border-box; height: 26px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; padding: 2px 4px;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #111827; text-align: center;
}
.adp-agency-range input.rng:focus { outline: none; border-color: #2b6df3; }
.adp-agency-range .val {
  flex: 1 1 auto; min-width: 0; text-align: right;
  font-size: 13px; font-weight: 800; color: #111827;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
