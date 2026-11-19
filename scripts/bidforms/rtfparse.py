# 작은 RTF 해석기 — 법원 공동입찰신고서 · 공동입찰자목록(A3364 · A3365) 원본 구조를 그대로 꺼낸다
# 결과: blocks = [('p', props, runs) | ('tbl', rows) | ('pb',)], sect = 용지 · 여백
import re

SKIP = {'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'listtable', 'listoverridetable', 'rsidtbl', 'generator',
        'latentstyles', 'themedata', 'colorschememapping', 'datastore', 'xmlnstbl', 'mmathPr', 'pnseclvl', 'pntxta', 'pntxtb',
        'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'filetbl', 'revtbl', 'pgdsctbl', 'listpicture', 'object', 'shp', 'nonshppict', 'fldinst'}
TOK = re.compile(r"\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\(.)|([{}])|([^\\{}\r\n]+)|[\r\n]+")

def parse(raw):
    s = raw.decode('latin-1')
    blocks = []; sect = {}
    st = [dict(fs=24, b=False, ul=False, skip=False, uc=1, f=0)]
    pp = {}; para_runs = []; bytebuf = bytearray()
    cell_paras = []; cells = []; row_def = None; cur_def = None; rows = []
    in_tbl = False; ucskip = 0
    def flush_bytes():
        nonlocal bytebuf
        if bytebuf:
            try: t = bytes(bytebuf).decode('cp949')
            except UnicodeDecodeError: t = bytes(bytebuf).decode('latin-1')   # 한 바이트 기호(× 등)
            add_text(t); bytebuf = bytearray()
    def add_text(t):
        g = st[-1]
        if g['skip'] or not t: return
        k = (g['fs'], g['b'], g['ul'], g['f'])
        if para_runs and para_runs[-1][1:] == k: para_runs[-1] = (para_runs[-1][0] + t,) + k
        else: para_runs.append((t,) + k)
    def end_para():
        nonlocal para_runs
        flush_bytes()
        p = ('p', dict(pp, _fs=st[-1]['fs']), para_runs); para_runs = []
        if pp.get('intbl'): cell_paras.append(p)
        else: blocks.append(p)
    newdef = lambda: dict(cellx=[], trrh=0, cells=[], cur=dict(b={}))
    for m in TOK.finditer(s):
        word, num, hx, sym, brace, text = m.groups()
        g = st[-1]
        if brace == '{':
            flush_bytes(); st.append(dict(g, star=False)); continue
        if brace == '}':
            flush_bytes()
            if len(st) > 1: st.pop()
            continue
        if hx:
            if ucskip: ucskip -= 1; continue
            if not g['skip']: bytebuf.append(int(hx, 16))
            continue
        if text is not None:
            if g['skip']: continue
            flush_bytes(); add_text(text); continue
        if sym is not None:
            if sym == '*': g['skip'] = True
            elif sym in '\\{}': flush_bytes(); add_text(sym)
            elif sym == '~': flush_bytes(); add_text('\u00a0')
            continue
        if word is None: continue
        n = int(num) if num is not None else None
        if word in SKIP: g['skip'] = True; continue
        if g['skip']: continue
        if word == 'u':
            flush_bytes(); add_text(chr(n % 65536)); ucskip = g.get('uc', 1); continue
        if word == 'uc': g['uc'] = n; continue
        flush_bytes()
        # 구역(용지 · 여백)
        if word in ('paperw', 'paperh', 'margl', 'margr', 'margt', 'margb'): sect[word] = n; continue
        if word in ('sect', 'page'):
            blocks.append(('pb',)); continue
        # 글자
        if word == 'fs': g['fs'] = n; continue
        if word == 'f': g['f'] = n; continue
        if word == 'b': g['b'] = (n != 0); continue
        if word == 'ul': g['ul'] = (n != 0); continue
        if word == 'ulnone': g['ul'] = False; continue
        if word == 'plain': g['fs'] = 24; g['b'] = False; g['ul'] = False; g['f'] = 0; continue
        if word == 'tab': add_text('\t'); continue
        if word == 'line': add_text('\n'); continue
        # 문단
        if word == 'pard': pp = {}; continue
        if word in ('ql', 'qc', 'qr', 'qj', 'qd'): pp['al'] = word; continue
        if word in ('li', 'ri', 'fi', 'sb', 'sa', 'sl', 'slmult'): pp[word] = n; continue
        if word == 'intbl': pp['intbl'] = True; continue
        if word == 'itap': pp['itap'] = n; (pp.__setitem__('intbl', True) if n else None); continue
        if word == 'par': end_para(); continue
        # 표 행 정의
        if word == 'trowd': cur_def = newdef(); continue
        if cur_def is not None:
            if word == 'trrh': cur_def['trrh'] = n; continue
            if word in ('clvmgf', 'clvmrg'): cur_def['cur'][word] = True; continue
            if word in ('clvertalt', 'clvertalc', 'clvertalb'): cur_def['cur']['va'] = word[-1]; continue
            if word in ('clbrdrt', 'clbrdrb', 'clbrdrl', 'clbrdrr'): cur_def['cur']['_side'] = word[-1]; cur_def['cur']['b'][word[-1]] = {'w': 0, 'k': 's'}; continue
            if word.startswith('brdr') and '_side' in cur_def['cur']:
                bd = cur_def['cur']['b'][cur_def['cur']['_side']]
                if word == 'brdrw': bd['w'] = n
                elif word in ('brdrs', 'brdrdb', 'brdrth', 'brdrnone', 'brdrnil', 'brdrdot', 'brdrdash'): bd['k'] = word[4:]
                continue
            if word == 'cellx':
                c = cur_def['cur']; c.pop('_side', None); c['x'] = n; cur_def['cells'].append(c); cur_def['cur'] = dict(b={}); continue
        if word == 'cell':
            end_para() if para_runs else None
            cells.append(cell_paras); cell_paras = []; continue
        if word == 'row':
            if cur_def is not None: row_def = cur_def
            rows.append(dict(defn=row_def, cells=cells)); cells = []
            if not blocks or blocks[-1][0] != 'tbl': blocks.append(('tbl', []))
            blocks[-1][1].append(rows[-1]); rows = []
            continue
    return blocks, sect
