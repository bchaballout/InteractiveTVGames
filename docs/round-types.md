# Round types

A round type is one folder under `src/rounds/<type-name>/`. It must export:

1. a **config check** (is the round's `config` valid?),
2. a **scoring function** (pure: ballots in, scores out),
3. later, a **phone UI** and a **TV UI**.

## Shipped

| Type | Status |
| --- | --- |
| `ranked-picks` | Scoring and validation done (`src/rounds/ranked-picks/scoring.ts`). Phone and TV UI not built yet. |

## Planned (from the build brief)

Single-choice poll, trivia, write-ins, rating scale, head-to-head bracket, superlatives.

## Adding a new round type

1. Create `src/rounds/<your-type>/`.
2. Add the type name to `validateGame()` in `src/engine/validate.ts` and give it its config rules.
3. Write a scoring function that takes ballots and returns scores. Keep it free of I/O so it can be tested.
4. Add tests next to the existing ones in `test/`.
5. Run `npm run check`.

Engine core files (`ballots.ts`, `room.ts`, `types.ts`) should not need changes for a new type.
