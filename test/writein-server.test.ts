import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRoomServer } from "../src/server/room-server.js";
import { validateGame } from "../src/engine/validate.js";
import type { GameDefinition } from "../src/engine/types.js";

const TOKEN = "writein-host-token-0123456789";
const game: GameDefinition = {
  schemaVersion: 1,
  id: "wi",
  title: "Write-ins",
  entries: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  rounds: [
    { id: "wins", type: "write-ins", title: "Wins", config: { maxLength: 40 }, questions: [{ id: "q", prompt: "Biggest win?" }] },
    { id: "h2h", type: "head-to-head", title: "Head to head", questions: [{ id: "m", prompt: "Better?", entryIds: ["a", "b"] }] },
  ],
};
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
const host = (path: string, body?: unknown) =>
  fetch(base + path + "?token=" + TOKEN, body === undefined ? { method: "POST" } : post(body));

test("write-ins: the game file validates, including head-to-head with exactly two entries", () => {
  assert.deepEqual(validateGame(game), { ok: true, errors: [] });
  const bad = structuredClone(game);
  (bad.rounds[1] as { questions: { entryIds: string[] }[] }).questions[0]!.entryIds = ["a", "b", "a"];
  assert.equal(validateGame(bad).ok, false);
});

test("write-ins: guests send text; empty or too-long text is refused", async () => {
  const g = browser();
  const stepId = (await (await g("/api/state")).json()).stepId;
  assert.equal((await g("/api/ballot", post({ stepId, text: "   " }))).status, 400);
  assert.equal((await g("/api/ballot", post({ stepId, text: "x".repeat(41) }))).status, 400);
  assert.equal((await g("/api/ballot", post({ stepId, text: "The gravy" }))).status, 200);
  assert.equal((await g("/api/ballot", post({ stepId, text: "Again" }))).status, 409);
});

test("write-ins: guests never see answers; the TV sees only what the host shows", async () => {
  const g2 = browser();
  const stepId = (await (await g2("/api/state")).json()).stepId;
  await g2("/api/ballot", post({ stepId, text: "Pie crust" }));
  const tv = await (await fetch(base + "/api/state")).json();
  assert.equal(tv.ballotCount, 2);
  assert.deepEqual(tv.shownTexts, []);
  const hostView = await (await fetch(base + "/api/host/state?token=" + TOKEN)).json();
  assert.deepEqual(hostView.writeIns.map((w: { text: string }) => w.text), ["The gravy", "Pie crust"]);
  await host("/api/host/show", { index: 1 });
  assert.deepEqual((await (await fetch(base + "/api/state")).json()).shownTexts, ["Pie crust"]);
  assert.equal((await host("/api/host/show", { index: 9 })).status, 400);
});

test("write-ins: answers stay anonymous in every public response", async () => {
  const text = await (await fetch(base + "/api/state")).text();
  assert.doesNotMatch(text, /pge_voter|voterId|"name":/);
  assert.equal((await host("/api/host/reveal")).status, 409, "reveal is replaced by Show for write-ins");
});

test("head-to-head: one matchup per question, with the two entries as choices", async () => {
  await host("/api/host/next");
  const s = await (await fetch(base + "/api/state")).json();
  assert.equal(s.kind, "superlative");
  assert.deepEqual(s.choices, ["A", "B"]);
});
