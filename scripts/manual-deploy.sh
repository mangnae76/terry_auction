#!/bin/zsh
# 마이턴 매뉴얼 자동 배포 — launchd(com.myturn.manual-deploy)가 .manual-deploy 폴더가 바뀔 때 실행한다.
# .manual-deploy/request 내용이 .manual-deploy/done 과 다를 때만 빌드·배포하고, 결과를 log.txt 에 남긴다.
REPO="${0:A:h:h}"
Q="$REPO/.manual-deploy"
LOCK="/tmp/myturn-manual-deploy.lock"
mkdir -p "$Q"
# 30분 넘은 잠금은 끊긴 것으로 보고 지운다
if [[ -d "$LOCK" ]] && [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]]; then rmdir "$LOCK" 2>/dev/null; fi
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
cd "$REPO" || exit 1
while true; do
  req="$(cat "$Q/request" 2>/dev/null)"
  fin="$(cat "$Q/done" 2>/dev/null)"
  [[ -z "$req" || "$req" == "$fin" ]] && break
  {
    echo "request: $req"
    echo "start: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "commit: $(git rev-parse --short HEAD 2>/dev/null)"
    echo "manuals: $(cd web/manual 2>/dev/null && ls *.html 2>/dev/null | tr '\n' ' ')"
    # 앱 쪽에 커밋 안 된 변경이 있으면 작업 중인 코드가 나가지 않도록 멈춘다(web/manual 은 제외)
    dirty="$(git status --porcelain --untracked-files=no -- . ':(exclude)web/manual' 2>/dev/null)"
    if [[ -n "$dirty" ]]; then
      echo "blocked: 저장소에 커밋 안 된 변경이 있어 배포하지 않았습니다"
      echo "$dirty"
      rc=2
    else
      npm run build && npx --yes firebase-tools deploy --only hosting --non-interactive
      rc=$?
    fi
    echo "exit: $rc"
    echo "end: $(date '+%Y-%m-%d %H:%M:%S')"
  } > "$Q/log.txt" 2>&1
  print -r -- "$req" > "$Q/done"
done
