# git 명령어 모음 (terry_auction)

- 저장소: https://github.com/mangnae76/terry_auction (**공개 저장소**)
- 기본 가지(branch): `main`
- 작업 폴더: `/Users/kang/gitsource/terry_auction`

맨 앞에 `cd /Users/kang/gitsource/terry_auction` 을 한 번 치고 시작하면 그 뒤로는 그냥 붙여 넣으면 된다.

---

## 1. 지금 상태 보기

```bash
git status            # 고친 파일 / 새로 생긴 파일
git status --short    # 짧게 (M=고침, A=새로 추가, ??=아직 git이 모르는 파일)
git diff              # 고친 내용 (아직 담지 않은 것)
git diff --cached     # 담아 둔(staged) 내용
git log --oneline -10 # 최근 커밋 10개
```

---

## 2. 받아오기 (pull)

다른 컴퓨터에서 올린 걸 내려받는다. **작업 시작 전에 먼저 한다.**

```bash
git pull
```

`git pull` 이 거절되면 내 쪽에 저장 안 한 수정이 남아 있다는 뜻이다. 둘 중 하나:

```bash
# (가) 내 수정을 잠깐 치워 두고 받은 뒤 다시 꺼낸다
git stash
git pull
git stash pop

# (나) 내 수정을 버리고 받은 것으로 맞춘다  ※ 되돌릴 수 없다
git reset --hard
git pull
```

---

## 3. 저장하기 (commit)

### 한 줄 메시지

```bash
git add -A
git commit -m "무엇을 왜 바꿨는지"
```

### 여러 줄 메시지 (권장)

```bash
git add -A
git commit -F - <<'MSG'
한 줄 요약 (50자 안쪽)

- 바꾼 것 1
- 바꾼 것 2

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

- `git add -A` = 고친 것 + 새 파일 + 지운 것을 **전부** 담는다.
- 일부만 담으려면 `git add src/pages/MorePage.vue` 처럼 파일을 적는다.
- 메시지는 **무엇을 왜** 바꿨는지 적는다. "수정", "update" 만 적으면 나중에 아무 쓸모가 없다.

---

## 4. 올리기 (push)

```bash
git push
```

처음 만든 가지면 한 번만 이렇게:

```bash
git push -u origin main
```

---

## 5. 한 번에 (가장 많이 쓰는 흐름)

```bash
cd /Users/kang/gitsource/terry_auction
git pull
# ... 작업 ...
git add -A
git commit -m "무엇을 왜 바꿨는지"
git push
```

---

## 6. 올리기 전에 꼭 확인할 것

### 비밀값이 안 들어갔는지

**이 저장소는 공개다.** 올린 키는 전 세계가 본다. 올라간 뒤에 지워도 기록에 남으므로, 실수로 올렸으면 **그 키를 즉시 폐기**해야 한다.

```bash
# 담아 둔 내용에 키 비슷한 게 있는지 훑어본다
git diff --cached | grep -niE "ghp_|github_pat|AIza|serviceKey=|-----BEGIN|password|secret"
```

`.gitignore` 가 이미 막아 두고 있는 것들:

| 가려진 것 | 왜 |
|---|---|
| `.env` | 공공데이터·카카오·파이어베이스 **실제 키** |
| `*.local` | `github-token.local` 등 로컬 비밀 |
| `dist/`, `node_modules/` | 빌드 산출물 |
| `android/app/build/`, `*.keystore`, `*.jks` | 네이티브 빌드물과 **서명키** |
| `docs/*.pdf` | 실제 경매 PDF — 소유자·채무자 **개인정보** |

새로 만든 파일이 여기 해당하면 **올리지 말고** `.gitignore` 에 먼저 추가한다.

### 빌드가 되는지

```bash
npm run build
```

`✓ built` 가 나와야 한다. 타입 오류가 있으면 여기서 걸린다.

> **주의** — `npm run build 2>&1 | tail -3` 처럼 파이프를 붙이면 **빌드가 실패해도 성공으로 보인다**(파이프의 마지막 명령 결과가 남기 때문). 그래서 `&&` 로 배포까지 이어 붙이면 **깨진 빌드가 그대로 올라간다.** 붙여 쓸 때는 `grep -E "✓ built|error TS"` 로 결과를 직접 눈으로 확인한다.

---

## 7. 되돌리기

```bash
# 아직 커밋 안 한 특정 파일의 수정을 버린다
git checkout -- src/pages/MorePage.vue

# 아직 커밋 안 한 수정을 전부 버린다   ※ 되돌릴 수 없다
git reset --hard

# 방금 한 커밋의 메시지만 고친다 (아직 push 안 했을 때만)
git commit --amend -m "새 메시지"

# 방금 한 커밋을 취소하되 고친 내용은 남긴다 (아직 push 안 했을 때만)
git reset --soft HEAD~1
```

**이미 push 한 커밋은 `--amend` 나 `reset` 으로 고치지 않는다.** 다른 컴퓨터의 기록과 어긋난다. 대신 되돌리는 커밋을 새로 만든다:

```bash
git revert <커밋해시>
```

---

## 8. 가지(branch)

지금은 `main` 하나로만 쓰고 있다. 큰 작업을 따로 하고 싶을 때:

```bash
git switch -c feat/이름      # 새 가지를 만들고 그리로 간다
git switch main              # main 으로 돌아온다
git branch                   # 가지 목록
git push -u origin feat/이름 # 새 가지를 처음 올릴 때
```

---

## 9. 배포는 git 과 별개다

`git push` 는 **소스만** 올린다. 실제 서비스에 반영하려면 따로 배포해야 한다.

```bash
# 웹 (https://terryauction-6b374.web.app)
npm run build
npx -y firebase-tools deploy --only hosting

# 파이어스토어 보안 규칙까지 같이
npx -y firebase-tools deploy --only hosting,firestore:rules

# 안드로이드 APK
npm run build
npx cap sync android
cd android
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ./gradlew assembleDebug
# 결과물: android/app/build/outputs/apk/debug/GoldenBoyAuction-debug.apk

# 에뮬레이터/폰에 설치
~/Library/Android/sdk/platform-tools/adb install -r \
  android/app/build/outputs/apk/debug/GoldenBoyAuction-debug.apk
```

`firebase` 는 따로 설치돼 있지 않다. 반드시 `npx -y firebase-tools` 로 부른다.
