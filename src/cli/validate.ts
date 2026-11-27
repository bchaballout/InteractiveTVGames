// `npm run validate -- <path-to-game.json>` checks a game file and lists every problem.
import { readFileSync } from "node:fs";
import { validateGame } from "../engine/validate.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run validate -- examples/<game>/game.json");
  process.exit(2);
}

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.error(`Could not read ${path} as JSON: ${(err as Error).message}`);
  process.exit(1);
}

const result = validateGame(parsed);
if (result.ok) {
  console.log(`OK: ${path} is a valid game.`);
} else {
  console.error(`${path} has ${result.errors.length} problem(s):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
