// 알림 — '무엇을 언제 알려 줄지'를 여기 한곳에서 정한다.
//
// 화면(NotificationsPage)은 여기서 나온 줄을 그리기만 하고, 켜고 끄는 값은
// 사용자별 설정(userPrefs.alertPrefs)에 담는다. 셈에 쓰는 값은 모두 앱 안에
// 이미 있는 것들이다 — 낙찰일·매각기일·인테리어 일정·사진 용량.
//
// 푸시(FCM)는 아직 붙이지 않았다. 지금은 앱을 열었을 때 보이는 알림이고,
// 푸시를 붙일 때도 보낼 내용은 여기서 그대로 가져다 쓰면 된다.
import type { AuctionDetail } from '../types/auction';
import type { InteriorExpenseRecord } from '../types/finance';
import { shortAddr } from '../utils/address';
import { shortCase } from '../utils/auctionSummary';
import { bidStageOf, hasBidResult } from '../utils/stageLabel';

export type AlertKey =
  | 'balanceDue'
  | 'bidDay'
  | 'acqTax'
  | 'photoQuota'
  | 'interior'
  | 'bidding'
  | 'fieldTrip'
  | 'postWinCheck'
  | 'taxCalendar';

export type AlertTone = 'red' | 'orange' | 'blue' | 'gray';

/** 알림 한 줄 */
export interface AlertItem {
  id: string;
  key: AlertKey;
  /** 한 줄 제목 */
  title: string;
  /** 무엇을 해야 하는지 */
  body: string;
  /** 며칠 남았는지 — 음수면 지났다. 날짜가 없는 알림은 null */
  dday: number | null;
  /** 날짜 칸에 적을 글 */
  when: string;
  /** 어느 집 이야기인지 — 사건번호만으로는 알아보기 어렵다 */
  where?: string;
  tone: AlertTone;
  /** 눌렀을 때 갈 곳 */
  to?: { path: string; query?: Record<string, string> };
}

/** 켜고 끌 수 있는 알림 종류 */
export interface AlertDef {
  key: AlertKey;
  group: string;
  name: string;
  desc: string;
  /** 설정이 없을 때의 값 */
  on: boolean;
}

export const ALERT_GROUPS: Array<{ title: string; note: string }> = [
  { title: '놓치면 손해', note: '돈과 바로 이어지는 기한이다. 꺼 두지 않기를 권한다.' },
  { title: '내가 정한 일정', note: '적어 둔 일정이 지나가고 있을 때 알려 준다.' },
  { title: '세금 달력', note: '해마다 같은 날 돌아오는 신고·납부.' },
];

export const ALERT_DEFS: AlertDef[] = [
  {
    key: 'balanceDue', group: '놓치면 손해', on: true,
    name: '잔금 납부 기한',
    desc: '낙찰일 기준으로 대금지급기한이 다가오면 D-14·7·3·1에 알린다. 놓치면 보증금을 잃는다.',
  },
  {
    key: 'bidDay', group: '놓치면 손해', on: true,
    name: '입찰일(매각기일)',
    desc: '아직 결과가 없는 물건의 매각기일 D-7·3·1과 당일에 알린다.',
  },
  {
    key: 'acqTax', group: '놓치면 손해', on: true,
    name: '취득세 신고·납부',
    desc: '잔금 납부일부터 60일 안에 신고해야 한다. 기한 30일·7일 전에 알린다.',
  },
  {
    key: 'photoQuota', group: '놓치면 손해', on: true,
    name: '사진 용량',
    desc: '한도를 넘으면 오래된 사진이 자동으로 지워진다. 80%를 넘으면 미리 알린다.',
  },
  {
    key: 'interior', group: '내가 정한 일정', on: true,
    name: '인테리어 공정',
    desc: '시작 예정일 하루 전과, 완료 예정일이 지났는데 아직 완료가 아닐 때 알린다.',
  },
  {
    key: 'bidding', group: '내가 정한 일정', on: true,
    name: '업체 비딩 회신',
    desc: '견적을 적어 두지 않은 업체가 사흘 넘게 비어 있으면 알린다.',
  },
  {
    key: 'fieldTrip', group: '내가 정한 일정', on: true,
    name: '임장 예정 물건',
    desc: '매각기일이 가까운데 임장 계획에 담기지 않은 물건을 알린다.',
  },
  {
    key: 'postWinCheck', group: '내가 정한 일정', on: true,
    name: '낙찰당일 체크리스트',
    desc: '낙찰한 지 이틀이 지나도록 당일 할 일을 하나도 체크하지 않았을 때 알린다.',
  },
  {
    key: 'taxCalendar', group: '세금 달력', on: true,
    name: '세금 신고·납부일',
    desc: '6월 1일 기준일, 종합소득세(5월), 재산세(7·9월), 종합부동산세(12월)를 때맞춰 알린다.',
  },
];

export const defaultAlertPrefs = (): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const d of ALERT_DEFS) out[d.key] = d.on;
  return out;
};

/** 설정에 없는 종류는 기본값을 따른다 */
export const alertOn = (prefs: Record<string, boolean> | undefined, key: AlertKey): boolean => {
  const v = prefs?.[key];
  if (typeof v === 'boolean') return v;
  return ALERT_DEFS.find((d) => d.key === key)?.on ?? true;
};

/* ───────── 날짜 셈 ───────── */

const DAY_MS = 24 * 60 * 60 * 1000;
const p2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' · '2026.03.05' · '20260305' 를 모두 받는다 */
export const parseYmd = (raw?: string): Date | null => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return new Date(y, m - 1, d);
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** to 가 from 보다 며칠 뒤인지 — 같은 날이면 0 */
const daysTo = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
const fmt = (d: Date) => `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;

/** D-7 · 오늘 · 3일 지남 */
export const ddayText = (n: number | null): string => {
  if (n === null) return '';
  if (n === 0) return '오늘';
  return n > 0 ? `D-${n}` : `${-n}일 지남`;
};

/** 낙찰일로부터 대금지급기한까지 — 법원 통지가 보통 이 언저리에 떨어진다 */
const BALANCE_DUE_DAYS = 45;
/** 취득일(잔금 납부일)부터 취득세 신고기한까지 */
const ACQ_TAX_DAYS = 60;

const label = (a: AuctionDetail) => shortCase(a) || shortAddr(a.address) || '물건';
/** 제목 아래에 붙일 주소 — 제목이 이미 주소면 겹쳐 적지 않는다 */
const where = (a: AuctionDetail) => {
  const addr = shortAddr(a.address);
  return addr && addr !== label(a) ? addr : '';
};

/* ───────── 알림 만들기 ───────── */

export interface AlertInput {
  auctions: AuctionDetail[];
  interior: InteriorExpenseRecord[];
  /** 지금까지 쓴 사진 용량 (바이트) */
  photoBytes: number;
  photoBudget: number;
  prefs?: Record<string, boolean>;
  /** 시험할 때 날짜를 바꿔 넣는다 */
  today?: Date;
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

export const buildAlerts = (input: AlertInput): AlertItem[] => {
  const today = startOfDay(input.today ?? new Date());
  const prefs = input.prefs;
  const out: AlertItem[] = [];
  const push = (key: AlertKey, item: Omit<AlertItem, 'key'>) => {
    if (!alertOn(prefs, key)) return;
    out.push({ ...item, key });
  };

  for (const a of input.auctions) {
    const stage = bidStageOf(a);
    const won = parseYmd(a.wonDate);
    // 법원 통지서의 기한을 적어 뒀으면 그 날짜가 먼저다 — 비어 있을 때만 낙찰일로 셈한다
    const told = parseYmd(a.balanceDueDate);
    const due = told ?? (won ? addDays(won, BALANCE_DUE_DAYS) : null);

    // 1) 잔금 납부 기한 — 낙찰했고 아직 팔기 전인 물건
    if (due && stage === '낙찰') {
      const d = daysTo(today, due);
      if (d <= 14 && d >= -30) {
        push('balanceDue', {
          id: `balanceDue.${a.id}`,
          title: `${label(a)} 잔금 납부 기한`,
          body: d < 0
            ? '기한이 지났다. 납부하지 않으면 보증금을 잃는다 — 법원 통지서의 기한을 바로 확인하자.'
            : told
              ? '법원이 알려 준 기한이다. 대출 실행과 등기 서류를 함께 맞춰 두자.'
              : `낙찰일로부터 ${BALANCE_DUE_DAYS}일로 어림한 날짜다. 물건상세에 통지서의 기한을 적어 두면 그 날짜로 센다.`,
          dday: d,
          when: fmt(due),
          where: where(a),
          tone: d <= 3 ? 'red' : 'orange',
          to: { path: '/post-win', query: { item: a.id, tab: 'balance' } },
        });
      }
    }

    // 2) 입찰일 — 아직 결과를 적지 않은 물건
    const event = parseYmd(a.eventDate);
    if (event && !hasBidResult(a)) {
      const d = daysTo(today, event);
      if (d >= 0 && d <= 7) {
        push('bidDay', {
          id: `bidDay.${a.id}`,
          title: `${label(a)} 매각기일`,
          body: d === 0 ? '오늘이 입찰일이다. 보증금과 신분증·도장을 챙기자.' : '입찰가 산정과 보증금을 미리 맞춰 두자.',
          dday: d,
          when: fmt(event),
          where: where(a),
          tone: d <= 1 ? 'red' : 'blue',
          to: { path: `/auctions/${a.id}` },
        });
      }
    }

    // 3) 취득세 — 잔금 납부일(취득일)부터 60일
    if (due) {
      const limit = addDays(due, ACQ_TAX_DAYS);
      const d = daysTo(today, limit);
      if (d <= 30 && d >= -30) {
        push('acqTax', {
          id: `acqTax.${a.id}`,
          title: `${label(a)} 취득세 신고·납부`,
          body: d < 0
            ? '기한이 지났다. 늦으면 가산세가 붙는다.'
            : '소유권 이전 등기 전에 신고·납부해야 한다.',
          dday: d,
          when: fmt(limit),
          where: where(a),
          tone: d <= 7 ? 'red' : 'orange',
          to: { path: '/tax' },
        });
      }
    }

    // 4) 임장 예정인데 아직 계획에 안 담긴 물건
    if (a.status === '임장예정' && !a.isFieldTrip && event) {
      const d = daysTo(today, event);
      if (d >= 0 && d <= 21) {
        push('fieldTrip', {
          id: `fieldTrip.${a.id}`,
          title: `${label(a)} 임장 계획 미등록`,
          body: '매각기일이 다가오는데 임장 경로에 담기지 않았다.',
          dday: d,
          when: fmt(event),
          where: where(a),
          tone: 'blue',
          to: { path: '/field-trip' },
        });
      }
    }

    // 5) 낙찰당일 체크리스트를 아직 시작하지 않았을 때
    if (stage === '낙찰' && won) {
      const since = daysTo(won, today);
      const checked = Object.values(a.postWinChecks ?? {}).some(Boolean);
      if (since >= 2 && since <= 14 && !checked) {
        push('postWinCheck', {
          id: `postWinCheck.${a.id}`,
          title: `${label(a)} 낙찰당일 체크리스트`,
          body: '낙찰한 지 며칠 지났는데 당일 할 일을 하나도 체크하지 않았다.',
          dday: null,
          when: `낙찰 ${since}일째`,
          where: where(a),
          tone: 'gray',
          to: { path: '/post-win', query: { item: a.id, tab: 'win' } },
        });
      }
    }
  }

  // 6) 인테리어 공정
  const nameOf = (r: InteriorExpenseRecord) => [r.auctionLabel, r.work].filter(Boolean).join(' · ') || '인테리어';
  for (const r of input.interior) {
    const done = String(r.status ?? '').includes('완료');
    if (r.kind === 'cost' && !done) {
      const start = parseYmd(r.startDate);
      const end = parseYmd(r.endDate);
      if (start) {
        const d = daysTo(today, start);
        if (d >= 0 && d <= 1) {
          push('interior', {
            id: `interior.start.${r.id}`,
            title: `${nameOf(r)} 시작`,
            body: d === 0 ? '오늘 시작하기로 한 공정이다.' : '내일 시작하기로 한 공정이다.',
            dday: d,
            when: fmt(start),
            tone: 'blue',
            to: { path: '/post-win', query: { item: r.auctionId, tab: 'repair' } },
          });
        }
      }
      if (end) {
        const d = daysTo(today, end);
        if (d < 0 && d >= -30) {
          push('interior', {
            id: `interior.end.${r.id}`,
            title: `${nameOf(r)} 완료 예정일 지남`,
            body: '완료 예정일이 지났는데 아직 완료로 적히지 않았다.',
            dday: d,
            when: fmt(end),
            tone: 'orange',
            to: { path: '/post-win', query: { item: r.auctionId, tab: 'repair' } },
          });
        }
      }
    }

    // 7) 업체 비딩 — 견적이 비어 있는 줄
    if (r.kind === 'bid' && !(r.amountWithVat > 0)) {
      const made = r.createdAt ? new Date(r.createdAt) : null;
      if (made && !Number.isNaN(made.getTime())) {
        const since = daysTo(made, today);
        if (since >= 3 && since <= 60) {
          push('bidding', {
            id: `bidding.${r.id}`,
            title: `${r.vendor || '업체'} 견적 미회신`,
            body: `${nameOf(r)} — 견적을 적어 둔 지 ${since}일째 비어 있다.`,
            dday: null,
            when: `${since}일 경과`,
            tone: 'gray',
            to: { path: '/post-win', query: { item: r.auctionId, tab: 'repair' } },
          });
        }
      }
    }
  }

  // 8) 사진 용량
  if (input.photoBudget > 0) {
    const ratio = input.photoBytes / input.photoBudget;
    if (ratio >= 0.8) {
      const pct = Math.round(ratio * 100);
      push('photoQuota', {
        id: 'photoQuota',
        title: `사진 용량 ${pct}%`,
        body: `${mb(input.photoBytes)} / ${mb(input.photoBudget)} — 한도를 넘으면 오래된 사진부터 자동으로 지워진다.`,
        dday: null,
        when: `${pct}% 사용`,
        tone: ratio >= 0.9 ? 'red' : 'orange',
      });
    }
  }

  // 9) 세금 달력
  if (alertOn(prefs, 'taxCalendar')) {
    const y = today.getFullYear();
    const at = (m: number, d: number) => new Date(y, m - 1, d);
    const soldLastYear = input.auctions.some((a) => {
      const s = parseYmd(a.sellDate);
      return s ? s.getFullYear() === y - 1 : false;
    });
    const cal: Array<{ id: string; from: Date; to: Date; title: string; body: string; when: string; skip?: boolean }> = [
      {
        id: 'tax.june1', from: at(5, 10), to: at(5, 31),
        title: '6월 1일 기준일',
        body: '6월 1일에 보유 중인 사람에게 재산세·종합부동산세가 매겨진다. 5월 31일까지 잔금을 받으면 올해분은 빠진다.',
        when: `${y}.05.31`,
      },
      {
        id: 'tax.income', from: at(4, 20), to: at(5, 31),
        title: '종합소득세 확정신고',
        body: `5월 1일~31일. ${y - 1}년에 판 물건의 사업소득을 신고한다.`,
        when: `${y}.05.31`,
        skip: !soldLastYear,
      },
      {
        id: 'tax.property1', from: at(7, 1), to: at(7, 31),
        title: '재산세 납부 (건물분)',
        body: '7월 16일~31일. 6월 1일 기준 보유 중인 물건만 해당한다.',
        when: `${y}.07.31`,
      },
      {
        id: 'tax.property2', from: at(9, 1), to: at(9, 30),
        title: '재산세 납부 (토지분)',
        body: '9월 16일~30일. 6월 1일 기준 보유 중인 물건만 해당한다.',
        when: `${y}.09.30`,
      },
      {
        id: 'tax.comprehensive', from: at(11, 20), to: at(12, 15),
        title: '종합부동산세 납부',
        body: '12월 1일~15일. 6월 1일 기준 보유 주택 공시가 합산 9억원(1세대 1주택 12억원) 초과 시에만 해당한다.',
        when: `${y}.12.15`,
      },
    ];
    for (const c of cal) {
      if (c.skip) continue;
      if (today < c.from || today > c.to) continue;
      const d = daysTo(today, c.to);
      out.push({
        id: c.id, key: 'taxCalendar', title: c.title, body: c.body,
        dday: d, when: c.when, tone: d <= 7 ? 'orange' : 'blue',
        to: { path: '/tax' },
      });
    }
  }

  // 급한 것이 위로 — 날짜 없는 알림은 뒤에 둔다
  const rank: Record<AlertTone, number> = { red: 0, orange: 1, blue: 2, gray: 3 };
  return out.sort((a, b) => {
    if (a.dday === null && b.dday === null) return rank[a.tone] - rank[b.tone];
    if (a.dday === null) return 1;
    if (b.dday === null) return -1;
    return a.dday - b.dday || rank[a.tone] - rank[b.tone];
  });
};
