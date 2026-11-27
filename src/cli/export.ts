// `npm run export -- <game.json> <out.json>` checks a game file and writes a clean copy.
// `npm run import -- <game.json>` checks a shared game file and saves it under examples/<id>/.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateGame } from "../engine/validate.js";

const [mode, input, output] = [process.argv[2], process.argv[3], process.argv[4]];

function load(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Could not read ${path} as JSON: ${(err as Error).message}`);
    process.exit(1);
  }
}

function fail(errors: string[]): never {
  console.error(`The game has ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (mode === "export" && input && output) {
  const game = load(input);
  const check = validateGame(game);
  if (!check.ok) fail(check.errors);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(game, null, 2) + "\n");
  console.log(`Exported a valid game to ${output}`);
} else if (mode === "import" && input) {
  const game = load(input) as { id?: unknown };
  const check = validateGame(game);
  if (!check.ok) fail(check.errors);
  const id = String(game.id);
  const target = join(process.cwd(), "examples", id, "game.json");
  if (existsSync(target)) {
    console.error(`${target} already exists. Rename the game's id, or remove the old folder first.`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(input, target);
  console.log(`Imported "${id}" to ${target}. Start it with: npm start -- ${target}`);
} else {
  console.error("Usage:\n  npm run export -- <game.json> <out.json>\n  npm run import -- <game.json>");
  process.exit(2);
}
