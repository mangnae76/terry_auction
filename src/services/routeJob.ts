// 동선 계산은 화면을 벗어나도 이어진다.
//
// 계산이 임장경로 화면 안에서만 살아 있으면, 다른 화면으로 옮기는 순간 결과가 어디로
// 갔는지 알 수 없게 된다. 계산이 도는지(running)와 그 약속(promise)을 화면 밖에 두어,
// 돌아왔을 때 '계산중'을 그대로 보여 주고 끝나면 결과를 받아 올 수 있게 한다.
//
// 앱 자체가 꺼지면 멈춘다 — 그때까지 버티려면 서버가 대신 돌려야 한다.
import { ref } from 'vue';

export const routeJobRunning = ref(false);

let current: Promise<unknown> | null = null;

/** 계산 하나를 이 자리에 걸어 둔다 — 화면이 사라져도 약속은 살아 있다 */
export const trackRouteJob = <T>(job: Promise<T>): Promise<T> => {
  routeJobRunning.value = true;
  current = job;
  void job
    .catch(() => undefined)
    .finally(() => {
      if (current === job) {
        current = null;
        routeJobRunning.value = false;
      }
    });
  return job;
};

/** 지금 도는 계산 — 없으면 null */
export const currentRouteJob = (): Promise<unknown> | null => current;
