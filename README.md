# Party Game Engine

An open-source engine for phone-and-TV party games. Clone it, describe the game you want to Claude, and get a working game you can put on your TV.

> Status: working build. Seven round types, a room server, a TV screen, phone voting, host controls, a QR code and a browser game builder. Not yet tested on real phones or in a live game night.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything (once) |
| `npm start` | Runs the game on this computer. Prints the TV link, phone link, QR code and host link |
| `npm run builder` | Opens the game builder at http://localhost:4000 |
| `npm run validate -- <game.json>` | Checks a game file and lists every problem |
| `npm run new-game -- <id>` | Creates `examples/<id>/game.json` from a starter |
| `npm run new-round-type -- <name>` | Creates a new round type folder and a test |
| `npm run export -- <game.json> <out.json>` | Writes a checked copy of a game |
| `npm run import -- <game.json>` | Checks a shared game and saves it under `examples/` |
| `npm run check` | Type check, build and all tests |

## What works today

- A game format (`game.json`) with schema version 1 and a validator that reports every error at once.
- Seven round types: ranked picks, trivia (timed, speed bonus), poll, rating, superlatives, head-to-head and write-ins.
- Ranked picks: guests rank up to N entries; points by rank; tied totals share a rank (1, 1, 3).
- One vote per browser, enforced in the ballot store. Exact retries are counted once.
- Live rooms: add an entry mid-game without changing the room id, join code, or existing ballots.
- Example games: Thanksgiving Cook-off, Trivia Night and Office Superlatives.

## Quick start

```bash
npm install
npm run check
```

`npm run check` runs the type checks, the build and all tests.

## Making your own game

Open Claude Code (or another AI coding assistant) in this folder and say, for example:

> Make me a game where guests rank the best birthday cake and the best party song.

The assistant reads `CLAUDE.md` and `docs/game-format.md`, writes a game file, and checks it. See `docs/round-types.md` to add a new kind of round.

## Documentation

- `docs/adding-a-game.md`: how to make a game, with or without code.
- `CODE_OF_CONDUCT.md`: how we treat each other.
- `CONTRIBUTING.md`: how to share games and round types.
- `docs/community-game-template.md`: template for sharing a game.

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

Nothing leaves your home network unless you choose to put the app on the internet yourself. The TV and phone pages work now; the QR code on the TV is still to come, so for now type the phone address shown in the terminal.
