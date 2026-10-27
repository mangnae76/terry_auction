// MYTURN AUCTION — 30 s service film v2. Pacing taken from reference #3 (dark hook -> hard cut to light ->
// phone + two-line copy per feature -> 3-phone summary -> flow diagram -> logo). Graphics are MYTURN's own.
const W = 1920, H = 1080, SQ = 0.96066;
// ---- every time below comes from beats.json (reference soundtrack analysis): bt(n) = time of beat n
const B = BEATS.beat_period, bt = n => BEATS.offset + n * B;
const DROP = 11;                       // drop on downbeat 11 (5.58 s)
const TAG0 = DROP, FEAT0 = DROP + 8, FEATLEN = 8, NFEAT = 6;   // 1-bar tagline on the drop, then   // 6 features x 2 bars, each starting on a downbeat, in workflow order
const SUM0 = FEAT0 + NFEAT * FEATLEN, END0 = SUM0 + 8, FLOW0 = END0, LAST = END0 + 8;   // 42 s total
const cv = document.getElementById('cv'); const ctx = cv.getContext('2d');
const NAVY = '#0B1226', NAVY2 = '#14213D', OR = '#F07900', BL = '#50C3FC', LIGHT = '#F4F6FB', CREAM = '#FBFCFE', PEACH = '#F0A35E', SLATE = '#4A5568', LINE = '#D7DEEC';
const KR = '"Noto Sans CJK KR", sans-serif', MONO = '"Noto Sans Mono CJK KR", monospace';
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), p = (t, a, b) => cl((t - a) / (b - a)), lerp = (a, b, k) => a + (b - a) * k;
const eo3 = x => 1 - Math.pow(1 - x, 3), eo5 = x => 1 - Math.pow(1 - x, 5), ei3 = x => x * x * x, eio3 = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const backOut = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const IMG = {}; const SHOT = { list: '53eb5d72dbedcf14716dc675474e1f72', info: 'f538ce26245556b86f18e8e3bec69984', check: '74c80b031850a5a3008625a222d77b0e', bid: 'bid_stage', route: 'route_multi', alarm: 'd38a0c761a697d916f83f5b34bb5434f', fund: 'fund_filled', field: 'field_detail_done', tamun: 'field_tamun_done' };
// ---------- logo
const LG = LOGO; const PP = { sil: new Path2D(LG.sil), top: new Path2D(LG.top), left: new Path2D(LG.left), right: new Path2D(LG.right), tri: new Path2D(LG.tri) };
const LET = LG.letters.map(l => ({ g: l.g, p: new Path2D(l.d) })); const [LCX, LCY, LR] = LG.circle;
function drawMark() { ctx.fillStyle = BL; ctx.beginPath(); ctx.arc(LCX, LCY, LR, 0, 7); ctx.fill(); drawDice(); }
function drawDice(ts = 1) {   // the dice alone (design units); ts = play-triangle press scale
  const g1 = ctx.createLinearGradient(622, 0, 1532, 0); g1.addColorStop(0, '#EB7501'); g1.addColorStop(.56, '#F49220'); g1.addColorStop(1, '#F18A19');
  const g2 = ctx.createLinearGradient(1113, 0, 1561, 0); g2.addColorStop(0, '#F49422'); g2.addColorStop(1, '#EF8414');
  ctx.fillStyle = '#fff'; ctx.fill(PP.sil); ctx.fillStyle = g1; ctx.fill(PP.top); ctx.fillStyle = '#EA6F00'; ctx.fill(PP.left); ctx.fillStyle = g2; ctx.fill(PP.right);
  ctx.fillStyle = '#fff'; for (const q of LG.pips) { ctx.beginPath(); ctx.ellipse(q.c[0], q.c[1], q.wh[0] / 2, q.wh[1] / 2, q.ang * Math.PI / 180, 0, 7); ctx.fill(); }
  ctx.save(); ctx.translate(1332, 1102); ctx.scale(ts, ts); ctx.translate(-1332, -1102); ctx.fill(PP.tri); ctx.restore();
}
function markAt(cx, cy, S) { ctx.save(); ctx.translate(cx - (LCX + .5) * S * SQ, cy - (LCY + .5) * S); ctx.scale(S * SQ, S); drawMark(); ctx.restore(); }
function drawLogo(cx, cy, S, reveal = 1) {
  const LW = (5930 - (LCX - LR)) * S * SQ, X0 = cx - LW / 2 - (LCX - LR) * S * SQ, Y0 = cy - 922 * S;
  ctx.save(); ctx.translate(X0, Y0); ctx.scale(S * SQ, S); drawMark();
  LET.forEach((l, i) => { const k = cl(reveal * 14 - i); if (k <= 0) return; ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 160); ctx.fillStyle = l.g === 'my' ? '#50C3FD' : (l.g === 'turn' ? '#F07900' : '#A5A5A5'); ctx.fill(l.p, 'evenodd'); ctx.restore(); });
  ctx.restore();
}
// ---------- text
function T(s, x, y, size, color, o = {}) { ctx.save(); ctx.font = `${o.w || 900} ${size}px ${o.f || KR}`; ctx.fillStyle = color; ctx.textAlign = o.a || 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = (o.ls != null ? o.ls : -size * 0.035) + 'px'; if (o.al != null) ctx.globalAlpha *= o.al; ctx.fillText(s, x, y); const w = ctx.measureText(s).width; ctx.restore(); return w; }
function M(s, x, y, size, color, o = {}) { return T(s, x, y, size, color, Object.assign({ f: MONO, w: 700, ls: 1 }, o)); }
function MW(s, size, o = {}) { ctx.save(); ctx.font = `${o.w || 900} ${size}px ${o.f || KR}`; ctx.letterSpacing = (o.ls != null ? o.ls : -size * 0.035) + 'px'; const w = ctx.measureText(s).width; ctx.restore(); return w; }
// rich line: segments [[text,color],...]; appears with ghost->solid like the reference
function copyLine(segs, x, y, size, t, t0, o = {}) {
  const k = eo3(p(t, t0, t0 + 0.32)); if (k <= 0) return; const ghost = p(t, t0 - 0.25, t0);
  let cx = x; ctx.save(); ctx.globalAlpha = k; const dy = (1 - k) * 26;
  for (const [s, c] of segs) { cx += T(s, cx, y + dy, size, c, o); }
  ctx.restore();
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
// phone drawn at (0,0) centre, height h
function phoneAt(h0, img, o = {}) {
  const w = h0 * 0.45, bz = h0 * 0.016, iw = w - 2 * bz, sbH = h0 * 0.058;   // status bar height (holds the speaker pill)
  const h = (img && img.height / img.width < 2.0) ? 2 * bz + sbH + iw * img.height / img.width : h0;   // shorter screenshots get a shorter phone
  const x = -w / 2, y = -h / 2, r = h0 * 0.075;
  ctx.save(); ctx.shadowColor = 'rgba(20,33,61,0.28)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; ctx.fillStyle = NAVY2; rr(x, y, w, h, r); ctx.fill(); ctx.restore();
  ctx.save(); rr(x + bz, y + bz, iw, h - 2 * bz, r * 0.78); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  if (img) {
    const avail = h - 2 * bz - sbH, ih0 = iw * img.height / img.width, s = Math.min(1, avail / ih0);
    const dw = iw * s, dh = ih0 * s, dx = x + bz + (iw - dw) / 2;
    ctx.drawImage(img, dx, y + bz + sbH, dw, dh);
    if (o.zoom && o.zoom.k > 0) o._lens = { dx, dy: y + bz + sbH, sx: dw / img.width, sy: dh / img.height, iw };
  }
  // status bar: time + signal/battery, pill in the middle
  const sy = y + bz + sbH * 0.56, fs = h0 * 0.019;
  T('9:41', x + bz + iw * 0.12, sy + fs * 0.36, fs, NAVY2, { w: 800, ls: 0 });
  ctx.fillStyle = NAVY2; const rx = x + bz + iw * 0.80;
  for (let k = 0; k < 4; k++) ctx.fillRect(rx + k * fs * 0.32, sy + fs * 0.3 - fs * 0.22 * (k + 1), fs * 0.2, fs * 0.22 * (k + 1));
  ctx.strokeStyle = NAVY2; ctx.lineWidth = Math.max(1, fs * 0.08); rr(rx + fs * 1.5, sy - fs * 0.45, fs * 1.2, fs * 0.72, fs * 0.18); ctx.stroke(); ctx.fillRect(rx + fs * 1.6, sy - fs * 0.35, fs * 0.85, fs * 0.52);
  ctx.restore();
  ctx.fillStyle = NAVY2; rr(-w * 0.16, y + bz + sbH * 0.22, w * 0.32, sbH * 0.6, sbH * 0.3); ctx.fill();
  if (o._lens) {   // magnifier: the region lifts off the screen and grows past the phone edges
    const L = o._lens, [u0, v0, u1, v1] = o.zoom.r, k = o.zoom.k, rw = (u1 - u0) * L.sx, rh = (v1 - v0) * L.sy;
    const cx = L.dx + (u0 + u1) / 2 * L.sx, cy = L.dy + (v0 + v1) / 2 * L.sy, m = lerp(1, L.iw * (o.zoom.f || 1.6) / rw, k);
    ctx.save(); ctx.translate(cx * (1 - 0.15 * k) + (o.zoom.dx || 0) * k, cy); ctx.scale(m, m);
    ctx.save(); ctx.shadowColor = 'rgba(20,33,61,0.35)'; ctx.shadowBlur = 40 / m; ctx.shadowOffsetY = 16 / m; ctx.fillStyle = '#fff'; rr(-rw / 2, -rh / 2, rw, rh, 10 / m); ctx.fill(); ctx.restore();
    ctx.save(); rr(-rw / 2, -rh / 2, rw, rh, 10 / m); ctx.clip(); ctx.drawImage(img, u0, v0, u1 - u0, v1 - v0, -rw / 2, -rh / 2, rw, rh);
    if (o.zoom.tap != null && o.zoom.tap >= 0 && o.zoom.tap < 1) { const e = o.zoom.tap; ctx.strokeStyle = `rgba(240,121,0,${1 - e})`; ctx.lineWidth = 3 / m; ctx.beginPath(); ctx.arc(0, 0, (8 + 60 * eo3(e)) / m, 0, 7); ctx.stroke(); }
    ctx.restore(); ctx.strokeStyle = OR; ctx.lineWidth = 4 / m; rr(-rw / 2, -rh / 2, rw, rh, 10 / m); ctx.stroke(); ctx.restore();
  }
}
// zoom targets on the real screenshots (image pixels) and when they open/close (beats into the section)
const ZOOM = { route: { r: [20, 380, 760, 482], a: 2.0, b: 99, tap: 2.5, f: 1.65 }, bid: { r: [20, 1205, 840, 1295], a: 5.5, b: 99, f: 1.65 },
  tamun: { r: [20, 488, 1010, 782], a: 3, b: 5.25, f: 1.75, dx: -110 }, fund: { r: [10, 100, 770, 282], a: 4, b: 6.25, tap: 4.5, f: 1.75, dx: -110 } };
function zoomAt(name, t, t0) { const z = ZOOM[name]; if (!z) return null; const ta = t0 + z.a * B, tb = t0 + z.b * B;
  const k = backOut(p(t, ta, ta + 0.3), 1.6) * (1 - eio3(p(t, tb, tb + 0.3))); return { r: z.r, k, f: z.f, dx: z.dx, tap: z.tap != null ? (t - (t0 + z.tap * B)) / 0.45 : null }; }
// swing transform (fake Y rotation) around (cx,cy); ang in radians
function swing(cx, cy, ang, tilt = 0) { ctx.translate(cx, cy); ctx.rotate(tilt); ctx.transform(Math.cos(ang), Math.sin(ang) * 0.18, 0, 1, 0, 0); }
// ---------- data
const BEAT = n => n * B;
const WINS = [   // [type, title, x, y, depth, rotation°]
  ['pdf', '경매지.pdf', 300, 640, 1.0, -5], ['xls', '시세조사.xlsx', 1590, 650, 1.0, 4], ['chart', '실거래가 조회', 620, 880, 0.85, 3],
  ['map', '지도', 1330, 900, 0.9, -3], ['calc', '계산기', 170, 330, 0.7, 6], ['memo', '임장 메모', 1760, 330, 0.75, -6],
  ['photo', '사진첩', 960, 960, 0.7, 2], ['doc', '등기부등본', 1500, 160, 0.55, 4], ['ppt', '보고서.pptx', 430, 150, 0.55, -4],
  ['chat', '카톡', 1820, 880, 0.6, 5], ['bars', '호가 분석', 90, 880, 0.6, -3], ['xls', '수익계산.xlsx', 980, 700, 0.5, -2],
];
// one mini app window (360 x 240 design units, centred)
function drawWin(type, title) {
  const w = 360, h = 240, x = -w / 2, y = -h / 2, tb = 38;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; ctx.fillStyle = '#FFFFFF'; rr(x, y, w, h, 16); ctx.fill(); ctx.restore();
  ctx.save(); rr(x, y, w, h, 16); ctx.clip();
  ctx.fillStyle = '#E9EDF5'; ctx.fillRect(x, y, w, tb);
  [['#FF5F57', 0], ['#FEBC2E', 1], ['#28C840', 2]].forEach(([c, k]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 22 + k * 20, y + tb / 2, 6.5, 0, 7); ctx.fill(); });
  T(title, x + 92, y + tb / 2 + 7, 19, '#4A5568', { w: 700, ls: 0 });
  const cx0 = x + 22, cy0 = y + tb + 18, cw = w - 44, ch = h - tb - 36;
  const L = (xx, yy, ww, c = '#D7DEEC', th = 10) => { ctx.fillStyle = c; rr(xx, yy, ww, th, th / 2); ctx.fill(); };
  if (type === 'pdf' || type === 'doc') {
    ctx.fillStyle = type === 'pdf' ? '#E5484D' : '#2A3F8F'; rr(cx0, cy0, 54, 66, 8); ctx.fill(); T(type === 'pdf' ? 'PDF' : '등기', cx0 + 27, cy0 + 41, 17, '#fff', { a: 'center', w: 900, ls: 0 });
    for (let k = 0; k < 6; k++) L(cx0 + 72, cy0 + 4 + k * 22, cw - 72 - (k % 3) * 34);
    if (type === 'pdf') { ctx.fillStyle = 'rgba(255,214,0,0.55)'; ctx.fillRect(cx0 + 70, cy0 + 44 - 4, 160, 18); }
  } else if (type === 'xls') {
    ctx.strokeStyle = '#C9D3E6'; ctx.lineWidth = 2; const cols = 5, rows = 5;
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(cx0, cy0 + r * ch / rows); ctx.lineTo(cx0 + cw, cy0 + r * ch / rows); ctx.stroke(); }
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(cx0 + c * cw / cols, cy0); ctx.lineTo(cx0 + c * cw / cols, cy0 + ch); ctx.stroke(); }
    ctx.fillStyle = '#1D8F55'; ctx.fillRect(cx0, cy0, cw, ch / rows); ctx.fillStyle = 'rgba(29,143,85,0.18)'; ctx.fillRect(cx0 + 2 * cw / cols, cy0 + 3 * ch / rows, cw / cols, ch / rows);
  } else if (type === 'chart' || type === 'bars') {
    ctx.strokeStyle = '#D7DEEC'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0, cy0 + ch); ctx.lineTo(cx0 + cw, cy0 + ch); ctx.stroke();
    if (type === 'chart') { ctx.strokeStyle = '#2A3F8F'; ctx.lineWidth = 5; ctx.beginPath(); for (let k = 0; k <= 10; k++) { const xx = cx0 + 8 + k * (cw - 16) / 10, yy = cy0 + ch - 14 - (k * 9 + 26 * Math.sin(k * 1.1) + 20); k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
    else { for (let k = 0; k < 8; k++) { const hh = 26 + 90 * Math.abs(Math.sin(k * 0.9 + 0.4)); ctx.fillStyle = k === 5 ? OR : BL; rr(cx0 + 12 + k * 38, cy0 + ch - hh, 24, hh, 5); ctx.fill(); } }
  } else if (type === 'map') {
    ctx.fillStyle = '#EAF1E4'; ctx.fillRect(x, y + tb, w, h - tb);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x, y + 150); ctx.lineTo(x + w, y + 110); ctx.moveTo(x + 140, y + tb); ctx.lineTo(x + 200, y + h); ctx.stroke();
    ctx.fillStyle = '#B9DDA9'; ctx.beginPath(); ctx.ellipse(x + 80, y + 200, 60, 30, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 290, y + 80, 50, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#E5484D'; ctx.beginPath(); ctx.arc(x + 250, y + 140, 16, Math.PI, 0); ctx.lineTo(x + 250, y + 176); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 250, y + 140, 6, 0, 7); ctx.fill();
  } else if (type === 'calc') {
    ctx.fillStyle = '#14213D'; rr(cx0, cy0, cw, 44, 8); ctx.fill(); T('188,398,000', cx0 + cw - 12, cy0 + 31, 24, '#fff', { a: 'right', w: 800, ls: 0 });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { ctx.fillStyle = c === 4 ? OR : '#E9EDF5'; rr(cx0 + c * (cw / 5) + 3, cy0 + 56 + r * 40, cw / 5 - 6, 32, 7); ctx.fill(); }
  } else if (type === 'memo') {
    ctx.fillStyle = '#FFF6CC'; ctx.fillRect(x, y + tb, w, h - tb); ctx.strokeStyle = '#EED98A'; ctx.lineWidth = 2;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x + 16, y + tb + k * 32); ctx.lineTo(x + w - 16, y + tb + k * 32); ctx.stroke(); }
    ['남향, 엘리베이터 O', '외벽 누수 흔적', '관리비 체납 문의'].forEach((m, k) => T(m, x + 24, y + tb + 26 + k * 32, 19, '#6B5B1E', { w: 700, ls: 0 }));
  } else if (type === 'photo') {
    const cols = ['#9CC3E6', '#F3C08A', '#B9DDA9', '#C9B8E8']; for (let k = 0; k < 4; k++) { const px = cx0 + (k % 2) * (cw / 2 + 4), py = cy0 + Math.floor(k / 2) * (ch / 2 + 4); ctx.fillStyle = cols[k]; rr(px, py, cw / 2 - 4, ch / 2 - 4, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(px + 14, py + ch / 2 - 14); ctx.lineTo(px + 50, py + 26); ctx.lineTo(px + 84, py + ch / 2 - 14); ctx.closePath(); ctx.fill(); }
  } else if (type === 'ppt') {
    ctx.fillStyle = '#F4F6FB'; ctx.fillRect(cx0, cy0, cw, ch); ctx.fillStyle = '#D24726'; ctx.fillRect(cx0, cy0, cw, 12);
    L(cx0 + 18, cy0 + 30, 180, '#14213D', 14); L(cx0 + 18, cy0 + 60, 240); L(cx0 + 18, cy0 + 84, 200); ctx.fillStyle = OR; rr(cx0 + cw - 90, cy0 + 70, 66, 50, 6); ctx.fill();
  } else if (type === 'chat') {
    ctx.fillStyle = '#BACEE0'; ctx.fillRect(x, y + tb, w, h - tb);
    ctx.fillStyle = '#fff'; rr(x + 18, y + tb + 18, 190, 40, 14); ctx.fill(); ctx.fillStyle = '#FEE500'; rr(x + w - 218, y + tb + 72, 200, 40, 14); ctx.fill(); ctx.fillStyle = '#fff'; rr(x + 18, y + tb + 126, 150, 40, 14); ctx.fill();
    T('잔금 일정 언제?', x + 34, y + tb + 45, 18, '#333', { w: 700, ls: 0 }); T('법원 3계, 11시!', x + w - 202, y + tb + 99, 18, '#333', { w: 700, ls: 0 });
  }
  ctx.restore();
}
const SECTIONS = [  // [start, end, key, label, headline segs, [sub line A segs, sub line B segs]] — start/end filled from beats.json below
  [0, 0, 'list', '01 · 선정물건 관리', [['고른 물건, ', NAVY2], ['한눈에.', OR]],
    [[['손품부터 낙찰 이후까지,', SLATE]], [['단계만 넘기면', NAVY2], [' 기록은 카드에 쌓입니다.', SLATE]]]],
  [0, 0, 'market', '02 · 손품조사 · 가격정보', [['시세조사, ', NAVY2], ['수요조사.', OR]],
    [[['실거래가도, 매매수요도,', SLATE]], [['앱이 알아서', NAVY2], [' 한 화면에 모읍니다.', SLATE]]]],
  [0, 0, 'route', '03 · 임장 동선 최적화', [['임장은 ', NAVY2], ['동선부터.', OR]],
    [[['동선을 계획하는 시간, 이동하는 시간,', SLATE]], [['버튼 하나로', NAVY2], [' 아껴 드립니다.', SLATE]]]],
  [0, 0, 'field', '04 · 임장 현장조사 · 탐문 체크리스트', [['현장에서, ', NAVY2], ['바로.', OR]],
    [[['손품조사 내용을 ', SLATE], ['펼쳐 보고,', NAVY2]], [['체크리스트로', NAVY2], [' 탐문하며 물건별로 확인합니다.', SLATE]]]],
  [0, 0, 'bid', '05 · 입찰가 산정 · 예상 수익 분석', [['입찰 전에, ', NAVY2], ['수익부터.', OR]],
    [[['입찰가를 넣으면 필요한 돈과 남는 돈,', SLATE]], [['세금까지', NAVY2], [' 한 번에 계산됩니다.', SLATE]]]],
  [0, 0, 'alarm', '06 · 낙찰 이후 · 자금관리 · 세금 신고', [['낙찰, ', NAVY2], ['그다음까지.', OR]],
    [[['잔금 기한은 미리 알려 드리고,', SLATE]], [['세금 신고철에도', NAVY2], [' 영수증 뒤질 일 없습니다.', SLATE]]]],
];
SECTIONS.forEach((s, i) => { s[0] = bt(FEAT0 + i * FEATLEN); s[1] = bt(FEAT0 + (i + 1) * FEATLEN); });
// workflow stepper: in 01 the stages pop in as chips under the copy, then fly up and stay as a stepper for 02-05,
// lighting the current stage on each section's downbeat
const STEPS = ['손품조사', '임장예정', '임장완료', '입찰산정', '낙찰'];   // the app's own card stages
let STAMP = null;
function stampImg() {   // built once (after fonts load), 2x resolution; deterministic grain so every frame matches
  if (STAMP) return STAMP; const c = document.createElement('canvas'); c.width = 480; c.height = 264; const g = c.getContext('2d'); const ink = '#D9362B';
  g.strokeStyle = ink; g.lineWidth = 10; g.beginPath(); g.roundRect(12, 12, 456, 240, 34); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.roundRect(30, 30, 420, 204, 22); g.stroke();
  g.fillStyle = ink; g.font = `900 96px ${KR}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.letterSpacing = '4px'; g.fillText('임장완료', 240, 158);
  g.font = `700 26px ${MONO}`; g.letterSpacing = '6px'; g.fillText('현장확인 · MYTURN', 240, 208);
  g.globalCompositeOperation = 'destination-out'; let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1400; i++) { g.globalAlpha = 0.25 + 0.7 * rnd(); g.beginPath(); g.arc(rnd() * 480, rnd() * 264, 0.6 + 2.4 * rnd() ** 2, 0, 7); g.fill(); }
  for (let i = 0; i < 6; i++) { g.globalAlpha = 0.35; g.lineWidth = 2 + 3 * rnd(); g.beginPath(); const y = rnd() * 264; g.moveTo(rnd() * 120, y); g.lineTo(240 + rnd() * 240, y + (rnd() - 0.5) * 30); g.stroke(); }
  return (STAMP = c);
}
function drawStepper(t, idx) {
  const S0 = SECTIONS[0], X = 1060;
  const m = eio3(p(t, S0[1] - B, S0[1] - B / 4));                         // 0 = chip row (01), 1 = stepper at the top
  // summary (idx === NFEAT): the stepper stays, each stage lights orange with 조사하고 / 임장하고 / 낙찰받는다, all connectors glow on '마이턴 옥션.'
  const SUM = idx >= NFEAT, GRP = [0, 1, 1, 2, 2];
  const fade = 1 - p(t, bt(END0) - B / 2, bt(END0) - 0.05);
  const act = SUM ? STEPS.length - 1 : (idx >= 1 ? idx - 1 : -1), ak = SUM ? 1 : (idx >= 1 ? eo3(p(t, SECTIONS[idx][0] - B / 2, SECTIONS[idx][0])) : 0);
  const geo = j => ({ x: lerp(X + j * 152, X + j * 146, m), y: lerp(690, 240, m), w: lerp(140, 120, m), h: lerp(52, 40, m), f: lerp(23, 19, m) });
  // connectors (stepper mode only): fill up to the active stage
  if (m > 0) for (let j = 0; j < STEPS.length - 1; j++) { const a = geo(j), b = geo(j + 1), yy = a.y + a.h / 2;
    ctx.globalAlpha = m * fade; ctx.fillStyle = LINE; ctx.fillRect(a.x + a.w + 6, yy - 2, b.x - a.x - a.w - 12, 4);
    const fill = j + 1 < act ? 1 : (j + 1 === act ? ak : 0); if (fill > 0) { ctx.fillStyle = NAVY2; ctx.fillRect(a.x + a.w + 6, yy - 2, (b.x - a.x - a.w - 12) * fill, 4); }
    if (SUM) { const g = eo3(p(t, bt(SUM0 + 4) + j * 0.04, bt(SUM0 + 4) + j * 0.04 + 0.16)); if (g > 0) { ctx.fillStyle = OR; ctx.fillRect(a.x + a.w + 6, yy - 3, (b.x - a.x - a.w - 12) * g, 6); } } }
  STEPS.forEach((s, j) => {
    const q = idx === 0 ? eo5(p(t, S0[0] + 4 * B + j * B / 2, S0[0] + 4.4 * B + j * B / 2)) : 1; if (q <= 0) return;
    const g = geo(j); ctx.globalAlpha = q * fade;
    const pill = (fill, stroke, tc) => { ctx.fillStyle = fill; rr(g.x, g.y, g.w, g.h, g.h / 2); ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); T(s, g.x + g.w / 2, g.y + g.h / 2 + g.f * 0.36, g.f, tc, { a: 'center', w: 800, ls: 0 }); };
    const state = j < act ? 'done' : (j === act ? 'act' : 'todo'), prev = j < act - 1 ? 'done' : (j === act - 1 ? 'act' : 'todo');
    const look = st => st === 'done' ? [NAVY2, NAVY2, '#fff'] : (st === 'act' ? [OR, OR, '#fff'] : [CREAM, LINE, m > 0.5 ? SLATE : NAVY2]);
    pill(...look(prev)); if (ak > 0 && state !== prev) { ctx.globalAlpha = q * fade * ak; pill(...look(state)); }
    if (SUM) { const tg = bt(SUM0 + 1 + GRP[j]), lit = eo3(p(t, tg, tg + 0.15)); if (lit > 0) { ctx.globalAlpha = fade * lit; pill(...look('act')); }
      [tg, bt(SUM0 + 4)].forEach(tp => { const d = t - tp; if (d >= 0 && d < 0.45) { const e = d / 0.45; ctx.globalAlpha = (1 - e) * fade; ctx.strokeStyle = OR; ctx.lineWidth = 3 * (1 - e) + 1;
        rr(g.x - 10 * eo3(e), g.y - 10 * eo3(e), g.w + 20 * eo3(e), g.h + 20 * eo3(e), g.h / 2 + 10 * eo3(e)); ctx.stroke(); } }); }
    else if (j === act) { const d = t - SECTIONS[idx][0]; if (d >= 0 && d < 0.45) { const e = d / 0.45; ctx.globalAlpha = (1 - e) * fade; ctx.strokeStyle = OR; ctx.lineWidth = 3 * (1 - e) + 1;
      rr(g.x - 10 * eo3(e), g.y - 10 * eo3(e), g.w + 20 * eo3(e), g.h + 20 * eo3(e), g.h / 2 + 10 * eo3(e)); ctx.stroke(); } }
    ctx.globalAlpha = 1; });
  ctx.globalAlpha = 1;
}
// ================= scenes
// windows pile up faster and faster (8ths -> 16ths -> 32nds) into the punch line on beat 3
const WT = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.625, 2.75, 2.8125, 2.875, 2.9375];   // after '경매는,' — 16ths, then 32nds into the punch on beat 3
function sIntro(t) {
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  { const gk = eo3(p(t, 0, 0.5)) * (1 - p(t, bt(3), bt(4))); if (gk > 0) { const g = ctx.createRadialGradient(960, 300, 0, 960, 300, 820); g.addColorStop(0, `rgba(31,58,114,${0.55 * gk})`); g.addColorStop(1, 'rgba(31,58,114,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } }
  const conv = eio3(p(t, bt(5), bt(8)));        // chips converge into the case card
  const appear = p(t, bt(0), bt(3));
  // floating app windows ("열 개 넘는 창") — far ones smaller/dimmer, one pops in every 16th note
  const sh = t >= bt(3) && t < bt(3) + 0.3 ? (1 - (t - bt(3)) / 0.3) * 10 : 0; ctx.save(); ctx.translate(Math.sin(t * 90) * sh, Math.cos(t * 70) * sh * 0.6);
  const order = WINS.map((wd, i) => [wd[3], i]).sort((u, v) => u[0] - v[0]);
  for (const [, i] of order) {
    const [type, title, cx, cy, z, rot] = WINS[i]; const t0 = bt(WT[i]);
    if (t < t0) continue;
    const pop = backOut(p(t, t0, t0 + 0.28), 2.2), seed = i * 1.7;
    const dx = Math.sin(t * 0.55 + seed) * 22 * z, dy = Math.cos(t * 0.45 + seed) * 16 * z - (t - t0) * 10 * z;
    const x = lerp(cx + dx, 960, conv), y = lerp(cy + dy, 640, conv), sc = lerp(z, 0.25, ei3(conv)) * pop;
    ctx.save(); ctx.globalAlpha = (1 - p(t, bt(7.5), bt(8.2))) * (0.55 + 0.45 * z); ctx.translate(x, y); ctx.rotate((rot * Math.PI / 180) * (1 - conv)); ctx.scale(sc, sc);
    drawWin(type, title); ctx.restore();
  }
  ctx.restore();   // end shake
  // copy (top, like the reference)
  const fadeTop = 1 - p(t, bt(4.6), bt(5));
  if (fadeTop > 0) { ctx.save(); ctx.globalAlpha = fadeTop;
    const vg = ctx.createRadialGradient(960, 270, 0, 960, 270, 760); vg.addColorStop(0, 'rgba(11,18,38,0.88)'); vg.addColorStop(0.6, 'rgba(11,18,38,0.55)'); vg.addColorStop(1, 'rgba(11,18,38,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);                                  // keeps the copy readable over the windows
    { const k = eo3(p(t, bt(0.75), bt(0.75) + 0.5)); if (k > 0) T('경매는,', 960 - MW('경매는,', 80) / 2, 190 + (1 - k) * 12, 80, CREAM, { al: k }); }   // fades up at ~0.45 s, after the music
    const k = p(t, bt(3), bt(3) + 0.24); if (k > 0) { const s2 = '아직 아날로그다.', f2 = 116, sc = lerp(1.28, 1, eo5(k)), w2 = MW(s2, f2);
      ctx.save(); ctx.globalAlpha *= eo3(cl(k * 2.5)); ctx.translate(960, 330 - f2 * 0.35); ctx.scale(sc, sc); let x = -w2 / 2;
      for (const [seg, c] of [['아직 ', CREAM], ['아날로그', OR], ['다.', CREAM]]) x += T(seg, x, f2 * 0.35, f2, c); ctx.restore(); }
    ctx.restore(); }
  if (t > bt(5)) { ctx.save(); ctx.globalAlpha = 1 - p(t, bt(10), bt(10.5));
    copyLine([['열 개 넘는 창을 오가던 일,', CREAM]], 960 - MW('열 개 넘는 창을 오가던 일,', 58) / 2, 230, 58, t, bt(5.1));
    copyLine([['이제 ', CREAM], ['사건카드 한 장', OR], ['으로.', CREAM]], 960 - MW('이제 사건카드 한 장으로.', 58) / 2, 310, 58, t, bt(7));
    ctx.restore(); }
  // the case card forms
  const ck = backOut(p(t, bt(7), bt(7.8)), 2.0), zk = ei3(p(t, bt(10), bt(11)));   // zoom-through: the card flies at the camera into the drop
  if (ck > 0) { ctx.save(); ctx.translate(960, lerp(640, 560, zk)); ctx.rotate(-0.05 * zk); ctx.scale(ck * (1 + 15 * zk), ck * (1 + 15 * zk)); ctx.fillStyle = CREAM; rr(-330, -150, 660, 300, 28); ctx.fill(); ctx.fillStyle = OR; rr(-330, -150, 660, 18, 9); ctx.fill();
    T('2026타경1234', -290, -66, 50, NAVY2); ctx.fillStyle = OR; rr(150, -110, 140, 50, 25); ctx.fill(); T('임장완료', 220, -75, 26, '#fff', { a: 'center', w: 800 });
    M('경기도 안양시 동안구 · 아파트', -290, -14, 26, SLATE, { w: 600, ls: 0 });
    ['권리 ✓', '시세 ✓', '임장 ✓', '입찰가 ✓'].forEach((s, i) => { const q = p(t, bt(8 + i * 0.5), bt(8.3 + i * 0.5)); ctx.globalAlpha = q; ctx.fillStyle = '#1F3A72'; rr(-290 + i * 148, 40, 136, 52, 26); ctx.fill(); T(s, -222 + i * 148, 76, 24, CREAM, { a: 'center', w: 800 }); ctx.globalAlpha = 1; });
    ctx.restore(); }
}
function sFeature(t, sec, idx) {
  ctx.fillStyle = LIGHT; ctx.fillRect(0, 0, W, H);
  const [t0, t1, key, label, l1, l2] = sec;
  // phone swing-in from previous / swing-out to next
  const inK = eo5(p(t, t0 - B / 2, t0 + B)), outK = ei3(p(t, t1 - B, t1 - B / 2));
  const ang = (1 - inK) * -1.2 + outK * 1.25; const tilt = -0.05 + 0.03 * Math.sin(t * 1.3);
  const dk = key === 'route' ? eio3(p(t, t0 + 2.6 * B, t0 + 3.0 * B)) : 0;      // 03: dive into the phone's map right after the tap
  if (dk > 0) drawRouteMap(t, t0, p(dk, 0.35, 0.9) * (1 - outK), 1 + 0.04 * p(t, t0 + 3 * B, t1));
  ctx.save();
  if (dk > 0) { const Z = 1 + 3.03 * ei3(dk), mx = lerp(560, 480, dk), my = lerp(808, 560, dk); ctx.globalAlpha = 1 - p(dk, 0.55, 1);   // ends at the full map's scale/position
    if (dk < 1) { swing(mx, my - 248.5 * Z, ang * (1 - dk), tilt * (1 - dk)); ctx.scale(Z, Z); phoneAt(880, IMG[key], { zoom: zoomAt(key, t, t0) }); } }
  else if (key && key !== 'market') { swing(560, 560 + (1 - inK) * 40, ang, tilt); phoneAt(880, IMG[key], { zoom: zoomAt(key, t, t0) }); }
  else { swing(560, 560, ang * 0.6, 0); chartCard(t, t0); }
  ctx.restore();
  if (dk > 0) { const a = p(dk, 0.35, 0.9) * (1 - outK), g = ctx.createLinearGradient(860, 0, 1080, 0);   // keeps the copy readable over the map
    g.addColorStop(0, 'rgba(244,246,251,0)'); g.addColorStop(1, `rgba(244,246,251,${0.95 * a})`); ctx.fillStyle = g; ctx.fillRect(860, 0, 1060, H); }
  // second phone rises with sub line A: 06 fund ledger, 04 the 탐문 checklist in front of the 손품+현장 tab
  const SECOND = { alarm: 'fund', field: 'tamun' }[key];
  if (SECOND) { const k2 = eo5(p(t, t0 + 2 * B, t0 + 3 * B)); ctx.save(); swing(820, 600 + (1 - k2) * 260, (1 - k2) * -0.8 + outK, 0.06); ctx.globalAlpha = k2; phoneAt(760, IMG[SECOND], { zoom: zoomAt(SECOND, t, t0) }); ctx.restore(); }
  // copy
  const X = 1060; M(label, X, 364, 20, OR, { al: eo3(p(t, t0 - B / 2, t0)) * (1 - outK), ls: 1.5 });
  ctx.save(); ctx.globalAlpha = 1 - outK; copyLine(l1, X, 480, 92, t, t0);
  // two-line spoken sub: line A on beat 3, line B on the following 8th (lands with the route button tap)
  copyLine(l2[0], X, 560, 40, t, t0 + 1.5 * B, { w: 700 }); copyLine(l2[1], X, 616, 40, t, t0 + 2 * B, { w: 800 }); ctx.restore();
  drawStepper(t, idx);
  if (key === 'market') { ctx.save(); ctx.globalAlpha = 1 - outK;
    // the app's own numbers (손품+현장 tab, example property) arriving and being calculated: 시세 with the line, 수요 지표 with the bars
    const card = (y, title, cells, ta, tb) => { const k = eo3(p(t, ta - 0.1, ta + 0.2)); if (k <= 0) return; ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 30, 0);
      const h = 118, cw = 720 / cells.length; ctx.save(); ctx.shadowColor = 'rgba(20,33,61,0.10)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = '#fff'; rr(X, y, 720, h, 16); ctx.fill(); ctx.restore();
      ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(X, y, 720, h, 16); ctx.stroke();
      M(title, X + 20, y + 30, 19, NAVY2, { ls: 0 });
      const live = 0.5 + 0.5 * Math.sin(t * 9); ctx.fillStyle = `rgba(24,160,88,${0.45 + 0.55 * live})`; ctx.beginPath(); ctx.arc(X + 620, y + 23, 6, 0, 7); ctx.fill(); T('실시간', X + 632, y + 30, 18, '#18A058', { w: 800, ls: 0 });
      cells.forEach(([lab, val, fmt, gr], j) => { const cx = X + cw * j + cw / 2, q = eo3(p(t, ta + j * B / 4, tb + j * B / 4));
        if (j) { ctx.fillStyle = LINE; ctx.fillRect(X + cw * j, y + 48, 2, 56); }
        T(lab, cx, y + 70, 17, SLATE, { a: 'center', w: 700, ls: 0 }); const w = T(fmt(val * q), cx + (gr ? -14 : 0), y + 102, 26, NAVY2, { a: 'center', w: 900, ls: 0 });
        if (gr && q >= 1) { const gk = backOut(p(t, tb + j * B / 4, tb + j * B / 4 + 0.2), 2.4); ctx.save(); ctx.translate(cx - 14 + w / 2 + 20, y + 93); ctx.scale(gk, gk); ctx.fillStyle = gr === 'B' ? '#DCE6FF' : '#E9ECF2'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill(); T(gr, 0, 7, 18, NAVY2, { a: 'center', w: 900, ls: 0 }); ctx.restore(); } });
      ctx.restore(); };
    const won = v => Math.round(v).toLocaleString('ko-KR'), pct = v => v.toFixed(2) + '%';
    card(668, '실거래가 조사 · 자동입력', [['매매 실거래가', 190000000, won], ['전세 실거래가', 107100000, won], ['국토부 실거래 평균', 169111111, won]], t0 + 2.5 * B, t0 + 3.5 * B);
    card(806, '매매수요 · 지표결과', [['거래 회전율', 2.71, pct, 'B'], ['매물 소화율', 13.90, pct, 'C'], ['매물 부담률', 19.48, pct, 'C'], ['소진기간', 86, v => Math.round(v) + 'M', 'C']], t0 + 3.5 * B, t0 + 4.5 * B);
    ctx.restore(); }
  if (key === 'field') {   // tags under the two phones: what you researched before the visit vs what you check on site
    [[470, '임장 전 · 손품조사', t0 + B, CREAM, NAVY2], [830, '현장 · 탐문', t0 + 3 * B, OR, '#fff']].forEach(([cx, s, ta, bg, tc]) => {
      const k = backOut(p(t, ta, ta + 0.25), 2.2); if (k <= 0) return; const w = MW(s, 24, { w: 800, ls: 0 }) + 44;
      ctx.save(); ctx.globalAlpha = 1 - outK; ctx.translate(cx, 962); ctx.scale(k, k); ctx.fillStyle = bg; rr(-w / 2, -24, w, 48, 24); ctx.fill();
      if (bg === CREAM) { ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke(); } T(s, 0, 9, 24, tc, { a: 'center', w: 800, ls: 0 }); ctx.restore(); }); }
  if (key === 'field') { ctx.save(); ctx.globalAlpha = 1 - outK;
    // rows taken from the app's own 탐문 checklist (손품+현장 tab)
    const kt = eo3(p(t, t0 + 2.5 * B, t0 + 3 * B)); if (kt > 0) M('탐문 체크리스트', X, 704, 22, SLATE, { al: kt, ls: 0 });
    const ROWS = [['향 / 뷰', '서향', 0], ['건물관리', '외벽크랙 X', 0], ['우편함', '전기 · 가스 · 수도요금 X', 0], ['누수', '입주민에게 확인', 0]];
    ROWS.forEach(([a, v, flag], j) => { const tj = t0 + 3 * B + j * B / 2, k = eo3(p(t, tj - 0.12, tj + 0.12)), ck = backOut(p(t, tj, tj + 0.2), 2.6); if (k <= 0) return; const y = 752 + j * 46;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 24, 0);
      ctx.fillStyle = '#fff'; rr(X, y - 26, 30, 30, 7); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
      if (ck > 0) { ctx.save(); ctx.translate(X + 15, y - 11); ctx.scale(ck, ck); ctx.fillStyle = flag ? OR : NAVY2; rr(-15, -15, 30, 30, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-2, 5); ctx.lineTo(7, -5); ctx.stroke(); ctx.restore(); }
      T(a, X + 46, y, 26, SLATE, { w: 700, ls: 0 }); T(v, X + 290, y, 26, flag ? OR : NAVY2, { w: 900, ls: 0 }); ctx.restore(); });
    // rubber stamp (도장): comes down over the checklist and hits exactly on beat 6, red ink with a worn texture
    const ts = t0 + 5.5 * B, kd = p(t, ts - 0.14, ts); if (kd > 0) { const STP = stampImg(); const hit = t >= ts ? p(t, ts, ts + 0.16) : 0;
      const sc = t < ts ? lerp(1.9, 1, ei3(kd)) : 1 - 0.05 * Math.sin(Math.PI * hit);
      ctx.save(); ctx.translate(X + 650, 828); ctx.rotate(-0.16);
      if (t >= ts && hit < 1) { ctx.strokeStyle = `rgba(217,54,43,${0.35 * (1 - hit)})`; ctx.lineWidth = 3; rr(-118 - 30 * hit, -66 - 20 * hit, 236 + 60 * hit, 132 + 40 * hit, 20); ctx.stroke(); }
      ctx.scale(sc, sc); ctx.globalAlpha *= (t < ts ? 0.35 * kd : 0.9); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(STP, -STP.width / 4, -STP.height / 4, STP.width / 2, STP.height / 2); ctx.restore(); }
    ctx.restore(); }
  if (key === 'bid') { ctx.save(); ctx.globalAlpha = 1 - outK;
    // the app's own breakdown (same numbers as the screenshot): three cost rows on 8ths, then the total rolls up and lands on beat 6
    const ROWS = [['입찰 당일 · 입찰보증금', 43400000], ['잔금 납부 · 취득 비용', 129998000], ['명도 · 수리', 15000000]];
    ROWS.forEach(([s, v], j) => { const tj = t0 + 3 * B + j * B / 2, k = eo3(p(t, tj, tj + 0.25)); if (k <= 0) return; const y = 706 + j * 48;
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 30, 0); ctx.fillStyle = NAVY2; ctx.beginPath(); ctx.arc(X + 14, y - 9, 14, 0, 7); ctx.fill();
      T(String(j + 1), X + 14, y - 1, 18, '#fff', { a: 'center', w: 900, ls: 0 }); T(s, X + 42, y, 26, SLATE, { w: 700, ls: 0 }); T(v.toLocaleString('ko-KR') + '원', X + 720, y, 26, NAVY2, { a: 'right', w: 800, ls: 0 }); ctx.restore(); });
    const tc = t0 + 4.5 * B, tl = t0 + 5.5 * B, ka = eo3(p(t, tc, tc + 0.2));
    if (ka > 0) { ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = LINE; ctx.fillRect(X, 836, 720, 3);
      const v = Math.round(188398000 * eo3(p(t, tc, tl))), hit = t >= tl ? 1 + 0.12 * (1 - eo3(p(t, tl, tl + 0.3))) : 1;
      T('필요한 내 돈 합계', X, 900, 30, NAVY2, { w: 900, ls: 0 });
      ctx.save(); ctx.translate(X + 720, 900); ctx.scale(hit, hit); T(v.toLocaleString('ko-KR') + '원', 0, 0, 58, OR, { a: 'right', ls: 0 }); ctx.restore(); ctx.restore(); }
    ctx.restore(); }
  if (key === 'alarm') { ctx.save(); ctx.globalAlpha = 1 - outK;
    // tax season: '엑셀저장' (the app's own button) pops on beat 5, tapped on the next 8th, the file lands on beat 6 with a check
    const bk = backOut(p(t, t0 + 4 * B, t0 + 4 * B + 0.25), 2.2), tTap = t0 + 4.5 * B;
    if (bk > 0) { const press = (t >= tTap && t < tTap + 0.14) ? 0.92 : 1, on = t >= tTap; ctx.save(); ctx.translate(X + 130, 726); ctx.scale(bk * press, bk * press);
      ctx.fillStyle = on ? NAVY2 : '#fff'; rr(-130, -32, 260, 64, 16); ctx.fill(); ctx.strokeStyle = NAVY2; ctx.lineWidth = 3; ctx.stroke();
      const c = on ? '#fff' : NAVY2; ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-92, -12); ctx.lineTo(-92, 6); ctx.moveTo(-100, -1); ctx.lineTo(-92, 7); ctx.lineTo(-84, -1); ctx.moveTo(-102, 13); ctx.lineTo(-82, 13); ctx.stroke();
      T('엑셀저장', 16, 9, 26, c, { a: 'center', w: 900, ls: 0 }); ctx.restore();
      const d = t - tTap; if (d >= 0 && d < 0.45) { const e = d / 0.45; ctx.strokeStyle = `rgba(20,33,61,${1 - e})`; ctx.lineWidth = 4 * (1 - e); ctx.beginPath(); ctx.arc(X + 150, 738, 14 + 70 * eo3(e), 0, 7); ctx.stroke(); } }
    const tf = t0 + 5 * B, kf = eo3(p(t, tf, tf + 0.3)); if (kf > 0) { ctx.save(); ctx.globalAlpha *= kf; ctx.translate(lerp(X + 150, X + 300, kf), 0);
      ctx.fillStyle = '#fff'; rr(0, 694, 400, 64, 16); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1D6F42'; rr(14, 706, 40, 40, 8); ctx.fill(); T('X', 34, 735, 26, '#fff', { a: 'center', w: 900, ls: 0 });
      T('자금내역_세무사용.xlsx', 66, 736, 24, NAVY2, { w: 800, ls: 0 });
      const kc = backOut(p(t, t0 + 5.5 * B, t0 + 5.5 * B + 0.25), 2.4); if (kc > 0) { ctx.save(); ctx.translate(372, 726); ctx.scale(kc, kc); ctx.fillStyle = '#18A058'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-2, 5); ctx.lineTo(7, -5); ctx.stroke(); ctx.restore(); }
      ctx.restore(); }
    ctx.restore(); }
  if (key === 'route') { ctx.save(); ctx.globalAlpha = 1 - outK;
    // one-tap '동선최적화' button: appears with line 2, tapped on the following 8th, then the stops land on beats
    const bk = backOut(p(t, t0 + 2 * B, t0 + 2 * B + 0.25), 2.2), tTap = t0 + 2.5 * B;
    if (bk > 0) { const press = (t >= tTap && t < tTap + 0.14) ? 0.92 : 1; ctx.save(); ctx.translate(X + 120, 730); ctx.scale(bk * press, bk * press);
      ctx.fillStyle = t >= tTap ? '#F06A6A' : '#FFE3E3'; rr(-118, -36, 236, 72, 18); ctx.fill(); ctx.strokeStyle = '#F06A6A'; ctx.lineWidth = 3; ctx.stroke();
      const tc = t >= tTap ? '#fff' : '#D63A3A'; ctx.strokeStyle = tc; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-74, 0, 13, 0, 7); ctx.stroke(); ctx.fillStyle = tc; ctx.fillRect(-75.5, -2, 3, 9); ctx.fillRect(-75.5, -8, 3, 3);
      T('동선최적화', 16, 10, 28, tc, { a: 'center', w: 900, ls: 0 }); ctx.restore();
      const d = t - tTap; if (d >= 0 && d < 0.45) { const e = d / 0.45; ctx.strokeStyle = `rgba(240,106,106,${1 - e})`; ctx.lineWidth = 4 * (1 - e); ctx.beginPath(); ctx.arc(X + 150, 742, 14 + 70 * eo3(e), 0, 7); ctx.stroke(); }
      if (t >= tTap - 0.25 && t < tTap + 0.35) { const ck = p(t, tTap - 0.25, tTap); ctx.save(); ctx.translate(lerp(X + 230, X + 150, eo3(ck)), lerp(810, 742, eo3(ck))); ctx.globalAlpha = 1 - p(t, tTap + 0.15, tTap + 0.35);
        ctx.fillStyle = 'rgba(20,33,61,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.strokeStyle = NAVY2; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); } }
    ctx.restore(); }
}
// 03 full-bleed map (illustrative, MYTURN colours): example visits 구로 -> 부천 -> 안양 -> 군포, one pin per beat
const RPIN = [[803, 275], [556, 484], [309, 731], [632, 921]];   // = the phone map's pins x1.9 around (480,560)
const RSEG = [[[803, 275], [700, 320], [556, 484]], [[556, 484], [430, 560], [309, 731]], [[309, 731], [470, 790], [632, 921]]];
const RCARD = [[500, 170, '09:30', '구로 디지털로 300'], [600, 440, '10:40', '부천 부일로 77'], [40, 760, '13:10', '안양 평촌대로 123'], [680, 900, '14:20', '군포 산본로 45']];
function polyPart(pts, k) {   // first k (0..1) of a polyline, by length
  const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
  let rem = tot * k; const out = [pts[0]]; for (let i = 1; i < pts.length && rem > 0; i++) { const f = Math.min(1, rem / L[i - 1]); out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); rem -= L[i - 1]; }
  return out; }
function drawRouteMap(t, t0, a, ms) {
  if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#E9EFF6'; ctx.fillRect(0, 0, W, H);
  ctx.translate(480, 560); ctx.scale(ms, ms); ctx.translate(-480, -560);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#CFE3F5'; ctx.lineWidth = 86; ctx.beginPath(); ctx.moveTo(-300, 170); ctx.bezierCurveTo(400, 60, 950, 270, 2300, 110); ctx.stroke();
  ctx.fillStyle = '#D8ECD5'; for (const [x, y, rx, ry] of [[830, 480, 150, 90], [150, 720, 190, 120], [930, 930, 210, 110], [380, 240, 120, 70], [1500, 720, 280, 170], [1350, 380, 160, 90]]) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0.2, 0, 7); ctx.fill(); }
  ctx.save(); ctx.translate(600, 560); ctx.rotate(0.14); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 5;
  for (let i = -16; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(i * 95, -1400); ctx.lineTo(i * 95, 1400); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-1800, i * 95); ctx.lineTo(1800, i * 95); ctx.stroke(); } ctx.restore();
  const roads = [[[-200, 420], [700, 320], [2200, 200]], [[900, -200], [556, 484], [200, 1300]], [[-200, 640], [430, 560], [1200, 480]], [[-200, 700], [470, 790], [2200, 1000]], [[180, -200], [309, 731], [380, 1300]], [[632, 1300], [632, 921], [900, 200]]];
  for (const [w, c] of [[30, '#D3DCE8'], [21, '#FFFFFF']]) { ctx.strokeStyle = c; ctx.lineWidth = w; for (const r of roads) { ctx.beginPath(); r.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); } }
  for (const [s_, x, y] of [['구로', 780, 150], ['부천', 380, 420], ['안양', 150, 690], ['군포', 520, 1020]]) T(s_, x, y, 30, 'rgba(74,85,104,0.55)', { w: 800, ls: 2 });
  // route segments: segment j runs between pin j and pin j+1, each inside one beat
  const tS = t0 + 3 * B;
  RSEG.forEach((seg, j) => { const k = eo3(cl((t - (tS + j * B)) / (0.85 * B))); if (k <= 0) return; const pts = polyPart(seg, k);
    for (const [w, c] of [[20, '#FFFFFF'], [11, '#316EE8']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    if (k < 1) { const [hx, hy] = pts[pts.length - 1]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#316EE8'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill(); } });
  RPIN.forEach(([x, y], j) => { const tj = tS + j * B; if (t < tj) return; const sc = backOut(p(t, tj, tj + 0.22), 2.6), c = j === 0 ? OR : '#316EE8';
    const d = t - tj; if (d < 0.5) { const e = d / 0.5; ctx.strokeStyle = `rgba(49,110,232,${0.6 * (1 - e)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, 20 + 60 * eo3(e), (20 + 60 * eo3(e)) * 0.45, 0, 0, 7); ctx.stroke(); }
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.fillStyle = 'rgba(20,33,61,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, 0); { const ta = Math.acos(26 / 44); ctx.arc(0, -44, 26, Math.PI / 2 + ta, Math.PI / 2 - ta); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); T(String(j + 1), 0, -34, 28, '#fff', { a: 'center', w: 900, ls: 0 }); ctx.restore();
    const [cx, cy, tm, ad] = RCARD[j], kc = backOut(p(t, tj + 0.05, tj + 0.3), 2); if (kc > 0) { ctx.save(); ctx.translate(cx + 125, cy + 39); ctx.scale(kc, kc);
      ctx.save(); ctx.shadowColor = 'rgba(20,33,61,0.16)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fff'; rr(-125, -39, 250, 78, 14); ctx.fill(); ctx.restore();
      T(tm, -105, -6, 24, c, { w: 900, ls: 0 }); T(ad, -105, 24, 21, SLATE, { w: 700, ls: 0 }); ctx.restore(); } });
  const tz = tS + 3 * B + 0.1, kz = backOut(p(t, tz, tz + 0.3), 2); if (kz > 0) { ctx.save(); ctx.translate(380, 92); ctx.scale(kz, kz); ctx.fillStyle = NAVY2; rr(-290, -36, 580, 72, 36); ctx.fill();
    T('총 이동 38.4km · 예상 4시간 50분', 0, 10, 28, '#fff', { a: 'center', w: 800, ls: 0 }); ctx.restore(); }
  ctx.restore();
}
// illustrative price/demand chart (MYTURN colours), drawn on a card
function chartCard(t, t0) {
  const w = 600, h = 740, x = -w / 2, y = -h / 2;
  ctx.save(); ctx.shadowColor = 'rgba(20,33,61,0.2)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; ctx.fillStyle = '#fff'; rr(x, y, w, h, 40); ctx.fill(); ctx.restore();
  M('실거래가 흐름', x + 50, y + 80, 26, NAVY2, { ls: 0 });
  const k = eo3(p(t, t0, t0 + 4 * B)); const pts = 14; ctx.strokeStyle = '#2A3F8F'; ctx.lineWidth = 6; ctx.beginPath();
  for (let i = 0; i <= pts * k; i++) { const xx = x + 60 + i * (w - 120) / pts, yy = y + 300 - (60 + 120 * (i / pts) + 40 * Math.sin(i * 0.9)); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();

  M('매매 수요', x + 50, y + 420, 26, NAVY2, { ls: 0 });
  for (let i = 0; i < 10; i++) { const tb_ = t0 + 2 * B + i * B / 4; const hh = (60 + 150 * Math.abs(Math.sin(i * 0.7 + 0.5))) * backOut(p(t, tb_, tb_ + 0.2), 1.8); ctx.fillStyle = i === 6 ? OR : BL; rr(x + 60 + i * 50, y + 680 - hh, 34, hh, 8); ctx.fill(); }
  // '내 입찰가' hero moment: after the demand bars finish, the point lifts off the line with a '띵' (beat 24 ≈ 12.08 s),
  // the chart dims around it, then two soft pulses on the next 8ths
  { const tL = t0 + 5 * B; if (t >= tL) {
    const k = p(t, tL, tL + 0.3), pop = backOut(k, 2.8), lift = -34 * eo3(p(t, tL, tL + 0.4));
    const xx = x + 60 + 10 * (w - 120) / pts, yy0 = y + 300 - (60 + 120 * (10 / pts) + 40 * Math.sin(9)), yy = yy0 + lift;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * eo3(k)})`; rr(x, y, w, h, 40); ctx.fill();            // spotlight: dim the rest
    ctx.strokeStyle = 'rgba(240,121,0,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(xx, yy0); ctx.lineTo(xx, yy + 18); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,121,0,0.35)'; ctx.beginPath(); ctx.arc(xx, yy0, 7, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, 90 * pop); g.addColorStop(0, 'rgba(240,121,0,0.35)'); g.addColorStop(1, 'rgba(240,121,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xx, yy, 90 * pop, 0, 7); ctx.fill();
    let bump = 0; [tL, tL + B / 2, tL + B].forEach((tp, n) => { const d = t - tp; if (d >= 0 && d < 0.36) { const e = d / 0.36;
      bump = Math.max(bump, (n ? 0.3 : 0.5) * (1 - e)); ctx.strokeStyle = OR; ctx.lineWidth = 5 * (1 - e); ctx.globalAlpha = 1 - e; ctx.beginPath(); ctx.arc(xx, yy, 22 + (n ? 40 : 70) * eo3(e), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } });
    ctx.save(); ctx.shadowColor = 'rgba(240,121,0,0.6)'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(xx, yy, 24 * pop * (1 + bump), 0, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = OR; ctx.beginPath(); ctx.arc(xx, yy, 17 * pop * (1 + bump), 0, 7); ctx.fill();
    const lk = backOut(p(t, tL + 0.08, tL + 0.36), 2.2); if (lk > 0) { ctx.save(); ctx.translate(xx, yy - 58); ctx.scale(lk, lk); ctx.fillStyle = OR; rr(-78, -24, 156, 48, 24); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, 22); ctx.lineTo(9, 22); ctx.lineTo(0, 34); ctx.closePath(); ctx.fill(); T('내 입찰가', 0, 9, 25, '#fff', { a: 'center', w: 900, ls: 0 }); ctx.restore(); } } }
}

// tagline on the drop (deck p.8): '번거로운 일은 앱이, / 중요한 판단은 당신이.' — text only, one bar
function sTag(t) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1F3A72'); g.addColorStop(1, '#14213D'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bar = ctx.createLinearGradient(0, 0, W, 0); bar.addColorStop(0, OR); bar.addColorStop(0.55, PEACH); bar.addColorStop(1, '#2A3F8F');
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W * eo3(p(t, bt(TAG0), bt(TAG0) + 0.45)), 12);
  const z = lerp(1, 1.035, p(t, bt(TAG0), bt(FEAT0))); ctx.save(); ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
  const e = '그래서 결론은, 마이턴 옥션!', l1 = '번거로운 일은 앱이,', l2 = '중요한 판단은 당신이.';
  copyLine([[e, PEACH]], 960 - MW(e, 40, { w: 700 }) / 2, 370, 40, t, bt(TAG0), { w: 700 });
  copyLine([[l1, CREAM]], 960 - MW(l1, 112) / 2, 540, 112, t, bt(TAG0));
  const k = p(t, bt(TAG0 + 2), bt(TAG0 + 2) + 0.3); if (k > 0) { const sc = lerp(1.1, 1, eo5(k)); ctx.save(); ctx.globalAlpha = eo3(cl(k * 2)); ctx.translate(960, 680 - 40); ctx.scale(sc, sc);
    T(l2, -MW(l2, 112) / 2, 40, 112, OR); ctx.restore(); }
  ctx.restore();
}
function sSummary(t) {
  ctx.fillStyle = LIGHT; ctx.fillRect(0, 0, W, H);
  const k = eo5(p(t, bt(SUM0) - B / 2, bt(SUM0) + B)), iso = eio3(p(t, bt(SUM0 + 1), bt(SUM0 + 3)));
  ['list', 'route', 'bid'].forEach((key, i) => {
    ctx.save(); const cx = lerp(1130 + i * 270, 1060 + i * 270, iso), cy = lerp(620, 710 - i * 70, iso);
    ctx.translate(cx, cy + (1 - k) * 200); ctx.globalAlpha = k;
    ctx.transform(1, -0.28 * iso, 0.55 * iso, 1 - 0.25 * iso, 0, 0);    // isometric tilt
    ctx.scale(0.58, 0.58); phoneAt(880, IMG[key]); ctx.restore();
    M(['선정물건', '임장경로', '입찰가산정'][i], cx + 40 * iso, cy + 320 - 40 * iso, 24, OR, { a: 'center', al: k, ls: 0 });
  });
  copyLine([['조사하고,', NAVY2]], 140, 260, 92, t, bt(SUM0 + 1));
  copyLine([['임장하고,', NAVY2]], 140, 375, 92, t, bt(SUM0 + 2));
  copyLine([['낙찰받는다.', NAVY2]], 140, 490, 92, t, bt(SUM0 + 3));
  { const k = p(t, bt(SUM0 + 4), bt(SUM0 + 4) + 0.3); if (k > 0) { const sc = lerp(1.15, 1, eo5(k)); ctx.save(); ctx.globalAlpha = eo3(cl(k * 2)); ctx.translate(140, 650); ctx.scale(sc, sc);
    markAt(56, -40, 0.07); T('마이턴 옥션.', 128, 0, 104, OR); ctx.restore(); } }
  drawStepper(t, NFEAT);
}
function sFlow(t) {
  ctx.fillStyle = LIGHT; ctx.fillRect(0, 0, W, H);
  copyLine([['흩어진 자료가, ', NAVY2], ['한 곳으로.', OR]], 960 - MW('흩어진 자료가, 한 곳으로.', 70) / 2, 230, 70, t, bt(FLOW0));
  const SRC = ['경매지 PDF', '실거래가', '지도', '현장 사진'], DST = ['권리분석', '시세 · 수요', '임장 동선', '입찰가'];
  const cx = 960, cy = 610, k = eo3(p(t, bt(FLOW0 + 1), bt(FLOW0 + 3)));
  SRC.forEach((s, i) => { const y = 430 + i * 120; const a = eo3(p(t, bt(FLOW0 + 0.5 + i * 0.25), bt(FLOW0 + 1 + i * 0.25))); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; rr(260, y - 40, 300, 80, 40); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke(); T(s, 410, y + 12, 32, NAVY2, { a: 'center', w: 800 }); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(80,195,252,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(560, y); ctx.bezierCurveTo(700, y, 760, cy, lerp(560, 860, k), lerp(y, cy, k)); ctx.stroke();
    const u = (t * 1.6 + i * 0.25) % 1; if (k > 0.99) { const bx = (1 - u) ** 3 * 560 + 3 * (1 - u) ** 2 * u * 700 + 3 * (1 - u) * u * u * 760 + u ** 3 * 860, by = (1 - u) ** 3 * y + 3 * (1 - u) ** 2 * u * y + 3 * (1 - u) * u * u * cy + u ** 3 * cy; ctx.fillStyle = BL; ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill(); } });
  const mk = backOut(p(t, bt(FLOW0 + 3), bt(FLOW0 + 3.8)), 2); if (mk > 0) { ctx.save(); ctx.translate(960, cy); ctx.scale(mk, mk); markAt(0, 0, 0.11); ctx.restore(); }
  DST.forEach((s, i) => { const y = 430 + i * 120; const a = eo3(p(t, bt(FLOW0 + 4 + i * 0.5), bt(FLOW0 + 4.6 + i * 0.5))); if (a <= 0) return;
    ctx.strokeStyle = 'rgba(240,121,0,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1060, cy); ctx.bezierCurveTo(1160, cy, 1220, y, lerp(1060, 1360, a), y); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = i === 3 ? OR : '#fff'; rr(1360, y - 40, 300, 80, 40); ctx.fill(); ctx.strokeStyle = i === 3 ? OR : LINE; ctx.lineWidth = 2; ctx.stroke(); T(s, 1510, y + 12, 32, i === 3 ? '#fff' : NAVY2, { a: 'center', w: 800 }); ctx.globalAlpha = 1; });
}
// ending = the channel bumper's move: earth pops, the dice slams down onto it, the play button is pressed -> 'MY TURN!',
// then the mark slides into the lockup while MYTURN whips in and AUCTION rises
function sEnd(t) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  const E = bt(END0), TS = bt(END0 + 0.5), TM = bt(END0 + 1), TW = bt(END0 + 2), DX = 1073, DY = 931, DH = 591;
  let amp = 0; for (const [ts_, a] of [[TS, 22], [TM, 26]]) { const d = t - ts_; if (d >= 0) amp += a * Math.exp(-d * 14); }
  ctx.save(); ctx.translate(amp * Math.sin(t * 93.1), amp * Math.cos(t * 71.7));
  const Sa = 0.3, X0a = 960 - LCX * Sa * SQ, Y0a = 430 - LCY * Sa, Sf = 0.2, LWf = (5930 - (LCX - LR)) * Sf * SQ, X0f = 960 - LWf / 2 - (LCX - LR) * Sf * SQ, Y0f = 400 - 922 * Sf;
  const mv = eio3(p(t, TW - 0.05, TW + 0.35)), S = lerp(Sa, Sf, mv);
  ctx.save(); ctx.translate(lerp(X0a, X0f, mv), lerp(Y0a, Y0f, mv)); ctx.scale(S * SQ, S);
  const sl = t - TS, ek = backOut(p(t, E, E + 0.35), 1.8) * (sl >= 0 && sl < 0.5 ? 1 - 0.06 * Math.exp(-sl * 8) * Math.sin(sl * 30) : 1);
  ctx.fillStyle = BL; ctx.beginPath(); ctx.arc(LCX, LCY, Math.max(0, LR * ek), 0, 7); ctx.fill();
  if (sl >= 0 && sl < 0.6) { const ee = eo3(sl / 0.6); ctx.strokeStyle = `rgba(80,195,252,${0.6 * (1 - ee)})`; ctx.lineWidth = 50 * (1 - ee) + 2; ctx.beginPath(); ctx.arc(LCX, LCY, LR * (1 + 0.7 * ee), 0, 7); ctx.stroke();
    for (let i = 0; i < 14; i++) { const a = (i * 360 / 14 + 10) * Math.PI / 180, rad = LR * (0.95 + 0.9 * ee) * (i % 2 ? 1 : 0.85); ctx.fillStyle = i % 2 ? OR : BL; ctx.beginPath(); ctx.arc(LCX + Math.cos(a) * rad, LCY + Math.sin(a) * rad, (i % 2 ? 56 : 40) * (1 - ee), 0, 7); ctx.fill(); } }
  if (t >= E) { let oy = 0, th = 0, sx = 1, sy = 1;
    if (t < TS) { const k = p(t, E, TS); oy = -3600 * (1 - k * k); th = lerp(-540, 0, eo3(k)); }
    else { th = 6 * Math.exp(-sl * 7) * Math.sin(sl * 22); if (sl < 0.5) { const e = Math.exp(-sl * 10) * Math.cos(sl * 28); sy = 1 - 0.18 * e; sx = 1 + 0.12 * e; } }
    const q = t - TM, tsc = q < 0 ? 1 : (q < 0.07 ? 1 - 0.22 * eo3(q / 0.07) : 1 - 0.22 * Math.exp(-(q - 0.07) * 6) * Math.cos((q - 0.07) * 20));
    ctx.save(); ctx.translate(DX, DY + oy + (1 - sy) * DH); ctx.rotate(th * Math.PI / 180); ctx.scale(sx, sy); ctx.translate(-DX, -DY); drawDice(tsc); ctx.restore();
    const pe = p(t, TM + 0.07, TM + 0.5); if (pe > 0 && pe < 1) { const pp = eo3(pe); ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - pp)})`; ctx.lineWidth = 30 * (1 - pp) + 3; ctx.beginPath(); ctx.arc(1332, 1102, 60 + 520 * pp, 0, 7); ctx.stroke(); } }
  LET.forEach((l, i) => { let k, tx = 0, ty = 0, sxl = 1;
    if (i < 6) { const st = TW + 0.045 * i; k = p(t, st, st + 0.26); tx = lerp(2600, 0, backOut(k, 1.4)); sxl = 1 + 0.5 * (1 - eo3(k)); }
    else { const st = TW + 0.25 + 0.03 * (i - 6); k = p(t, st, st + 0.3); ty = 440 * (1 - backOut(k, 1.6)); }
    if (k <= 0) return; ctx.save(); ctx.globalAlpha *= cl(k * 5); ctx.translate(tx, ty); ctx.scale(sxl, 1); ctx.fillStyle = l.g === 'my' ? '#50C3FD' : (l.g === 'turn' ? '#F07900' : '#A5A5A5'); ctx.fill(l.p, 'evenodd'); ctx.restore(); });
  ctx.restore();
  // 'MY TURN!' — per-character drop with impact lines, out as the wordmark arrives
  const ho = p(t, TW - 0.05, TW + 0.2); if (t >= TM && ho < 1) {
    const kl = p(t, TM, TM + 0.3); if (kl < 1) { ctx.save(); for (let i = 0; i < 22; i++) { const a = (i * 360 / 22 + ((i * 37) % 11) - 5) * Math.PI / 180, r0 = lerp(300, 480, eo3(kl)), r1 = r0 + lerp(60, 340, eo5(kl)) * (0.6 + ((i * 53) % 5) * 0.12), w = (10 + ((i * 29) % 4) * 7) * (1 - kl);
      const ca = Math.cos(a), sa = Math.sin(a); ctx.fillStyle = i % 3 === 0 ? OR : BL; ctx.beginPath(); ctx.moveTo(960 + ca * r0 * 1.45 - sa * w / 2, 600 + sa * r0 * 0.8 + ca * w / 2); ctx.lineTo(960 + ca * r1 * 1.45, 600 + sa * r1 * 0.8); ctx.lineTo(960 + ca * r0 * 1.45 + sa * w / 2, 600 + sa * r0 * 0.8 - ca * w / 2); ctx.fill(); } ctx.restore(); }
    const sc = 0.2067, WT_ = 4420; ctx.save(); ctx.globalAlpha = 1 - ho; ctx.translate(960, 905 + 60 * ho); ctx.scale((1 - 0.3 * ho) * sc * SQ, (1 - 0.3 * ho) * sc); ctx.translate(-WT_ / 2, -1299);
    for (let i = 0; i < 7; i++) { const st = TM + 0.03 * i, k = p(t, st, st + 0.2); if (k <= 0) continue; ctx.save(); ctx.globalAlpha *= cl(k * 4); ctx.translate(0, -260 / sc * (1 - backOut(k, 2)));
      ctx.fillStyle = i < 2 ? '#50C3FD' : '#F07900';
      if (i < 6) { ctx.translate(-2115 + (i >= 2 ? 300 : 0), 0); ctx.fill(LET[i].p, 'evenodd'); } else { rr(4270, 610, 150, 480, 60); ctx.fill(); ctx.beginPath(); ctx.arc(4345, 1212, 88, 0, 7); ctx.fill(); }
      ctx.restore(); }
    ctx.restore(); }
  ctx.restore();
  { const d = t - TM; if (d >= 0 && d < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - d / 0.12)})`; ctx.fillRect(0, 0, W, H); } }
  { // one line: small '처음부터 끝까지' + large '실전 경매 노트', sharing a baseline
    const s1 = '처음부터 끝까지', s2 = '실전 경매 노트', f1 = 46, f2 = 116, gap = 28, base = 768;
    const w1 = MW(s1, f1, { w: 700 }), w2 = MW(s2, f2), x1 = 960 - (w1 + gap + w2) / 2, x2 = x1 + w1 + gap;
    copyLine([[s1, SLATE]], x1, base, f1, t, bt(END0 + 2.5), { w: 700 });
    const k = p(t, bt(END0 + 3), bt(END0 + 3) + 0.35); if (k > 0) { const sc = lerp(1.12, 1, eo5(k)); ctx.save(); ctx.globalAlpha = eo3(cl(k * 2));
      ctx.translate(x2 + w2 / 2, base - f2 * 0.35); ctx.scale(sc, sc); T(s2, -w2 / 2, f2 * 0.35, f2, NAVY2); ctx.restore(); } }
  // CTA from ~37.3 s, holds ~2.7 s
  const ck = backOut(p(t, bt(END0 + 3.5), bt(END0 + 4.2)), 2); if (ck > 0) { ctx.save(); ctx.translate(960, 890); ctx.scale(ck, ck); ctx.fillStyle = OR; rr(-230, -40, 460, 80, 40); ctx.fill(); T('3일 무료체험 · 앱 / 모바일 웹', 0, 12, 32, '#fff', { a: 'center' }); ctx.restore(); }
}
// ---------- master
function render(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  if (t < bt(DROP)) sIntro(t);
  else if (t < bt(FEAT0) - B / 2) sTag(t);
  else if (t < bt(SUM0) - B / 2) { const i = SECTIONS.findIndex(s => t >= s[0] - B / 2 && t < s[1] - B / 2); sFeature(t, SECTIONS[Math.max(0, i)], i); }
  else if (t < bt(FLOW0)) sSummary(t);
  else if (t < bt(END0)) sFlow(t);
  else sEnd(t);
  // hard-cut flash into the light section and a soft white dip before the logo
  const f = 1 - p(t, bt(DROP), bt(DROP) + 0.2); if (t >= bt(DROP) && f > 0) { ctx.fillStyle = `rgba(255,255,255,${0.8 * f})`; ctx.fillRect(0, 0, W, H); }
  const f2 = 1 - p(t, bt(FEAT0) - B / 2, bt(FEAT0) - B / 2 + 0.18); if (t >= bt(FEAT0) - B / 2 && f2 > 0) { ctx.fillStyle = `rgba(255,255,255,${0.6 * f2})`; ctx.fillRect(0, 0, W, H); }   // cut to the light sections
  const d = Math.max(p(t, bt(END0) - 0.2, bt(END0)) * (1 - p(t, bt(END0), bt(END0) + 0.2)), 0); if (d > 0) { ctx.fillStyle = `rgba(255,255,255,${d})`; ctx.fillRect(0, 0, W, H); }
  { const b0 = 1 - eo3(p(t, 0, 0.5)); if (b0 > 0) { ctx.fillStyle = `rgba(0,0,0,${b0})`; ctx.fillRect(0, 0, W, H); } }   // cold open from black
  const e = p(t, window.DURATION - 0.4, window.DURATION); if (e > 0) { ctx.fillStyle = `rgba(255,255,255,${e})`; ctx.fillRect(0, 0, W, H); }
}
window.render = render; window.DURATION = 42;
const keys = Object.keys(SHOT); let loaded = 0;
keys.forEach(k => { const im = new Image(); im.onload = () => { IMG[k] = im; if (++loaded === keys.length) document.fonts.ready.then(() => { window.READY = true; render(0); }); }; im.src = 'shots/' + SHOT[k] + '.png'; });
