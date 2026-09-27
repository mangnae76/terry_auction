export interface NumberFormatOptions {
  minFractionDigits?: number;
  maxFractionDigits?: number;
}

const DEFAULT_MIN_FRACTION_DIGITS = 0;
const DEFAULT_MAX_FRACTION_DIGITS = 2;

export const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const formatNumber = (value: unknown, options: NumberFormatOptions = {}) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return '';
  }
  return parsed.toLocaleString('ko-KR', {
    minimumFractionDigits: options.minFractionDigits ?? DEFAULT_MIN_FRACTION_DIGITS,
    maximumFractionDigits: options.maxFractionDigits ?? DEFAULT_MAX_FRACTION_DIGITS,
  });
};

export const toEditableNumberString = (value: unknown, options: NumberFormatOptions = {}) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return '';
  }
  const maxFractionDigits = options.maxFractionDigits ?? DEFAULT_MAX_FRACTION_DIGITS;
  return parsed.toFixed(maxFractionDigits).replace(/\.?0+$/g, '');
};

export const sanitizeNumericInput = (value: string, maxFractionDigits = DEFAULT_MAX_FRACTION_DIGITS) => {
  const trimmed = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!trimmed) {
    return '';
  }

  let result = '';
  let hasDot = false;
  let hasMinus = false;
  let fractionCount = 0;

  for (const char of trimmed) {
    if (char === '-' && !hasMinus && result.length === 0) {
      hasMinus = true;
      result += char;
      continue;
    }
    if (char === '.' && !hasDot) {
      hasDot = true;
      result += char;
      continue;
    }
    if (/\d/.test(char)) {
      if (!hasDot) {
        result += char;
        continue;
      }
      if (fractionCount < maxFractionDigits) {
        result += char;
        fractionCount += 1;
      }
    }
  }

  if (result === '-' || result === '.' || result === '-.') {
    return '';
  }

  return result;
};

export const parseKoreanPriceText = (value: string) => {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }

  if (/^[\d,]+(?:\.\d+)?$/.test(normalized)) {
    return toFiniteNumber(normalized);
  }

  const eokMatch = normalized.match(/(\d[\d,]*)억/);
  const manMatch = normalized.match(/(\d[\d,]*)만/);
  const cheonMatch = normalized.match(/(\d[\d,]*)천/);

  let total = 0;

  if (eokMatch) {
    total += Number(eokMatch[1].replace(/,/g, '')) * 100000000;
  }
  if (manMatch) {
    total += Number(manMatch[1].replace(/,/g, '')) * 10000;
  }
  if (cheonMatch && !manMatch) {
    total += Number(cheonMatch[1].replace(/,/g, '')) * 1000;
  }

  if (total > 0) {
    return total;
  }

  return toFiniteNumber(normalized.replace(/[^\d.-]/g, ''));
};
