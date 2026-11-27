// Core types for the game format (schema version 1).
// A game is a plain JSON definition. Rooms and ballots are kept separate from it.

export const SCHEMA_VERSION = 1;

export interface Entry {
  id: string;
  name: string;
  /** Optional photo path inside the game's assets folder. */
  photo?: string;
  /** Free-form tag shown on the TV, e.g. "Chef: Aunt Rosa". */
  subtitle?: string;
}

export interface RankedPicksConfig {
  /** How many distinct entries a guest may rank. */
  maxPicks: number;
  /** Points for rank 1, 2, 3 ... Entries beyond this list score 0. */
  points: number[];
}

export interface RankedPicksRound {
  id: string;
  type: "ranked-picks";
  title: string;
  /** Which entries may be ranked in this round. */
  entryIds: string[];
  config: RankedPicksConfig;
}

export interface TriviaQuestion {
  id: string;
  prompt: string;
  choices: string[];
  /** Index into choices (0 = first). */
  correctIndex: number;
  /** Points for a correct answer, before the speed bonus. */
  points: number;
}

export interface TriviaConfig {
  /** Seconds guests have to answer each question. */
  questionSeconds: number;
  /** Extra points for answering fast: full bonus at 0 seconds, none at the limit. */
  speedBonusMax: number;
}

export interface TriviaRound {
  id: string;
  type: "trivia";
  title: string;
  questions: TriviaQuestion[];
  config: TriviaConfig;
}

export type Round = RankedPicksRound | TriviaRound;

export interface GameDefinition {
  schemaVersion: number;
  id: string;
  title: string;
  /** Optional theme: colours as CSS strings. */
  theme?: { accent?: string; background?: string; text?: string };
  /** Things guests vote on. May be empty for games made only of trivia. */
  entries: Entry[];
  rounds: Round[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
