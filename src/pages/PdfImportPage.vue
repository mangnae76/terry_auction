<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import {
  listDrivePdfFiles,
  parseDrivePdfFile,
  parsePdfFile,
  type ParsedPdfAuction,
} from '../services/pdfAuctionImport';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import buildingIcon from '../assets/icones/building (1).png';
import housePlusIcon from '../assets/icones/house-plus (1).png';
import houseMinusIcon from '../assets/icones/house-m.png';
import banIcon from '../assets/icones/ban.png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import searchIcon from '../assets/icones/searchs.png';
import filesIcon from '../assets/icones/files.png';
import userStarIcon from '../assets/icones/user-star.png';
import infoIcon from '../assets/icones/info.png';

type RowStatus = 'error' | '신규' | '변경' | '기존';

interface ImportPreviewRow {
  key: string;
  sourceName: string;
  status: 'ready' | 'error';
  rowStatus: RowStatus;
  parsed?: ParsedPdfAuction;
  error?: string;
  sourceType: 'drive' | 'file';
}

const DEFAULT_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1nBYw59L5J895mbyWzC7cZUapQ2rG81W4';

const store = useAuctionStore();
const authStore = useAuthStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const driveFolderUrl = ref(DEFAULT_DRIVE_FOLDER);
const importRows = ref<ImportPreviewRow[]>([]);
const loading = ref(false);
const loadingLabel = ref('');
const message = ref('');
const statsCollapsed = ref(false);
const resultsCollapsed = ref(false);
const lastUpdate = ref('');
const banner = ref('');

const favorites = ref<string[]>([]);
const favListOpen = ref(false);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const showToast = (msg: string) => {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 1800);
};

// 사용자 전환·로그아웃 시 모든 로컬 상태를 비워서 다른 사용자의 데이터가 보이지 않도록 함
const resetPrefsState = () => {
  favorites.value = [];
  banner.value = '';
  lastUpdate.value = '';
  importRows.value = [];
};

// Firestore에서 사용자별 상태를 동기화. 저장 직후 watcher가 자기 자신의 값을 다시
// 저장하는 루프를 막기 위해 hydration 동안 watcher 동작을 일시 정지한다.
let suppressWriteback = false;
const hydrateFromCloud = async (uid: string) => {
  suppressWriteback = true;
  try {
    resetPrefsState();
    if (!uid) return;
    const prefs = await loadUserPrefs(uid);
    if (!prefs) return;
    if (Array.isArray(prefs.pdfImportFolderFavorites)) {
      favorites.value = prefs.pdfImportFolderFavorites.filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      );
    }
    if (typeof prefs.pdfImportBanner === 'string') banner.value = prefs.pdfImportBanner;
    if (typeof prefs.pdfImportLastUpdate === 'string') lastUpdate.value = prefs.pdfImportLastUpdate;
    if (Array.isArray(prefs.pdfImportLastRows)) {
      importRows.value = prefs.pdfImportLastRows as ImportPreviewRow[];
    }
  } finally {
    suppressWriteback = false;
  }
};

onMounted(() => {
  void hydrateFromCloud(authStore.uid);
});

watch(() => authStore.uid, (newUid) => {
  void hydrateFromCloud(newUid);
});

watch(importRows, (val) => {
  if (suppressWriteback) return;
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { pdfImportLastRows: val });
}, { deep: true });

watch(banner, (val) => {
  if (suppressWriteback) return;
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { pdfImportBanner: val });
});

watch(lastUpdate, (val) => {
  if (suppressWriteback) return;
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { pdfImportLastUpdate: val });
});

watch(favorites, (val) => {
  if (suppressWriteback) return;
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { pdfImportFolderFavorites: val });
}, { deep: true });

const formatTime = () => {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const hh = String(((h + 11) % 12) + 1).padStart(2, '0');
  return `${ampm} ${hh}:${m}`;
};

const existingByCase = computed(() => {
  const map = new Map<string, typeof store.auctions[number]>();
  store.auctions.forEach((item) => {
    if (item.caseNumber) map.set(item.caseNumber, item);
  });
  return map;
});

const classifyRow = (parsed: ParsedPdfAuction): RowStatus => {
  const existing = existingByCase.value.get(parsed.caseNumber);
  return existing ? '변경' : '신규';
};

const newCount = computed(() => importRows.value.filter((r) => r.rowStatus === '신규').length);
const changedCount = computed(() => importRows.value.filter((r) => r.rowStatus === '변경').length);
const errorCount = computed(() => importRows.value.filter((r) => r.rowStatus === 'error').length);
const totalRegistered = computed(() => store.auctions.length);

const readyRows = computed(() => importRows.value.filter((row) => row.status === 'ready' && row.parsed));

const upsertRows = (rows: ImportPreviewRow[]) => {
  const merged = new Map(importRows.value.map((row) => [row.key, row]));
  rows.forEach((row) => {
    merged.set(row.key, row);
  });
  importRows.value = [...merged.values()];
};

const openFilePicker = () => {
  fileInputRef.value?.click();
};

const autoSaveReady = async () => {
  const parsedRows = readyRows.value
    .map((row) => row.parsed)
    .filter((row): row is ParsedPdfAuction => Boolean(row));
  if (parsedRows.length === 0) return;
  try {
    await store.importParsedPdfAuctions(parsedRows);
  } catch {
    // ignore — banner already shows status
  }
};

const parseFiles = async (files: File[]) => {
  if (files.length === 0) return;

  loading.value = true;
  loadingLabel.value = `PDF ${files.length}개 분석 중`;
  message.value = '';
  banner.value = '';

  try {
    const rows: ImportPreviewRow[] = [];
    for (const file of files) {
      try {
        const parsed = await parsePdfFile(file);
        rows.push({
          key: `file-${file.name}`,
          sourceName: file.name,
          status: 'ready',
          rowStatus: classifyRow(parsed),
          parsed,
          sourceType: 'file',
        });
      } catch (error) {
        rows.push({
          key: `file-${file.name}`,
          sourceName: file.name,
          status: 'error',
          rowStatus: 'error',
          error: error instanceof Error ? error.message : 'PDF 해석 중 오류가 발생했습니다.',
          sourceType: 'file',
        });
      }
    }
    upsertRows(rows);
    await autoSaveReady();
    lastUpdate.value = formatTime();
    banner.value = `${formatTime()} PDF ${rows.filter((r) => r.status === 'ready').length}건 등록 완료`;
  } finally {
    loading.value = false;
    loadingLabel.value = '';
  }
};

const onFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = [...(target.files ?? [])];
  await parseFiles(files);
  target.value = '';
};

const scanDriveFolder = async () => {
  if (!driveFolderUrl.value.trim()) {
    message.value = 'Google Drive 폴더 링크를 입력해 주세요.';
    return;
  }

  loading.value = true;
  loadingLabel.value = 'Google Drive 폴더 스캔 중';
  message.value = '';
  banner.value = '';

  try {
    const files = await listDrivePdfFiles(driveFolderUrl.value);
    const rows: ImportPreviewRow[] = [];

    for (const file of files) {
      try {
        const parsed = await parseDrivePdfFile(file, driveFolderUrl.value);
        rows.push({
          key: `drive-${file.id}`,
          sourceName: file.name,
          status: 'ready',
          rowStatus: classifyRow(parsed),
          parsed,
          sourceType: 'drive',
        });
      } catch (error) {
        rows.push({
          key: `drive-${file.id}`,
          sourceName: file.name,
          status: 'error',
          rowStatus: 'error',
          error: error instanceof Error ? error.message : 'Drive PDF 해석 중 오류가 발생했습니다.',
          sourceType: 'drive',
        });
      }
    }

    upsertRows(rows);
    await autoSaveReady();
    lastUpdate.value = formatTime();
    banner.value = `${formatTime()} 구글드라이브 스캔 완료`;
  } catch (error) {
    banner.value =
      error instanceof Error
        ? error.message
        : 'Google Drive 폴더를 읽지 못했습니다. PDF 파일 직접 선택을 사용해 주세요.';
  } finally {
    loading.value = false;
    loadingLabel.value = '';
  }
};

const saveFavorite = () => {
  const url = driveFolderUrl.value.trim();
  if (!url) {
    showToast('주소를 입력해 주세요.');
    return;
  }
  if (favorites.value.includes(url)) {
    showToast('이미 저장된 주소입니다.');
    return;
  }
  favorites.value = [...favorites.value, url];
  showToast('즐겨찾기에 저장되었습니다.');
};

const pickFavoriteUrl = (url: string) => {
  driveFolderUrl.value = url;
  favListOpen.value = false;
};

const removeFavorite = (url: string) => {
  favorites.value = favorites.value.filter((u) => u !== url);
  if (favorites.value.length === 0) favListOpen.value = false;
  showToast('즐겨찾기에서 삭제되었습니다.');
};

const summaryShort = (parsed: ParsedPdfAuction) =>
  parsed.address || parsed.roadAddress || '주소 미확인';

const fileTitle = (row: ImportPreviewRow) => {
  if (row.parsed?.sourceName) return row.parsed.sourceName;
  return row.sourceName;
};
</script>

<template>
  <section class="pip-shell">
    <div class="pip-fixed-top">
      <div class="pip-title-row">
        <h1 class="pip-title">관심물건등록</h1>
        <button
          type="button"
          class="pip-chev-btn"
          :aria-expanded="!statsCollapsed"
          aria-label="통계 카드 접기"
          @click="statsCollapsed = !statsCollapsed"
        >
          <img :src="chevronDownIcon" alt="" :class="['pip-chev', { up: statsCollapsed }]" />
        </button>
      </div>

      <div v-if="!statsCollapsed" class="pip-stats">
        <article class="pip-stat">
          <small>총 등록물건</small>
          <div class="pip-stat-row">
            <img :src="buildingIcon" alt="" class="pip-stat-icon" />
            <strong>{{ totalRegistered }}<em>개</em></strong>
          </div>
        </article>
        <article class="pip-stat">
          <small>신규물건</small>
          <div class="pip-stat-row">
            <img :src="housePlusIcon" alt="" class="pip-stat-icon" />
            <strong>{{ newCount }}<em>개</em></strong>
          </div>
        </article>
        <article class="pip-stat">
          <small>변경물건</small>
          <div class="pip-stat-row">
            <img :src="houseMinusIcon" alt="" class="pip-stat-icon" />
            <strong>{{ changedCount }}<em>개</em></strong>
          </div>
        </article>
        <article class="pip-stat">
          <small>오류물건</small>
          <div class="pip-stat-row">
            <img :src="banIcon" alt="" class="pip-stat-icon" />
            <strong>{{ errorCount }}<em>개</em></strong>
          </div>
        </article>
      </div>
    </div>

    <div class="pip-body">
      <div class="pip-section-head">
        <span class="pip-section-title">구글드라이브 연동</span>
        <img :src="infoIcon" alt="" class="pip-info-ico" />
      </div>

      <div class="pip-input-wrap">
        <input
          v-model="driveFolderUrl"
          :class="['pip-input', { 'is-default': driveFolderUrl === DEFAULT_DRIVE_FOLDER }]"
          placeholder="구글 드라이버 주소입력"
          type="text"
          @focus="favListOpen = false"
        />
        <button
          v-if="favorites.length > 0"
          type="button"
          class="pip-input-chev"
          :aria-expanded="favListOpen"
          aria-label="즐겨찾기 목록 열기"
          @click.stop="favListOpen = !favListOpen"
        >
          <img :src="chevronDownIcon" alt="" :class="['pip-chev-sm', { up: favListOpen }]" />
        </button>
        <button
          type="button"
          class="pip-input-icn"
          aria-label="즐겨찾기에 저장"
          @click="saveFavorite"
        >
          <img :src="userStarIcon" alt="" />
        </button>

        <ul v-if="favListOpen && favorites.length > 0" class="pip-fav-dropdown">
          <li
            v-for="url in favorites"
            :key="url"
            class="pip-fav-dropdown-item"
            @click="pickFavoriteUrl(url)"
          >
            <span class="pip-fav-dropdown-text">{{ url }}</span>
            <button
              type="button"
              class="pip-fav-dropdown-del"
              aria-label="삭제"
              @click.stop="removeFavorite(url)"
            >×</button>
          </li>
        </ul>
      </div>

      <div class="pip-actions">
        <button class="pip-btn pip-btn-scan" :disabled="loading" type="button" @click="scanDriveFolder">
          <img :src="searchIcon" alt="" class="pip-btn-icn" />
          폴더스캔
        </button>
        <button class="pip-btn pip-btn-pdf" :disabled="loading" type="button" @click="openFilePicker">
          <img :src="filesIcon" alt="" class="pip-btn-icn" />
          PDF등록
        </button>
      </div>

      <div v-if="banner || loading" class="pip-banner">
        <span v-if="loading" class="pip-banner-dot" /><span v-if="loading" class="pip-banner-dot" /><span v-if="loading" class="pip-banner-dot" />
        <span class="pip-banner-text">{{ loading ? (loadingLabel || '처리 중') + '…' : banner }}</span>
      </div>

      <input ref="fileInputRef" accept="application/pdf" class="sr-only" multiple type="file" @change="onFileChange" />

      <section class="pip-results">
        <div class="pip-results-head">
          <h2>파싱결과</h2>
          <button
            type="button"
            class="pip-chev-btn"
            :aria-expanded="!resultsCollapsed"
            aria-label="결과 접기"
            @click="resultsCollapsed = !resultsCollapsed"
          >
            <img :src="chevronDownIcon" alt="" :class="['pip-chev', { up: resultsCollapsed }]" />
          </button>
        </div>

        <div v-if="!resultsCollapsed">
          <div v-if="importRows.length === 0" class="pip-empty">
            <div class="pip-empty-icon">📂</div>
            <p>PDF를 선택하거나 Google Drive 폴더를 스캔하면</p>
            <p>여기에 미리보기가 표시됩니다.</p>
          </div>

          <ul v-else class="pip-result-list">
            <li v-for="row in importRows" :key="row.key" class="pip-result-item">
              <div class="pip-result-text">
                <strong>{{ fileTitle(row) }}</strong>
                <p v-if="row.status === 'ready' && row.parsed">{{ summaryShort(row.parsed) }}</p>
                <p v-else class="err">{{ row.error }}</p>
              </div>
              <span :class="['pip-badge', `s-${row.rowStatus === 'error' ? 'error' : row.rowStatus}`]">
                {{ row.rowStatus === 'error' ? '오류' : row.rowStatus }}
              </span>
            </li>
          </ul>

          <div v-if="importRows.length > 0" class="pip-result-foot">
            <span class="pip-update">UPDATE : {{ lastUpdate || '—' }}</span>
            <span class="pip-count">{{ importRows.length }}건</span>
          </div>
        </div>
      </section>
    </div>

    <AppMobileBottomNav active="watchlist" />

    <div v-if="toast" class="pip-toast">{{ toast }}</div>
  </section>
</template>

<style scoped>
.pip-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: 76px;
}

.pip-fixed-top { background: #f3f4f6; }

.pip-title-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 6px;
}
.pip-title {
  margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.3px;
}
.pip-chev-btn {
  border: none; background: transparent; cursor: pointer; padding: 4px;
  display: inline-flex; align-items: center; justify-content: center;
}
.pip-chev { width: 20px; height: 20px; object-fit: contain; transition: transform 0.2s; }
.pip-chev.up { transform: rotate(180deg); }

.pip-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 0 12px 10px;
}
.pip-stat {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 8px 6px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  min-width: 0;
}
.pip-stat small {
  font-size: 11px; color: #6b7280; font-weight: 600;
}
.pip-stat-row { display: inline-flex; align-items: center; gap: 5px; }
.pip-stat-icon { width: 20px; height: 20px; object-fit: contain; opacity: 0.85; }
.pip-stat strong {
  font-size: 24px; font-weight: 900; color: #111827; line-height: 1; letter-spacing: -0.5px;
}
.pip-stat strong em {
  font-style: normal; font-size: 13px; font-weight: 700; color: #374151; margin-left: 2px;
}

.pip-body {
  flex: 1 1 auto;
  padding: 4px 12px 16px;
  display: flex; flex-direction: column; gap: 10px;
}

.pip-section-head {
  display: flex; align-items: center; gap: 6px;
  margin-top: 4px;
}
.pip-section-title {
  font-size: 14px; font-weight: 800; color: #111827;
}
.pip-info-ico { width: 14px; height: 14px; object-fit: contain; opacity: 0.55; }

.pip-input-wrap {
  position: relative;
  display: flex; align-items: center;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 0 8px;
}
.pip-input {
  flex: 1 1 auto; min-width: 0;
  border: none; outline: none; background: transparent;
  padding: 12px 6px; font-size: 13px; color: #111827;
}
.pip-input::placeholder { color: #9ca3af; }
.pip-input.is-default { color: #9ca3af; }
.pip-input-icn {
  flex: 0 0 auto;
  border: none; background: transparent; cursor: pointer;
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px;
  font-size: 18px; font-weight: 700; color: #6b7280;
}
.pip-input-icn img { width: 22px; height: 22px; object-fit: contain; }
.pip-input-icn:hover { background: #f3f4f6; }

.pip-input-chev {
  flex: 0 0 auto;
  border: none; background: transparent; cursor: pointer;
  width: 28px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px;
}
.pip-input-chev:hover { background: #f3f4f6; }
.pip-chev-sm { width: 16px; height: 16px; object-fit: contain; transition: transform 0.2s; }
.pip-chev-sm.up { transform: rotate(180deg); }

.pip-input-wrap { position: relative; }

.pip-fav-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  list-style: none; margin: 0; padding: 4px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  max-height: 220px; overflow-y: auto;
  z-index: 50;
}
.pip-fav-dropdown-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 6px;
  cursor: pointer;
  font-size: 12px; color: #111827;
}
.pip-fav-dropdown-item:hover { background: #f1f5f9; }
.pip-fav-dropdown-text {
  flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-fav-dropdown-del {
  flex: 0 0 auto;
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #9ca3af; line-height: 1; padding: 0 4px;
}
.pip-fav-dropdown-del:hover { color: #ef4444; }

.pip-toast {
  position: fixed; left: 50%; bottom: 96px;
  transform: translateX(-50%);
  background: rgba(17, 24, 39, 0.92); color: #fff;
  padding: 11px 18px; border-radius: 999px;
  font-size: 13px; font-weight: 700;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.32);
  z-index: 300;
  white-space: nowrap;
}

.pip-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.pip-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: none; border-radius: 12px;
  padding: 16px 12px; font-size: 16px; font-weight: 800;
  color: #fff; cursor: pointer;
  letter-spacing: -0.3px;
}
.pip-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pip-btn-scan { background: #14b8a6; }
.pip-btn-pdf { background: #f87171; }
.pip-btn-icn { width: 18px; height: 18px; object-fit: contain; filter: brightness(0) invert(1); }

.pip-banner {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: #e5e7eb; color: #374151;
  border-radius: 10px; padding: 10px 12px;
  font-size: 12.5px; font-weight: 700;
}
.pip-banner-text { color: #2b6df3; }
.pip-banner-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #2b6df3;
  animation: pipDot 1.2s infinite ease-in-out;
}
.pip-banner-dot:nth-child(2) { animation-delay: 0.2s; }
.pip-banner-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes pipDot {
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

.pip-results {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 10px 12px;
}
.pip-results-head {
  display: flex; align-items: center; justify-content: space-between;
}
.pip-results-head h2 { margin: 0; font-size: 14px; font-weight: 800; color: #111827; }

.pip-empty {
  border: 1.5px dashed #e5e7eb; border-radius: 10px;
  padding: 32px 16px; text-align: center; color: #9ca3af;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  margin-top: 8px;
}
.pip-empty-icon { font-size: 32px; opacity: 0.6; }
.pip-empty p { margin: 0; font-size: 12px; }

.pip-result-list {
  list-style: none; margin: 8px 0 0; padding: 0;
  display: flex; flex-direction: column;
}
.pip-result-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid #f1f5f9;
}
.pip-result-item:last-child { border-bottom: none; }
.pip-result-text { flex: 1 1 auto; min-width: 0; }
.pip-result-text strong {
  display: block; font-size: 12.5px; font-weight: 700; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-result-text p {
  margin: 2px 0 0; font-size: 11.5px; color: #6b7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-result-text p.err { color: #ef4444; }

.pip-badge {
  flex: 0 0 auto;
  font-size: 11px; font-weight: 700;
  padding: 4px 10px; border-radius: 6px;
  background: #eff6ff; color: #2b6df3;
}
.pip-badge.s-신규 { background: #eff6ff; color: #2b6df3; }
.pip-badge.s-변경 { background: #f3e8ff; color: #7c3aed; }
.pip-badge.s-기존 { background: #f3f4f6; color: #6b7280; }
.pip-badge.s-error { background: #fee2e2; color: #ef4444; }

.pip-result-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 10px;
}
.pip-update { font-size: 11.5px; color: #6b7280; font-weight: 600; }
.pip-count {
  font-size: 12px; font-weight: 800; color: #2b6df3;
  background: #eff6ff; padding: 4px 12px; border-radius: 6px;
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
