# CLAUDE.md — Varagh (ورق) · Persian Card Games Platform

## What this project is

Varagh is a multiplayer Persian card games platform, shipped as an installable
PWA. Shipped games: **Hokm** (2p / 3p / 4p variants), **Pasur** / Chahar Barg
(2p; more variants to come), and **Shelem** (4p partnership bidding &
trick-taking). Future games: Haft Khabis, Poker (Hold'em, Omaha).

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
      pasur/           # Chahar Barg — fishing game (only 2p ships for now)
        index.ts       # exports the GameDefinition
        state.ts       # PasurState, PasurMove, PasurView types
        rules.ts       # pure rule functions (captures, Sur, scoring, ...)
        bot.ts         # view-only bot brain (getBotMove)
        variants/      # 2p.ts — 3p/4p slot in here later
        pasur.test.ts
apps/server/
  src/
    rooms/             # room lifecycle, join codes, public lobby
    transport/         # Socket.IO handlers — thin, no game logic
    auth/              # nickname + device-token auth
    timers/            # turn timers, disconnect grace, bot-takeover hook
apps/web/
  src/
    app/               # routing, theming, i18n
    lobby/             # create/join/public games (registry-driven, game-agnostic)
    auth/              # nickname signup
    games/
      RoomRouter.tsx   # picks the game UI by room.gameId (web game-UI registry)
      hokm/            # Hokm-specific UI (table, hand fan, trump picker)
      pasur/           # Pasur-specific UI (pool, hand, combination picker)
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
- `getBotMove(state, player, rng)` — OPTIONAL bot brain. The platform's generic
  bot-takeover hook plays computer seats and substitutes for a human who dropped
  past the grace period with this, falling back to `getDefaultMove` when a game
  omits it. Like a client it may read ONLY what `getPlayerView` exposes — never
  another seat's hand or the deck. The human-like pacing is the server's job.

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
  After grace, the **generic bot-takeover hook** plays the seat — the registered
  game bot (`getBotMove`) if it has one, else `getDefaultMove` — until the player
  returns, at which point the seat silently reverts to them (the current turn is
  rescheduled with a full timer). The human-like think delay lives in the server
  timer layer, never in the pure engine. This hook is part of the platform
  contract: any game gets bot substitution for free by exporting `getBotMove`.
  After prolonged absence the room may vote to replace with leave/end.
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

Trump (Hakem) rotation runs in the **same direction as play** (the next seat in
turn order): the Hakem keeps the seat while their side wins the hand and passes
it to the next player in play order on a loss. This holds for every variant.

**4-player (launch variant):** two teams of two, partners across. Full 52-card
deck. Hakem (ruler) determined initially by first-ace deal; thereafter Hakem
keeps the seat while their team wins, passes to the next player (in play order)
when their team loses a hand. Deal: Hakem receives 5 cards,
chooses trump (hokm), then everyone is dealt to 13 (batches of 4-4-5 in deal
order). Hakem leads the first trick. Must follow suit if able; otherwise any
card (trumping not mandatory). Trick won by highest trump, else highest card
of led suit. First team to 7 tricks wins the hand: 1 point; 7–0 (kot) = 2
points; if the Hakem's team is kotted (hakem-kot) = 3 points. First team to 7
points wins the game.

**3-player:** remove the 2♥ (51 cards, 17 each). **Free-for-all — no teams and
no cooperation: each player scores only their own tricks.** The first player to
reach 7 of the 17 tricks wins the hand for 1 point. A 7–0–0 sweep is a kot
(2 points); a sweep by a non-Hakem while the Hakem takes 0 is a hakem-kot
(3 points). Only the winning seat scores — the other two gain nothing. In the
rare case all 17 tricks are played with no one at 7 (a 6–6–5 split), the top
trick count wins and the Hakem takes a tie.

**2-player:** each player ends with 13 playable cards. Deal 5 + trump choice as
usual; then draw-and-discard mechanics determine the final hands (Hakem draws
first from stock: keep-or-discard rules per agreed variant). Confirm exact
stock mechanics with maintainer before implementing — regional versions differ.

These are the house rules of record. If an implementation detail is still
ambiguous after reading this, ask — do not invent.

## Pasur reference rules (canonical for this project)

Pasur (چهاربرگ), also called **Chahar Barg**, is a fishing game on a standard
52-card deck. Only the **2-player** variant ships today; it lives under
`variants/2p.ts` so 3p/4p can be added later with no core changes. The engine is
pure/deterministic and server-authoritative like every Varagh game.

**Deal.** A **round** is one full 52-card deck played out. At the start of a
round, 4 cards go face-up to the central **pool** and 4 to each player; the rest
of the deck is then dealt 4-to-each (the pool is laid once per round) until it is
exhausted (2p: six sub-deals of four). The **opening pool never contains a
Jack** — any Jack dealt into the opening four is buried back into the deck and
replaced until the pool is Jack-free, done deterministically through the
injected RNG.

**Captures.** On your turn you play one card:
- A **numeral** (A=1 … 10=10) captures pool numerals that sum *with it* to
  exactly 11.
- A **Jack** captures every pool numeral and Jack at once — never a Queen or
  King.
- A **Queen** captures Queens, and a **King** captures Kings, by rank match only
  — the only way Q/K ever leave the pool.
- A card that captures nothing stays face-up in the pool.
Captured cards (plus the capturing card) go face-down to your pile.

**Player chooses the combination.** When a played numeral could complete more
than one distinct sum-to-11 combination, *the player* picks which one — the
engine never chooses for them. Each distinct combination is its own entry in
`getValidMoves` (the move carries the exact pool cards it takes) and the UI
presents the options. The `multiCapture` option below overrides only this "take
all" case.

**End of round & winning.** When the deck is exhausted, every card left in the
pool goes to the last player who made a capture, the round is tallied, and its
points are added to each player's cumulative game score. The **starter rotates**
to the next seat and a fresh round is dealt. The first player to reach the
**target score** — default **62**, configurable per game via the `targetScore`
option — wins; an exact tie at the final tally is a draw.

**Scoring (per round).** Each Ace = 1, each Jack = 1, the 2♣ = 2, the 10♦ = 3.
**Most clubs (Haft Khâj)** = a flat 7 to whoever captured the most clubs (a tie
awards it to no one). **Sur** = 5 points each: clearing the pool with a capture.
Two Sur restrictions are always enforced: no Sur on the final deal of a round,
and clearing the pool with a Jack never scores a Sur.

**Toggleable rules** (chosen pre-game, all default OFF, passed through the
standard `options` channel that `setup(ctx)` receives, surfaced as bilingual
fa/en toggles, and kept extensible for future Pasur options):
- **Sur disabled at 50+** — a player at 50+ points (as of the last tally) can no
  longer score a Sur.
- **Net Surs only (tit-for-tat)** — an opponent's later Sur cancels one of
  yours; only the net Sur count scores.
- **Capture all combinations** — when one card completes several distinct
  sum-to-11 combinations, take all of them this turn instead of picking one.

**Bot & disconnect substitution.** Pasur ships a bot (`getBotMove`) that plays
from the redacted view only — never an opponent's hand or the deck — preferring
captures and valuing Surs and high-value cards (2♣, 10♦, clubs, Aces, Jacks). It
plays computer seats and, through the platform's generic bot-takeover hook,
substitutes for a disconnected human after the grace period (with a short
human-like think delay in the server timer layer), reverting the instant the
player returns.

These are the house rules of record. If an implementation detail is still
ambiguous after reading this, ask — do not invent.

## Shelem reference rules (canonical for this project)

Shelem (شلم) is a 4-player **partnership bidding & trick-taking** game on a
standard 52-card deck (no jokers, rank A high → 2). Only the **4-player**
variant ships, living under `variants/4p.ts`. Two teams of two sit across —
seats {0,2} vs {1,3} — mirroring Hokm 4p's seat/team model exactly. The engine
is pure/deterministic and server-authoritative like every Varagh game. Phases:
`bidding → zaminExchange → playing → gameOver` (a finished round emits a
`roundOver` event and immediately deals the next round's bidding).

**Deal.** 12 cards to each player in batches of 4; the remaining 4 form the
**Zamin** (زمین), face-down in the middle.

**Bidding.** Rises in steps of **5 with NO minimum floor**, starting left of the
dealer. **Pass is permanent.** Numeric bids are capped one step below the round
total (5…160 at aceValue 10; 5…180 at 15); claiming the full total requires a
**Shelem (slam) call**, which outranks every numeric bid. The highest bidder
becomes **Hakem** (declarer). **If all four players pass with no bid, the deal is
void: the dealer rotates and a fresh round is dealt.**

**Zamin exchange.** The Hakem picks up the 4 Zamin (now holds 16) and buries
**any 4 face-down into their own team's pile** — those 4 discards COUNT toward
the team's captured points, and the buried pile also counts as one trick
(see scoring). Back to 12 cards.

**Trump.** There is **no separate trump-picker step.** After the exchange the
Hakem **leads any card to trick 1, and that card's suit retroactively becomes
trump** (`trumpSuit` is null until that lead). Every later trick uses normal
follow-suit logic: follow the led suit if able, else any card; highest trump
wins, else the highest card of the led suit.

**Card-points (the exact model).** Each Ace = 10 (option: 15), each 10 = 10,
each 5 = 5, **AND each trick won = 5**. There are 12 played tricks plus the
buried **Zamin pile, which counts as a 13th trick** (worth 5, always the Hakem
team's). Round total = 4×Ace + 4×10 + 4×5 + 13×5 = **165** (or **185** at
aceValue 15) — asserted as an invariant.

**Scoring per round.** The Hakem's team must reach its bid to score it; the
opponents ALWAYS score exactly the card-points they made. Play continues across
rounds (dealer/starter rotates each round) until a team reaches the **target
score** (default **1165**); the higher score wins, the Hakem team taking ties.

**Toggleable rules** (pre-game, via the standard `options` channel, bilingual
fa/en, surfaced generically by the lobby; defaults noted):
- **Failed-contract penalty** (default `simple`): `simple` = lose exactly the
  bid; `doubled` = lose the bid, doubled when the Hakem team scored less than the
  opponents; `yasa` = if the Hakem team scored less than the opponents, take the
  full round total (165 / 185) as negative.
- **Zamin reveal** (default `private`): `private` (only the Hakem sees the 4
  Zamin) vs `reveal` (face-up to all, then the Hakem takes them) — affects
  `getPlayerView` redaction.
- **Target score** (numeric, default `1165`; common 600 / 1165 / 1200).
- **Shelem (slam) reward** (default `330`): a successful slam scores `330`, or
  `bidX2` = twice the slam's effective bid (the full round total).
- **Ace value** (default `10`): `10` (165-point round) vs `15` (185-point round).
- **Successful-contract score** (default `bidExact`): `bidExact` (score the bid,
  capped) vs `actual` (score the actual card-points made, uncapped).

A Shelem's effective bid for the `bidX2` reward and the failure penalty is the
full round total (165 / 185). A failed slam pays the chosen failure penalty
against that total.

**Bot & disconnect substitution.** Shelem ships a bot (`getBotMove`) that plays
from the redacted view only — a hand-strength bidding heuristic and a card-play
heuristic (lead strong, follow suit, win point-rich tricks, feed points to the
partner). Through the platform's generic bot-takeover hook it plays computer
seats and substitutes for a disconnected human after the grace period (short
human-like think delay in the server timer layer), reverting when they return.

These are the house rules of record. If an implementation detail is still
ambiguous after reading this, ask — do not invent.