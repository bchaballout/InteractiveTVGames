import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRoomServer } from "../src/server/room-server.js";
import type { GameDefinition } from "../src/engine/types.js";

const TOKEN = "trivia-host-token-0123456789";
const game: GameDefinition = {
  schemaVersion: 1,
  id: "mixed",
  title: "Mixed",
  entries: [{ id: "gravy", name: "Gravy" }],
  rounds: [
    { id: "dish", type: "ranked-picks", title: "Dish", entryIds: ["gravy"], config: { maxPicks: 1, points: [3] } },
    {
      id: "quiz",
      type: "trivia",
      title: "Quiz",
      config: { questionSeconds: 20, speedBonusMax: 0 },
      questions: [
        { id: "q1", prompt: "2 + 2?", choices: ["3", "4"], correctIndex: 1, points: 100 },
        { id: "q2", prompt: "Capital of Italy?", choices: ["Rome", "Milan"], correctIndex: 0, points: 100 },
      ],
    },
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
const post = (path: string, body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const host = (path: string, body?: unknown) =>
  fetch(base + path + "?token=" + TOKEN, body === undefined ? { method: "POST" } : post(path, body));

test("host moves from ranked picks to the first trivia question", async () => {
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.kind, "ranked");
  const next = await host("/api/host/next");
  const hostState = await next.json();
  assert.equal(hostState.kind, "trivia");
  assert.equal(hostState.question.prompt, "2 + 2?");
  assert.equal(hostState.question.correctIndex, undefined, "answer key is hidden until reveal");
});

test("guests answer trivia once; answers are hidden until reveal", async () => {
  const guest = browser();
  const stepId = (await (await guest("/api/state")).json()).stepId;
  assert.equal((await guest("/api/ballot", post("/api/ballot", { stepId, choice: 1 }))).status, 200);
  assert.equal((await guest("/api/ballot", post("/api/ballot", { stepId, choice: 0 }))).status, 409);
  const state = await (await guest("/api/state")).json();
  assert.equal(state.question.correctIndex, undefined);
  assert.deepEqual(state.counts, [0, 1], "counts are shown, without names");
});

test("a wrong choice number or a stale question is refused", async () => {
  const guest = browser();
  const stepId = (await (await guest("/api/state")).json()).stepId;
  assert.equal((await guest("/api/ballot", post("/api/ballot", { stepId, choice: 9 }))).status, 400);
  assert.equal((await guest("/api/ballot", post("/api/ballot", { stepId: "dish", picks: ["gravy"] }))).status, 400);
});

test("reveal shows the correct answer, updates the leaderboard, and closes voting", async () => {
  const guest = browser();
  await guest("/api/nickname", post("/api/nickname", { name: "Aunt Rosa" }));
  const stepId = (await (await guest("/api/state")).json()).stepId;
  await guest("/api/ballot", post("/api/ballot", { stepId, choice: 1 }));
  const res = await host("/api/host/reveal");
  assert.equal(res.status, 200);
  const state = await (await guest("/api/state")).json();
  assert.equal(state.revealed, true);
  assert.equal(state.question.correctIndex, 1);
  assert.equal(state.yourChoice, 1);
  assert.equal(state.votingOpen, false);
  const rosa = state.leaderboard.find((row: { name: string }) => row.name === "Aunt Rosa");
  assert.equal(rosa?.points, 100);
  assert.equal((await guest("/api/ballot", post("/api/ballot", { stepId, choice: 0 }))).status, 409);
});

test("reveal is refused on a ranked round", async () => {
  await host("/api/host/previous");
  const res = await host("/api/host/reveal");
  assert.equal(res.status, 409);
  await host("/api/host/next");
});

test("the next question starts with voting open and no answers", async () => {
  await host("/api/host/next");
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.question.prompt, "Capital of Italy?");
  assert.equal(state.votingOpen, true);
  assert.equal(state.revealed, false);
  assert.equal(state.ballotCount, 0);
});

test("host reveal and next-question screens never expose the answer key early", async () => {
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.question.correctIndex, undefined);
  const text = await (await fetch(base + "/api/state")).text();
  assert.doesNotMatch(text, /voterId|pge_voter/);
});
