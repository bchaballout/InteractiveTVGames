# How to add a game

You do not need to be a programmer. You can make a game in about 15 minutes by copying a starter and editing it, or by describing it to an AI assistant such as Claude Code.

## Option A: the game builder (no code)

1. Open a terminal in the project folder and run `npm install` (only needed once).
2. Run `npm run builder`.
3. Open http://localhost:4000 in your browser.
4. Edit the game as text. Press **Check** to see every problem, fix them, and press **Download game.json**.
5. Save the file as `examples/<your-game-id>/game.json`.
6. Run `npm start -- examples/<your-game-id>/game.json` to play it.

## Option B: start from a template

1. Run `npm run new-game -- <your-game-id>`. Use lowercase letters, numbers and dashes, for example `birthday-roast`.
2. Edit `examples/<your-game-id>/game.json`. Change the title, entries and rounds.
3. Run `npm run validate -- examples/<your-game-id>/game.json`. Fix every problem it lists.
4. Run `npm start -- examples/<your-game-id>/game.json`.

## Option C: describe it to an AI assistant

Open Claude Code (or another assistant) in the project folder and say what you want, for example:

> Make me a game where guests vote for the best birthday cake and answer three trivia questions about the birthday person.

The assistant reads `CLAUDE.md` and writes the game file. Check its result with `npm run validate` before you play.

## What goes in a game

- **Title and id.** The title is shown on the TV. The id is a short name for the folder.
- **Entries.** The people or things guests vote on, such as dishes or names. Each needs a unique id.
- **Rounds.** The steps of the game, in order. Pick from seven types: ranked picks, trivia, poll, rating, superlatives, head-to-head and write-ins. See `docs/round-types.md`.

The full rules are in `docs/game-format.md`.

## Before you share it

- Check that it validates.
- Use only original text, or photos and music you have permission to use. See `NOTICE.md` for the licence rules.
- Leave out real people's private details and any guests' answers.
- To share it with the project, follow `docs/community-game-template.md` and `CONTRIBUTING.md`.

## Import a game someone sent you

Run `npm run import -- <path-to-game.json>`. It checks the file and saves it under `examples/`. It will not overwrite a game that is already there.
