// `npm run new-round-type -- <name>` scaffolds a new round type folder and a test file.
// The engine core is not changed. Register the type in validate.ts and the server when it is ready.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]{1,40}$/.test(name)) {
  console.error("Usage: npm run new-round-type -- <name>   (lowercase letters, numbers and dashes, e.g. write-ins)");
  process.exit(2);
}
const dir = join(process.cwd(), "src", "rounds", name);
const testFile = join(process.cwd(), "test", `${name}.test.ts`);
if (existsSync(dir) || existsSync(testFile)) {
  console.error(`src/rounds/${name} or test/${name}.test.ts already exists.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "scoring.ts"),
  `// ${name} round: pure scoring. Takes the guests' answers, returns scores. No I/O, so it is easy to test.

export interface ${pascal(name)}Answer {
  value: number;
}

export function score${pascal(name)}(answers: readonly ${pascal(name)}Answer[]): number {
  return answers.length;
}
`,
);
writeFileSync(
  testFile,
  `import { test } from "node:test";
import assert from "node:assert/strict";
import { score${pascal(name)} } from "../src/rounds/${name}/scoring.js";

test("${name}: scores the answers", () => {
  assert.equal(score${pascal(name)}([{ value: 1 }, { value: 2 }]), 2);
});
`,
);
console.log(`Created src/rounds/${name}/scoring.ts and test/${name}.test.ts.`);
console.log("Next: describe the round in docs/round-types.md, then run npm run check.");

function pascal(s: string): string {
  return s.split("-").map((p) => p[0]!.toUpperCase() + p.slice(1)).join("");
}
