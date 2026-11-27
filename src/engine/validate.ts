import { SCHEMA_VERSION, type GameDefinition, type ValidationResult } from "./types.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Validates a parsed game.json. Returns every problem it finds, not just the first,
 * so a host (or an AI assistant) can fix them in one pass.
 */
export function validateGame(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["The game must be a JSON object."] };
  }

  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${String(input.schemaVersion)}.`);
  }
  if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) {
    errors.push('id must be lowercase letters, numbers and dashes (for example "thanksgiving-2026").');
  }
  if (typeof input.title !== "string" || input.title.trim() === "") {
    errors.push("title is required.");
  }

  const entryIds = new Set<string>();
  if (!Array.isArray(input.entries)) {
    errors.push("entries must be a list (it can be empty for trivia-only games).");
  } else {
    input.entries.forEach((entry, i) => {
      if (!isObject(entry) || typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
        errors.push(`entries[${i}].id must be lowercase letters, numbers and dashes.`);
        return;
      }
      if (entryIds.has(entry.id)) {
        errors.push(`entries[${i}].id "${entry.id}" is used more than once.`);
      }
      entryIds.add(entry.id);
      if (typeof entry.name !== "string" || entry.name.trim() === "") {
        errors.push(`entries[${i}].name is required.`);
      }
    });
  }

  const roundIds = new Set<string>();
  if (!Array.isArray(input.rounds) || input.rounds.length === 0) {
    errors.push("rounds must be a non-empty list.");
    return { ok: errors.length === 0, errors };
  }
  input.rounds.forEach((round, i) => {
    const where = `rounds[${i}]`;
    if (!isObject(round) || typeof round.id !== "string" || !ID_PATTERN.test(round.id)) {
      errors.push(`${where}.id must be lowercase letters, numbers and dashes.`);
      return;
    }
    if (roundIds.has(round.id)) {
      errors.push(`${where}.id "${round.id}" is used more than once.`);
    }
    roundIds.add(round.id);
    if (typeof round.title !== "string" || round.title.trim() === "") {
      errors.push(`${where}.title is required.`);
    }

    if (round.type === "ranked-picks") {
      validateRankedPicks(round, where, entryIds, errors);
    } else if (round.type === "trivia") {
      validateTrivia(round, where, errors);
    } else {
      errors.push(`${where}.type "${String(round.type)}" is not a known round type.`);
    }
  });

  return { ok: errors.length === 0, errors };
}

function validateRankedPicks(round: Record<string, unknown>, where: string, entryIds: Set<string>, errors: string[]) {
  if (!Array.isArray(round.entryIds) || round.entryIds.length === 0) {
    errors.push(`${where}.entryIds must be a non-empty list.`);
  } else {
    for (const id of round.entryIds) {
      if (typeof id !== "string" || !entryIds.has(id)) {
        errors.push(`${where}.entryIds refers to unknown entry "${String(id)}".`);
      }
    }
  }
  const config = isObject(round.config) ? round.config : undefined;
  if (!config) {
    errors.push(`${where}.config is required.`);
    return;
  }
  if (!isInt(config.maxPicks, 1, 100)) {
    errors.push(`${where}.config.maxPicks must be a whole number of 1 or more.`);
  }
  if (
    !Array.isArray(config.points) ||
    config.points.some((p) => typeof p !== "number" || !Number.isFinite(p) || p < 0)
  ) {
    errors.push(`${where}.config.points must be a list of numbers, 0 or more.`);
  }
}

function validateTrivia(round: Record<string, unknown>, where: string, errors: string[]) {
  const config = isObject(round.config) ? round.config : undefined;
  if (!config) {
    errors.push(`${where}.config is required.`);
  } else {
    if (!isInt(config.questionSeconds, 5, 300)) {
      errors.push(`${where}.config.questionSeconds must be a whole number from 5 to 300.`);
    }
    if (!isInt(config.speedBonusMax, 0, 1000)) {
      errors.push(`${where}.config.speedBonusMax must be a whole number from 0 to 1000.`);
    }
  }

  if (!Array.isArray(round.questions) || round.questions.length === 0) {
    errors.push(`${where}.questions must be a non-empty list.`);
    return;
  }
  const questionIds = new Set<string>();
  round.questions.forEach((q, j) => {
    const at = `${where}.questions[${j}]`;
    if (!isObject(q) || typeof q.id !== "string" || !ID_PATTERN.test(q.id)) {
      errors.push(`${at}.id must be lowercase letters, numbers and dashes.`);
      return;
    }
    if (questionIds.has(q.id)) errors.push(`${at}.id "${q.id}" is used more than once.`);
    questionIds.add(q.id);
    if (typeof q.prompt !== "string" || q.prompt.trim() === "") {
      errors.push(`${at}.prompt is required.`);
    }
    if (
      !Array.isArray(q.choices) ||
      q.choices.length < 2 ||
      q.choices.length > 6 ||
      q.choices.some((c) => typeof c !== "string" || c.trim() === "")
    ) {
      errors.push(`${at}.choices must be 2 to 6 non-empty answers.`);
    } else if (!isInt(q.correctIndex, 0, q.choices.length - 1)) {
      errors.push(`${at}.correctIndex must point at one of the choices (0 is the first).`);
    }
    if (!isInt(q.points, 1, 1000)) {
      errors.push(`${at}.points must be a whole number from 1 to 1000.`);
    }
  });
}

/** Narrowing helper: throws a readable error if the input is not a valid game. */
export function assertValidGame(input: unknown): GameDefinition {
  const result = validateGame(input);
  if (!result.ok) {
    throw new Error(`Invalid game:\n- ${result.errors.join("\n- ")}`);
  }
  return input as GameDefinition;
}
