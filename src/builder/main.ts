// `npm run builder` opens the game builder at http://localhost:4000.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBuilderServer } from "./builder-server.js";

const starterPath = process.argv[2] ?? join(process.cwd(), "examples/trivia-night/game.json");
const port = Number(process.env.BUILDER_PORT ?? 4000);
const starter = readFileSync(starterPath, "utf8");
createBuilderServer(starter).listen(port, "127.0.0.1", () => {
  console.log(`\nGame builder: http://localhost:${port}\n(Starting from ${starterPath}. Press Ctrl+C to stop.)\n`);
});
