# 마이턴 옥션 소개 영상 — 웹페이지에 붙이기

이 폴더를 **통째로** 웹서버에 올리면 됩니다(예: `https://도메인/myturn-promo/`).
`index.html`을 더블클릭하면 내 컴퓨터에서도 바로 재생해 볼 수 있습니다.

## 방법 1. 실시간 재생 HTML (이 폴더의 index.html)

영상 파일 대신 브라우저가 화면을 직접 그리고, 소리에 맞춰 움직입니다.
어떤 크기로 띄워도 글자가 선명하고, 받는 용량도 약 4.8MB로 동영상(16MB)보다 작습니다.

```html
<div style="max-width:960px; margin:0 auto;">
  <iframe src="/myturn-promo/index.html" title="마이턴 옥션 소개 영상"
          style="width:100%; aspect-ratio:16/9; border:0; display:block;"
          loading="lazy" allow="autoplay; fullscreen"></iframe>
</div>
```

- 처음에는 썸네일과 「▶ 소개 영상 보기 · 42초」 버튼이 보이고, 누르면 소리와 함께 재생됩니다.
- 화면을 누르면 일시정지/계속, 끝나면 로고 화면에 「다시 보기」가 나옵니다. 오른쪽 위 버튼은 소리 끄기입니다.
- 브라우저가 그리는 방식이라 아주 오래된 휴대폰에서는 조금 끊겨 보일 수 있습니다(소리와 화면 시점은 항상 맞춰짐).

## 방법 2. 동영상 파일 그대로

가장 단순하고 어디서나 똑같이 나옵니다.

```html
<video src="/myturn-promo/media/MYTURN_promo_42s_1080p60.mp4"
       poster="/myturn-promo/media/poster.jpg"
       controls playsinline preload="none"
       style="width:100%; aspect-ratio:16/9; display:block;"></video>
```

## 폴더 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 재생 화면(버튼·일시정지·다시보기) |
| `promo.js`, `promo_data.js` | 영상을 그리는 코드와 로고·박자 데이터 (원본소스의 promo4.js와 같음) |
| `shots/` | 영상에 들어가는 앱 화면 9장 |
| `fonts/` | 영상과 똑같은 글꼴(Noto Sans CJK KR, 영상에 쓰인 글자만 담아 1개당 약 45KB · SIL OFL 무료 글꼴) |
| `media/promo_audio.m4a`, `.mp3` | 소리 (브라우저에 맞는 것을 자동 선택) |
| `media/poster.jpg` | 재생 전 화면(유튜브 썸네일) |
| `media/MYTURN_promo_42s_1080p60.mp4` | 방법 2용 동영상 |

## 올리기 전에 확인할 것

- 끝부분 "MY TURN!" 음성은 **모두의 마블 효과음 원본**입니다. 공개 웹페이지에 올리려면 넷마블 허락이 필요할 수 있습니다.
- 문구를 고치려면 `promo.js`의 `SECTIONS`(기능 6개 문구)를 고치면 됩니다. 새 글자를 넣었는데 글꼴이 다르게 보이면 `fonts/`를 다시 만들어야 합니다(영상에 쓰인 글자만 담겨 있음).
