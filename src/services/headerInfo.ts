// 머리글 오른쪽의 세 칸 — 동네·기온·원/달러.
//
// 머리글은 화면마다 새로 그려진다. 값은 앱 전체에 한 벌만 들고, 30분에 한 번만 다시 받는다.
// 못 받은 칸은 지어내지 않고 비워 둔다('–').
import { ref } from 'vue';
import { DEFAULT_PLACE, getHerePlace, type HerePlace } from './placeApi';
import { getNowWeather, type NowWeather } from './weatherApi';
import { getUsdRate, type UsdRate } from './fxApi';

const REFRESH_MS = 30 * 60 * 1000;
/** 못 받았으면 화면을 옮길 때마다 다시 부르지 않게 조금 쉰다 */
const RETRY_MS = 5 * 60 * 1000;

const place = ref<HerePlace>(DEFAULT_PLACE);
const weather = ref<NowWeather | null>(null);
const usd = ref<UsdRate | null>(null);

let inFlight: Promise<void> | null = null;
let lastTry = 0;
let lastOk = false;

const refresh = async () => {
  // 자리가 정해져야 그 자리의 기온을 부른다. 환율은 자리와 무관해 같이 출발한다
  const fxJob = getUsdRate().then((v) => { usd.value = v; });
  const here = await getHerePlace();
  place.value = here;
  weather.value = await getNowWeather(here.lat, here.lng);
  await fxJob;
  lastOk = Boolean(weather.value) && Boolean(usd.value);
};

export const useHeaderInfo = () => {
  const wait = lastOk ? REFRESH_MS : RETRY_MS;
  if (!inFlight && Date.now() - lastTry > wait) {
    lastTry = Date.now();
    inFlight = refresh().catch(() => undefined).finally(() => { inFlight = null; });
  }
  return { place, weather, usd };
};
