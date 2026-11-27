# Party Game Engine

An open-source engine for phone-and-TV party games. Clone it, describe the game you want to Claude, and get a working game you can put on your TV.

> Status: early build. The engine core, the game format and ranked-picks scoring work and are tested. The TV and phone screens are not built yet.

## What works today

- A game format (`game.json`) with schema version 1 and a validator that reports every error at once.
- Ranked picks: guests rank up to N entries; points by rank; tied totals share a rank (1, 1, 3).
- One vote per browser, enforced in the ballot store. Exact retries are counted once.
- Live rooms: add an entry mid-game without changing the room id, join code, or existing ballots.
- The Thanksgiving Cook-off example game (`examples/thanksgiving-cookoff/`).

## Quick start

```bash
npm install
npm run check
```

`npm run check` runs the type checks, the tests (12 at the moment) and the build.

## Making your own game

Open Claude Code (or another AI coding assistant) in this folder and say, for example:

> Make me a game where guests rank the best birthday cake and the best party song.

The assistant reads `CLAUDE.md` and `docs/game-format.md`, writes a game file, and checks it. See `docs/round-types.md` to add a new kind of round.

## Documentation

- `docs/game-format.md`: the game file, with examples.
- `docs/round-types.md`: round types and how to add one.
- `CLAUDE.md` / `AGENTS.md`: instructions for AI assistants.

## Licence

MIT. See `LICENSE`. Third-party material is listed in `NOTICE.md`.

## How it runs (no hosting needed)

There is no central server run by the author. Whoever downloads this repo runs it on their own computer:

1. Install Node.js (version 22 or newer), then run `npm install` and `npm start`.
2. Plug a laptop into the TV and open the TV page it shows (`http://localhost:...`).
3. Guests scan the QR code on the TV with their phones. Phones must be on the same Wi-Fi as the laptop.

Nothing leaves your home network unless you choose to put the app on the internet yourself. The `npm start` step is not built yet; this section describes the plan.
