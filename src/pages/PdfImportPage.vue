<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { computed, onMounted, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import {
  downloadDrivePdfBytes,
  listDrivePdfFiles,
  parsePdfBytes,
  type ParsedPdfAuction,
} from '../services/pdfAuctionImport';
import {
  AI_FIELD_LABELS,
  clearGeminiKey,
  fillWithGemini,
  GEMINI_KEY_URL,
  getGeminiKey,
  isGeminiOn,
  setGeminiKey,
  setGeminiOn,
  testGeminiKey,
} from '../services/geminiPdf';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import buildingIcon from '../assets/icones/building (1).png';
import housePlusIcon from '../assets/icones/house-plus (1).png';
import houseMinusIcon from '../assets/icones/house-m.png';
import banIcon from '../assets/icones/ban.png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import searchIcon from '../assets/icones/searchs.png';
import filesIcon from '../assets/icones/files.png';
import userStarIcon from '../assets/icones/user-star.png';
import infoIcon from '../assets/icones/info.png';
import { updateStamp } from '../services/updateStamp';

type RowStatus = 'error' | '신규' | '변경' | '기존';

interface ImportPreviewRow {
  key: string;
  sourceName: string;
  status: 'ready' | 'error';
  rowStatus: RowStatus;
  parsed?: ParsedPdfAuction;
  error?: string;
  sourceType: 'drive' | 'file';
  /** 드라이브에서 온 줄이면 어느 폴더에서 왔는지 — 그 폴더를 다시 스캔할 때 갈아치운다 */
  folderId?: string;
  /** AI 가 채운 칸 · 근거가 없어 버린 칸 · AI 가 실패한 까닭 */
  aiFilled?: string[];
  aiRejected?: string[];
  aiError?: string;
}

// === AI(Gemini)로 읽기 ===
// 키는 사용자 각자의 것 — 이 기기에만 적어 두고 Google 로 바로 보낸다(우리 서버를 거치지 않는다).
const aiKey = ref(getGeminiKey());
const aiOn = ref(isGeminiOn());
const toggleAi = () => {
  if (!aiKey.value) { openAiModal(); return; }
  aiOn.value = !aiOn.value;
  setGeminiOn(aiOn.value);
  // 폰에는 마우스 안내가 없어 켜짐·꺼짐을 잠깐 알린다
  showToast(aiOn.value ? 'AI 파싱을 켰습니다.' : 'AI 파싱을 껐습니다.');
};
const aiModalOpen = ref(false);
const aiKeyDraft = ref('');
const aiKeyMsg = ref('');
const aiKeyOk = ref(false);
const aiChecking = ref(false);
const aiKeyShow = ref(false);
const aiKeyInputRef = ref<HTMLInputElement | null>(null);
/** 붙여넣기 — 복사해 둔 글을 키 칸에 넣는다. 앱은 Capacitor 클립보드, 웹은 브라우저 클립보드. 막히면 길게 눌러 붙이도록 알린다 */
const pasteAiKey = async () => {
  let txt = '';
  try {
    if (Capacitor.isNativePlatform()) txt = (await Clipboard.read()).value ?? '';
    else if (navigator.clipboard?.readText) txt = await navigator.clipboard.readText();
  } catch { txt = ''; }
  txt = txt.trim();
  if (!txt) {
    showToast('붙여 넣을 내용을 읽지 못했습니다 — 칸을 길게 눌러 붙여 넣어 주세요.');
    aiKeyInputRef.value?.focus();
    return;
  }
  aiKeyDraft.value = txt;
  aiKeyMsg.value = '';
};
const openAiModal = () => {
  aiKeyShow.value = false;
  aiKeyDraft.value = aiKey.value;
  aiKeyMsg.value = '';
  aiKeyOk.value = false;
  aiModalOpen.value = true;
};
const saveAiKey = async () => {
  const key = aiKeyDraft.value.trim();
  if (!key) { aiKeyMsg.value = '키를 넣어 주세요'; return; }
  aiChecking.value = true;
  const r = await testGeminiKey(key);
  aiChecking.value = false;
  aiKeyOk.value = r.ok;
  aiKeyMsg.value = r.message;
  if (!r.ok) return;
  setGeminiKey(key);
  setGeminiOn(true);
  aiKey.value = key;
  aiOn.value = true;
  aiModalOpen.value = false;
};
const removeAiKey = () => {
  clearGeminiKey();
  aiKey.value = '';
  aiOn.value = false;
  aiKeyDraft.value = '';
  aiModalOpen.value = false;
};
/** 키 앞뒤만 보여 준다 — 화면 너머로 통째로 보이지 않게 */
/** Google AI Studio 키 화면 — 앱에선 바깥 브라우저로, 웹에선 새 탭으로 연다 */
const openGeminiKeySite = () => {
  if (Capacitor.isNativePlatform()) { void Browser.open({ url: GEMINI_KEY_URL }); return; }
  window.open(GEMINI_KEY_URL, '_blank', 'noopener');
};
const aiLabels = (keys?: string[]) => (keys ?? []).map((k) => AI_FIELD_LABELS[k] ?? k).join(', ');

/** 규칙으로 읽은 뒤, 켜져 있으면 AI 로 빈칸을 채운다. AI 가 실패해도 규칙 결과는 그대로 쓴다 */
const readPdf = async (
  bytes: Uint8Array,
  name: string,
  sourceUrl?: string,
  folderUrl?: string,
  fileId?: string,
): Promise<{ parsed: ParsedPdfAuction; aiFilled?: string[]; aiRejected?: string[]; aiError?: string }> => {
  const parsed = await parsePdfBytes(bytes, name, sourceUrl, folderUrl, fileId);
  if (!aiOn.value || !aiKey.value) return { parsed };
  try {
    const r = await fillWithGemini(bytes, parsed, aiKey.value);
    return { parsed: r.parsed, aiFilled: r.filled, aiRejected: r.rejected };
  } catch (e) {
    return { parsed, aiError: e instanceof Error ? e.message : 'AI 읽기 실패' };
  }
};


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
// 창 안의 일은 그 자리에서 끝난다 — 추가·체크는 바로, 수정은 그 줄의 '저장'으로,
// 삭제는 한 번 묻고 바로. 창 아래 '저장'은 두지 않는다(저장이 두 층이면 헷갈린다).
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};
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
  // 'UPDATE : ' 뒤에 붙는 글자는 화면마다 같아야 한다 — 공통 모듈에서 만든다
  return updateStamp();
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

/**
 * 목록을 이번에 읽은 것과 맞춘다.
 * - 폴더를 스캔했으면 그 폴더에서 온 옛 줄은 지운다 (드라이브에 없는 PDF가 남지 않게)
 * - 다른 폴더나 손으로 올린 줄은 그대로 둔다
 * - 등록은 이 함수와 따로, 이번에 읽은 줄만 한다
 */
const mergeRows = (rows: ImportPreviewRow[], rescannedFolders: string[] = []) => {
  const dropped = new Set(rescannedFolders);
  const kept = importRows.value.filter(
    (row) => !(row.sourceType === 'drive' && row.folderId && dropped.has(row.folderId)),
  );
  const merged = new Map(kept.map((row) => [row.key, row]));
  rows.forEach((row) => merged.set(row.key, row));
  importRows.value = [...merged.values()];
};

const openFilePicker = () => {
  fileInputRef.value?.click();
};

/** 이번 스캔에서 보관함에 있어 목록에 안 올라간 건수 — 배너에 알려 준다 */
const skippedHidden = ref(0);

/** 드라이브에서 사라진 물건 — 스캔한 폴더에서 온 것 가운데 이번에 안 보인 것.
 *  자동으로 지우지 않는다. 사람이 눌러야 휴지통으로 간다. */
const missingAuctions = ref<Array<{ id: string; label: string }>>([]);
const findMissingFromDrive = (targets: string[], rows: ImportPreviewRow[]) => {
  const scannedFolders = new Set(targets.map((t) => folderIdOf(t)));
  const liveFileIds = new Set(
    rows.map((r) => r.parsed?.sourceFileId).filter((v): v is string => !!v),
  );
  missingAuctions.value = store.auctions
    .filter((a) => {
      const meta = a.importMeta;
      if (!meta || meta.source !== 'pdf' || !meta.pdfFileId) return false;
      // 이번에 훑은 폴더에서 온 물건만 본다 — 다른 폴더 것은 건드리지 않는다
      const folder = meta.pdfFolderUrl ? folderIdOf(meta.pdfFolderUrl) : '';
      if (!folder || !scannedFolders.has(folder)) return false;
      return !liveFileIds.has(meta.pdfFileId);
    })
    .map((a) => ({ id: a.id, label: `${a.caseNumber || ''} ${a.address || ''}`.trim() }));
};

const sendMissingToTrash = async () => {
  const ids = missingAuctions.value.map((m) => m.id);
  if (ids.length === 0) return;
  await store.hideAuctions(ids);
  showToast(`${ids.length}건을 휴지통으로 보냈습니다.`);
  missingAuctions.value = [];
};
const autoSaveReady = async (rows: ImportPreviewRow[]) => {
  skippedHidden.value = 0;
  const parsedRows = rows
    .filter((row) => row.status === 'ready')
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
    for (const [idx, file] of files.entries()) {
      try {
        if (aiOn.value && aiKey.value) loadingLabel.value = `AI로 읽는 중 ${idx + 1}/${files.length}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { parsed, aiFilled, aiRejected, aiError } = await readPdf(bytes, file.name);
        rows.push({
          key: `file-${file.name}`,
          sourceName: file.name,
          status: 'ready',
          rowStatus: classifyRow(parsed),
          parsed,
          sourceType: 'file',
          aiFilled,
          aiRejected,
          aiError,
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
    mergeRows(rows);
    await autoSaveReady(rows);
    lastUpdate.value = formatTime();
    banner.value = `${formatTime()} PDF ${rows.filter((r) => r.status === 'ready').length}건 등록 완료`
      + (skippedHidden.value > 0 ? ` (보관함 ${skippedHidden.value}건 제외)` : '');
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
          if (aiOn.value && aiKey.value) loadingLabel.value = `AI로 읽는 중 · ${file.name}`;
          const bytes = await downloadDrivePdfBytes(file);
          const { parsed, aiFilled, aiRejected, aiError } = await readPdf(bytes, file.name, file.downloadUrl, target, file.id);
          rows.push({
            key: `drive-${file.id}`,
            sourceName: file.name,
            status: 'ready',
            rowStatus: classifyRow(parsed),
            parsed,
            sourceType: 'drive',
            folderId: folderIdOf(target),
            aiFilled,
            aiRejected,
            aiError,
          });
        } catch (error) {
          rows.push({
            key: `drive-${file.id}`,
            sourceName: file.name,
            status: 'error',
            rowStatus: 'error',
            error: error instanceof Error ? error.message : 'Drive PDF 해석 중 오류가 발생했습니다.',
            sourceType: 'drive',
            folderId: folderIdOf(target),
          });
        }
      }
    }

    mergeRows(rows, targets.map((t) => folderIdOf(t)));
    await autoSaveReady(rows);
    findMissingFromDrive(targets, rows);
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
/** 닫기 — 한 일은 이미 반영돼 있다. 고치던 줄만 접는다 */
const closeFavModal = () => {
  favModalOpen.value = false;
  favEditIdx.value = -1;
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
  if (selectedFavUrls.value.length === 0) selectedFavUrls.value = [url];
  favNewName.value = '';
  favNewUrl.value = '';
  showToast('등록되었습니다.');
};

/** 수정은 그 줄에서 — 드롭다운에서 눌렀으면 창을 열고 그 줄을 편다 */
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
const applyEditFavorite = () => {
  const url = favEditUrl.value.trim();
  if (!url) {
    showToast('등록 주소를 입력해 주세요.');
    return false;
  }
  const idx = favEditIdx.value;
  const old = favorites.value[idx];
  if (!old) { favEditIdx.value = -1; return true; }
  if (favorites.value.some((f, i) => i !== idx && folderIdOf(f.url) === folderIdOf(url))) {
    showToast('이미 저장된 폴더입니다.');
    return false;
  }
  const next = [...favorites.value];
  next[idx] = { name: favEditName.value.trim() || '이름 없는 폴더', url };
  favorites.value = next;
  // 주소를 바꿨으면 체크해 둔 것도 새 주소로 옮긴다
  selectedFavUrls.value = selectedFavUrls.value.map((u) => (u === old.url ? url : u));
  favEditIdx.value = -1;
  return true;
};
/** 그 줄의 '저장' — 바로 반영된다 */
const saveEditFavorite = () => {
  if (applyEditFavorite()) showToast('수정되었습니다.');
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

/** 삭제 — 되돌릴 수 없는 일은 이것 하나라 한 번 묻는다 (드롭다운·창 같은 규칙).
 *  목록에서만 빠진다: 드라이브의 PDF 와 이미 등록한 물건은 그대로다 */
const removeFavorite = (url: string) => {
  const fav = favorites.value.find((f) => f.url === url);
  askConfirm({
    title: `'${fav?.name || '이름 없는 폴더'}'를 목록에서 뺄까요?`,
    desc: '폴더 주소만 지웁니다. 구글 드라이브의 PDF와 이미 등록한 물건은 그대로 남습니다.',
    okLabel: '삭제',
    skipKey: '',
    run: () => {
      if (favEditIdx.value >= 0) favEditIdx.value = -1;
      favorites.value = favorites.value.filter((f) => f.url !== url);
      selectedFavUrls.value = selectedFavUrls.value.filter((u) => u !== url);
      if (favorites.value.length === 0) favListOpen.value = false;
      showToast('삭제되었습니다.');
    },
  });
};

const summaryShort = (parsed: ParsedPdfAuction) =>
  parsed.address || parsed.roadAddress || '주소 미확인';

const fileTitle = (row: ImportPreviewRow) => {
  if (row.parsed?.sourceName) return row.parsed.sourceName;
  return row.sourceName;
};

/** 뒤로가기 — 물건 목록에서 들어온 화면이다 */
const router = useRouter();

// === 탭 — 물건정보 화면처럼 둘로 나눈다. 구글드라이브 연동(폴더·폴더스캔·PDF등록) / AI 자동 분석(Gemini 키·켜기) ===
// 이름은 웹(/web)과 같다 — 키 넣는 쪽은 'AI 자동 분석', 읽은 결과 상자는 'AI 파싱'
type ImportTab = 'drive' | 'ai';
const IMPORT_TABS: Array<{ key: ImportTab; label: string }> = [
  { key: 'drive', label: '구글드라이브 연동' },
  { key: 'ai', label: 'AI 자동 분석' },
];
const TAB_STORE = 'myturn.import.tab';
const readTab = (): ImportTab => { try { return localStorage.getItem(TAB_STORE) === 'ai' ? 'ai' : 'drive'; } catch { return 'drive'; } };
const importTab = ref<ImportTab>(readTab());
watch(importTab, (t) => { try { localStorage.setItem(TAB_STORE, t); } catch { /* 그만 */ } });
/** 결과 상자 — 두 탭이 같은 상자를 쓰고 글자만 다르다 (웹 /web 과 같은 글) */
const PARSE_COPY: Record<ImportTab, { title: string; drop: [string, string] }> = {
  drive: { title: 'PDF 파싱', drop: ['파일을 드래그하거나 클릭하여 업로드하면', '여기에 미리보기가 표시됩니다.'] },
  ai: { title: 'AI 파싱', drop: ['파일을 드래그하거나 클릭하여 업로드하면', '여기에 미리보기가 표시됩니다.'] },
};
const parseCopy = computed(() => PARSE_COPY[importTab.value]);
/** 끌어다 놓기 — 목록이 생겨도 상자는 남아 계속 놓을 수 있다. 눌러도 파일을 고른다 */
const dropOver = ref(false);
const onDropFiles = async (e: DragEvent) => {
  dropOver.value = false;
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (files.length) await parseFiles(files);
};
</script>

<template>
  <section class="pip-shell">
    <div class="pip-fixed-top">
      <div class="pip-title-row">
        <button type="button" class="pg-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
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

      <nav class="pip-tabs" role="tablist" aria-label="물건등록 방법">
        <button
          v-for="tab in IMPORT_TABS"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="importTab === tab.key"
          :class="['pip-tab', { active: importTab === tab.key }]"
          @click="importTab = tab.key"
        >{{ tab.label }}</button>
      </nav>
    </div>

    <div class="pip-body">
      <template v-if="importTab === 'drive'">
      <!-- 구글드라이브 연동 — AI 자동 분석과 같은 흰 상자 하나: 제목·폴더등록 / 폴더 고르기 / 폴더스캔·PDF등록 -->
      <div class="pip-aibox pip-drivebox">
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
            <button type="button" class="pip-fav-item-btn edit" @click.stop="openRenameFavorite(i)">수정</button>
            <button type="button" class="pip-fav-item-btn del" @click.stop="removeFavorite(fav.url)">삭제</button>
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
      </div>
      </template>

      <!-- AI 자동 분석 — 규칙으로 못 읽은 칸만 Gemini 가 채운다 (각자 자기 키로).
           켜 두면 구글드라이브 연동 탭의 폴더스캔 · PDF등록이 읽을 때 같이 쓴다 -->
      <template v-else>
      <!-- AI 자동 분석 — 상자 하나 (웹 /web 과 같은 짜임)
           1줄: 제목 · (오른쪽 끝) 키 등록/키바꾸기 · 켜기 스위치(켜짐·꺼짐은 안내로)   2줄: 필수설정 · 키 상태 문장 -->
      <div class="pip-aibox">
        <div class="pip-aibox-row">
          <span class="pip-section-title">
            <svg class="pip-section-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>AI 자동 분석
          </span>
          <button type="button" class="pip-ai-key pip-aibox-key" @click="openAiModal">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></svg>{{ aiKey ? '키바꾸기' : '키 등록' }}
          </button>
          <button
            type="button"
            :class="['pip-ai-switch', { on: aiOn && !!aiKey }]"
            role="switch"
            :aria-checked="aiOn && !!aiKey"
            :aria-label="`AI 파싱 ${aiOn && aiKey ? '켜짐' : '꺼짐'}`"
            :title="`AI 파싱 ${aiOn && aiKey ? '켜짐' : '꺼짐'}`"
            @click="toggleAi"
          >
            <i />
          </button>
        </div>
        <div class="pip-aibox-row">
          <span class="pip-req">필수설정</span>
          <span class="pip-aibox-text">Gemini API 키가 <span :class="['pip-key-state', aiKey ? 'ok' : 'no']">{{ aiKey ? '등록' : '미등록' }}</span> 상태입니다.</span>
        </div>
      </div>
      </template>

      <div v-if="banner || loading" class="pip-banner">
        <span v-if="loading" class="pip-banner-dot" /><span v-if="loading" class="pip-banner-dot" /><span v-if="loading" class="pip-banner-dot" />
        <span class="pip-banner-text">{{ loading ? (loadingLabel || '처리 중') + '…' : banner }}</span>
      </div>

      <input ref="fileInputRef" accept="application/pdf" class="sr-only" multiple type="file" @change="onFileChange" />

      <section class="pip-results">
        <div class="pip-results-head">
          <h2>
            <svg v-if="importTab === 'ai'" class="pip-section-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" /></svg>
            <svg v-else class="pip-section-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
            {{ parseCopy.title }}
          </h2>
          <!-- 웹(/web)과 같은 줄 — 총 등록물건 · 신규 · 변경 · 오류 -->
          <span class="pip-head-stats">
            <span>총 등록물건<b>{{ totalRegistered }}</b>개</span>
            <span class="n-new">신규<b>{{ newCount }}</b></span>
            <span class="n-chg">변경<b>{{ changedCount }}</b></span>
            <span class="n-err">오류<b>{{ errorCount }}</b></span>
          </span>
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

        <div v-if="missingAuctions.length > 0" class="pip-missing">
          <div class="pip-missing-head">
            <strong>드라이브에 없는 물건 {{ missingAuctions.length }}건</strong>
            <button type="button" @click="sendMissingToTrash">휴지통으로</button>
          </div>
          <p>스캔한 폴더에서 PDF가 사라졌습니다. 선정물건은 그대로 남아 있습니다 — 치우려면 누르세요.</p>
          <ul>
            <li v-for="m in missingAuctions" :key="m.id">{{ m.label }}</li>
          </ul>
        </div>

        <div v-if="!resultsCollapsed">
          <div
            :class="['pip-empty', { slim: importRows.length > 0, over: dropOver }]"
            role="button"
            tabindex="0"
            aria-label="PDF 파일 고르기"
            @click="openFilePicker"
            @keydown.enter.prevent="openFilePicker"
            @dragover.prevent="dropOver = true"
            @dragleave="dropOver = false"
            @drop.prevent="onDropFiles"
          >
            <div class="pip-empty-icon">📂</div>
            <p>{{ parseCopy.drop[0] }}</p>
            <p>{{ parseCopy.drop[1] }}</p>
          </div>

          <ul v-if="importRows.length > 0" class="pip-result-list">
            <li v-for="row in importRows" :key="row.key" class="pip-result-item">
              <div class="pip-result-text">
                <strong>{{ fileTitle(row) }}</strong>
                <p v-if="row.status === 'ready' && row.parsed">{{ summaryShort(row.parsed) }}</p>
                <p v-else class="err">{{ row.error }}</p>
                <p v-if="row.aiFilled?.length" class="pip-ai-note">AI가 채움 · {{ aiLabels(row.aiFilled) }} <em>— 확인해 주세요</em></p>
                <p v-if="row.aiRejected?.length" class="pip-ai-note gray">PDF에서 근거를 못 찾아 버림 · {{ aiLabels(row.aiRejected) }}</p>
                <p v-if="row.aiError" class="pip-ai-note err">{{ row.aiError }}</p>
              </div>
              <span :class="['pip-badge', `s-${row.rowStatus === 'error' ? 'error' : row.rowStatus}`]">
                {{ row.rowStatus === 'error' ? '오류' : row.rowStatus }}
              </span>
            </li>
          </ul>

          <div v-if="importRows.length > 0" class="pip-result-foot">
            <span class="pip-update">UPDATE : {{ lastUpdate || '—' }}</span>
          </div>
        </div>
      </section>
    </div>

    <AppMobileBottomNav active="watchlist" />

    <!-- 확인창은 폴더 창(z 400) 위에 떠야 한다 — 한 겹 높여 둔다 -->
    <div class="pip-confirm-layer"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></div>

    <!-- Gemini 키 -->
    <div v-if="aiModalOpen" class="pip-fav-back" @click.self="aiModalOpen = false">
      <div class="pip-fav-modal pip-ai-modal">
        <header class="pip-fav-modal-head">
          <h2>Gemini 키 등록 설정</h2>
          <button type="button" class="pip-fav-modal-close" aria-label="닫기" @click="aiModalOpen = false">×</button>
        </header>
        <div class="pip-ai-body">
          <!-- 키 칸 — 오른쪽 끝에 눈(보기/가리기) · 붙여넣기 (웹 /web 과 같다) -->
          <div class="pip-key-field">
            <input
              ref="aiKeyInputRef"
              v-model="aiKeyDraft"
              class="pip-fav-field"
              :type="aiKeyShow ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="Google AI Studio 에서 받은 API 키"
              @keydown.enter.prevent="saveAiKey"
            />
            <button type="button" class="pip-kf-btn eye" :aria-label="aiKeyShow ? '키 가리기' : '키 보기'" @click="aiKeyShow = !aiKeyShow">
              <svg v-if="aiKeyShow" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.3" /><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></svg>
              <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button type="button" class="pip-kf-btn paste" aria-label="붙여넣기" @click="pasteAiKey">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
            </button>
          </div>
          <p v-if="aiKeyMsg" :class="['pip-ai-msg', { ok: aiKeyOk }]">{{ aiKeyMsg }}</p>
          <ul class="pip-ai-help">
            <li>키는 <b>이 기기에만</b> 저장됩니다.</li>
            <li>규칙으로 못 읽은 칸만 채우고, PDF에서 근거 글을 못 찾은 값은 버립니다.</li>
            <li>키 받는 곳: <button type="button" class="pip-key-link inline" @click="openGeminiKeySite">Google AI Studio</button> → Get API key</li>
            <li>Google 계정으로 로그인 → Get API key → Create API key</li>
          </ul>
          <div class="pip-ai-btns">
            <button v-if="aiKey" type="button" class="pip-ai-del" @click="removeAiKey">키지우기</button>
            <button type="button" class="pip-fav-add pip-ai-save" :disabled="aiChecking" @click="saveAiKey">{{ aiChecking ? '확인 중…' : '확인 후 저장' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 등록주소 즐겨찾기 -->
    <div v-if="favModalOpen" class="pip-fav-back" @click.self="closeFavModal">
      <div class="pip-fav-modal">
        <header class="pip-fav-modal-head">
          <h2>구글 드라이브 주소 등록</h2>
          <button type="button" class="pip-fav-modal-close" aria-label="닫기" @click="closeFavModal">×</button>
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
          <li v-for="(fav, i) in favorites" :key="fav.url" :class="['pip-fav-modal-item', { editing: favEditIdx === i }]">
            <input
              type="checkbox"
              class="pip-fav-check"
              :checked="selectedFavUrls.includes(fav.url)"
              aria-label="사용 중인 폴더"
              @click.stop="toggleFavSelect(fav.url)"
            />
            <template v-if="favEditIdx === i">
              <!-- 고치는 중에도 같은 모양 — 1행: 폴더명 칸 · 저장/취소, 2행: 주소 칸 -->
              <input v-model="favEditName" class="pip-fav-field pip-fav-edit-name" placeholder="폴더명" @keydown.enter.prevent="saveEditFavorite" />
              <span class="pip-fav-modal-acts">
                <button type="button" class="pip-fav-item-btn edit" @click="saveEditFavorite">저장</button>
                <button type="button" class="pip-fav-item-btn del" @click="cancelEditFavorite">취소</button>
              </span>
              <input v-model="favEditUrl" class="pip-fav-field pip-fav-edit-url" placeholder="주소" @keydown.enter.prevent="saveEditFavorite" />
            </template>
            <template v-else>
              <span class="pip-folder-chip">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>{{ fav.name || '이름 없는 폴더' }}
              </span>
              <span class="pip-fav-modal-acts">
                <button type="button" class="pip-fav-item-btn edit" @click="openRenameFavorite(i)">수정</button>
                <button type="button" class="pip-fav-item-btn del" @click="removeFavorite(fav.url)">삭제</button>
              </span>
              <span class="pip-fav-modal-url">{{ fav.url }}</span>
            </template>
          </li>
        </ul>

      </div>
    </div>

    <div v-if="toast" class="pip-toast">{{ toast }}</div>
  </section>
</template>

<style scoped>
.pg-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 4px 0 0; align-self: center;
}
.pip-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: 76px;
}

/* 제목 · 통계 · 탭은 틀 고정 — 아래 목록만 스크롤된다 (물건정보 화면 머리와 같은 방식) */
.pip-fixed-top { position: sticky; top: 0; z-index: 50; background: #f3f4f6; }

.pip-title-row {
  display: flex; align-items: center; gap: 4px;
  padding: 12px 16px 6px;
}
/* 제목은 뒤로 화살표 바로 옆 — 남는 자리를 차지해 접기 버튼을 오른쪽 끝으로 민다 */
.pip-title {
  flex: 1 1 auto; min-width: 0;
  margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.3px;
}
.pip-chev-btn {
  border: none; background: transparent; cursor: pointer; padding: 4px;
  display: inline-flex; align-items: center; justify-content: center;
}
.pip-chev { width: 20px; height: 20px; object-fit: contain; transition: transform 0.2s; }

/* 탭 — 물건정보 화면(.adp-tabs)과 같은 꼴: 흰 띠, 고른 칸 아래 곧은 파란 막대(::after) */
.pip-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: #fff; }
.pip-tab {
  position: relative; min-width: 0; overflow: hidden; white-space: nowrap; line-height: 1.25;
  border: none; background: transparent; padding: 9px 0 14px; cursor: pointer; text-align: center;
  font-size: 15.3px; font-weight: 700; letter-spacing: -0.8px; color: #111827;
}
.pip-tab.active::after {
  content: ''; position: absolute; left: 8%; right: 8%; bottom: 0;
  height: 3px; background: #2a5fbf; border-radius: 2px;
}
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

/* 드라이브에서 사라진 물건 알림 */
.pip-missing {
  margin: 0 14px 10px; padding: 11px 13px;
  background: #fff6e8; border: 1px solid #f3dcb5; border-radius: 12px;
}
.pip-missing-head { display: flex; align-items: center; gap: 8px; }
.pip-missing-head strong { font-size: 13px; font-weight: 800; color: #8a5a00; }
.pip-missing-head button {
  margin-left: auto; border: 1px solid #e3b472; border-radius: 8px; background: #fff;
  padding: 5px 11px; font-family: inherit; font-size: 11.5px; font-weight: 700;
  color: #8a5a00; cursor: pointer;
}
.pip-missing p { margin: 6px 0 0; font-size: 11.5px; line-height: 1.5; color: #8a6400; }
.pip-missing ul { margin: 6px 0 0; padding-left: 16px; }
.pip-missing li { font-size: 11.5px; color: #6b5a3a; line-height: 1.6; }

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
/* 고치는 중 — 폴더명 칸은 알약 자리(1행), 주소 칸은 주소 자리(2행)에 그대로 앉힌다 */
.pip-fav-modal-item.editing { align-items: center; }
.pip-fav-modal-item .pip-fav-edit-name { grid-column: 2; grid-row: 1; justify-self: start; width: min(240px, 100%); }
.pip-fav-modal-item .pip-fav-edit-url { grid-column: 2 / -1; grid-row: 2; }
.pip-fav-modal-item .pip-fav-field { height: 28px; font-size: 11.5px; border-radius: 7px; }
/* 창 안의 줄은 모두 같은 높이 — 폴더 알약 · 폴더명 칸 · 주소 칸 · 저장/취소 · 수정/삭제 = 28px */
.pip-fav-modal-item > .pip-folder-chip { height: 28px; box-sizing: border-box; padding: 0 11px; font-size: 11.5px; }
.pip-fav-modal-item .pip-fav-item-btn { height: 28px; box-sizing: border-box; padding: 0 10px; font-size: 11.5px; }
/* 임장경로 즐겨찾기와 같은 버튼 */
.pip-fav-item-btn {
  border: 1px solid #cbd5e1; background: #fff; color: #9ca3af;
  border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
}
.pip-fav-item-btn.on { border-color: #2a5fbf; background: #2a5fbf; color: #fff; }
/* 수정·저장은 파란 테두리, 삭제·취소는 빨간 테두리 — 속은 비워 둔다 */
.pip-fav-item-btn.edit { border-color: #2a5fbf; color: #2a5fbf; }
.pip-fav-item-btn.del { border-color: #ef4444; color: #ef4444; }
.pip-fav-item-btn.edit:active { background: #eef3fd; }
.pip-fav-item-btn.del:active { background: #fef2f2; }
.pip-fav-modal-list { padding-top: 0; }
.pip-fav-modal-item:last-child { border-bottom: none; }
/* 확인창을 폴더 창 위로 */
.pip-confirm-layer { position: relative; z-index: 500; }
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
/* AI 자동 분석 — 상자 하나: 제목 · 스위치 · 키 버튼 / 필수설정 · 키 상태 — 구글드라이브 연동(.pip-drivebox)도 같은 상자 */
.pip-aibox {
  display: flex; flex-direction: column; gap: 8px;
  background: #fff; border: 1px solid #e3e8f0; border-radius: 12px; padding: 11px 12px;
}
.pip-drivebox .pip-section-head { margin-top: 0; }
.pip-aibox-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pip-aibox-row .pip-section-title { margin-right: 2px; }
.pip-aibox-key { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.pip-req {
  flex: 0 0 auto; padding: 2px 6px; border-radius: 5px; background: #fdecec; color: #dc2626;
  font-size: 10.5px; font-weight: 800; letter-spacing: -0.2px;
}
.pip-aibox-text { min-width: 0; font-size: 12.5px; font-weight: 400; color: #111827; }
.pip-key-state { font-weight: 700; }
.pip-key-state.ok { color: #16a34a; }
.pip-key-state.no { color: #dc2626; }
/* 키 창 안의 'Google AI Studio' 글자 단추 */
.pip-key-link {
  display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: transparent;
  font-size: 12.5px; font-weight: 700; color: #2a5fbf; text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
}
.pip-key-link.inline { font-size: inherit; font-weight: 600; }
.pip-ai-switch {
  /* 키 등록 버튼(30)과 같은 높이 */
  flex: 0 0 auto; position: relative; width: 52px; height: 30px; padding: 0;
  border: none; border-radius: 999px; background: #d1d5db; cursor: pointer; transition: background 0.15s;
}
.pip-ai-switch i {
  position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: left 0.15s;
}
.pip-ai-switch.on { background: #2b6df3; }
.pip-ai-switch.on i { left: 25px; }
.pip-ai-key {
  flex: 0 0 auto; height: 30px; padding: 0 10px;
  border: 1px solid #d5dbe6; border-radius: 8px; background: #fff;
  font-size: 11.5px; font-weight: 700; color: #374151; cursor: pointer;
}
/* 결과 줄의 글자 규칙(.pip-result-text p)보다 앞서야 빛깔이 선다 */
.pip-result-text .pip-ai-note { margin: 3px 0 0; font-size: 11px; font-weight: 700; color: #2b6df3; }
.pip-result-text .pip-ai-note em { font-style: normal; font-weight: 400; color: #6b7280; }
.pip-result-text .pip-ai-note.gray { color: #9ca3af; font-weight: 400; }
.pip-result-text .pip-ai-note.err { color: #dc2626; font-weight: 400; }
.pip-ai-modal { max-width: 640px; }
/* 키 칸 — 오른쪽 끝 눈 · 붙여넣기 */
.pip-key-field { position: relative; }
.pip-key-field .pip-fav-field { width: 100%; box-sizing: border-box; padding-right: 74px; }
.pip-kf-btn {
  position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; padding: 0;
  border: none; border-radius: 6px; background: transparent; color: #6b7280; cursor: pointer;
  display: grid; place-items: center;
}
.pip-kf-btn:active { background: #f3f4f6; }
.pip-kf-btn.eye { right: 38px; }
.pip-kf-btn.paste { right: 5px; }
.pip-ai-body { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.pip-ai-msg { margin: 0; font-size: 11.5px; color: #dc2626; }
.pip-ai-msg.ok { color: #16a34a; }
.pip-ai-help { margin: 0; padding-left: 16px; font-size: 11.5px; line-height: 1.6; color: #4b5563; }
.pip-ai-btns { display: flex; justify-content: flex-end; gap: 8px; }
.pip-ai-save { width: auto; padding: 0 14px; height: 36px; font-size: 13px; }
.pip-ai-save:disabled { opacity: 0.6; cursor: default; }
.pip-ai-del {
  height: 36px; padding: 0 12px; border: 1px solid #f0d2d2; border-radius: 8px;
  background: #fff; color: #d14343; font-size: 12.5px; font-weight: 700; cursor: pointer;
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
  display: flex; align-items: center; gap: 8px;
}
/* 한 줄: 제목 · 통계(제목 바로 옆) · 접기 단추(오른쪽 끝) */
.pip-results-head h2 { white-space: nowrap; }
.pip-results-head .pip-chev-btn { margin-left: auto; }
.pip-head-stats { min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #6b7280; white-space: nowrap; }
.pip-head-stats b { margin: 0 1px 0 2px; font-weight: 800; color: #111827; }
.pip-head-stats .n-new b { color: #2b6df3; }
.pip-head-stats .n-chg b { color: #7c3aed; }
.pip-head-stats .n-err b { color: #ef4444; }
.pip-results-head h2 { display: inline-flex; align-items: center; gap: 5px; margin: 0; font-size: 14px; font-weight: 800; color: #111827; }

.pip-empty {
  border: 1.5px dashed #e5e7eb; border-radius: 10px;
  padding: 32px 16px; text-align: center; color: #9ca3af;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  margin-top: 8px;
}
.pip-empty-icon { font-size: 32px; opacity: 0.6; }
.pip-empty p { margin: 0; font-size: 12px; }
/* 목록이 생겨도 위에 남는 얇은 상자 — 더 끌어다 놓거나 눌러서 고른다 */
.pip-empty { cursor: pointer; transition: border-color 0.15s, background 0.15s, color 0.15s; }
.pip-empty.over { border-color: #2b6df3; background: #eef4ff; color: #2b6df3; }
.pip-empty.slim { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 0 4px; padding: 12px; }
.pip-empty.slim .pip-empty-icon { font-size: 18px; margin-right: 4px; }

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

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
