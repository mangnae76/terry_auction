# 이용가이드 기일입찰 영상 — privacy.html(14장) 틀(재생기 · 표지 · 자막 · 빨간 상자 · 커서 · 음량)에
# 실제 기일입찰 탭 화면(읽기만, 이름 · 전화 · 주소 ○○○)을 한 장으로 깔고 내려 가며 짚는다. 음성 솔라 · v4 · 0.1/0.8
import re, base64, json, io, sys
from PIL import Image
SRC = '/Users/kang/gitsource/terry_auction/public/guide/clip/privacy.html'
D = sys.argv[1]; OUT = sys.argv[2]
R0 = json.load(open(D + '/rects.json'))
K = 1.3
def sc(r): return [round(960 + (r[0] - 960) * K), round(r[1] * K), round(r[2] * K), round(r[3] * K)]
R = {k: (sc(v) if isinstance(v, list) and v and isinstance(v[0], (int, float)) else [sc(x) for x in v] if isinstance(v, list) and v and isinstance(v[0], list) and isinstance(v[0][0], (int, float)) else v) for k, v in R0.items() if k != 'cards'}
R['tutCard'] = sc(R0['cards'][2][0])
DUR = [2.56, 4.16, 9.84, 8.4, 8.32, 7.92, 5.44, 6.32]
GAP = 0.45
ST = [0.3]
for i in range(1, len(DUR)): ST.append(round(ST[-1] + DUR[i-1] + (0.45 if i != 1 else 0.45), 2))
ST[1] = max(ST[1], 3.3)
for i in range(2, len(DUR)): ST[i] = round(max(ST[i], ST[i-1] + DUR[i-1] + GAP), 2)
END = [round(s + d, 2) for s, d in zip(ST, DUR)]
TOTAL = round(END[-1] + 4.2, 1)
OUTRO0 = round(END[-1] + 0.25, 2)
print('starts', ST, 'total', TOTAL)

s = open(SRC, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:60], s.count(a)); s = s.replace(a, b)
def cut(a, b, new):
    global s
    i = s.index(a); j = s.index(b, i); s = s[:i] + new + s[j:]

rep('<title>개인정보 설정</title>', '<title>기일입찰</title>')
rep('aria-label="개인정보 설정 가이드 모션 그래픽"', 'aria-label="기일입찰 가이드 모션 그래픽"')
rep('#cap .num.sm{font-size:22px}\n', '#cap .num.sm{font-size:22px}\n#scr{position:absolute;inset:0;background:#f2f3f7;overflow:hidden}\n#shot{position:absolute;left:0;top:0;width:1920px;will-change:transform;transform-origin:960px 0}\n')

im = Image.open(D + '/bid_full.png').convert('RGB')
buf = io.BytesIO(); im.save(buf, 'WEBP', quality=86, method=6)
H = round(im.height * K)
cut('<div id="app">', '<div id="hl">', f'<div id="scr"><img id="shot" alt="" src="data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()}"></div>\n\n')

def c(r, dx=0.5, dy=0.5): return [round(r[0] + r[2] * dx), round(r[1] + r[3] * dy)]
fr = R['frame']; half = fr[2] / 2
LEFT = [fr[0] + 10, fr[1] + 50, round(half) - 20, 640]
RIGHT = [fr[0] + round(half) + 10, fr[1] + 50, round(half) - 20, 640]
S4 = fr[1] - 110                     # 서류 칸이 화면 위쪽에 오게
S5 = R['print'][1] - 640             # 인쇄 단추가 자막 위에
SMAX = H - 1080
t = ST
SCROLLS = [[t[4] - 0.2, t[4] + 0.9, S4], [t[5] - 0.2, t[5] + 0.9, S5], [t[7] - 0.2, t[7] + 0.9, SMAX]]
MOVES = [
  [t[1] + 0.2, t[1] + 1.4, c(R['tab'])],
  [t[2] + 0.4, t[2] + 1.2, c(R['typeBtns'][0])],
  [t[2] + 3.0, t[2] + 3.8, c(R['typeBtns'][1])],
  [t[2] + 4.6, t[2] + 5.4, c(R['typeBtns'][2])],
  [t[2] + 6.0, t[2] + 6.8, c(R['typeBtns'][4])],
  [t[3] + 0.3, t[3] + 1.1, c(R['kpis'][0], 0.5, 0.75)],
  [t[3] + 2.6, t[3] + 3.4, c(R['kpis'][1], 0.5, 0.75)],
  [t[3] + 4.4, t[3] + 5.2, c(R['kpis'][2], 0.5, 0.75)],
  [t[3] + 6.2, t[3] + 7.0, c(R['kpis'][3], 0.5, 0.75)],
  [t[4] + 1.2, t[4] + 2.0, [LEFT[0] + 300, LEFT[1] + 260]],
  [t[4] + 4.6, t[4] + 5.4, [RIGHT[0] + 300, RIGHT[1] + 260]],
  [t[5] + 1.2, t[5] + 2.0, c(R['print'])],
  [t[5] + 4.2, t[5] + 5.0, c(R['docx'])],
  [t[7] + 1.4, t[7] + 2.2, c(R['tutCard'], 0.2, 0.6)],
]
CLICKS = [round(t[1] + 2.0, 2)]
pad = lambda r, p=6: [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p]
HL = [
  [t[1] + 1.6, END[1] + 0.2, pad(R['tab']), 0],
  [t[2] + 0.2, END[2] + 0.2, pad(R['types']), 0],
  [t[3] + 0.2, END[3] + 0.2, pad(R['hero']), 0],
  [t[4] + 1.0, t[4] + 4.4, LEFT, 0],
  [t[4] + 4.4, END[4] + 0.2, RIGHT, 1],
  [t[5] + 1.0, t[5] + 4.0, pad(R['print']), 0],
  [t[5] + 4.0, END[5] + 0.2, pad(R['docx']), 1],
  [t[7] + 1.2, END[7] + 0.2, pad(R['tutCard']), 0],
]
L = '기일입찰 '
CAP = [
  [t[1] + 0.3, END[1] + 0.2, 1, '기일입찰 탭 열기', ['<b>물건상세</b> 맨 끝 <b>기일입찰</b> 탭을 누릅니다.'], [], L + '1 / 6'],
  [t[2] + 0.2, END[2] + 0.2, 2, '입찰유형 고르기', ['본인 · 대리인 · 법인 · 법인대리인 · 공동입찰 · 공동입찰대리인', '유형에 따라 넣을 서류가 달라집니다.'], [], L + '2 / 6'],
  [t[3] + 0.2, END[3] + 0.2, 3, '자동으로 들어가는 값', ['매각기일 · 법원 · 사건번호 · <b>확정 입찰가격</b> · 매수신청보증금'], [], L + '3 / 6'],
  [t[4] + 0.2, END[4] + 0.2, 4, '봉투에 넣을 서류 작성', ['법원 공식 서식 그대로 적습니다.', '왼쪽은 <b>내 서류</b>, 오른쪽은 빨간 글씨 <b>예시</b>입니다.'], [[t[4] + 0.2, 0], [t[4] + 4.4, 1]], L + '4 / 6'],
  [t[5] + 0.2, END[6] + 0.2, 5, '인쇄 · 내려받기', ['<b>서류전부인쇄</b> A4로 한 번에, <b>채운파일내려받기</b> 원본 docx에 글만', '적은 칸은 저장하지 않습니다(주민등록번호를 남기지 않으려고).'], [[t[5] + 0.2, 0], [t[6], 1]], L + '5 / 6'],
  [t[7] + 0.2, END[7] + 0.2, 6, '봉투 · 튜토리얼', ['봉투는 법정에서 받아 손으로 씁니다.', '쓰는 법은 <b>튜토리얼 바로가기</b>에서 봅니다.'], [], L + '6 / 6'],
]

JS = r"""
// ===== 기일입찰 — 실제 화면 한 장을 내려 가며 짚는다(줄 시작 __ST__) =====
const EV=[];
const INTRO=[0,__I1__], OUTRO=[__O0__,__TOT__];
const SCROLLS=__SCROLLS__, MOVES=__MOVES__, CLICKS=__CLICKS__, HL=__HL__, CAP=__CAP__;
const W=[1500,700];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const eOut=p=>1-Math.pow(1-p,3);
const _c=new Map();
function css(el,k,v){const key=el.id+'|'+k;if(_c.get(key)!==v){el.style[k]=v;_c.set(key,v)}}
function txt(el,v){const key=el.id+'|t';if(_c.get(key)!==v){el.textContent=v;_c.set(key,v)}}
function htm(el,v){const key=el.id+'|h';if(_c.get(key)!==v){el.innerHTML=v;_c.set(key,v)}}
function clearRC(){}
function invalidateAll(){_c.clear()}
let _sk='';
function scrollAt(t){let y=0;for(const [a,b,to] of SCROLLS){if(t<=a)break;if(t>=b){y=to;continue}y=y+(to-y)*ease((t-a)/(b-a));break}return y}
function render(t){
  const sy=scrollAt(t);css($('shot'),'transform',`translate3d(0,${(-sy).toFixed(1)}px,0) scale(__K__)`);
  // 커서 — 점 좌표는 화면 한 장 기준, 지금 내려간 만큼 뺀다
  let i=0;while(i<MOVES.length&&MOVES[i][1]<t)i++;
  const at=(p)=>[p[0],p[1]-sy];const lerp=(a,b,q)=>[a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q];
  let pos;
  if(i===0){const [a,b,p]=MOVES[0];pos=t<a?W:lerp(W,at(p),ease((t-a)/(b-a)))}
  else{const prev=at(MOVES[i-1][2]);if(i<MOVES.length&&t>=MOVES[i][0]){const [a,b,p]=MOVES[i];pos=lerp(prev,at(p),ease((t-a)/(b-a)))}else pos=prev}
  const c=$('cur'),vis=t>=INTRO[1]-0.1&&t<OUTRO[0]+0.3;
  let sc=1;for(const ck of CLICKS){const dt=t-ck;if(dt>-0.08&&dt<0.14)sc=0.82}
  css(c,'display',vis?'block':'none');css(c,'transform',`translate3d(${pos[0].toFixed(1)}px,${pos[1].toFixed(1)}px,0) scale(${sc})`);
  const r=$('rip');let rOn=false;
  for(const ck of CLICKS){const dt=t-ck;if(dt>=0&&dt<0.5){const q=eOut(dt/.5),s2=16+60*q;rOn=true;
    css(r,'width',s2.toFixed(1)+'px');css(r,'height',s2.toFixed(1)+'px');css(r,'transform',`translate3d(${(pos[0]+4-s2/2).toFixed(1)}px,${(pos[1]+4-s2/2).toFixed(1)}px,0)`);css(r,'opacity',(1-q).toFixed(3))}}
  css(r,'display',rOn?'block':'none');
  // 빨간 상자
  const slots=[$('hl'),$('hl2')],on=[false,false];
  for(const [a,b,[x,y,w,h],slot] of HL){if(t>=a&&t<=b){const pin=clamp((t-a)/.28,0,1),pout=clamp((b-t)/.2,0,1);const q=Math.min(eOut(pin),pout);const s3=1+0.08*(1-eOut(pin));const el=slots[slot];on[slot]=true;
    css(el,'left',x+'px');css(el,'top',(y-sy).toFixed(1)+'px');css(el,'width',w+'px');css(el,'height',h+'px');css(el,'opacity',q.toFixed(3));css(el,'transform',`scale(${s3.toFixed(4)})`)}}
  slots.forEach((s4,k)=>css(s4,'display',on[k]?'block':'none'));
  // 자막
  const cap=$('cap');let capOn=false;
  for(const [a,b,n,title,lines,ph,label] of CAP){if(t>=a&&t<=b){capOn=true;const pin=eOut(clamp((t-a)/.4,0,1)),pout=clamp((b-t)/.25,0,1);
    css(cap,'opacity',Math.min(pin,pout).toFixed(3));css(cap,'transform',`translate3d(0,${((1-pin)*40).toFixed(2)}px,0)`);
    css($('cap-n'),'display',n?'flex':'none');txt($('cap-n'),String(n));txt($('cap-t'),title);txt($('cap-s'),label||'');
    let act=-1;for(const [pt,ix] of ph)if(t>=pt)act=ix;
    htm($('cap-b'),lines.map((l,k)=>`<div class="ln${act>=0&&k>act?' dim':''}">${l}</div>`).join(''))}}
  css(cap,'display',capOn?'flex':'none');
  // 표지 · 끝 장면
  const cv=$('cover'),ci=$('cvimg');
  if(t<INTRO[1]){css(cv,'display','flex');css(cv,'opacity',(1-clamp((t-(INTRO[1]-0.5))/.5,0,1)).toFixed(3));txt($('cv1'),'기일입찰');txt($('cv2'),'물건상세 › 기일입찰');
    const p=eOut(clamp(t/0.8,0,1));css(ci,'transform',`translate3d(0,${((1-p)*20).toFixed(2)}px,0)`);css(ci,'opacity',p.toFixed(3))}
  else if(t>=OUTRO[0]){css(cv,'display','flex');css(cv,'opacity',eOut(clamp((t-OUTRO[0])/.6,0,1)).toFixed(3));txt($('cv1'),'법원 공식 서식 그대로, 기일입찰');txt($('cv2'),'MYTURN AUCTION');css(ci,'transform','none');css(ci,'opacity','1')}
  else css(cv,'display','none');
}
"""
for k, v in {'__ST__': ' · '.join(map(str, ST)), '__I1__': str(round(ST[1] - 0.1, 2)), '__O0__': str(OUTRO0), '__TOT__': str(TOTAL),
             '__SCROLLS__': json.dumps(SCROLLS), '__MOVES__': json.dumps(MOVES), '__CLICKS__': json.dumps(CLICKS), '__HL__': json.dumps(HL),
             '__CAP__': json.dumps(CAP, ensure_ascii=False), '__K__': str(K)}.items():
    JS = JS.replace(k, v)
cut('const W=[1300,760];', 'window.render=render;', JS)
rep('const TL={"total": 48.0, "segs": [[0, 48.0, 0, 48.0]]};', f'const TL={{"total": {TOTAL}, "segs": [[0, {TOTAL}, 0, {TOTAL}]]}};')
# 첫 재생 전에 미리 그려 둘 때 EV 대신 시간마다
rep("EV.forEach(e=>render(e[0]+0.4));", "for(let x=0;x<OUTRO[1];x+=1)render(x);")

bed = open(D + '/bed.mp3', 'rb').read()
m = re.search(r"bed:'([A-Za-z0-9+/=]+)'", s); s = s[:m.start(1)] + base64.b64encode(bed).decode() + s[m.end(1):]
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
fs = [frames(open(f'{D}/vo/c{n}.mp3', 'rb').read()) for n in range(len(ST))]
hh = bytearray(fs[0][0][:4]); hh[2] &= ~2
silf = bytes(hh) + bytes(144000 * 128 // 44100 - 4)
out = []; tt = 0.0
for st, x in zip(ST, fs):
    nn = round((st - tt) / FR); assert nn >= 0, (st, tt); out += [silf] * nn; tt += nn * FR; out += x; tt += len(x) * FR
out += [silf] * max(0, round((TOTAL - tt) / FR))
m = re.search(r"voice:'([A-Za-z0-9+/=]+)'", s); s = s[:m.start(1)] + base64.b64encode(b''.join(out)).decode() + s[m.end(1):]
open(OUT, 'w', encoding='utf-8').write(s); print('ok', len(s), 'voice end', round(tt, 2))
