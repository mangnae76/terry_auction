import { handleSocialLogin } from './socialLogin';

export interface Env {
  KAKAO_REST_API_KEY?: string;
  /** 브이월드 오픈API 인증키 — 공동주택/개별주택 공시가격 조회 (query 의 key 로 붙는다) */
  VWORLD_API_KEY?: string;
  /** 한국수출입은행 현재환율 인증키 — query 의 authkey 로 붙는다 */
  EXIM_API_KEY?: string;
  /** 공공데이터포털(국토부 실거래 · 기상청 등) 인증키 — query 의 serviceKey 로 붙는다.
   *  웹 묶음은 이 키를 싣지 않으므로, 요청에 serviceKey 가 없으면 여기서 붙인다 */
  PUBLIC_DATA_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  /** 국토부 실거래(RTMS) 응답 저장소 — 같은 요청은 공공데이터까지 가지 않는다(하루 호출 한도 아끼기) */
  TRADE_CACHE?: KVNamespace;
}

interface Route {
  prefix: string;
  target: string;
  headers?: Record<string, string>;
  /** kakao = Authorization 헤더, vworld = query 의 key, exim = query 의 authkey */
  authKind?: 'kakao' | 'vworld' | 'exim' | 'data';
}

const ROUTES: Route[] = [
  { prefix: '/api-data', target: 'https://apis.data.go.kr', authKind: 'data' },
  { prefix: '/api-onbid', target: 'https://openapi.onbid.co.kr' },
  {
    prefix: '/api-naver-land',
    target: 'https://new.land.naver.com',
    headers: {
      Referer: 'https://new.land.naver.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  },
  {
    prefix: '/api-geo',
    target: 'https://nominatim.openstreetmap.org',
    headers: {
      Referer: 'https://terry-auction.workers.dev',
      'User-Agent': 'terry-auction/1.0',
    },
  },
  { prefix: '/api-kakao', target: 'https://dapi.kakao.com', authKind: 'kakao' },
  { prefix: '/api-kakao-navi', target: 'https://apis-navi.kakaomobility.com', authKind: 'kakao' },
  { prefix: '/api-osrm', target: 'https://router.project-osrm.org' },
  { prefix: '/api-vworld', target: 'https://api.vworld.kr', authKind: 'vworld' },
  // 머리글의 원/달러 — 하루 한 번 고시되는 매매기준율
  { prefix: '/api-exim', target: 'https://oapi.koreaexim.go.kr', authKind: 'exim' },
  {
    prefix: '/api-court',
    target: 'https://www.courtauction.go.kr',
    headers: {
      Referer: 'https://www.courtauction.go.kr/pgj/index.on',
      Origin: 'https://www.courtauction.go.kr',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
    },
  },
];

const corsHeaders = (origin: string, env: Env): Record<string, string> => {
  const allowed = env.ALLOWED_ORIGINS ?? '*';
  const allowOrigin = allowed === '*' ? '*' : allowed.split(',').includes(origin) ? origin : allowed.split(',')[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
};

const stripHopByHop = (headers: Headers): Headers => {
  const out = new Headers(headers);
  ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer'].forEach((h) =>
    out.delete(h),
  );
  return out;
};

const handleDriveFolder = async (request: Request, env: Env): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '*';
  const cors = corsHeaders(origin, env);
  const url = new URL(request.url);
  const folderId = url.searchParams.get('folderId')?.trim();
  if (!folderId) {
    return new Response(JSON.stringify({ error: 'folderId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    });
  }
  const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`);
  if (!response.ok) {
    return new Response(JSON.stringify({ error: `drive fetch failed: ${response.status}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    });
  }
  const html = await response.text();
  const regex = /data-id="([^"]+)"[\s\S]{0,600}?data-tooltip="([^"]+\.pdf)[^"]*"/gi;
  const files: Array<{ id: string; name: string; downloadUrl: string }> = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const [, id, name] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    files.push({
      id,
      name,
      downloadUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download`,
    });
  }
  return new Response(JSON.stringify({ files }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
};

const handleDriveDownload = async (request: Request, env: Env): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '*';
  const cors = corsHeaders(origin, env);
  const url = new URL(request.url);
  const fileId = url.searchParams.get('id')?.trim();
  if (!fileId) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    });
  }
  const upstream = await fetch(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
  const outHeaders = stripHopByHop(upstream.headers);
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
};

// ===== 실거래(RTMS) 저장 — 시군구 · 달 · 종류가 같은 요청은 앱 · 웹 · 사람 가리지 않고 한 번만 공공데이터에 묻는다 =====
// 지난 달 자료는 거의 바뀌지 않아 30일, 최근 두 달은 신고가 계속 들어와 6시간만 둔다.
// 오류 · 한도 초과 응답은 저장하지 않는다.
const isRtms = (route: Route, url: URL, method: string) =>
  route.authKind === 'data' && method === 'GET' && url.pathname.includes('/RTMSDataSvc');
const rtmsKey = (url: URL) => {
  const params = new URLSearchParams(url.search);
  params.delete('serviceKey');
  params.sort();
  return `rtms:${url.pathname}?${params.toString()}`;
};
const rtmsTtl = (url: URL) => {
  const ymd = (url.searchParams.get('DEAL_YMD') ?? '').trim();
  if (!/^\d{6}$/.test(ymd)) return 6 * 3600;
  const now = new Date(Date.now() + 9 * 3600 * 1000); // 한국 시각
  const cut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const cutYm = `${cut.getUTCFullYear()}${String(cut.getUTCMonth() + 1).padStart(2, '0')}`;
  return ymd < cutYm ? 30 * 24 * 3600 : 6 * 3600;
};
const rtmsLooksOk = (body: string) =>
  /resultCode["'\s:>]*"?0+["'<]/.test(body) && !/LIMITED_NUMBER|SERVICE_KEY_IS|SERVICE ERROR|SERVICE_TIMEOUT/i.test(body);

const handleProxy = async (request: Request, env: Env, route: Route): Promise<Response> => {
  const origin = request.headers.get('origin') ?? '*';
  const cors = corsHeaders(origin, env);
  const url = new URL(request.url);
  // 브이월드는 인증키를 query 로 받는다 — 키가 브라우저로 나가지 않게 여기서 붙인다
  let search = url.search;
  if (route.authKind === 'vworld' && env.VWORLD_API_KEY) {
    const params = new URLSearchParams(url.search);
    params.set('key', env.VWORLD_API_KEY);
    search = `?${params.toString()}`;
  }
  if (route.authKind === 'exim' && env.EXIM_API_KEY) {
    const params = new URLSearchParams(url.search);
    params.set('authkey', env.EXIM_API_KEY);
    search = `?${params.toString()}`;
  }
  // 공공데이터 — 앱은 키를 직접 실어 보내고, 웹은 비워 보낸다. 비어 있을 때만 여기서 붙인다
  if (route.authKind === 'data' && env.PUBLIC_DATA_API_KEY) {
    const params = new URLSearchParams(search);
    if (!params.get('serviceKey')) {
      params.set('serviceKey', env.PUBLIC_DATA_API_KEY);
      search = `?${params.toString()}`;
    }
  }
  const rest = url.pathname.slice(route.prefix.length) + search;
  const targetUrl = `${route.target}${rest}`;

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');
  forwardHeaders.delete('origin');
  forwardHeaders.delete('referer');
  if (route.headers) {
    for (const [k, v] of Object.entries(route.headers)) forwardHeaders.set(k, v);
  }
  if (route.authKind === 'kakao' && env.KAKAO_REST_API_KEY) {
    forwardHeaders.set('Authorization', `KakaoAK ${env.KAKAO_REST_API_KEY}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers: forwardHeaders,
    redirect: 'follow',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
  }

  const cacheable = !!env.TRADE_CACHE && isRtms(route, url, request.method);
  if (cacheable) {
    const key = rtmsKey(url);
    const hit = await env.TRADE_CACHE!.getWithMetadata<{ type?: string }>(key);
    if (hit.value !== null) {
      return new Response(hit.value, {
        status: 200,
        headers: { 'Content-Type': hit.metadata?.type ?? 'application/json; charset=utf-8', 'X-Trade-Cache': 'HIT', ...cors },
      });
    }
    const upstream = await fetch(targetUrl, init);
    const body = await upstream.text();
    const type = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';
    if (upstream.ok && rtmsLooksOk(body)) {
      try {
        await env.TRADE_CACHE!.put(key, body, { expirationTtl: rtmsTtl(url), metadata: { type } });
      } catch {
        // 저장 한도에 걸려도 응답은 그대로 준다
      }
    }
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': type, 'X-Trade-Cache': 'MISS', ...cors },
    });
  }

  const upstream = await fetch(targetUrl, init);
  const outHeaders = stripHopByHop(upstream.headers);
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') ?? '*';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api-drive-folder') return handleDriveFolder(request, env);
    if (url.pathname === '/api-drive-download') return handleDriveDownload(request, env);
    if (url.pathname === '/api-kakao-login') return handleSocialLogin(request, env, cors, 'kakao');
    if (url.pathname === '/api-naver-login') return handleSocialLogin(request, env, cors, 'naver');

    const route = ROUTES.find((r) => url.pathname === r.prefix || url.pathname.startsWith(`${r.prefix}/`));
    if (route) return handleProxy(request, env, route);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, routes: ROUTES.map((r) => r.prefix) }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
      });
    }

    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    });
  },
};
