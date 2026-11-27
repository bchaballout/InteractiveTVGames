# Contributing

Thank you for helping. This project is MIT-licensed and open to anyone.

## Before you start
- Read `README.md`, `docs/game-format.md` and `docs/round-types.md`.
- Run `npm install` and `npm run check`. Everything should pass before you change anything.

## Sharing a community game
1. Make it with `npm run new-game -- <your-game-id>` (or the game builder: `npm run builder`).
2. Check it with `npm run validate -- examples/<your-game-id>/game.json`.
3. Use `docs/community-game-template.md` to describe it.
4. Only include original work, or assets whose licence fits MIT (see `NOTICE.md`). No real people's photos without their permission. No guest answers.

## Adding a round type
Run `npm run new-round-type -- <name>`, follow `docs/round-types.md`, and add tests. Do not change engine core files just for one game.

## Pull requests
- Keep changes small and focused.
- `npm run check` must pass.
- Do not commit secrets, `.env` files or `node_modules`.
