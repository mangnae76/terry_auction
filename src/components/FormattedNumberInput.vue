<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { formatNumber, sanitizeNumericInput, toEditableNumberString, toFiniteNumber } from '../utils/numberFormat';

const props = withDefaults(
  defineProps<{
    modelValue: number | string | undefined;
    readonly?: boolean;
    placeholder?: string;
    mode?: 'number' | 'string';
    minFractionDigits?: number;
    maxFractionDigits?: number;
    align?: 'left' | 'center' | 'right';
    /** 적는 중에도 천 단위 쉼표를 보여 줄 것인가 (금액칸처럼 자릿수가 헷갈리는 자리) */
    liveGroup?: boolean;
  }>(),
  {
    readonly: false,
    placeholder: '',
    mode: 'number',
    minFractionDigits: 0,
    maxFractionDigits: 2,
    align: 'right',
    liveGroup: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | string): void;
}>();

const isFocused = ref(false);
const displayValue = ref('');

/** 적는 중의 숫자에 쉼표만 끼워 넣는다. 반올림·자릿수 보정은 하지 않는다 —
 *  '1.' 처럼 아직 덜 적은 모양도 그대로 두어야 다음 글자를 이어 적을 수 있다. */
const groupDigits = (v: string) => {
  if (!v) return '';
  const neg = v.startsWith('-');
  const body = neg ? v.slice(1) : v;
  const dot = body.indexOf('.');
  const int = dot >= 0 ? body.slice(0, dot) : body;
  const rest = dot >= 0 ? body.slice(dot) : '';
  return `${neg ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${rest}`;
};
/** 쉼표를 끼우면 글자 수가 달라져 커서가 튄다 — '왼쪽에 숫자가 몇 개 있었나'로 되돌린다 */
const putCaretAfterDigits = (el: HTMLInputElement, text: string, digits: number) => {
  let i = 0;
  let seen = 0;
  while (i < text.length && seen < digits) {
    if (/\d/.test(text[i])) seen += 1;
    i += 1;
  }
  el.setSelectionRange(i, i);
};

const updateDisplayFromModel = () => {
  // 저장된 값이 없는 필드(optional)도 받을 수 있게 빈 값으로 보정한다
  const model = props.modelValue ?? '';
  const editable = toEditableNumberString(model, { maxFractionDigits: props.maxFractionDigits });
  displayValue.value = isFocused.value
    ? (props.liveGroup ? groupDigits(editable) : editable)
    : formatNumber(model, {
        minFractionDigits: props.minFractionDigits,
        maxFractionDigits: props.maxFractionDigits,
      });
};

const emitValue = (value: string, finalize = false) => {
  if (!value) {
    emit('update:modelValue', props.mode === 'string' ? '' : 0);
    return;
  }

  if (props.mode === 'string') {
    emit(
      'update:modelValue',
      finalize
        ? formatNumber(value, {
            minFractionDigits: props.minFractionDigits,
            maxFractionDigits: props.maxFractionDigits,
          })
        : value,
    );
    return;
  }

  const parsed = toFiniteNumber(value);
  emit('update:modelValue', parsed ?? 0);
};

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const raw = target.value;
  const caret = target.selectionStart ?? raw.length;
  const normalized = sanitizeNumericInput(raw, props.maxFractionDigits);
  emitValue(normalized);
  if (!props.liveGroup) {
    displayValue.value = normalized;
    return;
  }
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
  const grouped = groupDigits(normalized);
  displayValue.value = grouped;
  void nextTick(() => putCaretAfterDigits(target, grouped, digitsBefore));
};

const onFocus = () => {
  isFocused.value = true;
  const editable = toEditableNumberString(props.modelValue ?? '', { maxFractionDigits: props.maxFractionDigits });
  displayValue.value = props.liveGroup ? groupDigits(editable) : editable;
};

const onBlur = () => {
  isFocused.value = false;
  const normalized = sanitizeNumericInput(displayValue.value, props.maxFractionDigits);
  emitValue(normalized, true);
  updateDisplayFromModel();
};

watch(
  () => props.modelValue,
  () => {
    if (!isFocused.value) {
      updateDisplayFromModel();
    }
  },
  { immediate: true },
);
</script>

<template>
  <input
    :value="displayValue"
    :readonly="readonly"
    :placeholder="placeholder"
    :class="[`align-${align}`]"
    inputmode="decimal"
    type="text"
    @blur="onBlur"
    @focus="onFocus"
    @input="onInput"
  />
</template>

<style scoped>
.align-left {
  text-align: left;
}

.align-center {
  text-align: center;
}

.align-right {
  text-align: right;
}
</style>
