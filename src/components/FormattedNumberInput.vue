<script setup lang="ts">
import { ref, watch } from 'vue';
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
  }>(),
  {
    readonly: false,
    placeholder: '',
    mode: 'number',
    minFractionDigits: 0,
    maxFractionDigits: 2,
    align: 'right',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | string): void;
}>();

const isFocused = ref(false);
const displayValue = ref('');

const updateDisplayFromModel = () => {
  // 저장된 값이 없는 필드(optional)도 받을 수 있게 빈 값으로 보정한다
  const model = props.modelValue ?? '';
  displayValue.value = isFocused.value
    ? toEditableNumberString(model, { maxFractionDigits: props.maxFractionDigits })
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
  const normalized = sanitizeNumericInput(target.value, props.maxFractionDigits);
  displayValue.value = normalized;
  emitValue(normalized);
};

const onFocus = () => {
  isFocused.value = true;
  displayValue.value = toEditableNumberString(props.modelValue ?? '', { maxFractionDigits: props.maxFractionDigits });
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
