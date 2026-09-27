import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore, firestoreDisabledReason, firestoreReady } from './firebase';
import type { AuctionDetail } from '../types/auction';

const COLLECTION_NAME = 'auctions';
const FIELD_TRIP_COLLECTION = 'fieldTrips';

export interface FieldTripStop {
  order: number;
  kind: 'start' | 'stop' | 'end';
  address: string;
  lat: number;
  lng: number;
}

export interface FieldTripPlanPayload {
  uid: string;
  title: string;
  startAddress: string;
  endAddress: string;
  totalDistanceKm: number;
  driveMinutes: number;
  stayMinutes: number;
  totalMinutes: number;
  stopCount: number;
  stops: FieldTripStop[];
  createdAt: string;
}

const toAuction = (id: string, raw: unknown): AuctionDetail | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as AuctionDetail;
  if (!value.caseNumber || !value.address) {
    return null;
  }
  return { ...value, id };
};

export const isFirestoreAvailable = () => firestoreReady;
export const getFirestoreWarning = () => firestoreDisabledReason;

export const subscribeAuctionList = (
  uid: string,
  onData: (items: AuctionDetail[]) => void,
  onError: (error: string) => void,
): Unsubscribe => {
  if (!firestore) {
    onError(getFirestoreWarning() ?? 'Firestore가 초기화되지 않았습니다.');
    return () => undefined;
  }
  if (!uid) {
    onData([]);
    return () => undefined;
  }

  const q = query(collection(firestore, COLLECTION_NAME), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((item) => toAuction(item.id, item.data()))
        .filter((item): item is AuctionDetail => item !== null);
      rows.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
      onData(rows);
    },
    (error) => {
      onError(`Firestore 동기화 실패: ${error.message}`);
    },
  );
};

export const upsertAuction = async (auction: AuctionDetail) => {
  if (!firestore) {
    throw new Error(getFirestoreWarning() ?? 'Firestore 미연결');
  }
  await setDoc(doc(firestore, COLLECTION_NAME, auction.id), sanitizeForFirestore(auction), { merge: true });
};

const stripUndefined = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as T;
};

// sitePhotos used to be base64 strings (which exceeded Firestore 1MB limit) — they are now
// Firebase Storage URLs (short strings) so the doc fits and can sync across devices.
const sanitizeForFirestore = (auction: AuctionDetail): AuctionDetail => stripUndefined(auction);

export const upsertAuctionBatch = async (items: AuctionDetail[]) => {
  if (!firestore || items.length === 0) {
    return;
  }
  const db = firestore;
  const batch = writeBatch(db);
  items.forEach((item) => {
    const ref = doc(db, COLLECTION_NAME, item.id);
    batch.set(ref, stripUndefined(item), { merge: true });
  });
  await batch.commit();
};

export const deleteAuctionDoc = async (id: string) => {
  if (!firestore) {
    throw new Error(getFirestoreWarning() ?? 'Firestore 미연결');
  }
  await deleteDoc(doc(firestore, COLLECTION_NAME, id));
};

export const saveFieldTripPlan = async (planId: string, payload: FieldTripPlanPayload) => {
  if (!firestore) {
    throw new Error(getFirestoreWarning() ?? 'Firestore 미연결');
  }
  // Firestore는 undefined 필드를 거부함 — 좌표 누락 stop 등을 null로 정규화
  await setDoc(doc(firestore, FIELD_TRIP_COLLECTION, planId), stripUndefined(payload), { merge: true });
};
