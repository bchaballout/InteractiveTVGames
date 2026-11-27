import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const cli = (script: string, ...args: string[]) =>
  execFileSync("node", [join(root, "dist/cli", script), ...args], { encoding: "utf8", cwd: root, stdio: "pipe" });

test("export then import round-trips a game unchanged", () => {
  const out = join(root, "dist-test", "roundtrip.json");
  cli("export.js", "export", join(root, "examples/office-superlatives/game.json"), out);
  const exported = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(exported.id, "office-superlatives");
  const shadow = JSON.parse(readFileSync(join(root, "examples/office-superlatives/game.json"), "utf8"));
  assert.deepEqual(exported, shadow);
});

test("import refuses to overwrite an existing game", () => {
  assert.throws(() => cli("export.js", "import", join(root, "examples/office-superlatives/game.json")), /already exists/);
});

test("new-game creates a valid starter and refuses to overwrite", () => {
  const id = "cli-test-game";
  const file = join(root, "examples", id, "game.json");
  try {
    cli("new-game.js", id);
    assert.ok(existsSync(file));
    assert.match(cli("validate.js", file), /is a valid game/);
    assert.throws(() => cli("new-game.js", id), /already exists/);
  } finally {
    rmSync(join(root, "examples", id), { recursive: true, force: true });
  }
});

test("new-round-type scaffolds a folder and a test", () => {
  const name = "cli-test-type";
  const dir = join(root, "src/rounds", name);
  const testFile = join(root, "test", `${name}.test.ts`);
  try {
    cli("new-round-type.js", name);
    assert.ok(existsSync(join(dir, "scoring.ts")));
    assert.ok(existsSync(testFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(testFile, { force: true });
  }
});

test("builder page serves and checks a game sent from the browser", async () => {
  const { createBuilderServer } = await import("../src/builder/builder-server.js");
  const server = createBuilderServer("{}");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(page, /Game builder/);
    const bad = await (await fetch(`http://127.0.0.1:${port}/api/validate`, { method: "POST", body: '{"schemaVersion":1}' })).json();
    assert.equal(bad.ok, false);
    const broken = await (await fetch(`http://127.0.0.1:${port}/api/validate`, { method: "POST", body: "{nope" })).json();
    assert.match(broken.errors[0], /not valid JSON/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
