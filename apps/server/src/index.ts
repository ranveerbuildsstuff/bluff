import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketServer } from './socket/index.js';
import { RoomManager } from './room-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const host = '0.0.0.0';
// Production: check if apps/web/dist exists
const possibleDistPaths = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
];
const distPath = possibleDistPaths.find((p) => fs.existsSync(p));

const clientOrigin: string | boolean = process.env.CLIENT_ORIGIN || (distPath ? true : 'http://localhost:3000');

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

if (distPath) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
  maxHttpBufferSize: 10 * 1024, // 10 KB
});

const roomManager = new RoomManager();
setupSocketServer(io, roomManager);

server.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port} (CORS locked to: ${clientOrigin})`);
});
