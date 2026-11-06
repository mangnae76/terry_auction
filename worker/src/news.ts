// 부동산 뉴스 — 언론사가 공개한 부동산 RSS 몇 곳을 모아 최신순 목록(JSON)으로 준다. 대문 「부동산 뉴스」 상자가 읽는다.
// 30분 동안은 저장해 둔 목록을 그대로 준다(언론사를 매번 부르지 않는다). 한 곳이 안 받아져도 나머지로 만든다.
import type { Env } from './index';

const FEEDS: Array<{ src: string; url: string }> = [
  { src: '한국경제', url: 'https://www.hankyung.com/feed/realestate' },
  { src: '조선비즈', url: 'https://biz.chosun.com/arc/outboundfeeds/rss/category/real_estate/?outputType=xml' },
  { src: '서울경제', url: 'https://www.sedaily.com/rss/realestate' },
  { src: '파이낸셜뉴스', url: 'https://www.fnnews.com/rss/r20/fn_realnews_realestate.xml' },
];
const KEY = 'news:realestate:v4';
const TTL = 1800;
const LIMIT = 12;

export interface NewsItem { src: string; title: string; link: string; at: string }

const unwrap = (s: string) =>
  s.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1].trim()) : '';
};

const readFeed = async (f: { src: string; url: string }): Promise<NewsItem[]> => {
  const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyTurnNews/1.0)' } });
  if (!r.ok) return [];
  const xml = await r.text();
  return xml.split(/<item[\s>]/).slice(1).map((it) => {
    const t = Date.parse(tag(it, 'pubDate'));
    return { src: f.src, title: tag(it, 'title'), link: tag(it, 'link'), at: Number.isFinite(t) ? new Date(t).toISOString() : '' };
  }).filter((x) => x.title && /^https?:\/\//.test(x.link) && x.at);
};

const PER_SRC = 3;
// 제목 두 글자씩 묶음 — 같은 소식을 여러 곳이 쓴 기사를 가린다
const grams = (t: string) => {
  const c = t.replace(/\[[^\]]*\]/g, '').replace(/兆/g, '조').replace(/[^가-힣A-Za-z0-9]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < c.length - 1; i += 1) g.add(c.slice(i, i + 2));
  return g;
};
const alike = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  a.forEach((x) => { if (b.has(x)) n += 1; });
  return n / Math.max(1, Math.min(a.size, b.size)) >= 0.4;
};

const build = async (): Promise<NewsItem[]> => {
  const all = (await Promise.allSettled(FEEDS.map(readFeed))).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  all.sort((a, b) => b.at.localeCompare(a.at));
  const out: NewsItem[] = [];
  const kept: Array<Set<string>> = [];
  const per: Record<string, number> = {};
  for (const x of all) {
    if (out.length >= LIMIT) break;
    if (/^\[(속보|포토|사진|부고|인사)\]/.test(x.title)) continue;   // 부동산 피드에 섞여 오는 다른 기사
    if ((per[x.src] ?? 0) >= PER_SRC) continue;                      // 한 곳이 목록을 다 차지하지 않게
    const g = grams(x.title);
    if (kept.some((k) => alike(g, k))) continue;
    kept.push(g);
    per[x.src] = (per[x.src] ?? 0) + 1;
    out.push(x);
  }
  return out;
};

export const handleNews = async (env: Env, cors: Record<string, string>): Promise<Response> => {
  const json = (body: string, hit: string) =>
    new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-News-Cache': hit, ...cors } });
  const cached = env.TRADE_CACHE ? await env.TRADE_CACHE.get(KEY) : null;
  if (cached) return json(cached, 'HIT');
  const items = await build();
  const body = JSON.stringify({ at: new Date().toISOString(), items });
  if (items.length && env.TRADE_CACHE) {
    try { await env.TRADE_CACHE.put(KEY, body, { expirationTtl: TTL }); } catch { /* 저장 한도에 걸려도 응답은 그대로 */ }
  }
  return json(body, 'MISS');
};
