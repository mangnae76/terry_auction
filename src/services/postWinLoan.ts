// 낙찰이후 · 잔금·등기 — 대출 준비서류와 업체 비딩.
// 꼴은 사업자등록 표와 같다(묶음 이름 | 내용). 물건마다 챙기는 일이라 체크를 둔다.
//
// 물건 주소처럼 사람마다 다른 값은 기본 글에 적지 않는다 — 앱에서 편집으로
// 적어 두면 그 사람 자리에만 남는다(저장소에는 올라가지 않는다).
import type { CheckGroup } from './postWinChecklist';

/** 기본 글의 판 — 글을 고쳐 내보낼 때 올린다 */
export const POST_WIN_LOAN_VERSION = 18;

/** 네 상자를 '법무사 대행 잔금 납부 및 등기' 울타리로 묶을지.
 *  마음에 들지 않으면 false 로 두면 묶기 전 모습으로 돌아간다. */
export const LOAN_GROUPED = true;
const SUPER = LOAN_GROUPED ? '법무사 대행 잔금 납부 및 등기' : undefined;

export const POST_WIN_LOAN: CheckGroup[] = [
  {
    key: 'loan.screen',
    super: SUPER,
    title: '경락신탁대출 심사 서류 준비',
    note: '먼저 이 서류로 심사를 받는다.',
    sections: [
      {
        label: '심사 서류',
        rows: [
          { id: 'ln.c1', depth: 0, text: '사업자등록증' },
          { id: 'ln.c2', depth: 0, text: '법원 영수증' },
          { id: 'ln.c3', depth: 0, text: '전년도 신용카드 내역서' },
          { id: 'ln.c4', depth: 0, text: '전년도 소득금액증명서' },
          { id: 'ln.c5', depth: 0, text: '올해 근로소득원천징수 서류 추가 필요', warn: true },
          { id: 'ln.c6', depth: 0, text: '2년간 배우자 소득금액증명서' },
        ],
      },
    ],
  },
  {
    key: 'loan.docs',
    super: SUPER,
    title: '대출준비서류 (신탁)',
    note: '모든 서류는 주민등록번호가 보이게 발급받는다.',
    sections: [
      {
        label: '본인확인',
        rows: [
          { id: 'ln.d1', depth: 0, text: '신분증', memo: '지참' },
          { id: 'ln.d2', depth: 0, text: '인감도장', memo: '지참' },
          { id: 'ln.d3', depth: 0, text: '인감증명서', qty: '3부', memo: '동사무소 발급' },
        ],
      },
      {
        label: '가족·주소',
        rows: [
          { id: 'ln.d4', depth: 0, text: '가족관계증명서(상세)', qty: '2부', memo: '주민번호 모두 보이게' },
          { id: 'ln.d5', depth: 0, text: '주민등록등본', qty: '3부', memo: '주민번호 모두 보이게' },
          { id: 'ln.d6', depth: 0, text: '주민등록 원초본', qty: '3부' },
        ],
      },
      {
        label: '완납증명',
        rows: [
          { id: 'ln.d7', depth: 0, text: '국세완납증명서', qty: '2부', memo: '유효기간 발급일로부터 한 달로 요청' },
          { id: 'ln.d8', depth: 0, text: '지방세완납증명서', qty: '2부', memo: '유효기간 발급일로부터 한 달로 요청' },
        ],
      },
      {
        label: '지방세',
        rows: [
          { id: 'ln.d10', depth: 0, text: '지방세 완납증명서 — 물건별 1부씩 (신탁등기용 · 낙찰받은 물건지 기재)', qty: '각 1부', memo: '동사무소 발급\n유효기간 한 달' },
          { id: 'ln.d12', depth: 0, text: '지방세 세목별과세증명서 (최근 2년)', qty: '1부', memo: '동사무소 발급\n유효기간 한 달' },
        ],
      },
      {
        label: '사업자',
        rows: [{ id: 'ln.d13', depth: 0, text: '매매사업자등록증명원', memo: '지참' }],
      },
      {
        label: '경매서류',
        rows: [{ id: 'ln.d14', depth: 0, text: '입찰보증금영수증 / 매각결정통지서 / 대금지급기한통지서', qty: '1부' }],
      },
      {
        label: '소득서류',
        rows: [
          { id: 'ln.d15', depth: 0, text: '재직증명서, 근로소득원천징수영수증 (최근 2년)', qty: '각 1부' },
          { id: 'ln.d16', depth: 0, text: '건강보험자격득실확인서, 보험료납부확인서 (최근 1년)', qty: '각 1부' },
        ],
      },
      {
        label: '전입세대',
        rows: [{ id: 'ln.d17', depth: 0, text: '전입세대열람 (낙찰받은 물건)', memo: '동사무소 발급' }],
      },
    ],
  },
  {
    key: 'loan.bid',
    super: SUPER,
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
  {
    key: 'loan.legal',
    super: SUPER,
    title: '법무비용',
    // 읽어 두는 글이라 체크를 두지 않는다 — 글이 넓게 들어간다
    noCheck: true,
    // 견적서를 대조할 때 쓰는 자리들 (열어 보고 주소를 확인했다)
    links: [
      // 부동산계산기.com — 사용자가 쓰는 자리 (퓨니코드 주소 그대로 둔다)
      { label: '취득세', url: 'https://xn--989a00af8jnslv3dba.com/%EC%B7%A8%EB%93%9D%EC%84%B8' },
      { label: '국민주택채권', url: 'https://xn--989a00af8jnslv3dba.com/%EA%B5%AD%EB%AF%BC%EC%A3%BC%ED%83%9D%EC%B1%84%EA%B6%8C' },
    ],
    note: '견적서는 항목이 복잡해 보이지만, 셀프등기 비용과 대행 비용을 견주면 보인다.',
    sections: [
      {
        label: '취득세',
        rows: [
          { id: 'ln.l1', depth: 0, text: '보통 1.1%~3.5% 수준(표준세율) 납부' },
          { id: 'ln.l2', depth: 0, text: '전용 85㎡ 초과 또는 3억 원 초과 여부로 세율이 달라진다 → 부동산 계산기로 직접 셈해 견적서 금액과 대조' },
        ],
      },
      {
        label: '채권매입',
        rows: [
          { id: 'ln.l3', depth: 0, text: '취득할 때 의무로 매입한 뒤 당일 할인 매각한다 (할인율 약 8~9%)' },
          { id: 'ln.l4', depth: 0, text: '사업자 대출 → 견적서에 주택채권 매입 항목이 1개만 있어야 한다' },
          { id: 'ln.l5', depth: 0, text: '가계 대출 → 근저당권 설정 금액(대출금의 약 120%)의 1%에 해당하는 채권을 더 산다' },
          { id: 'ln.l6', depth: 0, text: '간단계산 → 가계대출 추가채권 부담은 대출금의 약 0.1%(1억당 약 10만원)' },
        ],
      },
      {
        label: '기타비용\n(실비)',
        rows: [
          { id: 'ln.l7', depth: 0, text: '말소비용 (건당 7,200원)' },
          { id: 'ln.l8', depth: 0, text: '등기신청수수료 (18,000원)' },
          { id: 'ln.l9', depth: 0, text: '우편료 2건 (12,000원)' },
          { id: 'ln.l10', depth: 0, text: '인도명령 신청비 (33,000원)' },
        ],
      },
      {
        label: '적정\n수수료',
        rows: [
          { id: 'ln.l11', depth: 0, text: '취득세·채권 할인액·실비(약 8~9만 원)를 뺀 순수 법무사 수수료 기준' },
          { id: 'ln.l12', depth: 0, text: '대출 1억 원 → 약 60만 원' },
          { id: 'ln.l13', depth: 0, text: '대출 2억 원 → 약 65만 원' },
          { id: 'ln.l14', depth: 0, text: '대출 3억 원 → 약 70만 원' },
          { id: 'ln.l15', depth: 0, text: '기준보다 비싸면 할인을 요청한다 → 다만 금리 등 조건이 많이 좋으면 적은 추가는 감수할 만하다' },
        ],
      },
      {
        label: '과다청구\n막기',
        rows: [
          { id: 'ln.l16', depth: 0, text: '견적서는 미리 받는다 → 잔금 일주일 전이나 당일에 받으면 대출을 바꾸기 어려워 그대로 받아들이게 된다', warn: true },
          { id: 'ln.l17', depth: 0, text: '대출 승인(자서)은 2곳 이상 → 잔금 직전에 과한 비용을 부르면 다른 대출로 갈아타거나 협상 카드로 쓴다' },
        ],
      },
    ],
  },
  {
    // 울타리 밖 — 법무사를 쓰지 않고 혼자 할 때의 차례
    key: 'loan.self',
    title: '셀프 잔금납부 및 등기',
    note: '부동산 경매 잔금 납부 및 셀프 등기 전체 흐름',
    sections: [
      {
        label: '1단계\n경매계 방문',
        rows: [{ id: 'ln.f1', depth: 0, text: '법원 경매계를 방문해 「법원 보관금 납부 명령서」를 받는다' }],
      },
      {
        label: '2단계\n은행·잔금납부',
        rows: [
          { id: 'ln.f2', depth: 0, text: '은행에 비치된 「법원 보관금 납부서」와 「송달료 납부 신청서」 작성' },
          { id: 'ln.f3', depth: 0, text: '잔금을 1장짜리 수표로 발급해 납부' },
          { id: 'ln.f4', depth: 0, text: '정부수입인지 500원권 1장 구입 → 송달료 납부 완료' },
        ],
      },
      {
        label: '3단계\n완납증명원',
        rows: [{ id: 'ln.f5', depth: 0, text: '잔금 납부 뒤 다시 경매계로 가서 「매각대금 완납증명원」을 받는다' }],
      },
      {
        label: '4단계\n취득세 신고·납부',
        rows: [
          { id: 'ln.f6', depth: 0, text: '법원 내 우체국 방문 → 지자체 세정과로 빠른 등기 발송 (보낼 서류: 매각대금 완납증명원 사본, 취득세 신고서)' },
          { id: 'ln.f7', depth: 0, text: '모바일 팩스 전송 → 완납증명원·취득세 신고서·등기접수 영수증을 찍어 세정과에 보낸 뒤 수신 확인 전화' },
          { id: 'ln.f8', depth: 0, text: '세정과에서 보내준 납부서의 계좌로 취득세를 계좌 이체' },
        ],
      },
      {
        label: '5단계\n등기 촉탁',
        rows: [{ id: 'ln.f9', depth: 0, text: '다시 법원 경매계를 방문해 「등기 촉탁 신청서」 작성 → 준비한 서류 제출 후 접수증 수령' }],
      },
    ],
  },
];
