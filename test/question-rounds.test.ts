import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyChoices, leaders } from "../src/rounds/poll/scoring.js";
import { tallyRatings, averageRating } from "../src/rounds/rating/scoring.js";
import { validateGame } from "../src/engine/validate.js";

test("poll: counts each choice", () => {
  assert.deepEqual(tallyChoices(3, [0, 2, 2, 7]), [1, 0, 2]);
});

test("poll: a tie returns every leader, and no votes returns none", () => {
  assert.deepEqual(leaders([3, 3, 1]), [0, 1]);
  assert.deepEqual(leaders([0, 0]), []);
});

test("rating: tallies 1 to scale and ignores anything else", () => {
  assert.deepEqual(tallyRatings(5, [1, 5, 5, 0, 9, 2.5]), [1, 0, 0, 0, 2]);
});

test("rating: average rounds to one decimal place, and no votes gives none", () => {
  assert.equal(averageRating([4, 5, 5]), 4.7);
  assert.equal(averageRating([]), undefined);
});

const base = { schemaVersion: 1, id: "q", title: "Q", entries: [{ id: "a", name: "A" }, { id: "b", name: "B" }] };

test("schema: poll, rating and superlatives validate", () => {
  const game = {
    ...base,
    rounds: [
      { id: "p", type: "poll", title: "P", questions: [{ id: "q1", prompt: "Snack?", choices: ["Chips", "Dip"] }] },
      { id: "r", type: "rating", title: "R", config: { scale: 10 }, questions: [{ id: "q1", prompt: "Vibe?" }] },
      { id: "s", type: "superlatives", title: "S", questions: [{ id: "q1", prompt: "Most likely to?", entryIds: ["a", "b"] }] },
    ],
  };
  assert.deepEqual(validateGame(game), { ok: true, errors: [] });
});

test("schema: rating scale must be 5 or 10; superlatives need known entries", () => {
  const game = {
    ...base,
    rounds: [
      { id: "r", type: "rating", title: "R", config: { scale: 7 }, questions: [{ id: "q1", prompt: "Vibe?" }] },
      { id: "s", type: "superlatives", title: "S", questions: [{ id: "q1", prompt: "Most?", entryIds: ["a", "ghost"] }] },
    ],
  };
  const result = validateGame(game);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("scale must be 5 or 10")));
  assert.ok(result.errors.some((e) => e.includes('unknown entry "ghost"')));
});
