# 기일입찰 탭 서식 — 법원 공식 서식(docx · RTF)을 읽어 격자 · 글자 크기 · 간격 · A4 여백 그대로 HTML 본보기로 만든다.
# 왼쪽 '내가 쓸 것'(입력칸) · 오른쪽 '보기'(빨간 예시). 물건 값은 ⟦…⟧ 자리표로 두고 웹(selected.src.html)이 물건마다 끼운다.
# 사용(저장소 맨 위에서): python3 scripts/bidforms/formgen.py   → web/forms/bid-{self,proxy,corp,corpproxy,joint,jointproxy}.html
# 원본: web/forms/originals/bid-A3360.docx(기일입찰표 + 위임장) · joint-A3364.doc(공동입찰신고서 · 목록, 실제로는 RTF)
# 기준은 윈도우에서 연 원본(겹선 두 줄 · 동그라미 인 · 함초롬바탕 줄 높이 1.8배 · 바탕체 1.2배). 자세한 결정은 메모리 bid-forms-exact-copy
import sys, zipfile, re, base64, html
import xml.etree.ElementTree as ET
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'web', 'forms')
SRC = os.path.join(OUT, 'originals', 'bid-A3360.docx')
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']
PX = 600 / 8504  # 본문 폭 8504 twips → 600px

z = zipfile.ZipFile(SRC)
root = ET.fromstring(z.read('word/document.xml'))
body = root.find('w:body', NS)
media = {n.split('/')[-1]: z.read(n) for n in z.namelist() if n.startswith('word/media/') and n.endswith('.jpeg')}
IMG = {k: 'data:image/jpeg;base64,' + base64.b64encode(v).decode() for k, v in media.items()}

PT = 20 * PX      # 1pt 를 표 폭과 같은 축척으로
DEF_PT = 10       # 바탕글(a3) 기본 10pt
TABW = 800 * PX   # 기본 탭 간격(settings.xml defaultTabStop 800)
def ind_of(p):
    e = p.find('w:pPr/w:ind', NS)
    return (int(e.get(W + 'left') or 0) * PX, int(e.get(W + 'right') or 0) * PX) if e is not None else (0, 0)
def chw(c, fs=12): return fs if ord(c) >= 0x1100 and c not in '‧·' else fs / 2
def runs_html(p):
    """문단 하나 → 글(굵게 · 밑줄 · 빈칸 · 탭 보존). 빈칸 2개 이상과 탭은 원본 폭 그대로 띄운다"""
    out = []; fld = None; x = ind_of(p)[0]; fs = DEF_PT * PT
    for r in p.findall('w:r', NS):
        fc = r.find('w:fldChar', NS)
        if fc is not None:
            k = fc.get(W + 'fldCharType')
            if k == 'begin': fld = ''
            elif k == 'end' and fld is not None:
                m = re.search(r'\\ac\((.),(.+?)\)', fld)
                out.append(f'<span class="circ">{html.escape(m.group(2))}</span>' if m else ''); x += fs; fld = None
            continue
        if fld is not None:
            it = r.find('w:instrText', NS)
            if it is not None: fld += it.text or ''
            continue
        rpr = r.find('w:rPr', NS)
        szel = rpr.find('w:sz', NS) if rpr is not None else None
        fs = int(szel.get(W + 'val')) / 2 * PT if szel is not None else DEF_PT * PT
        SPW = fs / 2
        b = rpr is not None and rpr.find('w:b', NS) is not None
        u = rpr is not None and rpr.find('w:u', NS) is not None
        we = rpr.find('w:w', NS) if rpr is not None else None; se = rpr.find('w:spacing', NS) if rpr is not None else None
        ww = int(we.get(W + 'val')) / 100 if we is not None else 1.0          # 장평(글자 폭 %)
        ls = fs * (ww - 1) + (int(se.get(W + 'val')) / 20 * PT if se is not None else 0)  # 자간(1/20pt) — 글자마다 줄임
        segs = []
        for c in r:
            tg = c.tag.replace(W, '')
            if tg == 't': segs.append(c.text or '')
            elif tg == 'tab': segs.append('\t')
        txt = ''.join(segs)
        if r.find('w:br', NS) is not None and not txt: out.append('<br>')
        if not txt: continue
        parts = []
        for m in re.finditer(r'\t| {2,}|[^\t ]+| ', txt):
            g = m.group(0)
            if g == '\t':
                nx = (int(x / TABW) + 1) * TABW; parts.append(f'<span class="sp" style="width:{nx - x:.1f}px"></span>'); x = nx
            elif g.startswith('  '):
                parts.append(f'<span class="sp" style="width:{len(g) * SPW:.1f}px"></span>'); x += len(g) * SPW
            elif g == ' ': parts.append(' '); x += SPW
            else: parts.append(html.escape(g)); x += sum(chw(c, fs) * ww + ls for c in g)
        s = f'<span style="font-size:{fs:.1f}px' + (f';letter-spacing:{ls:.2f}px' if ls else '') + '">' + ''.join(parts) + '</span>'
        if b: s = f'<b>{s}</b>'
        if u: s = f'<u>{s}</u>'
        out.append(s)
    return re.sub(r'(?:<span class="sp"[^>]*></span>| )+$', '', ''.join(out))

def p_align(p):
    pr = p.find('w:pPr', NS)
    jc = pr.find('w:jc', NS) if pr is not None else None
    v = jc.get(W + 'val') if jc is not None else ''
    return {'center': 'center', 'right': 'right', 'both': 'left', 'distribute': 'center'}.get(v, 'left')

def ptext(p): return ''.join(t.text or '' for t in p.iter(W + 't'))

tables = []; flow = []  # flow: ('p', el) | ('t', idx)
for el in body:
    tag = el.tag.replace(W, '')
    if tag == 'tbl': tables.append(el); flow.append(('t', len(tables) - 1))
    elif tag == 'p': flow.append(('p', el))

K = PT
def p_style(el):
    """원본 문단의 글자 크기 · 줄 간격 · 앞뒤 간격(바탕글 기본 10pt)"""
    szs = [int(r.find('w:rPr/w:sz', NS).get(W + 'val')) for r in el.findall('w:r', NS) if r.find('w:rPr/w:sz', NS) is not None and ''.join(t.text or '' for t in r.findall('w:t', NS)).strip()]
    pm = el.find('w:pPr/w:rPr/w:sz', NS)
    pt = (max(szs) if szs else int(pm.get(W + 'val')) if pm is not None else DEF_PT * 2) / 2; fs = pt * K
    sp = el.find('w:pPr/w:spacing', NS)
    line = int(sp.get(W + 'line') or 384) if sp is not None else 384
    bef = int(sp.get(W + 'before') or 0) if sp is not None else 0
    aft = int(sp.get(W + 'after') or 0) if sp is not None else 0
    lh = fs * 1.8 * line / 240  # 윈도우 워드 + 함초롬바탕 줄 높이 — 원본처럼 앞면이 A4 한 장을 채우는 값
    return f'font-size:{DEF_PT * K:.1f}px;line-height:{lh:.1f}px;min-height:0;margin:{bef / 20 * K:.1f}px 0 {aft / 20 * K:.1f}px'
def cell_html(tc, fill, left, key):
    """셀 하나. fill: {(key) : 값} 에 이 셀이 있으면 값(오른쪽) 또는 입력칸(왼쪽)"""
    ps = tc.findall('w:p', NS)
    inner = []
    for p in ps:
        t = runs_html(p)
        il, ir = ind_of(p)
        inner.append(f'<div class="p" style="text-align:{p_align(p)};padding-left:{il:.1f}px;padding-right:{ir:.1f}px;{p_style(p).replace("margin:", "margin:0;--m:")}">{t}</div>' if re.sub(r'<span class="sp"[^>]*></span>', '', t).strip() else f'<div class="p ep" style="{p_style(p).replace("margin:", "margin:0;--m:")}">&nbsp;</div>')
    body_html = ''.join(inner)
    if key in fill:
        spec = fill[key]
        body_html = spec(left, body_html)
    elif key in ((0, 3, 3), (0, 6, 3)):
        body_html = f'<div class="nm">{seal_at(body_html, key)}</div>'   # 비어 있는 성명 칸도 '인'은 원본 자리
    return body_html

def table_html(ti, fill, left, cls=''):
    tbl = tables[ti]
    grid = [int(g.get(W + 'w')) for g in tbl.find('w:tblGrid', NS)]
    cols = ''.join(f'<col style="width:{w * PX:.2f}px">' for w in grid)
    rows = []
    vspan = {}  # 열 위치 → (row index 시작, 남은 셀) for vMerge
    for ri, tr in enumerate(tbl.findall('w:tr', NS)):
        trh = tr.find('w:trPr/w:trHeight', NS); h = int(trh.get(W + 'val')) * PX if trh is not None else 0
        tds = []; gi = 0
        for ci, tc in enumerate(tr.findall('w:tc', NS)):
            pr = tc.find('w:tcPr', NS)
            span = int(pr.find('w:gridSpan', NS).get(W + 'val')) if pr.find('w:gridSpan', NS) is not None else 1
            vm = pr.find('w:vMerge', NS)
            if vm is not None and (vm.get(W + 'val') or 'continue') != 'restart':
                gi += span; continue  # 세로 병합 이어지는 칸 — 건너뜀
            rs = 1
            if vm is not None:  # restart — 몇 줄 이어지나 센다
                for tr2 in tbl.findall('w:tr', NS)[ri + 1:]:
                    g2 = 0; found = False
                    for tc2 in tr2.findall('w:tc', NS):
                        pr2 = tc2.find('w:tcPr', NS); sp2 = int(pr2.find('w:gridSpan', NS).get(W + 'val')) if pr2.find('w:gridSpan', NS) is not None else 1
                        if g2 == gi:
                            vm2 = pr2.find('w:vMerge', NS)
                            if vm2 is not None and (vm2.get(W + 'val') or 'continue') != 'restart': rs += 1; found = True
                            break
                        g2 += sp2
                    if not found: break
            st = ''
            shd = pr.find('w:shd', NS)
            if shd is not None and shd.get(W + 'fill') not in (None, 'auto', 'FFFFFF'): st += f'background:#{shd.get(W + "fill")};'
            bd = pr.find('w:tcBorders', NS)
            if bd is not None:
                for side in ('top', 'left', 'bottom', 'right'):
                    e = bd.find('w:' + side, NS)
                    if e is None: continue
                    v = e.get(W + 'val'); sz = int(e.get(W + 'sz') or 2)
                    if v == 'nil' or v == 'none': st += f'border-{side}:0;'
                    elif v == 'double': st += f'border-{side}:3px double #111;'
                    else: st += f'border-{side}:' + ('3px solid #111;' if sz >= 12 else '1px solid #111;')
            va = pr.find('w:vAlign', NS); va = va.get(W + 'val') if va is not None else 'center'
            key = (ti, ri, ci)
            tds.append(f'<td colspan="{span}" rowspan="{rs}" style="{st}vertical-align:{"middle" if va=="center" else va}" data-k="{ti}-{ri}-{ci}">{cell_html(tc, fill, left, key)}</td>')
            gi += span
        rows.append(f'<tr style="height:{h:.1f}px">{"".join(tds)}</tr>')
    return f'<table class="ft {cls}"><colgroup>{cols}</colgroup>{"".join(rows)}</table>'

def cell_left_tw(ti, ri, ci):
    """표 ti 의 행 ri · 칸 ci 왼쪽 경계(twips) — gridSpan 따라 누적"""
    tbl = tables[ti]; grid = [int(g.get(W + 'w')) for g in tbl.find('w:tblGrid', NS)]
    gi = 0
    for k, tc in enumerate(tbl.findall('w:tr', NS)[ri].findall('w:tc', NS)):
        if k == ci: return sum(grid[:gi])
        gs = tc.find('w:tcPr/w:gridSpan', NS); gi += int(gs.get(W + 'val')) if gs is not None else 1
    return sum(grid[:gi])
SEAL_PX = 12   # '인' 동그라미 지름 — 성명 칸 높이의 1/3 쯤
def seal_at(b, key):
    """성명 칸 '인'을 물건번호 칸 왼쪽 세로선 가운데에(원본 위치)"""
    off = (cell_left_tw(0, 1, 2) - cell_left_tw(*key)) * PX - 5.5 - SEAL_PX / 2
    return b.replace('<span class="circ">', f'<span class="circ ab" style="left:{off:.1f}px">', 1)

# ===== 채우기 규칙 =====
def inp(ph='입력', w='100%', cls='', v=None, f=None, src='물건'):
    df = f' data-f="{f}"' if f else ''
    if v is not None: return f'<input class="fx kn {cls}" value="{html.escape(v)}" style="width:{w}" title="{src} 정보에서 채운 값 · 고칠 수 있음"{df}>'
    return f'<input class="fx {cls}" placeholder="{ph}" style="width:{w}"{df}>'
def red(v): return f'<span class="pen">{html.escape(v)}</span>'
def fixv(v): return f'<b class="fixv">{html.escape(v)}</b>'
def known(left, v): return fixv(v) if left else red(v)
def val(v, w='100%', cls='', f=None, kv=None, src='회원'):
    """빈 칸에 값 하나. f=동기화 키, kv=회원 정보로 미리 채울 값"""
    return lambda left, b: inp(w=w, cls=cls, f=f, v=kv, src=src) if left else f'<div class="p">{red(v)}</div>'
def kval(v, w='100%', f=None):
    """우리가 아는 값 — 왼쪽도 채워 둔다"""
    return lambda left, b: f'<div class="p">{inp(w=w, v=v, f=f)}</div>' if left else f'<div class="p">{red(v)}</div>'
def digit(v, row='', i=0):
    return lambda left, b: f'<input class="fx d" maxlength="1" inputmode="numeric" placeholder="입력" data-row="{row}" data-i="{i}" value="{v}">' if left else (f'<div class="p c">{red(v)}</div>' if v else '<div class="p">&nbsp;</div>')
def case_cell(y, n):
    return lambda left, b: f'<div class="p c">{known(left, y)} 타 경 {known(left, n)} 호</div>'
def head_cell(court, y, m, d):
    """머리 칸 — 원본: 1줄 '(앞면)' 8pt + 가운데 탭 '기 일 입 찰 표' 15pt, 2줄 '지방법원 집행관 귀하' 9pt + 오른쪽 탭 '입찰기일 : 년 월 일'"""
    def f(left, b):
        c = known(left, court); yy = known(left, y); mm = known(left, m); dd = known(left, d)
        return (f'<div class="hd1"><span class="fs">(앞면)</span><span class="ttl">기  일  입  찰  표</span></div>'
                f'<div class="hd2"><span>{c} 지방법원&nbsp;&nbsp;집행관&nbsp;&nbsp;귀하</span><span>입찰기일 : {yy} 년 {mm} 월 {dd} 일</span></div>')
    return f
def guar_cell():
    def f(left, b):
        c1 = '<input type="checkbox" class="fxc">' if left else '<span class="pen">☑</span>'
        c2 = '<input type="checkbox" class="fxc">' if left else '☐'
        b = b.replace('□', c1, 1).replace('□', c2, 1)
        # 두 줄 모두 첫 탭 자리(800tw)에서 □ 시작 — 이름표를 탭 자리까지 고정 폭으로, 탭 빈칸은 뺀다
        for lab in ('보증의', '제공방법'):
            b = re.sub(r'(<span style="font-size:[\d.]+px">)' + lab + r'</span>(<span style="font-size:[\d.]+px">)<span class="sp" style="width:[\d.]+px"></span>',
                       lambda m: f'<span class="glab" style="{m.group(1)[13:-2]};width:{TABW - 100 * PX:.1f}px">{lab}</span>' + m.group(2), b, 1)
        return b
    return f
def seal():
    return '<i class="seal">인</i>'
CIRC = '<span class="circ mk">인</span>'; PAREN = '<span class="mk">(인)</span>'
def val_seal(v, w='100%', f=None, kv=None, mark=None, at=None):
    """성명 칸. mark = 원본에 찍힌 도장 자리 표기(○인 · (인)) — 왼쪽 · 오른쪽 · 인쇄 모두 남긴다. 없으면 화면용 점선 자리만"""
    if mark:
        def g(left, b):
            b = seal_at(b, at) if at else b
            if left: return f'<div class="nm">{b}{inp(f=f, v=kv, cls="ov", w="60%")}</div>'
            st = f'<i class="seal">{html.escape(v.replace(" ", "")[:3])}인</i>'
            return f'<div class="nm">{re.sub(r'(<span class="circ[^"]*"[^>]*>)', lambda m: m.group(1) + st, b, count=1)}<span class="pen ov">{html.escape(v)}</span></div>'
        return g
    return lambda left, b: (f'<div class="p">{inp(w=w, f=f, v=kv)}<i class="slot">인</i></div>' if left else f'<div class="p">{red(v)}<i class="seal">{html.escape(v.replace(" ", "")[:3])}인</i></div>')
def rrn_cell(v, f=None):
    """주민등록번호 칸"""
    return lambda left, b: (f'<div class="p c">{inp(f=f)}</div>' if left else f'<div class="p c">{red(v)}</div>')

CASE = dict(court='⟦court⟧', y='⟦yyyy⟧', yy='⟦yy⟧', m='⟦mm⟧', d='⟦dd⟧', n='⟦caseno⟧', item='⟦item⟧')  # 웹이 물건 값으로 바꿔 끼운다(물건번호 없으면 빈 글)
DEP = [f'⟦dep{i}⟧' for i in range(12)]   # 보증금액 12자리(천억~일) — 웹이 채운다
BID = [f'⟦bid{i}⟧' for i in range(12)]   # 입찰가격 12자리
ME = dict(name='홍 길 동', phone='010-1234-5678', rrn='800101-1******', addr='인천광역시 서구 ○○로 00, 000동 000호', job='자영업')
AG = dict(name='성 춘 향', phone='010-9876-5432', rrn='820202-2******', addr='인천광역시 연수구 ○○로 00, 000호', job='회사원', rel='지인')
CO = dict(name='주식회사 ○○ 대표이사 홍길동', biz='123-45-67890', corp='110111-1234567', addr='인천광역시 미추홀구 ○○로 00, 5층', phone='032-000-0000')
MEM = dict(name='⟦mname⟧', phone='⟦mphone⟧', addr='⟦maddr⟧')  # 회원 정보(별명 · 전화 · 주소) — 비면 웹이 빈 입력칸으로
P2 = dict(name='이 몽 룡', phone='010-5555-6666', rrn='810303-1******', addr='인천광역시 남동구 ○○로 00, 000동 000호', job='회사원')

def bid_fill(t):
    f = {(0, 0, 0): head_cell(CASE['court'], CASE['y'], CASE['m'], CASE['d']), (0, 1, 1): case_cell(CASE['y'], CASE['n']), (0, 9, 0): guar_cell()}
    f[(0, 2, 3)] = lambda left, b: f'<div class="p">{known(left, CASE["item"])}</div>'
    for i, v in enumerate(DEP): f[(0, 11, i + 1)] = digit(v, 'dep', i)
    for i, v in enumerate(BID): f[(0, 13, i + 1)] = digit(v, 'bid', i)
    corp = t in ('corp', 'corpproxy'); joint = t in ('joint', 'jointproxy'); proxy = t in ('proxy', 'corpproxy', 'jointproxy')
    if joint:
        f[(0, 3, 3)] = lambda left, b: f'<div class="nm">{seal_at(b, (0, 3, 3))}<span class="ov ov2">{known(left, "별첨 공동입찰자목록")}<br>{known(left, "기재와 같음")}</span></div>'
    elif corp:
        f[(0, 3, 3)] = val_seal(CO['name'], f='co.name', mark=CIRC, at=(0, 3, 3)); f[(0, 3, 5)] = val(CO['phone'], f='co.phone'); f[(0, 4, 3)] = val(CO['biz'], f='co.biz'); f[(0, 4, 5)] = val(CO['corp'], f='co.corp'); f[(0, 5, 3)] = val(CO['addr'], f='co.addr')
    else:
        f[(0, 3, 3)] = val_seal(ME['name'], f='me.name', kv=MEM['name'], mark=CIRC, at=(0, 3, 3)); f[(0, 3, 5)] = val(ME['phone'], f='me.phone', kv=MEM['phone']); f[(0, 4, 3)] = val(ME['rrn'], f='me.rrn'); f[(0, 5, 3)] = val(ME['addr'], f='me.addr', kv=MEM['addr'])
    if proxy:
        f[(0, 6, 3)] = val_seal(AG['name'], f='ag.name', mark=CIRC, at=(0, 6, 3)); f[(0, 6, 5)] = val(AG['rel'], f='ag.rel'); f[(0, 7, 3)] = val(AG['rrn'], f='ag.rrn'); f[(0, 7, 5)] = val(AG['phone'], f='ag.phone'); f[(0, 8, 3)] = val(AG['addr'], f='ag.addr')
    return f

def poa_fill(t):
    corp = t in ('corp', 'corpproxy'); joint = t == 'jointproxy'
    f = {(2, 0, 2): val(AG['name'], f='ag.name'), (2, 0, 4): val(AG['job'], f='ag.job'), (2, 1, 2): rrn_cell(AG['rrn'], f='ag.rrn'), (2, 1, 4): val(AG['phone'], f='ag.phone'), (2, 2, 2): val(AG['addr'], f='ag.addr')}
    co = dict(CO, rrn=CO['biz'], job='법인'); owners = [(ME, 'me'), (P2, 'p2')] if joint else [(co, 'co')] if corp else [(ME, 'me')]
    for k, (o, key) in enumerate(owners):
        r = 3 * k; rk = 'co.biz' if key == 'co' else key + '.rrn'; kv = MEM if key == 'me' else {}
        f[(3, r, 2)] = val_seal(o['name'], f=key + '.name', kv=kv.get('name')); f[(3, r, 4)] = val(o['job'], f=key + '.job'); f[(3, r + 1, 2)] = rrn_cell(o['rrn'], f=rk); f[(3, r + 1, 4)] = val(o['phone'], f=key + '.phone', kv=kv.get('phone')); f[(3, r + 2, 2)] = val(o['addr'], f=key + '.addr', kv=kv.get('addr'))
    return f

def para_html(el, left, fills):
    t = ptext(el); h = runs_html(el); al = p_align(el)
    if t.strip().startswith('주 의 사 항') or re.match(r'\s*[1-6]\.', t): h = re.sub(r'</?b>', '', h)  # 주의사항은 굵게 없이(사용자 지시)
    if '지방법원' in t and '타경' in t:  # 위임장 '    지방법원   타경   호 부동산'
        h = f'{known(left, CASE["court"])} 지방법원 {known(left, CASE["y"])} 타경 {known(left, CASE["n"])} 호 부동산'
    elif t.strip() == '지방법원 귀중':
        h = f'{known(left, CASE["court"])} 지방법원 귀중'
    return f'<p class="fp" style="text-align:{al};{p_style(el)}">{h}</p>' if t.strip() else ''

def sheet(t, left):
    fills = bid_fill(t); poa = poa_fill(t)
    out = []; back = False
    for kind, x in flow:
        if kind == 't':
            if x == 0:
                out.append(table_html(0, fills, left, 'main'))
            elif x == 1:
                h = table_html(1, {}, left, 'sample')
                # 기재 사례 칸에 양식 안 그림 셋
                for k, name in enumerate(['image1.jpeg', 'image2.jpeg', 'image3.jpeg']):
                    key = f'data-k="1-{k + 1}-{2 if k else 1}"'
                    h = re.sub(re.escape(key) + r'><div class="p ep"[^>]*>&nbsp;</div>', f'{key}><img class="simg" src="{IMG.get(name, "")}" alt="">', h, 1)
                out.append(h)
            elif x == 2: out.append(table_html(2, poa, left, 'poa'))
            elif x == 3: out.append(table_html(3, poa, left, 'poa'))
        else:
            txt = ptext(x)
            if '(뒷면)' in txt: out.append('<div class="pagebreak"></div><div class="back">'); back = True
            if not txt.strip(): out.append(f'<p class="fp" style="{p_style(x)}">&nbsp;</p>')  # 원본 빈 줄 = 세로 간격(앞 · 뒷면 모두)
            else: out.append(para_html(x, left, fills))
    if back: out.append('</div>')
    return ''.join(out)

# ===== 공동입찰신고서 · 공동입찰자목록(전산양식 A3364 · A3365) — 원본 RTF 구조 그대로 =====
from rtfparse import parse as rtf_parse
JBLOCKS, JSECT = rtf_parse(open(os.path.join(OUT, 'originals', 'joint-A3364.doc'), 'rb').read())
J_PAD = (JSECT['margt'] * PX, JSECT['margr'] * PX, JSECT['margb'] * PX, JSECT['margl'] * PX)
SANS = {16}  # 돋움
J_LH = 1.2   # 윈도우 바탕체 한 줄 높이 — 원본 RTF 에서 셈한 범위 1.191~1.218(빈 줄이 목록을 다음 장 첫 줄로 미는 조건)
def jtext(t, fs, b=False, ul=False, f=0, extra=''):
    """글 한 덩이 — 빈칸 2개 이상은 원본 폭(1/3 글자)대로"""
    out = []
    for m in re.finditer(r' {2,}|[^ ]+| ', t):
        g = m.group(0)
        out.append(f'<span class="sp" style="width:{len(g) * fs / 2:.1f}px"></span>' if g.startswith('  ') else html.escape(g))
    st = f'font-size:{fs:.1f}px;' + ('font-weight:700;' if b else '') + ('text-decoration:underline;' if ul else '') + ('font-family:-apple-system,\'Apple SD Gothic Neo\',sans-serif;' if f in SANS else '') + extra
    return f'<span style="{st}">' + ''.join(out) + '</span>'
def jpara_style(pp, runs):
    fs = (max([r[1] for r in runs]) if runs else pp.get('_fs', 24)) / 2 * PT
    al = {'qc': 'center', 'qr': 'right', 'qj': 'left', 'ql': 'left', 'qd': 'center'}.get(pp.get('al'), 'left')
    li = pp.get('li', 0) * PX; ri = pp.get('ri', 0) * PX; fi = pp.get('fi', 0) * PX
    return f'text-align:{al};margin:{pp.get("sb", 0) * PX:.1f}px {ri:.1f}px {pp.get("sa", 0) * PX:.1f}px {li:.1f}px;text-indent:{fi:.1f}px;font-size:{fs:.1f}px;line-height:{fs * J_LH:.1f}px;min-height:{fs * J_LH:.1f}px', fs
def slot_fill(t, fs, left, me_name):
    """신고서 빈칸 자리에 값 — 값 폭만큼 원본 빈칸을 덜어 뒤 글자 자리를 지킨다"""
    K = lambda v: known(left, v)
    sw = fs / 2
    def put(text, anchor, val_html, width_px, keep=1):
        i = text.index(anchor) + len(anchor); j = i
        while j < len(text) and text[j] == ' ': j += 1
        n = j - i; drop = max(0, min(n - keep - 1, round(width_px / sw)))  # 값 뒤 빈칸 하나는 남김
        return text[:i] + ' ' * keep + '\x00' + ' ' * (n - keep - drop) + text[j:], val_html
    vals = []
    if t.startswith('법원'):
        vals = [K(CASE['court'] + '지방')]; t = '\x00' + t
    elif t.startswith('사건번호'):
        t, v1 = put(t, '20', K(CASE['yy']), fs, keep=0); t, v2 = put(t.replace('\x00', '\x01', 1), '타경', K(CASE['n']), fs * 3); t = t.replace('\x01', '\x00'); vals = [v1, v2]
    elif t.startswith('물건번호'):
        vals = [K(CASE['item'])] if CASE['item'] else []; t = t + ('\x00' if CASE['item'] else '')
    elif re.match(r'20 +년', t):
        t, v1 = put(t, '20', K(CASE['yy']), fs, keep=0)
        t, v2 = put(t.replace('\x00', '\x01'), '년', K(CASE['m']), fs); t, v3 = put(t.replace('\x00', '\x02'), '월', K(CASE['d']), fs)
        t = t.replace('\x01', '\x00').replace('\x02', '\x00'); vals = [v1, v2, v3]
    elif t.startswith('신청인'):
        nm = inp(w='140px', f='me.name', v=MEM['name'], cls='big') if left else red('홍길동')
        cnt = inp(w='48px', f='j.cnt', cls='big c') if left else red('1')
        t, v1 = put(t, '신청인', nm, 140 if left else fs * 3); t, v2 = put(t.replace('\x00', '\x01'), '외', cnt, 48 if left else fs); t = t.replace('\x01', '\x00'); vals = [v1, v2]
    else:
        return None
    parts = t.split('\x00'); out = []
    for k, ptxt in enumerate(parts):
        out.append(jtext(ptxt, fs))
        if k < len(vals): out.append(vals[k])
    return ''.join(out)
def jcell(paras, left, fill=None):
    if fill is not None: return fill
    out = []
    for pp, runs in paras:
        st, fs = jpara_style(pp, runs)
        out.append(f'<div class="jp" style="{st}">' + (''.join(jtext(r[0], r[1] / 2 * PT, r[2], r[3], r[4]) for r in runs) or '&nbsp;') + '</div>')
    return ''.join(out) or '<div class="jp">&nbsp;</div>'
def jtable(rows, left):
    xs = sorted({c['x'] for r in rows for c in r['defn']['cells']}); edges = [0] + xs
    cols = ''.join(f'<col style="width:{(edges[i + 1] - edges[i]) * PX:.2f}px">' for i in range(len(xs)))
    # 세로 병합 칸 수
    spans = {}
    for ri, r in enumerate(rows):
        for ci, c in enumerate(r['defn']['cells']):
            if c.get('clvmgf'):
                n = 1
                for r2 in rows[ri + 1:]:
                    m = [c2 for c2 in r2['defn']['cells'] if c2['x'] == c['x']]
                    if m and m[0].get('clvmrg'): n += 1
                    else: break
                spans[(ri, ci)] = n
    people = {0: (ME, 'me'), 1: (P2, 'p2')}
    trs = []
    for ri, r in enumerate(rows):
        tds = []; prev = 0
        k = (ri - 3) // 2 if ri >= 3 else None; first = ri >= 3 and (ri - 3) % 2 == 0
        o, key = people.get(k, (None, None)) if k is not None else (None, None)
        fk = (lambda x: f'{key}.{x}') if key else (lambda x: None)
        kv = MEM if key == 'me' else {}
        for ci, c in enumerate(r['defn']['cells']):
            span = sum(1 for x in xs if prev < x <= c['x']); left_x = prev; prev = c['x']
            if c.get('clvmrg'): continue
            bd = ''
            for sd, nm in (('t', 'top'), ('b', 'bottom'), ('l', 'left'), ('r', 'right')):
                e = c['b'].get(sd)
                bd += f'border-{nm}:0;' if (e is None or e['k'] in ('none', 'nil')) else f'border-{nm}:{"3px double #111" if e["k"] == "db" else "1px solid #111"};'
            paras = [(p[1], p[2]) for p in r['cells'][ci]] if ci < len(r['cells']) else []
            fill = None
            if k is not None:
                if first and ci == 0: fill = f'<div class="jp c">{inp(w="100%", f=fk("no")) if left else (red(str(k + 1)) if o else "")}</div>'
                elif first and ci == 1:
                    b = jcell(paras, left).replace('(인)', '<span class="circ">(인)</span>')
                    if left: fill = f'<div class="nm">{b}{inp(f=fk("name"), v=kv.get("name"), cls="ov", w="60%")}</div>'
                    elif o: fill = f'<div class="nm">{b.replace("<span class=\"circ\">", "<span class=\"circ\"><i class=\"seal\">" + html.escape(o["name"].replace(" ", "")[:3]) + "인</i>", 1)}<span class="pen ov">{html.escape(o["name"])}</span></div>'
                elif first and ci == 2: fill = f'<div class="jp">{inp(f=fk("addr"), v=kv.get("addr")) if left else (red(o["addr"]) if o else "&nbsp;")}</div>'
                elif first and ci == 3: fill = f'<div class="jp c">{inp(f=fk("share")) if left else (red("1/2") if o else "")}</div>'
                elif not first and ci == 2: fill = f'<div class="jp jr">{jtext("-", 11 * PT)} {inp(w="calc(100% - 14px)", f=fk("rrn")) if left else (red(o["rrn"].split("-", 1)[0] + "-" + o["rrn"].split("-", 1)[1]) if o else "")}</div>'
                elif not first and ci == 3: fill = f'<div class="jp">{inp(f=fk("phone"), v=kv.get("phone")) if left else (red(o["phone"]) if o else "&nbsp;")}</div>'
            va = {'t': 'top', 'c': 'middle', 'b': 'bottom'}.get(c.get('va', 't'), 'top')
            tds.append(f'<td colspan="{span}" rowspan="{spans.get((ri, ci), 1)}" style="{bd}vertical-align:{va}">{jcell(paras, left, fill)}</td>')
        h = abs(r['defn']['trrh']) * PX
        trs.append(f'<tr style="height:{h:.1f}px">{"".join(tds)}</tr>')
    return f'<table class="ft jt" style="width:{xs[-1] * PX:.1f}px"><colgroup>{cols}</colgroup>{"".join(trs)}</table>'
def joint_forms(left, t):
    out = ['<div class="pagebreak"></div><i data-joint></i>']
    for bl in JBLOCKS:
        if bl[0] == 'p':
            pp, runs = bl[1], bl[2]; txt = ''.join(r[0] for r in runs)
            if txt.startswith('[전산양식 A3365'): out.append('<div class="pagebreak"></div><i data-joint></i>')
            st, fs = jpara_style(pp, runs)
            filled = slot_fill(txt.strip(), fs, left, MEM['name']) if txt.strip() else None
            if filled is not None and txt != txt.lstrip(): filled = jtext(txt[:len(txt) - len(txt.lstrip())], fs) + filled
            body = filled if filled is not None else (''.join(jtext(r[0], r[1] / 2 * PT, r[2], r[3], r[4]) for r in runs) or '&nbsp;')
            out.append(f'<p class="jp" style="{st.replace("min-height:", "height:")}">{body}</p>')  # 원본 문단은 모두 한 줄 — 줄 높이 고정
        elif bl[0] == 'tbl':
            out.append(jtable(bl[1], left))
    return ''.join(out)

CSS = '''
:root{color-scheme:light} html,body{background:#e9edf3;color:#111} @media print{html,body{background:#fff}} body{margin:0;padding:12px 14px;} .sheet .p,.sheet .fp,.sheet .jp{word-spacing:.25em} body{font-family:"Nanum Myeongjo","AppleMyungjo","Batang",serif;font-size:12px;line-height:1.35}
.two{display:grid;grid-template-columns:840px 840px;gap:22px;align-items:start;justify-content:start}
.two>div{min-width:0} .two .ch{display:flex;align-items:center;gap:8px;font:700 13px -apple-system,system-ui,sans-serif;color:#4b5563;margin:0 0 10px;height:22px} .two .ch{white-space:nowrap} .two .ch i{font-style:normal;padding:1px 9px;border-radius:4px;background:#fff;border:1px solid #d5dbe5} .two .r .ch i{background:#fff8e6;color:#7c4a03;border-color:#f3d9a4}
.sheet{width:600px} .pagebreak{height:0;border-top:2px dashed #cbd5e1;margin:22px 0 18px;position:relative} .pagebreak::after{content:"다음 장";position:absolute;right:0;top:-9px;font:11px -apple-system,system-ui,sans-serif;color:#94a3b8;background:#fff;padding:0 6px}
.meta{font-size:10.5px;color:#555;margin:0 0 4px} .meta.r{text-align:right;margin-top:4px} .ftt{text-align:center;font-size:20px;letter-spacing:.3em;margin:6px 0 12px;font-weight:400}
table.ft{table-layout:fixed;border-collapse:collapse;width:600px;margin:0 0 8px} table.ft td,table.ft th{border:1px solid #111;padding:2px 5px;vertical-align:middle;word-break:keep-all;overflow:hidden} table.ft th{font-weight:400;text-align:center;background:#fff} table.ft td.rel{position:relative}
table.ft td[data-k="0-9-1"] .p{white-space:nowrap} table.ft td[data-k="0-1-3"] .p{white-space:nowrap;word-spacing:0}
table.ft td .p{margin:0;min-height:18px;line-height:18px;position:relative} table.ft td .p.c{text-align:center} table.ft.jlist td,table.ft.jlist th{border-color:#222}
.hd1{position:relative;height:34px;line-height:34px} .hd1 .fs{font-size:11.3px;position:absolute;left:0;top:0} .hd1 .ttl{display:block;text-align:center;font-size:21.2px;font-weight:700;letter-spacing:.2em} .hd2{display:flex;justify-content:space-between;align-items:center;font-size:12.7px;line-height:26px;padding:2px 2px 2px 0} .hd2 .pen{letter-spacing:.3em}
table.ft.sample .simg{display:block;height:22px;margin:2px auto}
.fp{margin:4px 0;line-height:1.7} .fp.ind{text-indent:1em} .fp.note{font-size:11px;margin-top:10px}
.pen{color:#d8261c;font-weight:400;font-family:"Pretendard","Apple SD Gothic Neo",sans-serif}
input.fx{font:12.5px -apple-system,system-ui,sans-serif;height:20px;line-height:20px;padding:0 6px;border:1px solid #c4ccd8;border-radius:4px;background:#fff;color:#111;box-sizing:border-box;vertical-align:middle;min-width:0} input.fx::placeholder{color:#9ca3af}
input.fx.d{width:100%;height:30px;text-align:center;padding:0;border:0;background:transparent;font-size:16px;font-weight:400;color:#d8261c} input.fx.d::placeholder{color:#d1d5db;font-size:11px;font-weight:400}
input.fx.kn{background:#eef4ff;border-color:#9db4e6;color:#1e40af;font-weight:400} input.fx.kn::placeholder{color:#9ca3af}
.two .ch em.kn{font-style:normal;background:#eef4ff;border:1px solid #9db4e6;color:#1e40af;border-radius:4px;padding:0 5px;font-size:11.5px}
.two .l{position:relative} .pop{position:absolute;z-index:5;display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;border:1px solid #9db4e6;background:#f5f8ff;border-radius:8px;box-shadow:0 4px 14px rgba(30,64,175,.15);font-family:-apple-system,system-ui,sans-serif} .pop[hidden]{display:none} .pop label{font-size:12.5px;font-weight:700;color:#111} .pop input.a{width:140px;height:26px;font-size:15px;text-align:right;padding:0 8px;background:#fff;color:#111;font-weight:700} .pop .han{font-size:12px;color:#d8261c;min-width:140px} .pop small{font-size:11px;color:#6b7280}
@media print{.two{display:block;zoom:1!important} .two .r,.two .ch,.pop,.slot,.pagebreak{display:none!important} .pagebreak{break-after:page} input.fx{border:0!important;background:transparent!important;color:#111!important;font-weight:400;padding:0 2px} input.fx::placeholder{color:transparent} input.fx.d{color:#111!important}}
.circ{display:inline-block;box-sizing:border-box;width:12px;height:12px;line-height:10px;font-size:8.5px!important;border:1px solid #111;border-radius:50%;text-align:center;text-indent:0;vertical-align:-1px;white-space:nowrap;letter-spacing:0} .circ.ab{position:absolute;top:50%;margin-top:-6px} .mk{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:12px;color:#111;white-space:nowrap} .mk.circ{margin:0}
@media print{.circ{border-color:#000}}
table.ft td.vlab{text-align:center;vertical-align:middle;line-height:16px;font-size:14.1px;padding:3px 0}
.sp{display:inline-block} b.fixv{font-family:-apple-system,system-ui,sans-serif;font-weight:400;color:#111}
.nm{position:relative} .nm .ov{position:absolute;left:2px;top:50%;transform:translateY(-50%)} .nm .ov.ov2{display:block;line-height:15px;font-size:11.5px} .nm span.ov{line-height:15px;white-space:normal;word-break:keep-all} .circ{position:relative} .circ .seal{right:auto;left:50%;margin-left:-13px;white-space:normal;line-height:1.1}
.fp{line-height:22px;min-height:22px} .fp :is(b.fixv,.pen){line-height:1} .fp input.fx{height:20px}
.gq{display:flex!important;justify-content:space-between;align-items:baseline;padding:0 7px;white-space:nowrap;font-size:12.7px} .gq .back b,.back b.fixv,.back .pen,.back .sheet b:not(.fixv){font-weight:400!important} .sheet .back b:not(.fixv){font-weight:400}
.paper{width:840.0px;height:1188.0px;box-sizing:border-box;padding:46.0px 120.0px;background:#fff;box-shadow:0 0 0 1px #cfd6e2,0 3px 10px rgba(15,23,42,.10);margin:0 0 24px;overflow:hidden} .pno{float:right;margin:-32px -104px 0 0;font:11px -apple-system,system-ui,sans-serif;color:#94a3b8}
@media print{@page{size:A4;margin:0} .paper{zoom:0.9449;box-shadow:none;margin:0;break-after:page} .pno{display:none}}
input.fxc{width:12px;height:12px;margin:0 3px 0 0}
.glab{display:inline-block;white-space:nowrap;overflow:visible}
.paper.pj{padding:140.0px 120.0px 119.9px 120.0px} .paper.pj .pno{margin-top:-126px} .jp{margin:0;white-space:normal;word-break:keep-all;position:relative} p.jp :is(b.fixv,.pen){line-height:1;display:inline-block;vertical-align:baseline} p.jp input.fx{height:18px;vertical-align:-3px} p.jp input.fx.big{height:26px;font-size:14px;vertical-align:middle;margin:-6px 0;padding:0 8px;position:relative;top:-1px} p.jp input.fx.big.c{text-align:center;padding:0 4px} .jp.c{text-align:center} .jp.jr{display:flex;align-items:center;gap:3px} table.ft.jt td{padding:0 4px}  table.ft.jt input.fx{height:20px}
.sheet b{font-weight:400} .sheet table.sample tr:first-child b{font-weight:800} .sheet table.main tr:nth-child(11) b,.sheet table.main tr:nth-child(13) b{font-weight:800}  /* 굵게는 기재 사례 제목만(사용자 지시) */
input.fxc{width:13px;height:13px;vertical-align:-2px;margin:0 3px 0 0;accent-color:#d8261c}
.seal{position:absolute;right:4px;top:50%;margin-top:-13px;width:26px;height:26px;border:1.5px solid #d8261c;border-radius:50%;color:#d8261c;font:800 8px/1.1 "Pretendard",sans-serif;display:grid;place-items:center;text-align:center;transform:rotate(-6deg);background:rgba(216,38,28,.04);padding:2px;box-sizing:border-box;word-break:break-all} .seal.dim{border-style:dashed;opacity:.5}
.slot{position:absolute;right:4px;top:50%;margin-top:-13px;width:26px;height:26px;border:1.5px dashed #d8261c;border-radius:50%;color:#d8261c;font:10px/26px sans-serif;text-align:center;opacity:.7}
'''
TYPES = [('self', '본인'), ('proxy', '대리인'), ('corp', '법인'), ('corpproxy', '법인 대리인'), ('joint', '공동입찰'), ('jointproxy', '공동입찰 대리인')]
for key, name in TYPES:
    L = sheet(key, True); R = sheet(key, False)
    if key.startswith('joint'):
        L += joint_forms(True, key); R += joint_forms(False, key)
    paper = lambda h: ''.join(f'<div class="paper{" pj" if "data-joint" in x else ""}"><span class="pno">{i + 1}쪽 · A4</span>{x}</div>' for i, x in enumerate(h.split('<div class="pagebreak"></div>')))
    L = paper(L); R = paper(R)
    if key in ('self', 'corp', 'joint'):   # 뒷면 위임장이 필요 없는 경우 — 뒷면은 빈 채 두되 보기만(안내)
        pass
    page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap"><style>{CSS}</style><script>const fitz=()=>{{document.documentElement.style.zoom=Math.min(1,(window.innerWidth-2)/1732)}};fitz();addEventListener('resize',fitz);const H=['','일','이','삼','사','오','육','칠','팔','구'],U=['','십','백','천'],B=['','만','억','조'];
const han=n=>{{if(!n)return '';let s='',i=0;while(n>0){{let p=n%10000,t='';for(let j=0;j<4;j++){{const d=p%10;if(d)t=(d===1&&j>0?'':H[d])+U[j]+t;p=Math.floor(p/10)}}if(t)s=t+B[i]+s;n=Math.floor(n/10000);i++}}return s+'원'}};
const ROW={{dep:['보증금액','⟦depnote⟧'],bid:['입찰가격','⟦bidnote⟧']}};
const cells=k=>[...document.querySelectorAll('input.d[data-row='+k+']')];
const numOf=k=>+(cells(k).map(c=>c.value).join('')||0);
const toCells=(k,n)=>{{const ds=String(n||'').split('');const cs=cells(k);cs.forEach((c,i)=>{{const j=i-(cs.length-ds.length);c.value=n&&j>=0?ds[j]:'';c.placeholder=n?'':'입력'}})}};
let popK='';const pop=()=>document.getElementById('pop'),popA=()=>document.getElementById('popA');
const showPop=k=>{{const cs=cells(k);if(!cs.length)return;popK=k;const tr=cs[0].closest('tr'),tb=tr.closest('table'),sh=tb.closest('.sheet');const P=pop();P.hidden=false;P.style.left=(sh.offsetLeft+tb.offsetLeft+34)+'px';P.style.top=(sh.offsetTop+tb.offsetTop+tr.offsetTop+tr.offsetHeight+2)+'px';document.getElementById('popL').textContent=ROW[k][0];document.getElementById('popN').textContent=ROW[k][1];syncPop()}};
const syncPop=()=>{{if(!popK)return;const n=numOf(popK);const A=popA();if(document.activeElement!==A)A.value=n?n.toLocaleString('ko-KR'):'';document.getElementById('popH').textContent=han(n)}};
let hideT=0;const hidePop=()=>{{hideT=setTimeout(()=>{{const P=pop();if(!P.contains(document.activeElement)&&!(document.activeElement&&document.activeElement.dataset.row))P.hidden=true}},150)}};
const sizeNm=()=>document.querySelectorAll('.nm').forEach(n=>{{const c=n.querySelector('.circ'),i=n.querySelector('.ov');if(c&&i)i.style.width=Math.max(60,c.offsetLeft-12)+'px'}});
addEventListener('DOMContentLoaded',()=>{{
  document.querySelectorAll('input.kn').forEach(i=>{{if(!i.value){{i.classList.remove('kn');i.placeholder='입력';i.removeAttribute('title')}}}});
  sizeNm(); try{{new ResizeObserver(sizeNm).observe(document.body)}}catch(e){{}}
  document.querySelectorAll('input.d[data-row]').forEach(c=>{{
    c.addEventListener('focus',()=>{{clearTimeout(hideT);showPop(c.dataset.row);c.select()}});c.addEventListener('blur',hidePop);
    c.addEventListener('input',()=>{{const v=c.value.replace(/[^0-9]/g,'').slice(-1);c.value=v;const cs=cells(c.dataset.row),i=cs.indexOf(c);if(v&&cs[i+1])cs[i+1].focus();syncPop()}});
    c.addEventListener('keydown',e=>{{const cs=cells(c.dataset.row),i=cs.indexOf(c);if(e.key==='Backspace'&&!c.value&&cs[i-1]){{cs[i-1].focus()}}if(e.key==='ArrowLeft'&&cs[i-1])cs[i-1].focus();if(e.key==='ArrowRight'&&cs[i+1])cs[i+1].focus()}});
  }});
  const A=popA();if(A){{A.addEventListener('focus',()=>clearTimeout(hideT));A.addEventListener('blur',hidePop);A.addEventListener('input',()=>{{const n=+(A.value.replace(/[^0-9]/g,''))||0;A.value=n?n.toLocaleString('ko-KR'):'';toCells(popK,n);document.getElementById('popH').textContent=han(n)}})}}
  // 같은 키(data-f)는 모든 서류에서 같이
  document.querySelectorAll('input[data-f]').forEach(i=>i.addEventListener('input',()=>{{document.querySelectorAll('input[data-f="'+i.dataset.f+'"]').forEach(o=>{{if(o!==i)o.value=i.value}})}}));
  ['dep','bid'].forEach(k=>cells(k).forEach(c=>{{if(numOf(k))c.placeholder=''}}));
}});
</script></head><body>
<div class="two"><div class="l"><div class="ch"><i>내가 쓸 것</i><em class="kn">파란칸</em> 자동 채움 · 고칠 수 있음 · 같은 칸은 모든 서류에 같이</div><div class="sheet">{L}</div><div class="pop" id="pop" hidden><label id="popL"></label><input class="fx a" id="popA" inputmode="numeric"><b class="han" id="popH"></b><small id="popN"></small></div></div>
<div class="r"><div class="ch"><i>보기</i>예시 — 빨간 글씨(가상 인물 · 이 물건 값)</div><div class="sheet">{R}</div></div></div></body></html>'''
    open(f'{OUT}/bid-{key}.html', 'w', encoding='utf-8').write(page)
    print('wrote', key, len(page) // 1024, 'KB')

# ===== 채운 docx 내려받기 — 원본 칸마다 문단 id(w14:paraId) 표. 웹이 이 표로 원본 document.xml 에 글만 끼운다 =====
import json
PID = '{http://schemas.microsoft.com/office/word/2010/wordml}paraId'
fillmap = {'cells': {}, 'paras': {}}
for ti in (0, 2, 3):
    for ri, tr in enumerate(tables[ti].findall('w:tr', NS)):
        for ci, tc in enumerate(tr.findall('w:tc', NS)):
            fillmap['cells'][f'{ti}-{ri}-{ci}'] = [p.get(PID) for p in tc.findall('w:p', NS)]
for kind, el in flow:
    if kind != 'p': continue
    t = ptext(el)
    if '지방법원' in t and '타경' in t: fillmap['paras']['poaCase'] = el.get(PID)
    elif t.strip() == '지방법원 귀중': fillmap['paras']['poaCourt'] = el.get(PID)
open(os.path.join(OUT, 'bid-fill.json'), 'w', encoding='utf-8').write(json.dumps(fillmap, ensure_ascii=False))
print('wrote bid-fill.json', len(fillmap['cells']), 'cells', fillmap['paras'])
