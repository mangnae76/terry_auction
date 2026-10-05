import { handleSocialLogin } from './socialLogin';

export interface Env {
  KAKAO_REST_API_KEY?: string;
  /** 브이월드 오픈API 인증키 — 공동주택/개별주택 공시가격 조회 (query 의 key 로 붙는다) */
  VWORLD_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

interface Route {
  prefix: string;
  target: string;
  headers?: Record<string, string>;
  /** kakao = Authorization 헤더, vworld = query 의 key */
  authKind?: 'kakao' | 'vworld';
}

const ROUTES: Route[] = [
  { prefix: '/api-data', target: 'https://apis.data.go.kr' },
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
