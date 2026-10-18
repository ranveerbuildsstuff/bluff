# PROGRESS.md

## Slices
- [x] Slice 1: Scaffold, identity & lobby
- [x] Slice 2: Game setup, host settings & hidden information
- [x] Slice 3: Play loop
- [x] Slice 4: Challenge engine, final call & win
- [x] Slice 5: Reconnection, hardening & proof

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

### Slice 2: Game setup, host settings & hidden information
- **What was built**:
  - Shared Zod schemas + inferred types for `Card` (ids like `H-7`, `S-K`), `Suit`, `Rank`, `PileEntry`, `Player`, `GameState`, `PublicGameState`, `PublicPlayerView`, `PublicPileView`, `RoomSettings`, `UpdateSettingsRequest`, `StartGameRequest`, and `SettingsClamped`.
  - Helpers `maxCardsPerPlayer(playerCount)` and `recommendedCardsPerPlayer(playerCount)` exported from `@bluff/shared` so UI and server share identical calculations.
  - Deterministic card sorting `sortCards(cards)` ordering by Rank (A..K) then Suit (H, D, C, S).
  - Pure engine module `apps/server/src/engine/game.ts`: `createDeck()` (52 cards), `shuffle(cards, rng)` (Fisher-Yates), `dealCards(deck, playerIds, cardsPerPlayer)` (round-robin dealing, undealt cards discarded), `startGame(room, rng)` (random first player, `requiredRank = 'A'`, `playSeq = 0`), and `toPublicState(state, viewerId)` (security boundary).
  - Security boundary: viewers receive only their own hand; opponents receive only `handCount`; pile entries show only card count and last play summary without card identities; `sessionToken` is never included.
  - Host settings management: tracking `cardsPerPlayerSource: 'auto' | 'host'`. Auto updates follow recommended value on join/leave. When in host mode, joining players that reduce max below current setting automatically clamp the setting to the new max and emit `settings_clamped` to the host.
  - `start_game` event: host-only, requires at least 2 players in LOBBY, re-validates `cardsPerPlayer <= maxCardsPerPlayer`, transitions status to `PLAYING`, emits `room_view`, and calls `emitGameState(roomCode)` to push individual hidden-state views to all sockets.
  - Web UI:
    - Lobby: Host controls with preset chips (5 / 7 / 10), recommended badge, disabled state when above max, custom stepper (3 to max) with "max N" indicator, and "Deal & Start Game" button (disabled if < 2 players). Non-hosts see read-only settings view.
    - Game screen (`GameScreen.tsx`): Required rank banner, turn status indicator, face-down central pile stack with count, opponents grid with live connection dots, card counts, and turn highlight, plus player's hand as mobile-optimized CSS cards with 44px+ touch targets and rank/suit sorting.
  - Comprehensive tests in `slice2-game-setup.test.ts` and `slice2-socket-integration.test.ts` covering 52 unique cards, seeded Fisher-Yates permutation, max cards formula for 2–8 players, recommended helper bounds, round-robin dealing, non-host rejection, clamp-on-join, full socket integration, and leak assertion test proving zero other card identities and zero session tokens leak across the wire.
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [apps/server/src/engine/game.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/game.ts)
  - [apps/server/src/engine/room.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/room.ts)
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/web/src/components/LobbyScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/LobbyScreen.tsx)
  - [apps/web/src/components/GameScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/GameScreen.tsx)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
  - [apps/server/src/__tests__/slice2-game-setup.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice2-game-setup.test.ts)
  - [apps/server/src/__tests__/slice2-socket-integration.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice2-socket-integration.test.ts)
- **Event names**:
  - Client -> Server: `update_settings`, `start_game`
  - Server -> Client: `settings_clamped`, `game_state`
- **Deviations**: None.

### Slice 3: Play loop
- **What was built**:
  - Shared strict Zod schema `PlayTurnRequestSchema`: `selectedCardIds: string[]` (1 to 4 unique strings). Strict schema rejects any `declaredRank` or unrecognized keys.
  - Rank cycle helper `getNextRank(currentRank)` advancing `A, 2...K` and wrapping `K -> A`.
  - Pure engine module `apps/server/src/engine/game.ts`: `playTurn(state, playerId, cardIds)`:
    - Validates status is `PLAYING`, player is `currentTurnId`, card count is 1..4, card ids unique, and all cards exist in the player's hand.
    - Pure mutation removing played cards from hand, incrementing `playSeq`, pushing new `PileEntry` `{ playSeq, playerId, cards, declaredRank: state.requiredRank, count }`, advancing `requiredRank` (wrapping K -> A), and rotating `currentTurnId` in `turnOrder` (wrapping around).
    - Detects empty hand condition: transitions `status` to `'FINAL_CALL'` and records `winnerId` as pending winner.
  - `RoomManager.playTurn`: delegates to engine, updates room game state and room status.
  - Server Socket.io handler: `play_turn` event validated via `handle()`. Rejections emit typed `ErrorEvent` to that socket only. Valid plays emit `ROOM_VIEW` and `emitGameState` to broadcast hidden state to all room players.
  - Web UI (`GameScreen.tsx`):
    - Tap-to-toggle card selection (up to 4 cards max; selected cards lift with CSS transition, border highlight, and amber glow).
    - Sticky bottom action bar displaying dynamic label: `"Play 2 cards as 7s"` (using server's required rank), enabled only on your turn with 1–4 cards selected.
    - Central pile announces last play: `"<PlayerName> played 2 x 7s"`.
    - Obvious "YOUR TURN" status banner with high-contrast indicator.
    - Clears selection after a successful play. No optimistic updates; client waits strictly for authoritative server game state.
  - Vitest test suite (`slice3-play-loop.test.ts`) covering all 10 requirements: valid play updates (hand, pile, playSeq, turn, rank), wrong turn rejection, missing card in hand rejection, duplicate IDs rejection, 0 and 5 cards rejection, rank wrap K -> A, turn order wrap, FINAL_CALL transition on empty hand, strict schema rejection of declaredRank and unknown keys, and privacy leak checks.
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [apps/server/src/engine/game.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/game.ts)
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/web/src/components/GameScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/GameScreen.tsx)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
  - [apps/server/src/__tests__/slice3-play-loop.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice3-play-loop.test.ts)
- **Event names**:
  - Client -> Server: `play_turn`
  - Server -> Client: `game_state`, `error`
### Fix (UI wording): Rank labels
- **What was fixed/built**:
  - Added shared helper `rankLabel(rank, count)` in `@bluff/shared`:
    - Names: A -> Ace/Aces, J -> Jack/Jacks, Q -> Queen/Queens, K -> King/Kings, numbers -> 2/2s ... 10/10s.
    - Singular when count is 1, plural otherwise (default count is 2 / plural).
  - Updated UI rank references in `GameScreen.tsx`:
    - Required rank banner: `"Claim must be: Aces"` (with big card letter preserved as before).
    - Play bar: `"Play 2 cards as Aces"` / `"Play 1 card as an Ace"` (using "an" before Ace and "a" before other ranks).
    - Pile caption: `"<Player> played 1 x Ace"` / `"<Player> played 2 x 7s"`.
  - Added unit test suite in `packages/shared/src/__tests__/rank-label.test.ts` covering singular and plural for A, J, Q, K, 2, 10.
  - **Rule for later slices**: Later slices must use `rankLabel` for any rank text shown to players.
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [packages/shared/src/__tests__/rank-label.test.ts](file:///e:/ranveer/BLUFF/packages/shared/src/__tests__/rank-label.test.ts)
  - [apps/web/src/components/GameScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/GameScreen.tsx)

### Slice 4: Challenge engine, final call & win
- **What was built**:
  - Shared strict Zod schemas and inferred types: `CallBluffRequestSchema` (`{ playSeq }`), `ChallengeResultSchema` (`{ playSeq, challengerId, accusedId, declaredRank, revealedCards, wasBluff, pickedUpById, pickedUpCount }`), and `PlayAgainRequestSchema` (`{}`).
  - Added `finalCallDeadline` to `GameStateSchema` and `PublicGameStateSchema`, and defined constant `FINAL_CALL_MS = 10000`.
  - Pure engine module `apps/server/src/engine/game.ts`:
    - `callBluff(state, challengerId, playSeq)` validating callable status (`PLAYING` or `FINAL_CALL`), non-empty pile, playSeq freshness (`STALE_CHALLENGE`), challenger presence, and self-challenge rejection (`CANNOT_CHALLENGE_SELF`).
    - Truthful resolution: verifies all revealed cards match declaredRank. Loser (truthful ? challenger : accused) receives all pile cards into hand; `centralPile` empties; challenge winner takes `currentTurnId`; `requiredRank` is preserved without reset.
    - Final call resolution: truthful challenge in `FINAL_CALL` triggers `GAME_OVER` with empty-handed player as winner; bluff challenge returns status to `PLAYING`, liar picks up pile, and challenger takes turn.
  - Concurrency & RoomManager:
    - In-memory sequential queue `enqueueRoomAction` per room code ensuring sequential processing and preventing concurrent challenge race conditions.
    - Final call timer behind injectable `Scheduler`: broadcasts `finalCallDeadline` and transitions room to `GAME_OVER` upon 10-second expiry if unchallenged.
    - `playAgain(roomCode, requesterId)` host-only event resetting room state to `LOBBY` while keeping players and settings.
  - Web UI:
    - Fixed-bottom "Call Bluff" button with double-tap prevention, enabled only when pile is non-empty and last play was not yours.
    - Reveal overlay featuring CSS 3D card flip animation, "BLUFF!" or "TRUTHFUL!" banner, and pickup announcement; auto-dismisses after 3.5s or on tap.
    - Real-time countdown ticker during `FINAL_CALL` computed from `finalCallDeadline` with `serverNow` clock offset.
    - Game Over modal with winner celebration and host-only "Play Again" button.
  - Comprehensive Vitest test suite (`slice4-challenge-engine.test.ts`):
    - Covers truth case, bluff case, multi-entry pile pickup, winner turn advancement, unchanged requiredRank, stale playSeq rejection, self-challenge rejection, empty pile challenge, simultaneous challenges (second rejected), final call timer expiry to win, final call + truth to win, final call + bluff continuation, revealedCards containment, and 3-tab end-to-end full game integration test proving hidden-information boundary (card faces appear strictly inside `challenge_result`).
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [apps/server/src/engine/game.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/game.ts)
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/web/src/components/GameScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/GameScreen.tsx)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
  - [apps/server/src/__tests__/slice4-challenge-engine.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice4-challenge-engine.test.ts)
- **Event names**:
  - Client -> Server: `call_bluff`, `play_again`
  - Server -> Client: `challenge_result`, `game_state`, `room_view`, `error`
- **Deviations**: None.

### Slice 5: Reconnection, hardening & proof
- **What was built**:
  - Pure engine game functions: `pauseGame(state, now, graceMs)`, `resumeGame(state, now)`, and `abandonGame(state, abandonedPlayerName)`.
  - Pause on disconnect: when a socket disconnects during `PLAYING` or `FINAL_CALL`, marks player disconnected, pauses room, stores `pausedFrom`, calculates and saves `finalCallRemainingMs`, cancels final call timer, and schedules a 60-second grace timer per disconnected player.
  - While `PAUSED`, `play_turn` and `call_bluff` are strictly rejected with error code `GAME_PAUSED`.
  - Reconnection via `sessionToken`: restoring connection updates socket association, emits private `game_state`, stays `PAUSED` if other players remain disconnected, and resumes status to `pausedFrom` once all players are back. If resuming `FINAL_CALL`, remaining time is preserved (scheduled as `now + finalCallRemainingMs`, not reset to 10s).
  - Abandonment: if a grace timer reaches 60s without return, room transitions to `GAME_OVER` with `endedReason: 'PLAYER_ABANDONED'` and winner cleared (`winnerId: undefined`), broadcasts to all, and schedules room deletion after 2 minutes.
  - Abuse protection: per-socket token bucket (~10 events/sec, capacity 10, refill 10/s) dropping excess with error code `RATE_LIMITED`. Payload limit enforced at 10 KB via `maxHttpBufferSize`.
  - Security audit:
    - Vitest scanner test failing if any `socket.on` is registered outside the `handle()` wrapper (except the built-in `disconnect`).
    - Automated assertion that every inbound schema is `.strict()`.
    - Zero leaks: `sessionToken` and other players' cards never appear in outbound payloads or logs (card faces appear strictly inside `challenge_result.revealedCards`).
    - Error messages contain no sensitive state.
    - Zero `console.log` of game state.
  - Client enhancements:
    - Immediate reconnection on page refresh/reopen and `visibilitychange` with stored `sessionToken`.
    - `PAUSED` countdown overlay: "Waiting for {name} to reconnect ({X}s)" synchronized using `serverNow` clock offset.
    - `PLAYER_ABANDONED` screen: "Game ended: {name} didn't come back" with a Leave button returning to landing screen.
    - Uses `rankLabel` for all rank references.
  - End-to-end integration test (`slice5-integration.test.ts`): 3 real `socket.io-client` connections covering settings update, start, truthful challenge, bluff-caught challenge, mid-game pause and resume, final-call preserved time resume, abandonment on grace expiry, `play_again` return to lobby, and full frame assertion confirming zero card leaks to opponent views.
  - Production & Deployment:
    - Single-process static serving: Express serves `apps/web/dist` SPA when built, listening on `0.0.0.0` and `process.env.PORT`.
    - `README.md` documentation covering local Wi-Fi mobile gameplay instructions and free-tier single-process deployment guide.
  - Testing & V8 Coverage:
    - Installed and configured `@vitest/coverage-v8`.
    - `npm run test:coverage` achieves **98.01%** Statements, **93.67%** Branches, **100%** Functions, and **98.01%** Lines on `apps/server/src/engine/` (exceeding the >= 90% target).
- **Key file paths**:
  - [packages/shared/src/index.ts](file:///e:/ranveer/BLUFF/packages/shared/src/index.ts)
  - [apps/server/src/engine/game.ts](file:///e:/ranveer/BLUFF/apps/server/src/engine/game.ts)
  - [apps/server/src/room-manager.ts](file:///e:/ranveer/BLUFF/apps/server/src/room-manager.ts)
  - [apps/server/src/socket/handle.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/handle.ts)
  - [apps/server/src/socket/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/socket/index.ts)
  - [apps/server/src/index.ts](file:///e:/ranveer/BLUFF/apps/server/src/index.ts)
  - [apps/web/src/components/GameScreen.tsx](file:///e:/ranveer/BLUFF/apps/web/src/components/GameScreen.tsx)
  - [apps/web/src/App.tsx](file:///e:/ranveer/BLUFF/apps/web/src/App.tsx)
  - [apps/server/src/__tests__/slice5-reconnection-pause.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice5-reconnection-pause.test.ts)
  - [apps/server/src/__tests__/security-audit.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/security-audit.test.ts)
  - [apps/server/src/__tests__/slice5-integration.test.ts](file:///e:/ranveer/BLUFF/apps/server/src/__tests__/slice5-integration.test.ts)
  - [README.md](file:///e:/ranveer/BLUFF/README.md)
  - [vitest.config.ts](file:///e:/ranveer/BLUFF/vitest.config.ts)
- **Event names**:
  - Client -> Server: `create_room`, `join_room`, `update_settings`, `start_game`, `play_turn`, `call_bluff`, `play_again`, `leave_room`, `get_room_view`
  - Server -> Client: `player_disconnected`, `player_reconnected`, `session_issued`, `room_view`, `game_state`, `challenge_result`, `error`
- **Deviations**: None.



