// 일을 한꺼번에 몇 개까지만 돌린다 — 공공데이터는 한꺼번에 많이 던지면 429(잠깐 막힘)가 오고,
// 하나씩 차례로 하면 동 27곳 세대수에 1분이 넘게 걸렸다. 그 사이에서 limit 개씩 겹쳐 돌린다.
// 한 일이 끝나면 바로 다음 일을 집는다(묶음째 기다리지 않는다). stop() 이 참이면 남은 일은 집지 않는다.
export const runLimited = async <T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> => {
  let next = 0;
  const lane = async () => {
    while (next < items.length && !stop()) {
      const i = next;
      next += 1;
      try { await work(items[i], i); } catch { /* 한 일의 실패가 다른 일을 멈추지 않게 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
};
