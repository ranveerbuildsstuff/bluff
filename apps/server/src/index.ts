import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketServer } from './socket/index.js';
import { RoomManager } from './room-manager.js';
import { initStatsService, StatsService } from './stats/index.js';
import { createApiRouter, createIpRateLimiter } from './http/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(options?: {
  statsService?: StatsService;
  customOrigin?: string | boolean;
}) {
  const app = express();
  const statsService = options?.statsService ?? initStatsService();

  const possibleDistPaths = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  const distPath = possibleDistPaths.find((p) => fs.existsSync(p));

  const clientOrigin: string | boolean =
    options?.customOrigin ??
    (process.env.CLIENT_ORIGIN || (distPath ? true : 'http://localhost:3000'));

  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, status: 'healthy' });
  });

  app.use('/api', createIpRateLimiter());
  app.use(
    '/api',
    createApiRouter({
      statsStore: statsService.store,
      tokenVerifier: statsService.verifier,
      accountsEnabled: statsService.enabled,
    })
  );

  if (distPath) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/socket.io') ||
        req.path.startsWith('/api') ||
        req.path === '/health'
      ) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, statsService, clientOrigin };
}

const { app, statsService, clientOrigin } = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const host = '0.0.0.0';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
  maxHttpBufferSize: 10 * 1024, // 10 KB
});

const roomManager = new RoomManager(undefined, undefined, statsService.store);
setupSocketServer(io, roomManager, statsService.verifier);

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, host, () => {
    console.log(`Server listening on ${host}:${port} (CORS locked to: ${clientOrigin})`);
  });
}

export { app, server, io, roomManager, statsService };
