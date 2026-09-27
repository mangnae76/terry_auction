import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

const driveFolderApiPlugin = (): Plugin => ({
  name: 'drive-folder-api',
  configureServer(server) {
    server.middlewares.use('/api-drive-folder', async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const folderId = requestUrl.searchParams.get('folderId')?.trim();

        if (!folderId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'folderId is required' }));
          return;
        }

        const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`);
        if (!response.ok) {
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: `drive fetch failed: ${response.status}` }));
          return;
        }

        const html = await response.text();
        const regex = /data-id="([^"]+)"[\s\S]{0,600}?data-tooltip="([^"]+\.pdf)[^"]*"/gi;
        const files: Array<{ id: string; name: string; downloadUrl: string }> = [];
        const seen = new Set<string>();
        let match: RegExpExecArray | null;

        while ((match = regex.exec(html)) !== null) {
          const [, id, name] = match;
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
          files.push({
            id,
            name,
            downloadUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download`,
          });
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ files }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'unknown error',
          }),
        );
      }
    });

    server.middlewares.use('/api-drive-download', async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const fileId = requestUrl.searchParams.get('id')?.trim();

        if (!fileId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'id is required' }));
          return;
        }

        const response = await fetch(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
        if (!response.ok) {
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: `drive download failed: ${response.status}` }));
          return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const disposition = response.headers.get('content-disposition');
        const contentType = response.headers.get('content-type') ?? 'application/pdf';

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        if (disposition) {
          res.setHeader('Content-Disposition', disposition);
        }
        res.end(buffer);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'unknown error',
          }),
        );
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue(), driveFolderApiPlugin()],
    server: {
      proxy: {
        '/api-data': {
          target: 'https://apis.data.go.kr',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-data/, ''),
        },
        '/api-onbid': {
          target: 'https://openapi.onbid.co.kr',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-onbid/, ''),
        },
        '/api-geo': {
          target: 'https://nominatim.openstreetmap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-geo/, ''),
          headers: {
            Referer: 'http://localhost:5173',
            'User-Agent': 'terry-auction/1.0',
          },
        },
        '/api-kakao': {
          target: 'https://dapi.kakao.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-kakao/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.VITE_KAKAO_REST_API_KEY) {
                proxyReq.setHeader('Authorization', `KakaoAK ${env.VITE_KAKAO_REST_API_KEY}`);
              }
            });
          },
        },
        '/api-kakao-navi': {
          target: 'https://apis-navi.kakaomobility.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-kakao-navi/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.VITE_KAKAO_REST_API_KEY) {
                proxyReq.setHeader('Authorization', `KakaoAK ${env.VITE_KAKAO_REST_API_KEY}`);
              }
            });
          },
        },
        '/api-osrm': {
          target: 'https://router.project-osrm.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-osrm/, ''),
        },
        '/api-naver-land': {
          target: 'https://new.land.naver.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-naver-land/, ''),
          headers: {
            Referer: 'https://new.land.naver.com/',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
        },
        '/api-court': {
          target: 'https://www.courtauction.go.kr',
          changeOrigin: true,
          secure: true,
          autoRewrite: true,
          followRedirects: true,
          rewrite: (path) => path.replace(/^\/api-court/, ''),
          cookieDomainRewrite: 'localhost',
          cookiePathRewrite: '/',
          headers: {
            Referer: 'https://www.courtauction.go.kr/pgj/index.on',
            Origin: 'https://www.courtauction.go.kr',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
          },
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const loc = proxyRes.headers['location'];
              if (typeof loc === 'string') {
                proxyRes.headers['location'] = loc
                  .replace(/^https?:\/\/www\.courtauction\.go\.kr/, '/api-court')
                  .replace(/^https?:\/\/courtauction\.go\.kr/, '/api-court');
              }
            });
          },
        },
      },
    },
  };
});
