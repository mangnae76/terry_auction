// 낙찰이후 · 매매사업자 — 등록부터 계좌·카드까지 한 번에 보는 글.
// 꼴은 낙찰당일 표와 같다(묶음 이름 | 내용). 다만 여기서는 체크를 두지 않는다 —
// 물건마다 하는 일이 아니라 한 번 해 두면 되는 일이라서다.
import type { CheckGroup } from './postWinChecklist';

/** 기본 글의 판 — 글을 고쳐 내보낼 때 올린다 (postWinChecklist 와 같은 규칙) */
export const POST_WIN_BIZ_VERSION = 2;

export const POST_WIN_BIZ: CheckGroup[] = [
  {
    key: 'biz.intro',
    title: '매매사업자 등록 및 운영',
    note: '주택을 사서 되파는 일을 되풀이할 생각이면 사업자로 내는 편이 낫다.',
    sections: [
      { label: '신청 대상', rows: [{ id: 'bz.t1', depth: 0, text: '주택을 사서 되파는 사업의 반복성·계획성이 있는 경우' }] },
      {
        label: '업종 코드',
        rows: [
          { id: 'bz.t2', depth: 0, text: '701101 (부동산매매업 – 일반주택매매)' },
          { id: 'bz.t3', depth: 0, text: '703011 (면세사업자) > 이걸로 사업자등록' },
          { id: 'bz.t4', depth: 0, text: '703014 (과세사업자) > 84㎡ 이상 사용, 오피 등 면적 상관없이 과세사업자 > 부가세 발행 가능' },
        ],
      },
      { label: '신청 방법', rows: [{ id: 'bz.t5', depth: 0, text: '① 홈택스 온라인 등록  또는  ② 세무서 방문 신청' }] },
      { label: '등록 시점', rows: [{ id: 'bz.t6', depth: 0, text: '주택 매입 전 or 첫 거래 전 등록 권장' }] },
    ],
  },
  {
    key: 'biz.step1',
    title: '1단계 · 온라인 등록 (홈택스)',
    sections: [
      {
        label: '홈택스',
        href: 'https://www.hometax.go.kr/',
        rows: [
          { id: 'bz.s1a', depth: 0, text: '홈택스 접속' },
          { id: 'bz.s1b', depth: 0, text: '민원증명 > 사업자등록 신청' },
          { id: 'bz.s1c', depth: 0, text: '개인사업자 선택 → 업종 코드 703011 체크 — 주거용 건물 매매업(부동산매매업)' },
          { id: 'bz.s1d', depth: 0, text: '종목을 "주거용 건물 매매업"으로 변경' },
        ],
      },
      {
        label: '필요 서류',
        rows: [
          { id: 'bz.s1e', depth: 0, text: '신분증 사본' },
          { id: 'bz.s1f', depth: 0, text: '임대차 계약서 (사무실 주소) or 본인 자택' },
          { id: 'bz.s1g', depth: 0, text: '사업 개시일, 예상 수입 등 입력' },
        ],
      },
      { label: '발급', rows: [{ id: 'bz.s1h', depth: 0, text: '접수 후 보통 1~2일 이내 사업자등록번호 발급' }] },
    ],
  },
  {
    key: 'biz.step2',
    title: '2단계 · 사업자용 계좌 개설 (은행)',
    sections: [
      {
        label: '개설 가능\n은행',
        rows: [
          { id: 'bz.s2a', depth: 0, text: '국민은행, 신한은행, 우리은행, 기업은행, 농협 등에서 가능' },
          { id: 'bz.s2b', depth: 0, text: '소상공인·부동산업 특화 서비스 제공 은행도 선택 가능' },
        ],
      },
      {
        label: '준비 서류',
        rows: [
          { id: 'bz.s2c', depth: 0, text: '사업자등록증 — 발급 후 원본' },
          { id: 'bz.s2d', depth: 0, text: '신분증 — 주민등록증 또는 운전면허증' },
          { id: 'bz.s2e', depth: 0, text: '사무실 임대차계약서 — 사무공간 주소 확인용 (필요 시)' },
          { id: 'bz.s2f', depth: 0, text: '도장 (선택) — 일부 은행 요청' },
        ],
      },
      {
        label: '개설 팁',
        rows: [
          { id: 'bz.s2g', depth: 0, text: '"사업 전용 통장으로 사용할 예정"이라고 명확히 요청' },
          { id: 'bz.s2h', depth: 0, text: '카드 매출 입금용과 사업비 지출용으로 나눠 쓸 예정이라고 말해 둔다' },
        ],
      },
    ],
  },
  {
    key: 'biz.step3',
    title: '3단계 · 사업자용 카드 신청 (신용 or 체크)',
    sections: [
      {
        label: '카드사 선택',
        rows: [
          { id: 'bz.s3a', depth: 0, text: '국민 · 신한 · 농협 · 삼성 — 주요 카드사 모두 개인사업자 전용 카드 운영' },
          { id: 'bz.s3b', depth: 0, text: 'BC카드 — 다양한 은행과 연동 가능' },
          { id: 'bz.s3c', depth: 0, text: '기업은행 — 소상공인 전용 상품 많음' },
        ],
      },
      {
        label: '준비 서류',
        rows: [
          { id: 'bz.s3d', depth: 0, text: '사업자등록증 사본 — 반드시 필요' },
          { id: 'bz.s3e', depth: 0, text: '신분증 — 본인 확인용' },
          { id: 'bz.s3f', depth: 0, text: '통장 사본 — 연결 계좌용' },
        ],
      },
      {
        label: '카드 종류\n고르기',
        rows: [
          { id: 'bz.s3g', depth: 0, text: '체크카드 — 비용 통제 쉬움, 지출 즉시 반영 → 경비처리 간편' },
          { id: 'bz.s3h', depth: 0, text: '신용카드 — 유예기간 有, 대량 비용 발생 시 유리' },
        ],
      },
    ],
  },
  {
    key: 'biz.note',
    title: '참고사항',
    sections: [
      { label: '사업용 계좌·\n카드만 사용', rows: [{ id: 'bz.n1', depth: 0, text: '개인 계좌·개인카드를 섞어 쓰면 비용으로 인정받지 못할 위험', warn: true }] },
      { label: '카드 등록', rows: [{ id: 'bz.n2', depth: 0, text: '국세청에 등록된 카드만 부가세 매입세액 공제 대상' }] },
      { label: '증빙 수취', rows: [{ id: 'bz.n3', depth: 0, text: '지출 건마다 세금계산서·영수증 확보 필수' }] },
      { label: '장부 기장', rows: [{ id: 'bz.n4', depth: 0, text: '간편장부 → 매출 / 비용 / 이익을 명확히 관리' }] },
    ],
  },
];
