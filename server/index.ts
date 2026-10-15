// Render에서 실행되는 서버의 시작점입니다.
// 만들어 둔 화면 파일(dist)을 보여 주고, /api 요청은 app.ts로 넘깁니다.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp, optionsFromEnv } from './app.ts';

const root = new Hono();
// 보안 관련 기본 설정
root.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  c.header('x-frame-options', 'DENY');
});

root.route('/', createApp(optionsFromEnv()));

// 이름에 해시가 붙은 파일(assets/)은 오래 보관해도 되고, 나머지는 매번 새로 확인합니다.
root.use(
  '/assets/*',
  serveStatic({
    root: './dist',
    onFound: (_p, c) => c.header('cache-control', 'public, max-age=31536000, immutable'),
  }),
);
root.use('*', serveStatic({ root: './dist' }));
// 화면 주소(/home, /resume 등)는 모두 index.html로 보냅니다.
root.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Story Dam Ieum 서버 실행 중: http://localhost:${info.port}`);
});
