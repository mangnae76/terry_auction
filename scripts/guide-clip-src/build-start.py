# 이용가이드 1장 「시작하며」 영상 — privacy.html(14장) 틀에 장면만 갈아 끼운다. 음성은 컨펌 뒤에(지금은 무음 자리).
import re, base64, sys, math
SRC = '/Users/kang/gitsource/terry_auction/public/guide/clip/privacy.html'
D = sys.argv[1]; OUT = sys.argv[2]
TOTAL = 78.0
s = open(SRC, encoding='utf-8').read()

def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:60], s.count(a)); s = s.replace(a, b)

def cut(a, b, new):
    global s
    i = s.index(a); j = s.index(b, i); s = s[:i] + new + s[j:]

rep('<title>개인정보 설정</title>', '<title>시작하며</title>')
rep('aria-label="개인정보 설정 가이드 모션 그래픽"', 'aria-label="시작하며 가이드 모션 그래픽"')

CSS = r"""
/* ===== 1장 시작하며 — 장면 ===== */
#scn{position:absolute;inset:0;background:#f2f3f7;color:#1b2133}
#cur{display:none!important}
.sc{position:absolute;inset:0;display:none;will-change:opacity}
#sA{background:radial-gradient(ellipse at 50% 40%,#24386f 0%,#213366 40%,#172650 100%);color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center}
#sA .eb{border:2px solid #f3700a;color:#ffb070;border-radius:999px;padding:12px 30px;font-size:30px;font-weight:700;letter-spacing:1px}
#sA .l1,#sA .l2{font-size:96px;font-weight:800;letter-spacing:-2px;line-height:1.25}
#sA .l1{margin-top:48px}
#sA em{font-style:normal;color:#f3700a}
.hdl{position:absolute;left:0;right:0;top:92px;text-align:center;font-size:58px;font-weight:800;color:#1f2a4d;letter-spacing:-1px}
.hdl b{color:#f3700a}
.hdl em{font-style:normal;color:#2b6df3}
.sub{position:absolute;left:0;right:0;top:178px;text-align:center;font-size:28px;color:#6b7280;font-weight:500}
/* 방향성 */
#sG{background:radial-gradient(ellipse at 50% 40%,#24386f 0%,#213366 40%,#172650 100%);color:#fff;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#sG .eb{border:2px solid #f3700a;color:#ffb070;border-radius:999px;padding:12px 30px;font-size:30px;font-weight:700;letter-spacing:1px}
#sG .q1,#sG .q2{font-size:84px;font-weight:800;letter-spacing:-2px;line-height:1.28}
#sG .q1{margin-top:44px}
#sG em{font-style:normal;color:#f3700a}
#sG .sm{font-size:32px;color:#c6cee3;font-weight:500;margin-top:44px;line-height:1.6}
#fP{position:absolute;left:0;right:0;top:640px;text-align:center;font-size:36px;font-weight:700;color:#1f2a4d}
#fP b{color:#f3700a}
/* 창 */
.win{position:absolute;left:0;top:0;width:330px;height:220px;background:#fff;border:1px solid #d5d9e1;border-radius:12px;box-shadow:0 14px 34px rgba(20,30,60,.16);overflow:hidden;will-change:transform,opacity}
.win .bar{height:38px;background:#eef1f6;border-bottom:1px solid #e3e6ec;display:flex;align-items:center;gap:8px;padding:0 14px}
.win .bar i{width:11px;height:11px;border-radius:50%;background:#d0d5de}
.win .bar span{margin-left:10px;font-size:20px;font-weight:700;color:#374151}
.win .ic{position:absolute;left:24px;top:62px;width:64px;height:64px;border-radius:12px;color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center}
.win .sk{position:absolute;left:108px;height:14px;border-radius:7px;background:#eceef3}
/* 사건카드 */
#card{position:absolute;left:50%;top:250px;width:1040px;margin-left:-520px;background:#fff;border:1px solid #dde1e8;border-radius:18px;box-shadow:0 24px 60px rgba(20,30,60,.18);padding:30px 40px 34px;will-change:transform,opacity}
#card .top{display:flex;align-items:center;gap:18px}
#card .tag{background:#213366;color:#fff;font-size:24px;font-weight:800;border-radius:8px;padding:8px 18px}
#card .no{width:300px;height:22px;border-radius:11px;background:#e3e6ec}
#card .ad{width:420px;height:16px;border-radius:8px;background:#eceef3;margin-top:18px}
#card .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:26px}
.it{height:84px;border:1px solid #e3e6ec;border-radius:12px;display:flex;align-items:center;gap:16px;padding:0 20px;background:#fbfcfe;will-change:transform,opacity}
.it i{flex:none;width:46px;height:46px;border-radius:10px;background:#fff1e6;color:#f3700a;font-style:normal;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center}
.it b{font-size:27px;font-weight:800;color:#1f2a4d}
/* 비교표 */
#tbl{position:absolute;left:50%;top:190px;width:1500px;margin-left:-750px;border:1px solid #dde1e8;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 14px 36px rgba(20,30,60,.10)}
#tbl .tr{display:grid;grid-template-columns:1fr 1.15fr 1fr;height:72px;border-top:1px solid #e9ecf1;font-size:27px;align-items:center;will-change:opacity}
#tbl .tr>div{padding:0 30px}
#tbl .th{height:66px;border-top:0;background:#213366;color:#fff;font-weight:800;font-size:26px}
#tbl .th>div:last-child{color:#ffb070}
#tbl .tr>div:nth-child(1){font-weight:700;color:#1f2a4d}
#tbl .tr>div:nth-child(2){color:#8a909c}
#tbl .tr>div:nth-child(3){color:#f3700a;font-weight:800}
#tbl .th>div:nth-child(1),#tbl .th>div:nth-child(2){color:#fff}
/* 핵심 가치 */
#vals{position:absolute;left:50%;top:250px;width:1640px;margin-left:-820px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.vc{background:#fff;border:1px solid #dde1e8;border-radius:16px;padding:30px 30px 34px;height:330px;box-shadow:0 14px 34px rgba(20,30,60,.10);will-change:transform,opacity}
.vc small{display:block;font-size:22px;font-weight:700;color:#8a909c}
.vc b{display:block;font-size:40px;font-weight:800;color:#1f2a4d;margin-top:16px}
.vc p{font-size:25px;line-height:1.55;color:#4a5060;margin-top:20px}
.vc.hot{border:2px solid #f3700a}
.vc.hot b{color:#f3700a}
/* 범위 */
#scope{position:absolute;left:50%;top:330px;width:1700px;margin-left:-850px}
#scope .row{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
.cl{height:110px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;background:#e3e6ec;color:#6b7280;will-change:background-color}
.cl.in{background:#2b6df3;color:#fff}
#scope .cap2{display:grid;grid-template-columns:1fr 7fr;gap:10px;margin-top:18px;font-size:24px;font-weight:700;text-align:center}
#scope .cap2 div{border-top:3px solid #c9ced9;padding-top:12px;color:#8a909c}
#scope .cap2 div.in{border-color:#2b6df3;color:#2b6df3}
"""
rep('#cap .num.sm{font-size:22px}\n', '#cap .num.sm{font-size:22px}\n' + CSS)

WINS = [('경매지 PDF', 'PDF', '#e5484d'), ('엑셀', 'XLS', '#1f9d55'), ('시세 사이트', '₩', '#2b6df3'), ('지도', '◎', '#0f9aa8'),
        ('계산기', '±', '#6b7280'), ('메모장', '✎', '#e0a100'), ('사진첩', '▣', '#8b5cf6')]
POS = [(170, 300, -5), (560, 260, 3), (950, 310, -2), (1360, 270, 4), (300, 540, 3), (760, 560, -4), (1200, 545, 2)]
wh = ''.join(f'<div class="win" id="w{k}"><div class="bar"><i></i><i></i><i></i><span>{n}</span></div><div class="ic" style="background:{c}">{g}</div>'
             f'<div class="sk" style="top:70px;width:180px"></div><div class="sk" style="top:98px;width:140px"></div><div class="sk" style="top:150px;left:24px;width:280px"></div><div class="sk" style="top:176px;left:24px;width:220px"></div></div>'
             for k, (n, g, c) in enumerate(WINS))
ITEMS = [('권', '권리분석'), ('₩', '시세 · 수요'), ('▣', '현장 사진'), ('↗', '입찰가'), ('≡', '잔금'), ('%', '세금')]
ih = ''.join(f'<div class="it" id="i{k}"><i>{g}</i><b>{n}</b></div>' for k, (g, n) in enumerate(ITEMS))
ROWS = [('사건 자료 정리', 'PDF를 내려받아 옮겨 적기', '올리면 채워짐'), ('시세 · 수요 조사', '여러 사이트를 돌며 찾기', '마이턴이 모아 계산'),
        ('입찰가 산정', '엑셀 표 한 장', 'A~D안을 나란히 비교'), ('보고서 만들기', '단계별 PPT 보고서', '만들 필요 없음'),
        ('현장에서 보기 · 고치기', '파일을 열어 찾고, 돌아와서 다시', '탭 하나로 펴고 그 자리에서'), ('낙찰 · 매도 뒤 기록', '흩어져 사라짐', '물건에 쌓임')]
th = '<div class="tr th"><div>한 건을 하며 하는 일</div><div>지금까지</div><div>마이턴</div></div>' + ''.join(
    f'<div class="tr" id="r{k}"><div>{a}</div><div>{b}</div><div>{c}</div></div>' for k, (a, b, c) in enumerate(ROWS))
VALS = [('핵심 가치 1', 'AI가 먼저 읽고', '경매 서류를 AI가 읽어 사건카드와 권리분석을 채웁니다.', ''),
        ('핵심 가치 2', '데이터로 검증', '실거래가 · 수요지표 · 입지등수로 숫자에 근거를 붙입니다.', ''),
        ('핵심 가치 3', '현장과 이어지고', '책상에서는 웹으로 조사하고, 현장에서는 앱으로 확인합니다.', ''),
        ('핵심 가치 4', '끝까지 관리', '낙찰 뒤 잔금 · 명도 · 매도 · 세금까지 꾸준히 챙깁니다.', ' hot')]
vh = ''.join(f'<div class="vc{h}" id="v{k}"><small>{a}</small><b>{b}</b><p>{c}</p></div>' for k, (a, b, c, h) in enumerate(VALS))
CELLS = ['물건 검색', '물건 선정', '손품조사', '임장', '입찰', '낙찰', '명도 · 관리', '매도 · 세금']
ch = ''.join(f'<div class="cl" id="c{k}">{n}</div>' for k, n in enumerate(CELLS))

APP = f'''<div id="scn">
  <div class="sc" id="sA"><div class="eb" id="aE">AI 경매 분석 플랫폼</div><div class="l1" id="a1">경매, 물건만 고르세요.</div><div class="l2" id="a2"><em>마이턴</em>이 다 해줍니다.</div></div>
  <div class="sc" id="sB"><div class="hdl" id="bH">경매는 아직 <b>아날로그</b>입니다</div><div class="sub" id="bS">경매지 PDF, 엑셀, 시세 사이트, 지도, 계산기, 메모장, 사진첩까지</div></div>
  <div class="sc" id="sW">{wh}</div>
  <div class="sc" id="sC"><div class="hdl" id="cH"><b>사건카드</b> 한 장으로 모읍니다</div><div id="card"><div class="top"><span class="tag">사건카드</span><span class="no"></span></div><div class="ad"></div><div class="grid">{ih}</div></div></div>
  <div class="sc" id="sD"><div class="hdl" id="dH" style="top:70px">지금까지와 <b>마이턴</b></div><div id="tbl">{th}</div></div>
  <div class="sc" id="sG"><div class="eb" id="gE">서비스 방향성</div><div class="q1" id="g1">감이 아닌 정확한 데이터로,</div><div class="q2" id="g2"><em>경매의 처음부터 끝까지.</em></div><div class="sm" id="gS">물건 고르는 날부터 세금 신고까지,<br>모든 판단에 근거를 남깁니다.</div></div>
  <div class="sc" id="sE"><div class="hdl" id="eH" style="top:100px">네 가지 <b>핵심 가치</b></div><div id="vals">{vh}</div></div>
  <div class="sc" id="sF"><div class="hdl" id="fH" style="top:150px">물건을 고른 뒤부터가 <b>마이턴의 자리</b>입니다</div><div id="scope"><div class="row">{ch}</div><div class="cap2"><div>경매 정보 사이트</div><div class="in" id="fC">마이턴이 함께하는 구간</div></div></div><div id="fP">자료를 모으고 계산하는 번거로운 일은 <b>마이턴</b>이, 입찰가를 정하는 판단은 <b>사람</b>이 합니다.</div></div>
</div>

'''
cut('<div id="app">', '<div id="hl">', APP)

JS = r"""
// ===== 1장 시작하며 — 시간표 (음성 자리: 줄 시작 0.3 · 3.6 · 7.9 · 15.2 · 27.3 · 39.6 · 49.7 · 60.0 · 74.25 (실제 음성)) =====
const EV=[];
const INTRO=[0,3.4], OUTRO=[74.0,78.0];
const SC_=[['sA',3.4,7.8],['sB',7.8,15.2],['sW',7.8,16.3],['sC',15.2,27.1],['sD',27.1,39.4],['sG',39.4,49.5],['sE',49.5,59.8],['sF',59.8,74.1]];
const WIN_IN=8.4, WIN_GAP=0.6, MERGE=[15.2,16.2];
const POS=__POS__;
const ITEM_T=[17.4,18.7,20.0,21.3,22.6,23.9];
const ROW_T=[27.9,29.75,31.6,33.45,35.3,37.15];
const VAL_T=[50.0,52.4,54.8,57.0];
const CELL_T=[60.6,61.0,61.4,61.8,62.2,62.6,63.0,63.4];
const L5='시작하며 ';
const CAP=[[8.0,15.0,1,'경매는 아직 아날로그',['한 건에 열 개가 넘는 창을 오가며 손으로 모으고 계산합니다.'],[],L5+'1 / 5'],
 [15.5,26.9,2,'사건카드 한 장',['권리분석 · 시세와 수요 · 현장 사진 · 입찰가 · 잔금 · 세금까지','<b>사건번호 하나</b>에 쌓입니다.'],[],L5+'2 / 5'],
 [27.4,39.2,3,'지금까지와 마이턴',['PDF를 올리면 자료가 채워지고, 시세와 수요는 마이턴이 모아 계산합니다.','입찰가는 <b>A~D안</b>을 나란히 비교하고, 보고서는 만들 필요가 없습니다.'],[[27.4,0],[33.6,1]],L5+'3 / 5'],
 [49.8,59.6,4,'핵심 가치 넷',['AI가 먼저 읽고 · 데이터로 검증 · 현장과 이어지고 · <b>끝까지 관리</b>'],[],L5+'4 / 5'],
 [60.1,73.8,5,'물건을 고른 뒤부터',['물건 검색은 경매 정보 사이트에, 고른 물건을 <b>끝까지 진행</b>하는 일은 마이턴이 함께합니다.'],[],L5+'5 / 5']];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const eOut=p=>1-Math.pow(1-p,3);
const _c=new Map();
function css(el,k,v){const key=el.id+'|'+k;if(_c.get(key)!==v){el.style[k]=v;_c.set(key,v)}}
function txt(el,v){const key=el.id+'|t';if(_c.get(key)!==v){el.textContent=v;_c.set(key,v)}}
function htm(el,v){const key=el.id+'|h';if(_c.get(key)!==v){el.innerHTML=v;_c.set(key,v)}}
function cls(el,c,on){const key=el.id+'|c|'+c;if(_c.get(key)!==on){el.classList.toggle(c,on);_c.set(key,on)}}
function clearRC(){}
function invalidateAll(){_c.clear()}
let _sk='';
// 나타나기: t0 부터 0.45초 동안 아래에서 떠오름
function pop(id,t,t0,dy){const el=$(id),p=eOut(clamp((t-t0)/.45,0,1));css(el,'opacity',p.toFixed(3));css(el,'transform',`translate3d(0,${((1-p)*(dy||28)).toFixed(1)}px,0)`)}
function render(t){
  for(const [id,a,b] of SC_){const el=$(id),on=t>=a-0.001&&t<b+0.35;css(el,'display',on?(id==='sA'||id==='sG'?'flex':'block'):'none');
    if(on){const pin=id==='sW'?1:eOut(clamp((t-a)/.45,0,1)),pout=clamp((b+0.35-t)/.35,0,1);css(el,'opacity',Math.min(pin,pout).toFixed(3))}}
  // A 큰 글
  pop('aE',t,3.5,20);pop('a1',t,3.8);pop('a2',t,5.4);
  // B 머리 · 창
  pop('bH',t,7.9);pop('bS',t,8.6,16);
  const cx=960,cy=560,mp=ease(clamp((t-MERGE[0])/(MERGE[1]-MERGE[0]),0,1));
  POS.forEach(([x,y,r],k)=>{const el=$('w'+k),t0=WIN_IN+k*WIN_GAP,p=clamp((t-t0)/.35,0,1),q=eOut(p);
    const sx=0.7+0.3*q+(1-q)*0.15*Math.sin(p*Math.PI);
    const X=x+(cx-165-x)*mp,Y=y+(cy-110-y)*mp,S=sx*(1-0.75*mp),R=r*(1-mp);
    css(el,'opacity',(q*(1-mp)).toFixed(3));css(el,'transform',`translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0) rotate(${R.toFixed(2)}deg) scale(${S.toFixed(3)})`)});
  // C 사건카드
  pop('cH',t,15.3);
  {const el=$('card'),p=eOut(clamp((t-16.0)/.5,0,1));css(el,'opacity',p.toFixed(3));css(el,'transform',`scale(${(0.6+0.4*p).toFixed(3)})`)}
  ITEM_T.forEach((t0,k)=>pop('i'+k,t,t0,22));
  // D 표
  pop('dH',t,27.2);ROW_T.forEach((t0,k)=>pop('r'+k,t,t0,16));
  // E 가치
  pop('gE',t,39.5,20);pop('g1',t,39.7);pop('g2',t,41.0);pop('gS',t,44.3,18);
  pop('eH',t,49.6);VAL_T.forEach((t0,k)=>pop('v'+k,t,t0,36));
  // F 범위
  pop('fH',t,59.9);CELL_T.forEach((t0,k)=>{if(k)cls($('c'+k),'in',t>=t0)});pop('fC',t,63.8,10);pop('fP',t,67.3,18);
  // 자막
  const cap=$('cap');let capOn=false;
  for(const [a,b,n,title,lines,ph,label] of CAP){if(t>=a&&t<=b){capOn=true;const pin=eOut(clamp((t-a)/.4,0,1)),pout=clamp((b-t)/.25,0,1);
    css(cap,'opacity',Math.min(pin,pout).toFixed(3));css(cap,'transform',`translate3d(0,${((1-pin)*40).toFixed(2)}px,0)`);
    css($('cap-n'),'display',n?'flex':'none');txt($('cap-n'),String(n));txt($('cap-t'),title);txt($('cap-s'),label||'');
    let act=-1;for(const [pt,ix] of ph)if(t>=pt)act=ix;
    htm($('cap-b'),lines.map((l,i)=>`<div class="ln${act>=0&&i>act?' dim':''}">${l}</div>`).join(''))}}
  css(cap,'display',capOn?'flex':'none');
  // 표지 · 끝 장면
  const cv=$('cover'),ci=$('cvimg');
  if(t<INTRO[1]){css(cv,'display','flex');css(cv,'opacity',(1-clamp((t-(INTRO[1]-0.5))/.5,0,1)).toFixed(3));txt($('cv1'),'시작하며');txt($('cv2'),'마이턴이 해 주는 일 한눈에');
    const p=eOut(clamp(t/0.8,0,1));css(ci,'transform',`translate3d(0,${((1-p)*20).toFixed(2)}px,0)`);css(ci,'opacity',p.toFixed(3))}
  else if(t>=OUTRO[0]){css(cv,'display','flex');css(cv,'opacity',eOut(clamp((t-OUTRO[0])/.6,0,1)).toFixed(3));txt($('cv1'),'마이턴, 내 차례');txt($('cv2'),'다음 장 › 화면 공통 구성');css(ci,'transform','none');css(ci,'opacity','1')}
  else css(cv,'display','none');
}
""".replace('__POS__', str([list(p) for p in POS]))
cut('const W=[1300,760];', 'window.render=render;', JS)
rep('const TL={"total": 48.0, "segs": [[0, 48.0, 0, 48.0]]};', f'const TL={{"total": {TOTAL}, "segs": [[0, {TOTAL}, 0, {TOTAL}]]}};')

# 배경음악 — 7장 손품조사 곡(78초, 길이가 맞음)
bed = open(D + '/beds/survey.mp3', 'rb').read()
m = re.search(r"bed:'([A-Za-z0-9+/=]+)'", s); s = s[:m.start(1)] + base64.b64encode(bed).decode() + s[m.end(1):]
# 음성 — ElevenLabs 솔라 · Eleven v4 · 안정성 0.1 · 유사성 0.8, 줄마다 STARTS 시각에 놓고 사이는 무음 프레임
STARTS = [0.3, 3.6, 7.9, 15.2, 27.3, 39.6, 49.7, 60.0, 74.25]
FR = 1152 / 44100
def frames(b):
    k = 0
    if b[:3] == b'ID3': k = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127))
    out = []
    while k + 4 <= len(b):
        h = b[k:k+4]
        if h[0] != 0xFF or (h[1] & 0xE0) != 0xE0: k += 1; continue
        br = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][h[2] >> 4]
        if br == 0: k += 1; continue
        ln = 144000 * br // 44100 + ((h[2] >> 1) & 1); f = b[k:k+ln]
        if b'Xing' in f[:60] or b'Info' in f[:60]: k += ln; continue
        out.append(f); k += ln
    return out
fs = [frames(open(f'{D}/vo/c{n}.mp3', 'rb').read()) for n in range(len(STARTS))]
h = bytearray(fs[0][0][:4]); h[2] &= ~2
silf = bytes(h) + bytes(144000 * 128 // 44100 - 4)
out = []; tt = 0.0
for st, x in zip(STARTS, fs):
    nn = round((st - tt) / FR); assert nn >= 0, (st, tt); out += [silf] * nn; tt += nn * FR; out += x; tt += len(x) * FR
out += [silf] * max(0, round((TOTAL - tt) / FR)); sil = b''.join(out)
print('voice end', round(tt, 2))
m = re.search(r"voice:'([A-Za-z0-9+/=]+)'", s); s = s[:m.start(1)] + base64.b64encode(sil).decode() + s[m.end(1):]
open(OUT, 'w', encoding='utf-8').write(s); print('ok', len(s))
