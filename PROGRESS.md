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

### Fix (Slice 1): Leave room and lobby disconnect cleanup
- **What was fixed/built**:
  - `leave_room` removes the player immediately in LOBBY, frees the slot, updates player count, transfers host if host left, and broadcasts updated room view. Leaver's client clears session and returns to landing.
  - Injectable `Scheduler` introduced to `RoomManager` for deterministic timer testing.
  - In LOBBY, disconnected players remain "Offline" and are automatically removed after 60 seconds if they do not rejoin with their sessionToken.
  - Rejoining with sessionToken before 60 seconds cancels the disconnect timer and keeps the player in the room.
  - If the last player leaves or is removed after disconnect timeout, the room is deleted.
  - *Deviation/Note*: Pulled lobby-disconnect cleanup forward from Slice 5 into Slice 1 per ticket.
- **Key file paths**:
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/server/src/__tests__/leave-and-disconnect.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/leave-and-disconnect.test.ts)

### Fix (Slice 1): Connection status indicator
- **What was fixed/built**:
  - Resolved issue where connection indicator stuck on "Reconnecting..." in Chrome/Edge even while receiving updates.
  - Initial state sync on mount in `setupConnectionTracker` so existing connections aren't missed if `connect` fired prior to listener attachment or across React StrictMode remounts.
  - Added listeners across socket (`connect`, `disconnect`, `connect_error`) and manager (`reconnect`, `reconnect_attempt`, `reconnect_error`, `reconnect_failed`).
  - Derived connection status directly from `socket.connected` (`isSocketConnected || socket.connected`) and re-synced status whenever room view updates or session events arrive over the wire.
  - Added Vitest unit test suite for connection tracker logic.
- **Key file paths**:
  - [apps/web/src/connection-tracker.ts](file:///e:/ranveer/BLUFF/apps/web/src/connection-tracker.ts)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
  - [apps/web/src/socket.ts](file:///e:/ranveer/BLUFF/apps/web/src/socket.ts)
  - [apps/web/src/__tests__/connection-tracker.test.ts](file:///e:/ranveer/BLUFF/apps/web/src/__tests__/connection-tracker.test.ts)
