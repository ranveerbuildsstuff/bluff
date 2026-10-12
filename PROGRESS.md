# PROGRESS.md

## Slices
- [x] Slice 1: Scaffold, identity & lobby
- [ ] Slice 2: Game setup, host settings & hidden information
- [ ] Slice 3: Play loop
- [ ] Slice 4: Challenge engine, final call & win
- [ ] Slice 5: Reconnection, hardening & proof

## Decisions & deviations
### Slice 1: Scaffold, identity & lobby
- **What was built**:
  - Monorepo configured with npm workspaces: `packages/shared`, `apps/server`, `apps/web`.
  - Shared Zod schemas (`CreateRoomRequest`, `JoinRoomRequest`, `SessionIssued`, `RoomPlayer`, `RoomView`, `ErrorEvent`, `GetRoomViewRequest`, `LeaveRoomRequest`).
  - Server with Express + Socket.io, CORS locked to `CLIENT_ORIGIN`, 10 KB buffer limit, and `handle(schema, fn)` validator wrapper.
  - In-memory `RoomManager` with 6-character room codes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), pure engine room logic, lobby-level rejoins, host transfer on leaving, and 10-minute cleanup timer for empty rooms.
  - Public `playerId` (uuid) + secret `sessionToken` stored in localStorage, reattached on handshake auth.
  - Mobile-first React client (360x640 design, >=44px touch targets) with LandingScreen, LobbyScreen, toast notifications, share/copy fallback, and `visibilitychange` auto-reconnect.
  - Vitest test suite covering room-code generator (alphabet, length, no collisions over 10k generations), player name validation, full/non-lobby join rejection, host transfer, `handle()` wrapper validation, and full Socket.io lobby integration.
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [apps/server/src/engine/room-code.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/room-code.ts)
  - [apps/server/src/engine/identity.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/identity.ts)
  - [apps/server/src/engine/room.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/room.ts)
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/handle.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/handle.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/web/src/storage.ts](file:///e:/ranveer/BLUFF/apps/web/src/storage.ts)
  - [apps/web/src/socket.ts](file:///e:/ranveer/BLUFF/apps/web/src/socket.ts)
  - [apps/web/src/components/LandingScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/LandingScreen.tsx)
  - [apps/web/src/components/LobbyScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/LobbyScreen.tsx)
  - [apps/web/src/components/ToastContainer.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/ToastContainer.tsx)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
- **Event names**:
  - Client -> Server: `create_room`, `join_room`, `get_room_view`, `leave_room`
  - Server -> Client: `session_issued`, `room_view`, `error`
- **Deviations**: None.
