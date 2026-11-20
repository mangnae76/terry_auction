/* 사건 등록 한 곳 — 관심물건 · 저가매수의 '등록하기'(2026-11-20).
 * 같은 사건이 보관함에 있으면 덮어쓰지 않고 '보관함에 있습니다. 꺼내시겠습니까?' 확인창(공용 AppConfirm)을 띄운다.
 * 예전엔 보관함 물건에 덮어써 보관함에 그대로 남았다 — 목록에 안 보이고 단추도 '등록하기'로 남았다(사용자) */
import { ref } from 'vue';
import type { ConfirmBox } from '../services/confirmBox';
import { useAuctionStore } from '../stores/auctionStore';
import { caseKey } from '../services/bidPredict';
import type { ParsedPdfAuction } from '../services/pdfAuctionImport';

export const useCaseRegister = () => {
  const auctions = useAuctionStore();
  const confirmBox = ref<ConfirmBox | null>(null);
  /** key — '2026-502495' 꼴, label — 화면에 쓸 사건번호, make — 등록할 값(보관함이면 쓰지 않음), say — 결과 글 */
  const register = async (key: string, label: string, make: () => ParsedPdfAuction, say: (m: string) => void) => {
    const arch = auctions.archivedAuctions.find((a) => caseKey(a.caseNumber) === key);
    if (arch) {
      confirmBox.value = {
        title: '보관함에 있는 물건입니다',
        desc: `${label} 은 보관함에 있습니다. 꺼내시겠습니까?`,
        okLabel: '꺼내기',
        skipKey: '',
        tone: 'calm',
        run: async () => {
          try { await auctions.archiveAuctions([arch.id], false); say(`${label} 을 보관함에서 꺼내 물건목록에 올렸습니다.`); }
          catch { say('꺼내지 못했습니다. 다시 해 주세요.'); }
        },
      };
      return;
    }
    try { await auctions.importParsedPdfAuctions([make()]); say(`${label} 을 물건목록에 올렸습니다.`); }
    catch { say('등록하지 못했습니다. 다시 해 주세요.'); }
  };
  return { confirmBox, register };
};
