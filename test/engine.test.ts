import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateGame } from "../src/engine/validate.js";
import { BallotBox } from "../src/engine/ballots.js";
import { scoreRankedPicks } from "../src/rounds/ranked-picks/scoring.js";
import { addEntryToRoom, type Room } from "../src/engine/room.js";
import type { GameDefinition, RankedPicksRound } from "../src/engine/types.js";

const game = JSON.parse(
  readFileSync(join(process.cwd(), "examples/thanksgiving-cookoff/game.json"), "utf8"),
) as GameDefinition;
const config = { maxPicks: 3, points: [3, 2, 1] };
const ids = ["a", "b", "c", "d"];

test("ranked picks: points go to the right ranks", () => {
  const scores = scoreRankedPicks(ids, [["a", "b", "c"]], config);
  assert.deepEqual(scores.find((s) => s.entryId === "a"), { entryId: "a", points: 3, rank: 1 });
  assert.deepEqual(scores.find((s) => s.entryId === "b"), { entryId: "b", points: 2, rank: 2 });
  assert.deepEqual(scores.find((s) => s.entryId === "c"), { entryId: "c", points: 1, rank: 3 });
});

test("ranked picks: tied totals share rank using competition ranking (1, 1, 3)", () => {
  const ballots = [["a", "b"], ["b", "a"]]; // a: 3+2=5, b: 2+3=5
  const scores = scoreRankedPicks(ids, ballots, config);
  const rank = (id: string) => scores.find((s) => s.entryId === id)?.rank;
  assert.equal(rank("a"), 1);
  assert.equal(rank("b"), 1);
  assert.equal(rank("c"), 3, "next rank after a two-way tie is 3, not 2");
});

test("ranked picks: ignores picks beyond maxPicks, unknown ids and repeats", () => {
  const scores = scoreRankedPicks(ids, [["a", "a", "zzz", "b", "c", "d"]], config);
  const total = (id: string) => scores.find((s) => s.entryId === id)?.points;
  assert.equal(total("a"), 3, "repeat of a is not counted twice");
  assert.equal(total("b"), 0, "b sits past the 3-pick limit, so it scores 0");
});

test("duplicate enforcement: second ballot from the same voter is rejected", () => {
  const box = new BallotBox<string[]>();
  assert.equal(box.submit("r1", "browser-1", ["a"]).status, "accepted");
  assert.equal(box.submit("r1", "browser-1", ["b"]).status, "already-submitted");
  assert.deepEqual(box.forRound("r1"), [["a"]]);
});

test("duplicate enforcement: an exact retry is accepted but counted once", () => {
  const box = new BallotBox<string[]>();
  box.submit("r1", "browser-1", ["a", "b"]);
  assert.equal(box.submit("r1", "browser-1", ["a", "b"]).status, "accepted");
  assert.equal(box.forRound("r1").length, 1);
});

test("duplicate enforcement is per round", () => {
  const box = new BallotBox<string[]>();
  assert.equal(box.submit("r1", "browser-1", ["a"]).status, "accepted");
  assert.equal(box.submit("r2", "browser-1", ["a"]).status, "accepted");
});

test("schema: the Thanksgiving example is valid", () => {
  assert.deepEqual(validateGame(game), { ok: true, errors: [] });
});

test("schema: reports every problem at once", () => {
  const bad = {
    schemaVersion: 9,
    id: "Bad Id",
    title: "",
    entries: [{ id: "x", name: "" }],
    rounds: [{ id: "r", type: "mystery", entryIds: ["nope"], config: {} }],
  };
  const result = validateGame(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("schemaVersion")));
  assert.ok(result.errors.some((e) => e.includes("id must be")));
  assert.ok(result.errors.some((e) => e.includes("title is required")));
  assert.ok(result.errors.some((e) => e.includes("entries[0].name")));
  assert.ok(result.errors.some((e) => e.includes("not a known round type")));
});

test("schema: a round may only point at entries that exist", () => {
  const broken = structuredClone(game);
  (broken.rounds[0] as RankedPicksRound).entryIds.push("ghost-dish");
  const result = validateGame(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("ghost-dish")));
});

test("export and re-import: a JSON round trip stays valid and identical", () => {
  const exported = JSON.stringify(game, null, 2);
  const reimported = JSON.parse(exported) as unknown;
  assert.equal(validateGame(reimported).ok, true);
  assert.deepEqual(reimported, game);
});

test("live room: adding an entry keeps the room id, join code and existing ballots", () => {
  const room: Room = { roomId: "room-42", joinCode: "ABCD", game: structuredClone(game) };
  const box = new BallotBox<string[]>();
  box.submit("dish-overall", "browser-1", ["gravy", "pot-roast", "green-beans"]);

  const updated = addEntryToRoom(room, { id: "stuffing", name: "Stuffing" }, ["dish-overall"]);

  assert.equal(updated.roomId, "room-42");
  assert.equal(updated.joinCode, "ABCD");
  assert.ok(updated.game.entries.some((e) => e.id === "stuffing"));
  assert.ok((updated.game.rounds[0] as RankedPicksRound).entryIds.includes("stuffing"));
  assert.deepEqual(box.forRound("dish-overall"), [["gravy", "pot-roast", "green-beans"]]);
  const scores = scoreRankedPicks((updated.game.rounds[0] as RankedPicksRound).entryIds, box.forRound("dish-overall"), config);
  assert.equal(scores.find((s) => s.entryId === "stuffing")?.points, 0, "new entry starts at zero");
});

test("live room: refuses a duplicate entry id", () => {
  const room: Room = { roomId: "r", joinCode: "X", game: structuredClone(game) };
  assert.throws(() => addEntryToRoom(room, { id: "gravy", name: "Gravy again" }), /already exists/);
});

test("validate CLI: accepts the example and rejects a broken file", async () => {
  const { execFileSync } = await import("node:child_process");
  const cli = join(process.cwd(), "dist/cli/validate.js");
  const ok = execFileSync("node", [cli, join(process.cwd(), "examples/thanksgiving-cookoff/game.json")], { encoding: "utf8" });
  assert.match(ok, /is a valid game/);
  const bad = join(process.cwd(), "dist-test", "bad-game.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(bad, JSON.stringify({ schemaVersion: 1, id: "x", title: "", entries: [], rounds: [] }));
  assert.throws(() => execFileSync("node", [cli, bad], { encoding: "utf8", stdio: "pipe" }), /problem/);
});
