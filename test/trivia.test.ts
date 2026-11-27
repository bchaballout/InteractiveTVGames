import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreTriviaAnswer, countChoices } from "../src/rounds/trivia/scoring.js";
import { validateGame } from "../src/engine/validate.js";
import type { TriviaQuestion } from "../src/engine/types.js";

const q: TriviaQuestion = { id: "q1", prompt: "Capital of France?", choices: ["Paris", "Rome", "Oslo"], correctIndex: 0, points: 100 };
const config = { questionSeconds: 20, speedBonusMax: 50 };

test("trivia: correct answer at once earns full speed bonus", () => {
  assert.equal(scoreTriviaAnswer(q, config, { choice: 0, elapsedMs: 0 }), 150);
});

test("trivia: correct answer at the limit earns points with no bonus", () => {
  assert.equal(scoreTriviaAnswer(q, config, { choice: 0, elapsedMs: 20_000 }), 100);
});

test("trivia: bonus shrinks in between, and never goes negative", () => {
  assert.equal(scoreTriviaAnswer(q, config, { choice: 0, elapsedMs: 10_000 }), 125);
  assert.equal(scoreTriviaAnswer(q, config, { choice: 0, elapsedMs: 99_000 }), 100);
});

test("trivia: a wrong answer earns nothing, however fast", () => {
  assert.equal(scoreTriviaAnswer(q, config, { choice: 1, elapsedMs: 0 }), 0);
});

test("trivia: counts answers per choice without names", () => {
  const counts = countChoices(3, [
    { choice: 0, elapsedMs: 1 },
    { choice: 2, elapsedMs: 1 },
    { choice: 0, elapsedMs: 1 },
    { choice: 9, elapsedMs: 1 },
  ]);
  assert.deepEqual(counts, [2, 0, 1]);
});

const triviaGame = {
  schemaVersion: 1,
  id: "trivia-test",
  title: "Trivia",
  entries: [],
  rounds: [
    {
      id: "round-one",
      type: "trivia",
      title: "Geography",
      config,
      questions: [q],
    },
  ],
};

test("schema: a trivia-only game with no entries is valid", () => {
  assert.deepEqual(validateGame(triviaGame), { ok: true, errors: [] });
});

test("schema: trivia questions must have a real correct answer", () => {
  const bad = structuredClone(triviaGame);
  (bad.rounds[0] as { questions: TriviaQuestion[] }).questions[0]!.correctIndex = 7;
  bad.rounds[0]!.config = { questionSeconds: 1, speedBonusMax: 50 } as typeof bad.rounds[0]["config"];
  const result = validateGame(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("correctIndex")));
  assert.ok(result.errors.some((e) => e.includes("questionSeconds")));
});

test("schema: trivia needs at least two choices", () => {
  const bad = structuredClone(triviaGame);
  (bad.rounds[0] as { questions: TriviaQuestion[] }).questions[0]!.choices = ["Only one"];
  assert.ok(validateGame(bad).errors.some((e) => e.includes("2 to 6")));
});
