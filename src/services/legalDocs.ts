// 약관 · 정책 창의 글 — 이용약관 · 개인정보처리방침 · 환불정책 · 저작권정책 · 사업제휴.
// 대문(intro.html)과 웹(selected.html)이 같은 글을 같은 창으로 띄운다(예전에는 웹 파일 안에만 있어 대문에서 못 열었다).
// 이용약관 · 개인정보처리방침은 앱과 같은 글(services/legalTerms), 환불 금액 규칙은 이용약관 환불 규정 조항을 그대로 가져온다.
import { PRIVACY_CHILD, PRIVACY_CHILD_TITLE, PRIVACY_EFFECTIVE, PRIVACY_OFFICER, PRIVACY_OFFICER_TITLE, PRIVACY_SECTIONS, TERMS_CHAPTERS, TERMS_EFFECTIVE, type PrivacyBlock } from './legalTerms';
import { POINT_CAUTIONS } from './pointPolicy';
import { POINTS_OPEN } from './billingPlans';
import { legalFromDb } from './contentRepository';

export type LegalDocKey = 'terms' | 'privacy' | 'refund' | 'copyright' | 'partner';
export const LEGAL_DOC_KEYS: LegalDocKey[] = ['terms', 'copyright', 'privacy', 'refund', 'partner'];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const docList = (items?: string[], tag = 'ol') => (items && items.length ? `<${tag}>${items.map((x) => `<li>${esc(x).replace(/\n/g, '<br>')}</li>`).join('')}</${tag}>` : '');
type Art = { title: string; text?: string; items?: string[] };
const docArticles = (arts: Art[]) => arts.map((a) => `<h4>${esc(a.title)}</h4>${a.text ? `<p>${esc(a.text)}</p>` : ''}${docList(a.items)}`).join('');
const DOC_CONTACT = '<div class="doc-contact">위 이용 목적 밖으로 쓰시려면 아래로 문의해 주세요.<br><b>저작권 · 사업제휴 문의</b> 전화 02-456-1234 · 메일 contact@myturn.co.kr</div>';

const termsBody = () => (TERMS_CHAPTERS as Array<{ title: string; articles: Art[] }>).map((ch) => `<h3>${esc(ch.title)}</h3>${docArticles(ch.articles)}`).join('')
  + `<h3>부칙</h3><p>이 약관은 ${esc(TERMS_EFFECTIVE)}부터 시행하며, 종전의 이용약관은 이 약관으로 대체합니다.</p>`;

const blk = (b: PrivacyBlock): string => {
  if (b.kind === 'p') return `<p>${esc(b.text)}</p>`;
  if (b.kind === 'label') return `<h4>${esc(b.text)}</h4>`;
  if (b.kind === 'note') return `<p class="doc-note">${esc(b.text)}</p>`;
  if (b.kind === 'table') return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return docList(b.items, b.kind === 'ol' ? 'ol' : 'ul');
};
const privacyBody = () => {
  return PRIVACY_SECTIONS.map((sec) => `<h3>${esc(sec.title)}</h3>${sec.blocks.map(blk).join('')}`).join('')
    + `<h3>${esc(PRIVACY_OFFICER_TITLE)}</h3><dl class="doc-dl">${(PRIVACY_OFFICER as Array<{ label: string; value: string }>).map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>`
    + `<h3>${esc(PRIVACY_CHILD_TITLE)}</h3><p>${esc(PRIVACY_CHILD)}</p>`
    + `<h3>부칙</h3><p>이 개인정보 처리방침은 ${esc(PRIVACY_EFFECTIVE)}부터 시행합니다.</p>`;
};

// 환불정책 — 구성은 전액 · 부분 · 제한 / 절차 / 결제 취소 / 만료 / 문의. 금액 기준은 이용약관 환불 규정 조항 그대로(약관과 어긋나지 않게).
// 포인트 줄은 포인트를 붙일 때까지 숨긴다
const refundBody = () => {
  const art = (TERMS_CHAPTERS as Array<{ articles: Art[] }>).flatMap((c) => c.articles).find((a) => /환불 규정/.test(a.title));
  if (!art) return '<p>환불정책을 불러오지 못했습니다 — 새로고침 뒤 다시 열어 주세요.</p>';
  const pts = POINT_CAUTIONS.filter((t) => /환불|결제취소/.test(t));
  const SHOW_POINTS = POINTS_OPEN;
  let n = 0;
  const h = (t: string) => `<h3>${++n}. ${t}</h3>`;
  return `<p class="doc-lead">리치마블(이하 '회사')이 운영하는 마이턴 서비스(이하 '서비스')의 유료 이용권 환불 정책입니다.</p>
      ${h('디지털 콘텐츠 특성')}
      <p>서비스는 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 디지털 콘텐츠(무형상품)에 해당합니다. 서비스 이용을 시작한 뒤에는 청약철회가 제한될 수 있습니다.</p>
      ${h('환불 가능 기준')}
      <ul>
        <li><b>전액 환불:</b> 결제일로부터 7일 이내이며, 유료 기능(AI 분석 등)을 한 번도 이용하지 않은 경우</li>
        <li><b>부분 환불:</b> 이용 내역이 있는 경우 남은 이용 기간에 대해, 이용약관 ${esc(art.title)}에 따라 위약금과 사용일수를 뺀 금액을 환불
          <ul>${(art.items ?? []).filter((t) => /위약금/.test(t)).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </li>
        <li><b>환불 제한:</b> 무료 이용권 · 이벤트 참여 등 회사가 정한 일부 상품, 이용 기간이 끝난 이용권</li>
      </ul>
      ${h('환불 절차')}
      <ol><li>고객센터(전화 · 메일 또는 서비스 안 고객센터 문의)로 환불 신청</li><li>회사에서 이용 내역 확인 (1~2 영업일)</li><li>환불 승인 시 결제 취소 처리 (카드 결제 · 계좌 입금 모두 3~5 영업일, 카드사 · 은행 사정에 따라 달라질 수 있습니다)</li></ol>
      ${h('결제 취소(자동 환불)')}
      <p>카드 결제 후 당일 바로 취소하는 경우 결제 취소로 처리되어 청구되지 않습니다.</p>
      ${SHOW_POINTS ? `${h('포인트')}${docList(pts, 'ul')}` : ''}
      ${h('이용권 만료')}
      <p>이용 기간이 끝나면 자동으로 갱신되지 않으며, 만료 시점에 무료회원으로 바뀝니다. 만료 후 남은 기간이 없는 이용권은 환불하지 않습니다.</p>
      ${h('문의')}
      <p>환불 관련 문의는 서비스 안 고객센터 또는 아래 연락처로 해 주세요.</p>
      <div class="doc-contact"><b>환불 문의</b> 전화 02-456-1234 · 메일 contact@myturn.co.kr</div>
      <p class="doc-eff">이 환불정책은 이용약관과 같이 ${esc(TERMS_EFFECTIVE || '')}부터 시행합니다.</p>`;
};

const copyrightBody = () => `
      <p class="doc-scope"><b>적용대상</b> 마이턴(이하 '회사')이 운영하는 마이턴 웹과 앱(이하 '서비스')에서 제공하는 모든 정보와 자료</p>
      <h3>제1조 목적</h3>
      <p>이 정책은 회사가 서비스로 제공하는 정보(경매 물건 정리, 권리분석 · 수익분석 · 시장분석 결과, 사진, 도표, 영상 등)의 저작권을 보호하고 공정하게 이용하기 위한 원칙을 정해, 저작권 침해로부터 회사와 이용자 모두를 보호하는 것을 목적으로 합니다.</p>
      <h3>제2조 저작권의 귀속</h3>
      <ul>
        <li>서비스가 만든 콘텐츠(분석 결과 · 도표 · 화면 구성 · 안내 글 · 소개 영상 등)의 저작권은 회사에 있으며, 관련 법률에 따라 보호받습니다.</li>
        <li>법원 경매정보, 국토교통부 실거래가 등 공공기관 자료의 권리는 각 기관에 있습니다. 회사는 이를 모아 정리하고 분석한 결과에 대해서만 권리를 가집니다.</li>
        <li>이용자가 직접 올리거나 적은 사진 · 메모 · 비용 기록의 권리는 이용자에게 있습니다.</li>
        <li>서비스의 콘텐츠는 어떤 형태로든 <b>상업적 이용을 금지</b>합니다.</li>
      </ul>
      <h3>제3조 비상업적 이용</h3>
      <ul>
        <li>서비스의 자료는 비영리 · 교육 목적(블로그, 카페, 공부 자료 등)으로 게시할 수 있습니다.</li>
        <li>이때 다음 사항을 반드시 지켜야 합니다.
          <ul><li>출처를 <b>'마이턴'</b>으로 밝힐 것</li><li>소유자 · 채무자 · 임차인 등의 개인정보는 반드시 지울 것</li></ul>
        </li>
      </ul>
      <h3>제4조 정보 수집 및 복제 제한</h3>
      <ul>
        <li>자동 수집 프로그램이나 자동화 도구로 정보를 무단으로 수집하거나 복제하는 행위를 금지합니다.</li>
        <li>회원 계정은 본인만 쓸 수 있으며, 다른 사람과 함께 쓰거나 빌려줄 수 없습니다.</li>
        <li>상업적 목적으로 인터넷 · 모바일 등 전자매체에 복사 · 인쇄 · 저장 · 재사용 · 재판매할 수 없습니다.<br>(비영리 교육 · 참고 목적은 출처를 밝히면 예외로 허용)</li>
      </ul>
      <h3>제5조 저작권 침해에 대한 법적 책임</h3>
      <ul>
        <li>이 정책을 어기면 민사상 손해배상 책임을 질 수 있습니다.</li>
        <li>저작권법 등 관련 법령에 따라 형사 처벌을 받을 수 있습니다.</li>
      </ul>
      <h3>제6조 정책의 변경</h3>
      <p>이 정책은 회사의 내부 방침이나 관련 법령의 개정에 따라 바뀔 수 있으며, 바뀌면 서비스 공지사항으로 알려 드립니다.</p>
      ${DOC_CONTACT}`;

const partnerBody = () => `
      <p class="doc-lead">마이턴과 함께할 파트너를 찾습니다. 아래 분야의 제안을 기다립니다.</p>
      <h3>제휴 분야</h3>
      <ul>
        <li><b>데이터 · 콘텐츠</b> 경매 · 부동산 정보, 교육 콘텐츠 제공</li>
        <li><b>전문가</b> 법무사 · 세무사 · 공인중개사 · 명도 · 인테리어 등 낙찰 뒤 실무 파트너</li>
        <li><b>광고 · 마케팅</b> 서비스 안 광고, 공동 마케팅</li>
        <li><b>교육 · 강의</b> 경매 강의, 스터디 · 카페 운영 협력</li>
      </ul>
      <h3>제안하실 때</h3>
      <ul>
        <li>회사(기관)명과 담당자 연락처</li>
        <li>제안 내용과 바라는 협력 방식</li>
        <li>참고 자료(회사 소개서 등)가 있으면 함께 보내 주세요.</li>
      </ul>
      <p>보내 주신 제안은 검토한 뒤 담당자가 연락드립니다.</p>
      <div class="doc-contact"><b>사업제휴 문의</b> 메일 <a href="mailto:contact@myturn.co.kr">contact@myturn.co.kr</a> · 전화 02-456-1234</div>`;

const DOCS: Record<LegalDocKey, { title: string; body: () => string }> = {
  terms: { title: '이용약관', body: termsBody },
  privacy: { title: '개인정보처리방침', body: privacyBody },
  refund: { title: '환불정책', body: refundBody },
  copyright: { title: '마이턴 저작권 정책', body: copyrightBody },
  partner: { title: '사업제휴', body: partnerBody },
};

/** 창 제목 · 본문(HTML) — 모르는 열쇠면 null */
export const legalDoc = (key: string): { title: string; html: string } | null => {
  const d = DOCS[key as LegalDocKey];
  if (!d) return null;
  const db = legalFromDb(key);   // 운영 › 약관 관리에서 올린 판이 있으면 그것(contentRepository)
  return { title: d.title, html: db?.html || d.body() };
};
