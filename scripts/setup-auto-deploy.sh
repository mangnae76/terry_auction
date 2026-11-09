#!/bin/bash
# 한 번만 실행: 매뉴얼 자동 배포(launchd 에이전트) 설치.  bash ~/gitsource/terry_auction/scripts/setup-auto-deploy.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.myturn.manual-deploy"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NPX="$(command -v npx || true)"
if [ -z "$NPX" ]; then echo "npx 를 찾지 못했습니다. node 가 잡히는 터미널에서 다시 실행하세요."; exit 1; fi
mkdir -p "$REPO/.manual-deploy" "$HOME/Library/LaunchAgents"
touch "$REPO/.manual-deploy/request" "$REPO/.manual-deploy/done"
EX="$REPO/.git/info/exclude"
if [ -f "$EX" ] && ! grep -qxF '.manual-deploy/' "$EX"; then echo '.manual-deploy/' >> "$EX"; fi
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$REPO/scripts/manual-deploy.sh</string></array>
  <key>WatchPaths</key>
  <array><string>$REPO/.manual-deploy</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH</string>
    <key>HOME</key><string>$HOME</string>
    <key>LANG</key><string>ko_KR.UTF-8</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/myturn-manual-deploy.out</string>
  <key>StandardErrorPath</key><string>/tmp/myturn-manual-deploy.err</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "자동 배포 설치 완료 ($LABEL)"
echo "firebase 로그인 확인:"
"$NPX" --yes firebase-tools login:list || echo "로그인이 필요하면 터미널에서: npx firebase-tools login"
