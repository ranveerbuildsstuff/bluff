# Bluff Multiplayer Card Game

A real-time, mobile-first web implementation of the classic bluffing card game (also known as Cheat, I Doubt It, or Bullshit).

## Stack & Architecture
- **Monorepo:** npm workspaces (`packages/shared`, `apps/server`, `apps/web`)
- **Backend:** Node.js, Express, Socket.io, TypeScript
- **Frontend:** React, Vite, TailwindCSS, TypeScript
- **Validation:** Zod schemas across all boundaries (`packages/shared`)
- **Testing:** Vitest, `@vitest/coverage-v8`
- **Security:** Strict privacy boundaries—hidden information (other players' cards, face-down pile cards) is never sent across the wire or logged; card faces appear only inside `challenge_result.revealedCards` for the challenged play.

---

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Run dev mode (Vite client + Tsx watch server)
npm run dev
```

The web client runs at `http://localhost:3000` and the server at `http://localhost:3001`.

---

## Production Build & Single-Process Execution

The application is engineered to compile and run as a single process with same-origin hosting, eliminating CORS friction:

```bash
# 1. Build shared schemas, server, and client bundle
npm run build

# 2. Start the unified production server
npm start
```

The server listens on `0.0.0.0` and `process.env.PORT` (defaults to `3001`). When `apps/web/dist` exists, Express serves the static production bundle and handles SPA fallback routing while Socket.io handles real-time game events on the same port.

### Join by Link Verification
Verify that room link joins work on the single-process production build:
1. Run `npm run build && npm start`.
2. Open `http://localhost:3001/?room=ABC234` in a browser (or over Wi-Fi with your IP).
3. The landing page opens with room code `ABC234` prefilled in uppercase, focus on the name field, and a small line stating "You're joining room ABC234".
4. The address bar automatically cleans the `?room=...` query parameter via `history.replaceState` so page refreshes do not re-apply it. Invalid room codes are silently ignored.

---

## Playing on Phones Over the Same Wi-Fi

You can host a game on your computer and have friends join from their mobile phones over your local Wi-Fi:

1. **Find your computer's local IP address:**
   - On Windows: Open Command Prompt or PowerShell and run `ipconfig`. Look for the IPv4 Address under your active Wi-Fi adapter (e.g., `192.168.1.45`).
   - On macOS/Linux: Run `ifconfig` or `ip a` (e.g., `192.168.1.45`).
2. **Start the production server:**
   ```bash
   npm run build
   npm start
   ```
   *(Optionally specify a port: `PORT=3001 npm start`)*
3. **Connect from phones:**
   - Ensure all phones are connected to the same Wi-Fi network as the host computer.
   - Open a mobile browser on each phone and navigate to `http://<your-local-ip>:<port>` (e.g., `http://192.168.1.45:3001`).
4. **Firewall Notice (Windows):**
   - If Windows Defender Firewall displays an alert asking whether to allow Node.js to communicate on networks, check **Private networks** (e.g., home or work network) and click **Allow access**.

---

## Free-Tier Deployment (Single Web Service with WebSockets)

The application can be deployed to any free-tier or container cloud platform supporting Node.js and persistent WebSocket connections (such as Render, Railway, Fly.io, or Koyeb):

1. **Deploy Settings:**
   - **Environment:** Node.js (v20+ recommended)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `PORT`: Automatically set by the hosting platform (e.g., `10000` or `8080`).
     - `NODE_ENV`: `production`
     - `CLIENT_ORIGIN`: Optional. If omitted, same-origin WebSocket connections are permitted automatically.
2. **WebSockets Support:**
   - Ensure WebSocket support is enabled on the cloud provider's ingress proxy (enabled by default on Render and Railway).
3. **Important Lifecycle & In-Memory State Notice:**
   - **In-Memory State:** Rooms, game engines, and player sessions live in Node.js server memory.
   - **Free-Tier Sleep/Restart:** Free instances sleep after periods of inactivity and restart on new incoming traffic. When an instance sleeps or restarts, existing in-memory rooms are reset.

---

## Testing & Quality Assurance

```bash
# Typecheck all packages and apps
npm run typecheck

# Run test suite
npm test

# Run test suite with V8 coverage report
npm run test:coverage
```

- Target coverage for pure game logic (`apps/server/src/engine/`): **>= 90%** across statements, branches, functions, and lines.
