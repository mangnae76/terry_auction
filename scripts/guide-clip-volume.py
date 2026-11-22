# 이용가이드 장별 HTML 영상(public/guide/clip)에 음량 막대 넣기 — 새 판으로 덮어쓴 뒤 python3 scripts/guide-clip-volume.py public/guide/clip/<파일>.html
import re, sys, pathlib

CSS = """<style id="volcss">
/* 음량 막대 — 2026-11-22 모든 장 공통(소리 단추 오른쪽) */
#vol{-webkit-appearance:none;appearance:none;width:80px;height:18px;margin:0 4px 0 0;padding:0;background:transparent;cursor:pointer;flex:none}
#vol::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,#f3700a var(--v,100%),rgba(255,255,255,.3) var(--v,100%))}
#vol::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.3)}
#vol::-moz-range-progress{height:4px;border-radius:2px;background:#f3700a}
#vol::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:#fff;border:0}
#vol::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:0}
#vol:focus-visible{outline:2px solid #f3700a;outline-offset:2px}
</style>
"""

JS = """<script id="voljs">
/* 음량 막대 — 소리가 스피커로 나가기 직전에 음량 한 칸(GainNode)을 끼워 전체 음량을 조절한다.
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
    var el=document.getElementById('vol');if(!el)return;
    var paint=function(){el.style.setProperty('--v',Math.round(V*100)+'%');el.setAttribute('aria-valuetext','음량 '+Math.round(V*100))};
    el.value=Math.round(V*100);paint();
    ['click','pointerdown','mousedown','touchstart','keydown'].forEach(function(t){el.addEventListener(t,function(e){e.stopPropagation()})});
    el.addEventListener('input',function(){
      V=Math.max(0,Math.min(1,el.value/100));apply();paint();
      try{localStorage.setItem(KEY,String(V))}catch(e){}
      var h=document.querySelector('button#hint,#hint[role=button]');                 // 소리를 아직 안 켰으면 막대를 움직일 때 같이 켬
      if(V>0&&h&&h.offsetParent!==null&&getComputedStyle(h).display!=='none')h.click();
    });
  });
})();
</script>
"""

INPUT = '<input id="vol" type="range" min="0" max="100" step="1" value="100" aria-label="음량" title="음량">'

def inject(p: pathlib.Path):
    s = p.read_text(encoding='utf-8')
    if 'id="vol"' in s:
        print('skip', p.name); return
    # 1) 막대 — 소리 단추(#snd 또는 #bSnd) 바로 뒤
    m = re.search(r'<button id="(?:snd|bSnd)"[^>]*>.*?</button>', s, re.S)
    assert m, p.name
    s = s[:m.end()] + INPUT + s[m.end():]
    # 2) 스크립트 — 첫 <script> 앞(소리 코드보다 먼저)
    i = re.search(r'^<script[\s>]', s, re.M).start()   # 주석 속 '<script>' 글자는 건너뜀
    s = s[:i] + JS + s[i:]
    # 3) 꾸밈 — </head> 앞, 없으면 첫 <script id="voljs"> 앞
    j = s.find('</head>')
    if j < 0: j = s.index('<script id="voljs">')
    s = s[:j] + CSS + s[j:]
    p.write_text(s, encoding='utf-8')
    print('ok', p.name)

for a in sys.argv[1:]:
    inject(pathlib.Path(a))
