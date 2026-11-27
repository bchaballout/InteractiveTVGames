import { SCHEMA_VERSION, type GameDefinition, type ValidationResult } from "./types.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    errors.push("id must be lowercase letters, numbers and dashes (for example \"thanksgiving-2026\").");
  }
  if (typeof input.title !== "string" || input.title.trim() === "") {
    errors.push("title is required.");
  }

  const entryIds = new Set<string>();
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    errors.push("entries must be a non-empty list.");
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
  } else {
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

      if (round.type !== "ranked-picks") {
        errors.push(`${where}.type "${String(round.type)}" is not a known round type.`);
        return;
      }
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
      if (!Number.isInteger(config.maxPicks) || (config.maxPicks as number) < 1) {
        errors.push(`${where}.config.maxPicks must be a whole number of 1 or more.`);
      }
      if (
        !Array.isArray(config.points) ||
        config.points.some((p) => typeof p !== "number" || !Number.isFinite(p) || p < 0)
      ) {
        errors.push(`${where}.config.points must be a list of numbers, 0 or more.`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/** Narrowing helper: throws a readable error if the input is not a valid game. */
export function assertValidGame(input: unknown): GameDefinition {
  const result = validateGame(input);
  if (!result.ok) {
    throw new Error(`Invalid game:\n- ${result.errors.join("\n- ")}`);
  }
  return input as GameDefinition;
}
