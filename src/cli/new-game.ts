// `npm run new-game -- <game-id>` creates examples/<game-id>/game.json from a starter template.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateGame } from "../engine/validate.js";

const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
  console.error("Usage: npm run new-game -- <game-id>   (lowercase letters, numbers and dashes)");
  process.exit(2);
}
const dir = join(process.cwd(), "examples", id);
const file = join(dir, "game.json");
if (existsSync(file)) {
  console.error(`${file} already exists. Choose another id or edit that file.`);
  process.exit(1);
}
const starter = {
  schemaVersion: 1,
  id,
  title: "My new game",
  entries: [
    { id: "first", name: "First choice" },
    { id: "second", name: "Second choice" },
  ],
  rounds: [
    {
      id: "main-round",
      type: "ranked-picks",
      title: "Your ranking",
      entryIds: ["first", "second"],
      config: { maxPicks: 2, points: [2, 1] },
    },
  ],
};
const check = validateGame(starter);
if (!check.ok) throw new Error(`Starter template is invalid: ${check.errors.join("; ")}`);
mkdirSync(dir, { recursive: true });
writeFileSync(file, JSON.stringify(starter, null, 2) + "\n");
console.log(`Created ${file}. Edit the title, entries and rounds, then run: npm run validate -- ${file}`);
