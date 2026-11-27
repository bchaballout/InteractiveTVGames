import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createRoomServer } from "../src/server/room-server.js";
import type { GameDefinition } from "../src/engine/types.js";

const game = JSON.parse(readFileSync(join(process.cwd(), "examples/thanksgiving-cookoff/game.json"), "utf8")) as GameDefinition;
let server: Server;
let base = "";

before(async () => {
  server = await createRoomServer({ game, joinUrl: "http://192.168.1.20:3000/join" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

// Simple cookie-keeping client so each call is one "browser".
function browser() {
  let cookie = "";
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return res;
  };
}

const ballot = (picks: string[]) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ roundId: "dish-overall", picks }),
});

test("TV page and phone page are served", async () => {
  const tv = await fetch(base + "/");
  assert.equal(tv.status, 200);
  assert.match(await tv.text(), /Scan to play/);
  const phone = await fetch(base + "/join");
  assert.equal(phone.status, 200);
  assert.match(await phone.text(), /Submit my ranking/);
});

test("QR code is served as a picture of the phone address", async () => {
  const res = await fetch(base + "/qr.svg");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(await res.text(), /<svg/);
});

test("state tells the TV which address to encode", async () => {
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.joinUrl, "http://192.168.1.20:3000/join");
});

test("state shows every entry from the start, at zero", async () => {
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.entries.length, game.entries.length);
  assert.equal(state.ballotCount, 0);
  assert.ok(state.scores.every((s: { points: number }) => s.points === 0));
});

test("a guest's ballot is counted, and the scores move", async () => {
  const guest = browser();
  const res = await guest("/api/ballot", ballot(["gravy", "pot-roast", "green-beans"]));
  assert.equal(res.status, 200);
  const state = await (await guest("/api/state")).json();
  assert.equal(state.ballotCount, 1);
  assert.equal(state.youHaveVoted, true);
  assert.equal(state.scores.find((s: { entryId: string }) => s.entryId === "gravy").points, 3);
});

test("the same browser cannot vote twice (server-side)", async () => {
  const guest = browser();
  assert.equal((await guest("/api/ballot", ballot(["gravy"]))).status, 200);
  const again = await guest("/api/ballot", ballot(["pot-roast"]));
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, "You have already voted in this round.");
});

test("bad ballots are rejected with a readable message", async () => {
  const guest = browser();
  const tooMany = await guest("/api/ballot", ballot(["gravy", "pot-roast", "green-beans", "cranberry-sauce"]));
  assert.equal(tooMany.status, 400);
  const repeated = await guest("/api/ballot", ballot(["gravy", "gravy"]));
  assert.equal(repeated.status, 400);
  const unknown = await guest("/api/ballot", ballot(["not-a-dish"]));
  assert.equal(unknown.status, 400);
  const wrongRound = await guest("/api/ballot", { ...ballot(["gravy"]), body: JSON.stringify({ roundId: "nope", picks: ["gravy"] }) });
  assert.equal(wrongRound.status, 400);
});

test("the TV state never shows who voted", async () => {
  const text = await (await fetch(base + "/api/state")).text();
  assert.doesNotMatch(text, /pge_voter|voterId|voter/i);
});

test("live updates are pushed to open screens when a vote arrives", async () => {
  const stream = await fetch(base + "/events");
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  await reader.read(); // ": connected"
  await browser()("/api/ballot", ballot(["cranberry-sauce"]));
  const { value } = await reader.read();
  assert.match(decoder.decode(value), /event: update/);
  await reader.cancel();
});
