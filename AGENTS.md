# AGENTS.md: Antigravity Rules

**Stack:** Monorepo (npm workspaces): `packages/shared`, `apps/server`, `apps/web`. TypeScript everywhere.
Web: Vite + React + TailwindCSS. Server: Node.js + Express + Socket.io. Validation: Zod. Tests: Vitest.
No new dependencies without asking me.

## Architecture rules
1. Never trust the browser. The server is the absolute source of truth.
2. Clients must NEVER receive other players' hands or the true identity of face-down cards in the pile. Faces appear only in the `challenge_result` event, for the challenged play only.
3. Validate every incoming Socket.io payload with Zod. All inbound events go through one `handle(schema, fn)` wrapper that runs `safeParse` on a `.strict()` schema. Never register a raw `socket.on` with unvalidated data.
4. Strict TypeScript. Do not use `any`.
5. Mobile-first UI: design for 360x640, touch targets >= 44px, no hover-only UI, tap-to-select cards, `touch-action: manipulation`.
6. `packages/shared` holds ALL event Zod schemas; TypeScript types come from `z.infer`. No hand-written duplicate types.
7. All game logic lives in pure functions in `apps/server/src/engine/` (no sockets, no timers, no I/O). Socket handlers only validate, call the engine, and emit.
8. Identity: `playerId` is public (uuid). `sessionToken` is secret, sent only to its owner, never broadcast, never logged.
9. Never log or emit another player's cards.
10. Every slice ships Vitest tests for the logic it adds.

## Process for every slice
1. Re-read SPEC.md, AGENTS.md and PROGRESS.md.
2. Post a plan (max 10 lines: files to touch + any ambiguity in the ticket). If something is ambiguous, ask; otherwise proceed.
3. Touch nothing outside the slice scope. Do not build ahead.
4. At the end: run tests and typecheck, update PROGRESS.md, then `git commit -m "Slice N: <title>"` (git init if needed).
5. STOP and wait for my confirmation.
