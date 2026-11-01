import { describe, expect, it } from 'vitest';
import { runLimited } from './runLimited';

const tick = (ms: number) => new Promise((done) => { setTimeout(done, ms); });

describe('몇 개씩만 겹쳐 돌리기', () => {
  it('한꺼번에 limit 개를 넘지 않고 모두 돈다', async () => {
    let running = 0; let peak = 0; const seen: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1; peak = Math.max(peak, running);
      await tick(5 + (n % 3) * 3);
      seen.push(n);
      running -= 1;
    });
    expect(peak).toBe(3);
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('하나가 실패해도 나머지는 돈다', async () => {
    const seen: number[] = [];
    await runLimited([1, 2, 3], 2, async (n) => { if (n === 1) throw new Error('x'); seen.push(n); });
    expect(seen.sort()).toEqual([2, 3]);
  });

  it('stop 이 참이 되면 남은 일은 집지 않는다', async () => {
    const seen: number[] = [];
    await runLimited([1, 2, 3, 4, 5], 1, async (n) => { seen.push(n); }, () => seen.length >= 2);
    expect(seen).toEqual([1, 2]);
  });
});
