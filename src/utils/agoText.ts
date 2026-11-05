// 얼마 전인지 — '방금 · ○분 전 · ○시간 전 · 날짜 시각'.
// 마이페이지 '최근 작성'과 웹 물건상세 '저장됨 · …' 표시가 같은 말을 쓰게 한곳에 둔다(마이페이지는 앱을 고칠 때 이리로 옮긴다).
import { updateStamp } from '../services/updateStamp';

export const agoText = (at: number | string | Date, now: number = Date.now()): string => {
  const t = at instanceof Date ? at.getTime() : typeof at === 'string' ? new Date(at).getTime() : at;
  if (!Number.isFinite(t)) return '';
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 24 * 60 && new Date(t).toDateString() === new Date(now).toDateString()) return `${Math.floor(m / 60)}시간 전`;
  return updateStamp(t);
};
