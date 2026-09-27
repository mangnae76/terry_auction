<script setup lang="ts">
import { computed } from 'vue';
import type { AuctionDetail } from '../../types/auction';

const props = defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });

const defaultGuideNotes: Record<string, string> = {
  c1: '대항력 임차인인 경우, 배당 종기일이 지난 후 배당요구 경우 있다.\n배당신청 및 날짜까지 확인 필요하다. 이 경우 낙찰자 인수 이다.',
  c2: '토지만의 별도 등기가 있을 경우\n토지 별도등기자가 먼저 배당 받을 수 있음',
  c3: '선순위 임차인 있을 경우, 임금채권등 최선 순위이기 때문에 선순위 임차인 낙찰자 인수 가능성 있음\n법인의 경우 임금채권 의심/근로복지공단(체당금)최우선 변제',
  c4: '법정기일 빠른 세금이 있는 경우 확인 필요\n확정일자 보다 법정기일이 빠를 경우 선순위 이다. (당해세)\n이 경우에는 매각 불허가 처리도 가능',
};

const guideRows = computed(() => form.value.rights.checklist.slice(0, 4));

const isDefaultNote = (id: string, note: string) => note.trim() === (defaultGuideNotes[id] ?? '').trim();
</script>

<template>
  <section class="panel rights-panel">
    <h2>권리 분석</h2>
    <table class="rights-guide-table">
      <tbody>
        <tr v-for="(check, index) in guideRows" :key="check.id">
          <th v-if="index === 0" class="vertical-title" :rowspan="guideRows.length">권리분석</th>
          <th class="item-title">{{ check.label }}</th>
          <td>
            <textarea
              v-model="check.note"
              :readonly="props.readonly"
              :class="{ 'default-note': isDefaultNote(check.id, check.note) }"
              rows="3"
            />
          </td>
          <td class="check-cell">
            <label class="check-toggle">
              <input v-model="check.checked" :disabled="props.readonly" type="checkbox" />
              <span :class="['check-state', check.checked ? 'done' : 'pending']">
                {{ check.checked ? '확인완료' : '확인필요' }}
              </span>
            </label>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.rights-panel {
  padding-top: 4px;
}

.rights-guide-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
}

.rights-guide-table th,
.rights-guide-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 5px 6px;
}

.vertical-title {
  width: 76px;
  text-align: center;
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.item-title {
  width: 144px;
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  font-weight: 700;
  text-align: left;
  white-space: pre-line;
  line-height: 1.35;
}

.rights-guide-table textarea {
  width: 100%;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  resize: vertical;
  min-height: 54px;
  line-height: 1.35;
  font-size: 10px;
  padding: 6px 7px;
}

.check-cell {
  width: 96px;
  text-align: center;
  background: color-mix(in srgb, var(--bg-soft) 56%, var(--bg-card));
}

.check-toggle {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
}

.check-state.done {
  color: #15803d;
}

.check-state.pending {
  color: color-mix(in srgb, var(--text-secondary) 90%, #5b6473);
}

.rights-guide-table textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.default-note {
  color: color-mix(in srgb, var(--text-secondary) 78%, #98a1b3);
}

@media (max-width: 960px) {
  .rights-guide-table {
    table-layout: auto;
  }

  .vertical-title {
    width: 60px;
  }

  .item-title {
    width: 112px;
  }

  .rights-guide-table th,
  .rights-guide-table td {
    padding: 4px 5px;
  }

  .rights-guide-table textarea {
    min-height: 48px;
  }

  .check-cell {
    width: 80px;
  }
}
</style>
