# 이용가이드 장별 HTML 영상(public/guide/clip)에 음량 조절 넣기 — 새 판으로 덮어쓴 뒤
#   python3 scripts/guide-clip-volume.py public/guide/clip/<파일>.html
# 스피커 단추에 마우스를 올리면 위로 세로 음량 막대가 뜬다(누르면 음소거)(2026-11-22). 여러 번 돌려도 같은 결과(넣은 것을 지우고 다시 넣음).
import re, sys, pathlib

CSS = """<style id="volcss">
/* 음량 — 스피커 단추 위 세로 막대(모든 장 공통) */
.volw{position:relative;display:flex;align-items:center;flex:none}
.volpop{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);padding:0 0 8px;display:none;z-index:120}
.volw:hover .volpop{display:block}   /* 마우스를 올리면 뜬다 · 스피커를 누르면 음소거 */
.volpop .vbox{width:36px;height:116px;border-radius:8px;background:rgba(10,16,34,.88);box-shadow:0 4px 14px rgba(0,0,0,.3);position:relative}
#vol{-webkit-appearance:none;appearance:none;position:absolute;left:50%;top:50%;width:92px;height:20px;margin:0;padding:0;background:transparent;cursor:pointer;transform:translate(-50%,-50%) rotate(-90deg)}
#vol::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,#f3700a var(--v,100%),rgba(255,255,255,.3) var(--v,100%))}
#vol::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.3)}
#vol::-moz-range-progress{height:4px;border-radius:2px;background:#f3700a}
#vol::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:#fff;border:0}
#vol::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:0}
#vol:focus-visible{outline:2px solid #f3700a;outline-offset:2px}
#bVoc,#vc{display:none!important}   /* 음성 안내 단추 · 아이콘은 모든 장에서 뺌(V 키는 그대로) */
</style>
"""

JS = """<script id="voljs">
/* 음량 — 소리가 스피커로 나가기 직전에 음량 한 칸(GainNode)을 끼워 전체 음량을 조절한다.
   장마다 소리 코드가 달라도 같게 듣도록 AudioNode.connect(destination) 만 가로챈다. 고른 음량은 모든 장이 같이 쓴다(이 브라우저에만). */
(function(){
  var KEY='myturnClipVol',V=1;
  try{var s=localStorage.getItem(KEY);if(s!==null&&!isNaN(+s))V=Math.max(0,Math.min(1,+s))}catch(e){}
  var gainOf=function(v){return v*v};                       // 귀에 고르게 들리도록 제곱
  var masters=[];
  if(window.AudioNode&&window.AudioDestinationNode){
    var orig=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(dst){
      if(dst instanceof AudioDestinationNode){
        var m=null;for(var i=0;i<masters.length;i++)if(masters[i][0]===dst)m=masters[i][1];
        if(!m){m=dst.context.createGain();m.gain.value=gainOf(V);orig.call(m,dst);masters.push([dst,m])}
        var a=Array.prototype.slice.call(arguments);a[0]=m;return orig.apply(this,a)}
      return orig.apply(this,arguments)};
  }
  if(window.speechSynthesis){var sp=speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak=function(u){try{if(u&&u.text&&u.text.trim())u.volume=(u.volume==null?1:u.volume)*V}catch(e){}return sp(u)}}
  function apply(){masters.forEach(function(p){var m=p[1];try{m.gain.setTargetAtTime(gainOf(V),m.context.currentTime,0.02)}catch(e){m.gain.value=gainOf(V)}})}
  document.addEventListener('DOMContentLoaded',function(){
    var el=document.getElementById('vol'),w=el&&el.closest('.volw');if(!el||!w)return;
    var paint=function(){el.style.setProperty('--v',Math.round(V*100)+'%');el.setAttribute('aria-valuetext','음량 '+Math.round(V*100))};
    el.value=Math.round(V*100);paint();
    var pop=w.querySelector('.volpop');
    ['click','pointerdown','mousedown','touchstart','keydown'].forEach(function(t){pop.addEventListener(t,function(e){e.stopPropagation()})});
    el.addEventListener('input',function(){
      V=Math.max(0,Math.min(1,el.value/100));apply();paint();
      try{localStorage.setItem(KEY,String(V))}catch(e){}
      var h=document.querySelector('button#hint,#hint[role=button]');   // 소리를 아직 안 켰으면 막대를 움직일 때 같이 켬
      if(V>0&&h&&h.offsetParent!==null&&getComputedStyle(h).display!=='none')h.click();
    });
  });
})();
</script>
"""

POP = '<div class="volpop"><div class="vbox"><input id="vol" type="range" min="0" max="100" step="1" value="100" aria-label="음량" title="음량"></div></div>'

def strip(s):
    s = re.sub(r'<style id="volcss">.*?</style>\n', '', s, flags=re.S)
    s = re.sub(r'<script id="voljs">.*?</script>\n', '', s, flags=re.S)
    s = re.sub(r'<div class="volpop">.*?</div></div>', '', s, flags=re.S)
    s = s.replace('<input id="vol" type="range" min="0" max="100" step="1" value="100" aria-label="음량" title="음량">', '')
    s = re.sub(r'<div class="volw">(<button id="(?:snd|bSnd)"[^>]*>.*?</button>)</div>', r'\1', s, flags=re.S)
    return s

def inject(p: pathlib.Path):
    s = strip(p.read_text(encoding='utf-8'))
    m = re.search(r'<button id="(?:snd|bSnd)"[^>]*>.*?</button>', s, re.S)
    assert m, p.name
    s = s[:m.start()] + '<div class="volw">' + m.group(0) + POP + '</div>' + s[m.end():]
    i = re.search(r'^<script[\s>]', s, re.M).start()   # 주석 속 '<script>' 글자는 건너뜀
    s = s[:i] + JS + s[i:]
    j = s.find('</head>')
    if j < 0: j = s.index('<script id="voljs">')
    s = s[:j] + CSS + s[j:]
    p.write_text(s, encoding='utf-8')
    print('ok', p.name)

for a in sys.argv[1:]:
    inject(pathlib.Path(a))
