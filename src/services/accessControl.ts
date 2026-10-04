// 이 앱을 쓸 수 있는 계정.
//
// 화면 차단(라우터 가드)은 눈가림일 뿐이고, 진짜 차단은 firestore.rules가 한다.
// 여기 목록을 고치면 firestore.rules의 isAllowedUser()도 같이 고치고 다시 배포해야 한다.
export const ALLOWED_EMAILS = ['dark_0417@nate.com', 'mangnae760723@gmail.com'];

export const isAllowedEmail = (email?: string | null): boolean => {
  const normalized = (email ?? '').trim().toLowerCase();
  return normalized.length > 0 && ALLOWED_EMAILS.includes(normalized);
};

// 전체 강제 로그아웃 기준 시각.
// 이 시각보다 전에 로그인한 세션은 앱이 뜨는 순간 끊는다.
// 서버에서 토큰을 폐기하려면 Admin 자격증명이 필요한데 그게 없어서,
// 앱 쪽에서 '언제 로그인한 세션까지 무효로 볼지'를 정해 두는 방식으로 끊는다.
// 다시 전원을 내보내려면 이 값을 지금 시각으로 올리고 배포하면 된다.
export const FORCE_LOGOUT_BEFORE = Date.parse('2026-10-04T23:48:56+09:00');

/** 이 세션을 끊어야 하는가 — lastSignInTime이 기준보다 앞서면 끊는다 */
export const isStaleSession = (lastSignInTime?: string | null): boolean => {
  if (!FORCE_LOGOUT_BEFORE) return false;
  const signedInAt = Date.parse(lastSignInTime ?? '');
  // 로그인 시각을 읽지 못하면 안전한 쪽(끊는다)으로 간다
  if (!Number.isFinite(signedInAt)) return true;
  return signedInAt < FORCE_LOGOUT_BEFORE;
};
