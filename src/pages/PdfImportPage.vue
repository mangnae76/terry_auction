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


const store = useAuctionStore();
const authStore = useAuthStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const importRows = ref<ImportPreviewRow[]>([]);
const loading = ref(false);
const loadingLabel = ref('');
const message = ref('');
const statsCollapsed = ref(true); // 기본은 접힌 상태
const resultsCollapsed = ref(false);
const lastUpdate = ref('');
const banner = ref('');

type DriveFavorite = { name: string; url: string };
const favorites = ref<DriveFavorite[]>([]);
const favListOpen = ref(false);
// 등록주소 즐겨찾기 모달 — 폴더명과 주소를 함께 등록한다
const favModalOpen = ref(false);
const favNewName = ref('');
const favNewUrl = ref('');
// 줄에서 바로 고치기
const favEditIdx = ref(-1);
const favEditName = ref('');
const favEditUrl = ref('');
// 여러 폴더를 한 번에 스캔할 때 고른 주소들
const selectedFavUrls = ref<string[]>([]);
// 스캔을 마친 폴더 — 주소를 파랗게 보여 준다
const scannedFolderIds = ref<string[]>([]);
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
  selectedFavUrls.value = [];
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
      // 예전에 저장한 주소 문자열도 이름 없는 즐겨찾기로 받아 준다
      const seen = new Set<string>();
      favorites.value = prefs.pdfImportFolderFavorites
        .map((item) => (typeof item === 'string' ? { name: '', url: item } : {
          name: typeof item?.name === 'string' ? item.name : '',
          url: typeof item?.url === 'string' ? item.url : '',
        }))
        .filter((f) => {
          if (!f.url) return false;
          const id = folderIdOf(f.url);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
    }
    if (Array.isArray(prefs.pdfImportSelectedFolders)) {
      selectedFavUrls.value = prefs.pdfImportSelectedFolders.filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
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

watch(selectedFavUrls, (val) => {
  if (suppressWriteback) return;
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { pdfImportSelectedFolders: val });
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

/** 이번 스캔에서 휴지통에 있어 목록에 안 올라간 건수 — 배너에 알려 준다 */
const skippedHidden = ref(0);
const autoSaveReady = async () => {
  skippedHidden.value = 0;
  const parsedRows = readyRows.value
    .map((row) => row.parsed)
    .filter((row): row is ParsedPdfAuction => Boolean(row));
  if (parsedRows.length === 0) return;
  try {
    const saved = await store.importParsedPdfAuctions(parsedRows);
    skippedHidden.value = (saved ?? []).filter((item) => item.hidden).length;
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
    banner.value = `${formatTime()} PDF ${rows.filter((r) => r.status === 'ready').length}건 등록 완료`
      + (skippedHidden.value > 0 ? ` (휴지통 ${skippedHidden.value}건 제외)` : '');
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
  const targets = scanTargets.value;
  if (targets.length === 0) {
    message.value = '스캔할 폴더를 선택해 주세요.';
    return;
  }

  loading.value = true;
  loadingLabel.value = targets.length > 1
    ? `Google Drive 폴더 ${targets.length}곳 스캔 중`
    : 'Google Drive 폴더 스캔 중';
  message.value = '';
  banner.value = '';

  try {
    const rows: ImportPreviewRow[] = [];

    for (const target of targets) {
      const files = await listDrivePdfFiles(target);
      for (const file of files) {
        try {
          const parsed = await parseDrivePdfFile(file, target);
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
    }

    upsertRows(rows);
    await autoSaveReady();
    lastUpdate.value = formatTime();
    scannedFolderIds.value = [
      ...new Set([...scannedFolderIds.value, ...targets.map((t) => folderIdOf(t))]),
    ];
    const folderPart = targets.length > 1 ? ` ${targets.length}곳` : '';
    banner.value = `${formatTime()} 구글드라이브${folderPart} 스캔 완료 (${rows.length}개)`
      + (skippedHidden.value > 0 ? ` · 휴지통 ${skippedHidden.value}건 제외` : '');
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

const openFavModal = () => {
  favEditIdx.value = -1;
  favNewName.value = '';
  favNewUrl.value = '';
  favListOpen.value = false;
  favModalOpen.value = true;
};

/** 신규 등록 전용 */
const submitFavorite = () => {
  const url = favNewUrl.value.trim();
  const name = favNewName.value.trim() || '이름 없는 폴더';
  if (!url) {
    showToast('등록 주소를 입력해 주세요.');
    return;
  }
  if (favorites.value.some((f) => folderIdOf(f.url) === folderIdOf(url))) {
    showToast('이미 저장된 폴더입니다.');
    return;
  }
  favorites.value = [...favorites.value, { name, url }];
  showToast('즐겨찾기에 등록되었습니다.');
  favNewName.value = '';
  favNewUrl.value = '';
};

/** 수정은 그 줄에서 바로 */
const openRenameFavorite = (idx: number) => {
  const fav = favorites.value[idx];
  if (!fav) return;
  favEditIdx.value = idx;
  favEditName.value = fav.name;
  favEditUrl.value = fav.url;
  favListOpen.value = false;
  favModalOpen.value = true;
};
const cancelEditFavorite = () => { favEditIdx.value = -1; };
const saveEditFavorite = () => {
  const url = favEditUrl.value.trim();
  if (!url) {
    showToast('등록 주소를 입력해 주세요.');
    return;
  }
  const next = [...favorites.value];
  next[favEditIdx.value] = { name: favEditName.value.trim() || '이름 없는 폴더', url };
  favorites.value = next;
  favEditIdx.value = -1;
  showToast('즐겨찾기를 수정했습니다.');
};

/** 스캔할 폴더를 켜고 끈다 */
const toggleFavSelect = (url: string) => {
  selectedFavUrls.value = selectedFavUrls.value.includes(url)
    ? selectedFavUrls.value.filter((u) => u !== url)
    : [...selectedFavUrls.value, url];
};
/** 켜 둔 폴더들만 스캔한다 */
const scanTargets = computed(() => selectedFavUrls.value);

/** 드라이브 링크에서 폴더 id만 뽑는다 — 끝 슬래시나 ?usp= 같은 꼬리가 달라도 같은 폴더로 본다 */
const folderIdOf = (raw: string) => {
  const url = (raw ?? '').trim();
  if (!url) return '';
  return /\/folders\/([^/?#]+)/.exec(url)?.[1] ?? url.replace(/[/?#].*$/, '');
};
// 아무것도 안 골랐으면 첫 폴더를 기본으로 잡아 준다
watch(favorites, (list) => {
  if (selectedFavUrls.value.length === 0 && list.length > 0) {
    selectedFavUrls.value = [list[0].url];
  }
}, { immediate: true });

const removeFavorite = (url: string) => {
  favorites.value = favorites.value.filter((f) => f.url !== url);
  selectedFavUrls.value = selectedFavUrls.value.filter((u) => u !== url);
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
        <h1 class="pip-title">물건등록</h1>
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
        <span class="pip-section-title">
          <svg class="pip-section-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 20h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.9 10.2 3.9 3.9 0 0 0 7 20z" />
            <path d="M12 16V9" /><path d="m9 11.5 3-3 3 3" />
          </svg>구글드라이브 연동
        </span>
        <img :src="infoIcon" alt="" class="pip-info-ico" />
        <button type="button" class="pip-fav-open" :style="{ '--star': `url(${userStarIcon})` }" @click="openFavModal">
          <img :src="userStarIcon" alt="" />폴더등록
        </button>
      </div>

      <div class="pip-folder-wrap">
        <button type="button" class="pip-folder-box" @click="favListOpen = !favListOpen">
          <span class="pip-folder-chosen">
            <span
              v-for="url in selectedFavUrls"
              :key="url"
              class="pip-folder-chip"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>{{ favorites.find((f) => f.url === url)?.name || '이름 없는 폴더' }}
            </span>
            <span v-if="selectedFavUrls.length === 0" class="pip-folder-ph">
              {{ favorites.length === 0 ? '등록된 폴더가 없습니다 — 폴더 등록을 눌러 추가하세요' : '스캔할 폴더를 선택하세요' }}
            </span>
          </span>
          <img :src="chevronDownIcon" alt="" :class="['pip-chev-sm', { up: favListOpen }]" />
        </button>

        <div v-if="favListOpen && favorites.length > 0" class="pip-fav-backdrop" @click="favListOpen = false" />
        <ul v-if="favListOpen && favorites.length > 0" class="pip-folder-list">
          <li
            v-for="(fav, i) in favorites"
            :key="fav.url"
            class="pip-folder-item"
            @click="toggleFavSelect(fav.url)"
          >
            <input
              type="checkbox"
              class="pip-fav-check"
              :checked="selectedFavUrls.includes(fav.url)"
              @click.stop="toggleFavSelect(fav.url)"
            />
            <span class="pip-folder-chip pip-folder-item-name">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>{{ fav.name || '이름 없는 폴더' }}
            </span>
            <button type="button" class="pip-fav-item-btn" @click.stop="openRenameFavorite(i)">수정</button>
            <button type="button" class="pip-fav-item-btn" @click.stop="removeFavorite(fav.url)">삭제</button>
          </li>
        </ul>
      </div>

      <div class="pip-actions">
        <button class="pip-btn pip-btn-scan" :disabled="loading" type="button" @click="scanDriveFolder">
          <img :src="searchIcon" alt="" class="pip-btn-icn" />
          폴더스캔<span v-if="selectedFavUrls.length > 0"> ({{ selectedFavUrls.length }})</span>
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

    <!-- 등록주소 즐겨찾기 -->
    <div v-if="favModalOpen" class="pip-fav-back" @click.self="favModalOpen = false">
      <div class="pip-fav-modal">
        <header class="pip-fav-modal-head">
          <h2>구글 드라이브 주소 등록</h2>
          <button type="button" class="pip-fav-modal-close" aria-label="닫기" @click="favModalOpen = false">×</button>
        </header>

        <p class="pip-fav-sub">신규 폴더 + 주소 등록</p>
        <div class="pip-fav-form">
          <div class="pip-fav-fields">
            <input v-model="favNewName" class="pip-fav-field" placeholder="신규 폴더명 입력" />
            <input v-model="favNewUrl" class="pip-fav-field" placeholder="신규 폴더명 주소 입력" @keydown.enter.prevent="submitFavorite" />
          </div>
          <button type="button" class="pip-fav-add" @click="submitFavorite">추가</button>
        </div>

        <p class="pip-fav-sub list">구글 드라이브 폴더 + 주소 리스트</p>

        <ul class="pip-fav-modal-list">
          <li v-if="favorites.length === 0" class="pip-fav-modal-empty">등록된 폴더가 없습니다.</li>
          <li v-for="(fav, i) in favorites" :key="fav.url" class="pip-fav-modal-item">
            <template v-if="favEditIdx === i">
              <span class="pip-fav-modal-main edit">
                <input v-model="favEditName" class="pip-fav-field" placeholder="폴더명" />
                <input v-model="favEditUrl" class="pip-fav-field" placeholder="주소" @keydown.enter.prevent="saveEditFavorite" />
              </span>
              <span class="pip-fav-modal-acts">
                <button type="button" class="pip-fav-item-btn on" @click="saveEditFavorite">저장</button>
                <button type="button" class="pip-fav-item-btn" @click="cancelEditFavorite">취소</button>
              </span>
            </template>
            <template v-else>
              <input
                type="checkbox"
                class="pip-fav-check"
                :checked="selectedFavUrls.includes(fav.url)"
                aria-label="사용 중인 폴더"
                @click.stop="toggleFavSelect(fav.url)"
              />
              <span class="pip-folder-chip">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>{{ fav.name || '이름 없는 폴더' }}
              </span>
              <span class="pip-fav-modal-acts">
                <button type="button" class="pip-fav-item-btn" @click="openRenameFavorite(i)">수정</button>
                <button type="button" class="pip-fav-item-btn" @click="removeFavorite(fav.url)">삭제</button>
              </span>
              <span class="pip-fav-modal-url">{{ fav.url }}</span>
            </template>
          </li>
        </ul>

        <div class="pip-fav-modal-foot">
          <button type="button" class="save" @click="favModalOpen = false">저장</button>
        </div>
      </div>
    </div>

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
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 4px; min-width: 0;
}
.pip-section-title {
  font-size: 14px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 5px;
}
/* 다른 화면 카드 제목 아이콘과 같은 muted blue */
.pip-section-ico { flex: 0 0 auto; color: #2a5fbf; }
.pip-info-ico { width: 14px; height: 14px; object-fit: contain; opacity: 0.55; }

/* 폴더 등록 버튼 */
.pip-fav-open {
  margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid #c7d7f7; background: #eef3fd; border-radius: 8px;
  padding: 5px 9px; font-size: 11.5px; font-weight: 800; color: #2a5fbf; cursor: pointer;
}
/* PNG 별 아이콘도 파란색으로 */
.pip-fav-open img {
  width: 13px; height: 13px; object-fit: contain;
  background-color: currentColor;
  -webkit-mask: var(--star) center / contain no-repeat;
  mask: var(--star) center / contain no-repeat;
}
.pip-fav-open:active { background: #dfe9fb; }

/* 폴더 이름 알약 */
.pip-folder-chip {
  display: inline-flex; align-items: center; gap: 3px;
  min-width: 0; max-width: 100%;
  padding: 3px 9px;
  background: #eef3fd; border: 1px solid #d3e0fa; border-radius: 999px;
  font-size: 10.5px; font-weight: 700; color: #2a5fbf;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-folder-chip.off { background: #f3f4f6; border-color: #e3e7ef; color: #9ca3af; }

/* 폴더 선택 상자 — 화살표를 누르면 등록한 폴더가 펼쳐진다 */
.pip-folder-wrap { position: relative; }
/* 목록이 열려 있는 동안 화면 전체를 덮어, 바깥 아무 데나 눌러도 닫히게 한다 */
.pip-fav-backdrop { position: fixed; inset: 0; z-index: 40; }
.pip-folder-box {
  width: 100%; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 4px 8px; min-height: 30px; cursor: pointer; text-align: left;
}
.pip-folder-chosen { flex: 1 1 auto; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.pip-folder-ph { font-size: 11.5px; font-weight: 400; color: #9ca3af; }
.pip-folder-box .pip-chev-sm { flex: 0 0 auto; width: 13.5px; height: 13.5px; object-fit: contain; opacity: 1; transition: transform 0.2s; }
.pip-folder-box .pip-chev-sm.up { transform: rotate(180deg); }
.pip-folder-list {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
  list-style: none; margin: 0; padding: 4px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  max-height: 240px; overflow-y: auto;
}
.pip-folder-item {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 8px; border-radius: 7px; cursor: pointer;
  font-size: 12.5px; color: #4b5563;
}
.pip-folder-item-name { flex: 0 1 auto; min-width: 0; margin-right: auto; max-width: 100%; }
.pip-folder-item .pip-fav-item-btn { flex: 0 0 auto; padding: 3px 7px; }
.pip-folder-tag {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid #d3e0fa; background: #fff; border-radius: 999px;
  padding: 6px 12px; font-size: 12px; font-weight: 700; color: #2a5fbf; cursor: pointer;
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-folder-tag.on { background: #2a5fbf; border-color: #2a5fbf; color: #fff; }
.pip-folder-empty { margin: 2px 2px; font-size: 11.5px; color: #9ca3af; }
.pip-folder-empty b { color: #4b5563; }

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
.pip-fav-url {
  flex: 1 1 auto; min-width: 0; font-size: 10.5px; color: #9ca3af;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pip-fav-dropdown-edit {
  flex: 0 0 auto;
  border: none; background: transparent; cursor: pointer;
  font-size: 13px; color: #9ca3af; line-height: 1; padding: 0 3px;
}
.pip-fav-dropdown-edit:hover { color: #2a5fbf; }

/* 같이 스캔할 폴더 고르기 */
.pip-fav-check { flex: 0 0 auto; width: 15px; height: 15px; accent-color: #2a5fbf; }

/* 등록주소 즐겨찾기 */
.pip-fav-back {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.pip-fav-modal {
  width: 100%; max-width: 640px; background: #fff; border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.26); overflow: hidden;
}
.pip-fav-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 10px;
}
.pip-fav-modal-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.pip-fav-modal-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #6b7280; padding: 0 2px;
}
/* 작은 구분 제목 */
.pip-fav-sub {
  margin: 0; padding: 10px 14px 6px;
  font-size: 11.5px; font-weight: 800; color: #6b7280;
}
.pip-fav-sub.list { border-top: 1px solid #eef0f5; }
.pip-fav-form {
  display: flex; align-items: stretch; gap: 7px;
  padding: 0 14px 12px;
}
/* 폴더명·주소 두 칸은 왼쪽에 쌓고 */
.pip-fav-fields { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.pip-fav-field {
  width: 100%; box-sizing: border-box; height: 36px;
  border: 1px solid #e3e8f0; border-radius: 8px; padding: 0 10px;
  font-size: 12px; color: #111827; background: #fff; outline: none;
}
.pip-fav-field::placeholder { color: #9ca3af; }
.pip-fav-field:focus { border-color: #2a5fbf; }
/* 추가 버튼은 두 칸의 시작과 끝에 맞춰 한 덩어리로 */
.pip-fav-add {
  flex: 0 0 auto; align-self: stretch; width: 64px;
  border: none; border-radius: 8px; background: #2a5fbf; color: #fff;
  font-size: 14px; font-weight: 800; cursor: pointer;
}
.pip-fav-modal-list { list-style: none; margin: 0; padding: 8px 10px 12px; max-height: 240px; overflow-y: auto; }
.pip-fav-modal-empty { padding: 18px 4px; text-align: center; font-size: 12px; color: #9ca3af; }
/* 1행: 체크 · 태그 · 수정/삭제(오른쪽 끝, 태그와 아랫선 맞춤) / 2행: 주소 */
.pip-fav-modal-item {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: end; column-gap: 8px; row-gap: 5px;
  padding: 9px 4px; border-bottom: 1px solid #f1f3f7;
}
.pip-fav-modal-item .pip-fav-check { grid-column: 1; grid-row: 1; align-self: center; }
.pip-fav-modal-item > .pip-folder-chip { grid-column: 2; grid-row: 1; justify-self: start; max-width: 100%; }
.pip-fav-modal-acts { grid-column: 3; grid-row: 1; display: inline-flex; gap: 6px; justify-self: end; }
/* 주소는 아래 줄에서 끝까지 — 수정·삭제와 겹치지 않는다 */
.pip-fav-modal-url {
  grid-column: 2 / -1; grid-row: 2; min-width: 0;
  font-size: 10.5px; color: #6b7280; line-height: 1.45; word-break: break-all;
}
/* 수정 중일 때는 입력칸이 2·3열을 함께 쓴다 */
.pip-fav-modal-main.edit { grid-column: 2 / -1; grid-row: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pip-fav-modal-item .pip-fav-modal-main.edit + .pip-fav-modal-acts { grid-column: 2 / -1; grid-row: 2; }
/* 임장경로 즐겨찾기와 같은 버튼 */
.pip-fav-item-btn {
  border: 1px solid #cbd5e1; background: #fff; color: #9ca3af;
  border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
}
.pip-fav-item-btn.on { border-color: #2a5fbf; background: #2a5fbf; color: #fff; }
.pip-fav-modal-main .pip-fav-field { height: 30px; font-size: 11.5px; }
.pip-fav-modal-list { padding-top: 0; }
.pip-fav-modal-item:last-child { border-bottom: none; }
.pip-fav-modal-foot {
  display: grid; grid-template-columns: 1fr; gap: 8px;
  padding: 10px 14px 14px; border-top: 1px solid #eef0f5;
}
.pip-fav-modal-foot button {
  border-radius: 10px; padding: 11px 0; font-size: 13px; font-weight: 800; cursor: pointer;
}
.pip-fav-modal-foot .cancel { border: 1px solid #d5dbe6; background: #fff; color: #4b5563; }
.pip-fav-modal-foot .save { border: none; background: #2a5fbf; color: #fff; }
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
