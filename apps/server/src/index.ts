import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketServer } from './socket/index.js';
import { RoomManager } from './room-manager.js';

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

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

server.listen(port, () => {
  console.log(`Server listening on port ${port} (CORS locked to: ${clientOrigin})`);
});
