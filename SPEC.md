# SPEC.md: Multiplayer Bluff Card Game

**Core Goal:** A mobile-first web app where players join a room via a code and play Bluff (Cheat) in real time.
**Target Audience:** Mobile users playing with friends.
**Data:** In-memory server state only. No database for v1.

## Core Features (v1)
1. Room creation and joining via a 6-character code (alphabet without 0/O/1/I). 2–8 players. The creator is the host.
2. The host chooses how many cards each player gets in the lobby (see Rules).
3. Server-authoritative game: dealing, turn tracking, rotating required rank, challenge resolution, win condition.
4. The Play: the current player selects 1–4 cards and places them face down in the central pile, claiming the required rank.
5. The Challenge: any other player taps "Call Bluff" on the latest play. The server resolves it and the loser takes the pile.
6. Reconnection: a dropped player can rejoin; the game pauses for up to 60 seconds.

## Non-Goals (do NOT build)
User accounts, persistent leaderboards, custom avatars, chat, bots, matchmaking with strangers, general animations. The only allowed animation is the card flip when a challenge is revealed, plus basic CSS transitions.

## Rules (single source of truth)
- Players: 2–8. One 52-card deck only. Max cardsPerPlayer = min(15, floor(52 / playerCount)). Anything higher is rejected.
- The host picks `cardsPerPlayer` (integer 3 to max) in the lobby: presets 5 / 7 / 10 (disabled when above the max) plus a custom stepper. Recommended default by player count: 2–3 players -> 10, 4–5 -> 7, 6–8 -> 5. The default auto-updates as players join/leave only until the host picks manually. If a join lowers the max below the current value, clamp it down and tell the host.
- Deal: shuffle, then deal round-robin so every player gets exactly `cardsPerPlayer`. Undealt cards are out of play for the whole game.
- Rotating required rank (server-owned): starts at A, then 2, 3 ... K, wraps to A. Advances by one after every play. Players NEVER choose a rank. Challenges do not reset it.
- A play: the current player puts 1–4 cards face down, claiming "N x requiredRank".
- Challenge: any player except the one who just played may call bluff, on the most recent play only, and only before the next play. All cards match the declared rank (truth) -> challenger picks up the whole pile. Any mismatch (bluff) -> the player who played picks it up. The pile empties. The challenge winner takes the next turn.
- Win: first player to empty their hand. Final call: when a play empties a hand, others get 10 seconds to challenge. No challenge -> that player wins. Challenged and truthful -> they win. Challenged and bluff -> they pick up the pile and play continues.
- Hidden information: a client only ever receives its own hand. Other hands and the pile are counts only. Card faces are revealed only in the `challenge_result` event, and only for the challenged play.

## Roadmap (build ONE slice per ticket; never build ahead, but never make choices that block later slices)
1. Scaffold, identity (playerId + sessionToken) & lobby
2. Game setup: engine basics, host settings, dealing, hidden-information boundary
3. Play loop: play 1–4 cards, rotating rank, turn order
4. Challenge engine, final call, win, play again
5. Reconnection (PAUSED state), hardening, integration tests, production build

Note: `GameState.status` includes LOBBY | PLAYING | FINAL_CALL | PAUSED | GAME_OVER from Slice 2 on, so later slices extend instead of rewrite.
