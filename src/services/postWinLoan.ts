// 낙찰이후 · 잔금·등기 — 대출 준비서류와 업체 비딩.
// 꼴은 사업자등록 표와 같다(묶음 이름 | 내용). 물건마다 챙기는 일이라 체크를 둔다.
//
// 물건 주소처럼 사람마다 다른 값은 기본 글에 적지 않는다 — 앱에서 편집으로
// 적어 두면 그 사람 자리에만 남는다(저장소에는 올라가지 않는다).
import type { CheckGroup } from './postWinChecklist';

/** 기본 글의 판 — 글을 고쳐 내보낼 때 올린다 */
export const POST_WIN_LOAN_VERSION = 4;

export const POST_WIN_LOAN: CheckGroup[] = [
  {
    key: 'loan.docs',
    title: '대출준비서류 (신탁)',
    note: '모든 서류는 주민등록번호가 보이게 발급받는다.',
    sections: [
      {
        label: '본인확인',
        rows: [
          { id: 'ln.d1', depth: 0, text: '신분증', qty: '지참' },
          { id: 'ln.d2', depth: 0, text: '인감도장', qty: '지참' },
          { id: 'ln.d3', depth: 0, text: '인감증명서 (동사무소 발급)', qty: '3부' },
        ],
      },
      {
        label: '가족·주소',
        rows: [
          { id: 'ln.d4', depth: 0, text: '가족관계증명서(상세) · 주민번호 모두 보이게 발급', qty: '2부' },
          { id: 'ln.d5', depth: 0, text: '주민등록등본 · 주민번호 모두 보이게 발급', qty: '3부' },
          { id: 'ln.d6', depth: 0, text: '주민등록 원초본', qty: '3부' },
        ],
      },
      {
        label: '완납증명',
        rows: [
          { id: 'ln.d7', depth: 0, text: '국세완납증명서', qty: '2부' },
          { id: 'ln.d8', depth: 0, text: '지방세완납증명서', qty: '2부' },
          { id: 'ln.d9', depth: 1, text: '유효기간은 발급일로부터 한 달로 요청' },
        ],
      },
      {
        label: '지방세',
        rows: [
          { id: 'ln.d10', depth: 0, text: '지방세 완납증명서 · 물건별 1부씩 발급 (신탁등기용 · 낙찰받은 물건지 기재)', qty: '각 1부' },
          { id: 'ln.d11', depth: 1, text: '동사무소 발급 · 유효기간 발급일로부터 1달' },
          { id: 'ln.d12', depth: 0, text: '지방세 세목별과세증명서 (최근 2년)', qty: '1부' },
        ],
      },
      {
        label: '사업자',
        rows: [{ id: 'ln.d13', depth: 0, text: '매매사업자등록증명원', qty: '지참' }],
      },
      {
        label: '경매서류',
        rows: [{ id: 'ln.d14', depth: 0, text: '입찰보증금영수증 / 매각결정통지서 / 대금지급기한통지서', qty: '1부' }],
      },
      {
        label: '소득서류',
        rows: [
          { id: 'ln.d15', depth: 0, text: '재직증명서, 근로소득원천징수영수증 (최근 2년)' },
          { id: 'ln.d16', depth: 0, text: '건강보험자격득실확인서, 보험료납부확인서 (최근 1년)', qty: '각 1부' },
        ],
      },
      {
        label: '전입세대',
        rows: [{ id: 'ln.d17', depth: 0, text: '전입세대열람 · 낙찰받은 물건 (동사무소 발급)' }],
      },
    ],
  },
  {
    key: 'loan.seal',
    title: '인감증명서 3부 — 어디에 쓰나',
    sections: [
      {
        label: '쓰는 곳',
        rows: [
          { id: 'ln.s1', depth: 0, text: '지방세 완납증명서 → 물건별 1부씩 발급 (신탁등기용 · 낙찰받은 물건지 기재)' },
          { id: 'ln.s2', depth: 0, text: '신탁등기용 → 물건 주소를 적는다 (편집에서 내 물건 주소로 바꿔 둔다)' },
          { id: 'ln.s3', depth: 0, text: '신탁등기용 → 물건이 둘이면 한 줄 더 적는다' },
        ],
      },
    ],
  },
  {
    key: 'loan.bid',
    title: '대출업체 비딩',
    note: '여러 곳을 붙여 놓고 고른다 — 금리만 보지 않는다.',
    sections: [
      {
        label: '따져볼 것',
        rows: [
          { id: 'ln.b1', depth: 0, text: '금리 / 대출방식 / 중도상환수수료' },
          { id: 'ln.b2', depth: 0, text: '법무사비용 사전 확인' },
          { id: 'ln.b3', depth: 0, text: '잔금 시 인도명령 서비스 요청' },
        ],
      },
    ],
  },
];
