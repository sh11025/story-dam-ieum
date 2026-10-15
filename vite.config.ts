import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { createApp, optionsFromEnv } from './server/app.ts';

// 개발할 때(npm run dev) 화면과 서버 기능(/api)을 한 주소에서 같이 실행합니다.
function devApi(): Plugin {
  return {
    name: 'story-dam-ieum-dev-api',
    configureServer(server) {
      const listener = getRequestListener(createApp(optionsFromEnv()).fetch);
      server.middlewares.use((req, res, next) =>
        req.url?.startsWith('/api/') ? listener(req, res) : next(),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
