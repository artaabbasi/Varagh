# CLAUDE.md — Varagh (ورق) · Persian Card Games Platform

## What this project is

Varagh is a multiplayer Persian card games platform, shipped as an installable
PWA. Launch game: **Hokm** (2p / 3p / 4p variants). Future games: Shelem,
Haft Khabis, Chahar Barg (Pasur), Poker (Hold'em, Omaha).

The defining architectural promise: **adding a new game must never require
changing core server, lobby, or auth code.** A game is one self-contained
module in `packages/shared/games/<game>/` that implements the `GameDefinition`
interface, plus one registry line. If a change to core code is needed to add a
game, the core code is wrong — fix the abstraction, don't special-case.

## Tech stack

- **Monorepo:** pnpm workspaces + TypeScript project references
- **Shared:** `packages/shared` — game engines, types, the `GameDefinition` contract
- **Server:** `apps/server` — Node.js, TypeScript, Socket.IO, server-authoritative
- **Web:** `apps/web` — React 18, TypeScript, Vite, vite-plugin-pwa
- **Styling:** Material 3 Expressive via design tokens (CSS custom properties),
  `@material/web` components where they fit, custom components where they don't
- **Tests:** Vitest. Game engines require thorough unit tests (see Testing)
- **Persistence:** SQLite via better-sqlite3 (users, finished-game records).
  Live game state is in-memory on the server, JSON-serializable for recovery.

## Repository layout

```
packages/shared/
  src/
    engine/            # GameDefinition contract, Rng, shared card primitives
    games/
      index.ts         # game registry — ONE line per game
      hokm/
        index.ts       # exports the GameDefinition
        state.ts       # HokmState, HokmMove, HokmView types
        rules.ts       # pure rule functions (followSuit, trickWinner, ...)
        variants/      # 4p.ts, 3p.ts, 2p.ts — variant-specific logic
        hokm.test.ts
apps/server/
  src/
    rooms/             # room lifecycle, join codes, public lobby
    transport/         # Socket.IO handlers — thin, no game logic
    auth/              # nickname + device-token auth
    timers/            # turn timers, disconnect grace, getDefaultMove forcing
apps/web/
  src/
    app/               # routing, theming, i18n
    lobby/             # create/join/public games
    auth/              # nickname signup
    games/
      hokm/            # Hokm-specific UI (table, hand fan, trump picker)
    components/        # shared UI (cards, avatars, buttons)
    theme/             # M3 tokens, light/dark
```

## The GameEngine contract (the heart of everything)

Defined in `packages/shared/src/engine/game-engine.ts`. Every game exports a
`GameDefinition<TState, TMove, TView>` with:

- `setup(ctx)` — initial state from players + variant + options + seeded RNG
- `getValidMoves(state, player)` — all legal moves now; empty = not your turn
- `applyMove(state, player, move, rng)` — pure; returns new state + events, or a typed error
- `getPlayerView(state, player)` — redacted snapshot; the ONLY thing sent to clients
- `getOutcome(state)` — null while running
- `getDefaultMove(state, player)` — forced move on timeout/disconnect

### Hard rules for engine code

1. **Pure and deterministic.** No I/O, no `Date.now()`, no `Math.random()`.
   All randomness through the injected `Rng`. Never mutate state — return new objects.
2. **Plain-data state.** `TState` must survive `JSON.parse(JSON.stringify(state))`.
   No classes, no `Map`/`Set`, no functions in state.
3. **`applyMove` must reject any move not in `getValidMoves`.** They are two
   views of the same rule set and must never disagree.
4. **No game rules in UI or transport.** The web app asks `getValidMoves` what
   is playable; the server asks `applyMove` whether it happened. If a React
   component contains "must follow suit" logic, that's a bug.

## Server rules

- **Server-authoritative.** Full state exists only on the server. Clients
  receive `getPlayerView()` output and visibility-filtered events. A client
  must NEVER receive another player's hand, the deck, or unredacted state —
  treat any such leak as a security bug.
- **Transport is thin.** Socket handlers: authenticate → look up room →
  call engine → broadcast views/events. No conditionals about specific games.
- **Reconnection:** device token re-joins a live seat within the grace period.
  After grace, server plays `getDefaultMove` on the player's turns until they
  return; after prolonged absence the room may vote to replace with leave/end.
- **Rooms:** 6-character uppercase join codes (no ambiguous chars: 0/O, 1/I).
  Rooms are private by default; creator can list publicly in the lobby.

## Auth (deliberately minimal)

- Signup = pick a nickname. Server issues a long random device token stored in
  localStorage. That token IS the account.
- Optional 4-digit PIN lets a user recover the nickname on a new device.
- No email, no password rules, no verification. Friction kills fun.
- Nicknames: 2–20 chars, Persian and Latin letters, digits, spaces. Uniqueness
  NOT required (display name + short discriminator like `Sara#4821`).

## Design system — Material 3 Expressive

- Tokens first: all colors/typography/shape/spacing as CSS custom properties in
  `apps/web/src/theme/`. Components consume tokens, never raw hex values.
- Light + dark themes, default to `prefers-color-scheme`, user toggle persisted.
- Expressive flavor: large rounded shapes, springy motion on card plays and
  trick collection, bold display type for scores. Playful, not noisy.
- Mobile-first. Touch targets ≥ 48px. The game table layout is designed for
  portrait phones first, then scales up.
- **RTL is first-class.** UI is bilingual (fa/en). Use logical CSS properties
  (`margin-inline-start`, not `margin-left`). Test every screen in both
  directions. All user-facing strings go through i18n — no hardcoded text.
- Card faces: standard French suits with large indices; suits must be
  distinguishable without color alone (accessibility).

## Testing expectations

- Every game engine ships with unit tests covering, at minimum:
  - legal/illegal move validation (e.g. follow-suit enforcement)
  - turn order and phase transitions
  - win/score resolution including edge cases (Hokm: kot 7–0, Hakem rotation,
    trump-on-void plays, last-trick edge cases)
  - determinism: same seed + same moves = identical final state
- Engines are tested with fixed-seed RNGs and scripted move sequences. Tests
  must not depend on server or UI code.
- Server gets integration tests for: room lifecycle, view redaction (assert a
  client never receives another hand), reconnect flow.
- Run `pnpm test` before declaring any task complete.

## Coding conventions

- TypeScript `strict: true` everywhere. No `any` in `packages/shared` —
  the registry's type erasure is the single sanctioned exception.
- Prefer small pure functions in `rules.ts` files; engine methods compose them.
- Errors to users are typed + localized (`MoveError` with `{ en, fa }` messages).
- Commit after each working milestone. Conventional commit messages.
- When rules for a game variant are ambiguous or regional, ASK the maintainer
  which house rules apply before implementing — do not guess silently.

## Hokm reference rules (canonical for this project)

**4-player (launch variant):** two teams of two, partners across. Full 52-card
deck. Hakem (ruler) determined initially by first-ace deal; thereafter Hakem
keeps the seat while their team wins, passes to the next player
(counter-clockwise) when their team loses a hand. Deal: Hakem receives 5 cards,
chooses trump (hokm), then everyone is dealt to 13 (batches of 4-4-5 in deal
order). Hakem leads the first trick. Must follow suit if able; otherwise any
card (trumping not mandatory). Trick won by highest trump, else highest card
of led suit. First team to 7 tricks wins the hand: 1 point; 7–0 (kot) = 2
points; if the Hakem's team is kotted (hakem-kot) = 3 points. First team to 7
points wins the game.

**3-player:** remove the 2♥ (51 cards, 17 each). No teams — Hakem plays alone
against the other two who temporarily cooperate. Hakem must take 7 tricks to
score; either opponent side needs 7 combined to defeat the Hakem.

**2-player:** each player ends with 13 playable cards. Deal 5 + trump choice as
usual; then draw-and-discard mechanics determine the final hands (Hakem draws
first from stock: keep-or-discard rules per agreed variant). Confirm exact
stock mechanics with maintainer before implementing — regional versions differ.

These are the house rules of record. If an implementation detail is still
ambiguous after reading this, ask — do not invent.