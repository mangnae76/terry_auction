# 이용가이드 장별 HTML 영상 — 원본

public/guide/clip 의 파일들. 사용자가 만든 영상 원본을 고치지 않고 그대로 둔다(백업 겸). 새 판이 오면 같은 이름으로 덮어쓰고 이 표를 고친다.
받은 곳: 구글 드라이브 '02_가이드영상' 폴더(2026-11-16 내려받음).
2026-11-22 모든 장 플레이어 손봄 — ① 스피커 단추에 마우스를 올리면 위로 세로 음량 막대(#vol, 누르면 음소거는 그대로, 고른 값은 localStorage myturnClipVol 로 모든 장 같이) ② 음성 안내 아이콘(#vc 'ElevenLabs Sola') · 낙찰이후 '음성' 글자 단추(#bVoc) 숨김 ③ rights.html 「소리 · 음성 안내 켜기」가 화면 속 같은 id(#hint) 글에 걸려 눌러도 안 켜지던 것 고침. 넣는 스크립트 scripts/guide-clip-volume.py, 고친 뒤엔 guide/index.html 의 CLIP_V 를 올려 브라우저가 새 파일을 받게(head 의 #volcss · 첫 스크립트 앞 #voljs). 새 판으로 덮어쓰면 다시 넣어야 한다.
음성 설정(새로 만들 때) — 솔라 · Eleven v4 · 안정성 0.1 · 유사성 0.8 · 복제 강도 0.
2026-11-17 사용자 요청으로 영상 안 로고 그림만 MYTURN AUCTION(흰 AUCTION)으로 바꿨다. 다른 곳은 그대로. 바꾸기 전 원본은 ~/Downloads/로고교체전_원본_261117/02_가이드영상 에 있다.

| 파일 | 장 | 원본 이름 | 길이 |
|---|---|---|---|
| start.html | 시작하며 | (원본 없음 — 2026-11-23 Claude 가 privacy.html 틀에 장면을 새로 그림, 만드는 스크립트 scripts/guide-clip-src/build-start.py, 음성 솔라 · Eleven v4 · 안정성 0.1 · 유사성 0.8 · 음량 ×1.45, 배경음악은 survey 것) | 1:18 |
| layout.html | 화면 공통 구성 | myturn_guide_common_short.html | 0:57 |
| home.html | 로그인 후 대문 | myturn_login_main_guide_short.html | 0:46 |
| register.html | 물건등록 | myturn_register_guide_short.html | 1:01 |
| list.html | 물건목록 | myturn_card_guide.html | 0:55 |
| basic.html | 물건정보 | myturn_info_guide.html | 1:02 |
| rights.html | 권리분석 | myturn_rights_guide.html | 1:15 |
| survey.html | 손품조사 | myturn_hand_guide.html | 1:18 |
| profit.html | 수익분석 | myturn_profit_guide.html | 0:46 |
| field.html | 임장조사 | myturn_field_guide.html | 0:43 |
| trip.html | 임장경로 | myturn_임장경로_guide.html | 0:39 |
| postwin.html | 낙찰이후 | myturn_guide_낙찰이후_음성_50초.html | 0:50 |
| finance.html | 자금관리 | myturn_fund_guide.html | 0:47 |
| privacy.html | 개인정보 설정 | (원본 없음 — 2026-11-22 Claude 가 finance.html 틀로 만듦, 음성 ElevenLabs Sola · 모델 eleven_v4 · 안정성 0.1 · 유사성 0.8(11-22 다시 만듦, 목소리 음량 ×1.45), 배경음악은 layout 것을 끝 2.5초 줄여 씀) | 0:48 |
