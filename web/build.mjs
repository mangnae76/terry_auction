// 웹 빌드 — 저장소 맨 위에서:  node web/build.mjs
//  1) web/lib/shared.entry.js (앱 src/ 로직) → web/site/pdfparse.js   (Vite 라이브러리 빌드, 전역 이름 TAPdf)
//  2) web/pages/selected.src.html + 앱 로고   → web/site/selected.html
// 앱 빌드(npm run build)와는 따로 논다 — 앱의 vite.config.ts · package.json · src/ 는 건드리지 않는다.
import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)); // web/
const root = path.resolve(here, '..');                     // 저장소 맨 위
const out = path.join(here, 'site');
const API_BASE = 'https://terry-auction-proxy.goldenboy-auction.workers.dev';

// 앱과 같은 Firebase 프로젝트에 붙는다 — 루트 .env 에서 VITE_FIREBASE_* 여섯 줄만 읽는다(공개 설정값, 비밀 키 아님).
// 다른 키(카카오·공공데이터 등)는 읽지 않는다.
const rootEnv = await readFile(path.join(root, '.env'), 'utf8').catch(() => '');
const firebaseDefine = Object.fromEntries(
  rootEnv.split('\n')
    .map((line) => line.match(/^\s*(VITE_FIREBASE_[A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [`import.meta.env.${k}`, JSON.stringify(v.replace(/^['"]|['"]$/g, ''))]),
);
if (Object.keys(firebaseDefine).length < 6) console.warn('경고: 루트 .env 에 VITE_FIREBASE_* 값이 다 없습니다 — 웹이 앱 자료에 붙지 못합니다');
await mkdir(out, { recursive: true });

// 앱 파서가 워커 주소를 '?url' 로 가져오는데, 웹은 메인 스레드에서 돌리므로 빈 값으로 바꿔 끼운다
const urlStub = {
  name: 'ta-url-stub',
  enforce: 'pre',
  resolveId(id) { if (id.endsWith('?url')) return '\0ta-url-stub'; return null; },
  load(id) { if (id === '\0ta-url-stub') return 'export default ""'; return null; },
};

await build({
  configFile: false,         // 앱의 vite.config.ts 를 읽지 않는다
  root,
  envDir: here,              // 앱의 .env 를 읽지 않는다 (web/ 에는 .env 가 없다)
  publicDir: false,
  logLevel: 'warn',
  plugins: [urlStub],
  // 드라이브 폴더 읽기는 앱과 같은 워커로 간다 (공개 주소 — 비밀값 아님)
  define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(API_BASE), 'import.meta.env.VITE_USE_EMULATOR': '"false"', 'process.env.NODE_ENV': '"production"', ...firebaseDefine },
  build: {
    outDir: out,
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    minify: true,
    rolldownOptions: {
      // pdf.js 안의 Node 전용 부분(import.meta.url) 경고 — 브라우저에서는 안 타는 길이라 감춘다
      onwarn(w, warn) { if (w.code === 'EMPTY_IMPORT_META') return; warn(w); },
    },
    lib: {
      entry: path.join(here, 'lib/shared.entry.js'),
      name: 'TAPdf',
      formats: ['iife'],
      fileName: () => 'pdfparse.js',
    },
  },
});

// 페이지 — 맨 위 설명 주석을 떼고, 로고 자리에 앱 로고를 끼워 한 장짜리 문서로 만든다
const src = await readFile(path.join(here, 'pages/selected.src.html'), 'utf8');
const logo = 'data:image/png;base64,' + (await readFile(path.join(root, 'src/assets/icones/log/LOGO_AUCTION_WHITE.png'))).toString('base64');
const body = src.replace(/^<!--[\s\S]*?-->\s*/, '').split('{{LOGO_WHITE}}').join(logo);
const doc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${body}</body>
</html>
`;
await writeFile(path.join(out, 'selected.html'), doc);
console.log('web/site/selected.html · web/site/pdfparse.js 를 만들었습니다');
