import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRoomServer } from "../src/server/room-server.js";
import { validateGame } from "../src/engine/validate.js";
import type { GameDefinition } from "../src/engine/types.js";

const TOKEN = "question-host-token-0123456789";
const game = JSON.parse(readFileSync(join(process.cwd(), "examples/office-superlatives/game.json"), "utf8")) as GameDefinition;
let server: Server;
let base = "";

before(async () => {
  server = await createRoomServer({ game, joinUrl: "http://192.168.1.20:3000/join", hostToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

function browser() {
  let cookie = "";
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return res;
  };
}
const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const host = (path: string) => fetch(base + path + "?token=" + TOKEN, { method: "POST" });
const state = async (cookie?: string) => (await fetch(base + "/api/state", { headers: cookie ? { cookie } : {} })).json();

test("example office game is valid", () => {
  assert.deepEqual(validateGame(game), { ok: true, errors: [] });
});

test("superlatives: guests vote for a person, and the winner shows after reveal", async () => {
  const s = await state(); // first question of the game
  assert.equal(s.kind, "superlative");
  assert.deepEqual(s.choices, ["Priya", "Sam", "Lee"]);
  const a = browser();
  const b = browser();
  assert.equal((await a("/api/ballot", post({ stepId: s.stepId, choice: 1 }))).status, 200);
  assert.equal((await b("/api/ballot", post({ stepId: s.stepId, choice: 1 }))).status, 200);
  await host("/api/host/reveal");
  const after = await state();
  assert.deepEqual(after.counts, [0, 2, 0]);
  assert.deepEqual(after.winners, [1]);
});

test("poll: counts are live and there is no right answer", async () => {
  await host("/api/host/next"); // second superlative
  await host("/api/host/next"); // poll
  const s = await state();
  assert.equal(s.kind, "poll");
  assert.equal(s.revealed, false);
  const g = browser();
  await g("/api/ballot", post({ stepId: s.stepId, choice: 2 }));
  assert.deepEqual((await state()).counts, [0, 0, 1]);
});

test("rating: accepts 1 to scale only, and shows the average after reveal", async () => {
  await host("/api/host/next"); // rating
  const s = await state();
  assert.equal(s.kind, "rating");
  assert.equal(s.scale, 5);
  const g = browser();
  assert.equal((await g("/api/ballot", post({ stepId: s.stepId, rating: 6 }))).status, 400);
  assert.equal((await g("/api/ballot", post({ stepId: s.stepId, rating: 4 }))).status, 200);
  const h = browser();
  await h("/api/ballot", post({ stepId: s.stepId, rating: 5 }));
  assert.equal((await state()).average, undefined, "average hidden until reveal");
  await host("/api/host/reveal");
  assert.equal((await state()).average, 4.5);
});

test("a guest who refreshes keeps their place: same cookie, same question, already voted", async () => {
  await host("/api/host/previous"); // back to the poll
  const guest = browser();
  const s = await (await guest("/api/state")).json();
  assert.equal(s.kind, "poll");
  assert.equal((await guest("/api/ballot", post({ stepId: s.stepId, choice: 0 }))).status, 200);
  const refreshed = await (await guest("/api/state")).json();
  assert.equal(refreshed.stepId, s.stepId, "still on the same question");
  assert.equal(refreshed.youHaveVoted, true, "still shown as voted");
  assert.equal(refreshed.yourChoice, 0);
  assert.equal((await guest("/api/ballot", post({ stepId: s.stepId, choice: 1 }))).status, 409, "cannot vote again");
});
