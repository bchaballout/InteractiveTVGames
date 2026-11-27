# Instructions for AI assistants building games in this repo

You are helping someone make a party game for their TV and phones. The person may not be a programmer. Keep replies short and plain.

## What this repo is
- An **engine** (`src/engine/`) that runs rooms, ballots and scoring.
- **Round types** (`src/rounds/<type>/`), each a self-contained folder.
- **Example games** (`examples/<name>/game.json`). Read `examples/thanksgiving-cookoff/game.json` first; it is the reference.
- Schema: `docs/game-format.md`. Round types: `docs/round-types.md`.

## Making a new game
1. Ask only what you cannot guess: the game's purpose, the entries (people or things to vote on), and the round types.
2. Write `examples/<game-id>/game.json` (or a folder the person names). Use `schemaVersion: 1`.
3. Entries need unique lowercase `id`s. Rounds refer to entries by `id`.
4. Run `npm run validate -- examples/<game-id>/game.json` (once the CLI helper exists) or call `validateGame()`. Fix every error.
5. Tell the person what they still need to provide: photos, names, the TV theme, anything else.

## Rules
- **Do not edit engine core files** (`src/engine/*`) to make one game work. If a game needs a mechanic that does not exist, add a new round type folder following `docs/round-types.md`.
- Never put personal photos, names of real private people, or guest answers in the repo. Guest data is not stored in game files.
- Never add a dependency with a licence outside MIT, BSD, Apache-2.0, ISC, CC0 or CC-BY. List any new one in `NOTICE.md`.
- Original work only. Do not copy another game's name, branding, screens or sounds.
- Do not make the repo public, deploy, or add paid services without the owner's explicit yes.

## Testing
- `npm run check` runs type checks, tests and the build. Run it before every commit and make it pass.
- Add a test when you add a round type or change scoring.

## Commits
- Keep commits small. Do not commit secrets, `.env` files, or `node_modules`.
- Do not include model names in commit messages or PR text.
