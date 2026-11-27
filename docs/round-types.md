# Round types

A round type is one folder under `src/rounds/<type-name>/`. It must export:

1. a **config check** (is the round's `config` valid?),
2. a **scoring function** (pure: ballots in, scores out),
3. later, a **phone UI** and a **TV UI**.

## Shipped (schema version 1)

| Type | What guests do | What the TV shows |
| --- | --- | --- |
| `ranked-picks` | Rank up to N entries, tap in order | Live scores, cards reorder, leader highlighted |
| `trivia` | Pick one answer before the timer ends | Timer, live anonymous counts, correct answer and leaderboard after reveal |
| `poll` | Pick one choice | Live anonymous counts |
| `rating` | Pick a number from 1 to 5 or 1 to 10 | Live counts; average after reveal |
| `superlatives` | Vote for one entry ("most likely to…") | Live counts; the winner after reveal |
| `head-to-head` | Pick one of exactly two entries | Live counts; the winner after reveal |
| `write-ins` | Type a short anonymous answer | Only the answers the host chooses to show, one at a time, as a large pop-up |

Scoring code lives in `src/rounds/<type>/`. The server connects each type in `src/server/room-server.ts`.

## Planned

Bracket (a full knockout tree that advances winners). Head-to-head covers single matchups for now.

## Adding a new round type

1. Run `npm run new-round-type -- <your-type>`. It creates the folder and a starter test.
2. Add the type name to `validateGame()` in `src/engine/validate.ts` and give it its config rules.
3. Write a scoring function that takes ballots and returns scores. Keep it free of I/O so it can be tested.
4. Add tests next to the existing ones in `test/`.
5. Run `npm run check`.

Engine core files (`ballots.ts`, `room.ts`, `types.ts`) should not need changes for a new type.
