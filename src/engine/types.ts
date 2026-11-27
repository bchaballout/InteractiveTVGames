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

/** A poll: guests pick one choice. Results are shown live, with no right answer. */
export interface PollQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

export interface PollRound {
  id: string;
  type: "poll";
  title: string;
  questions: PollQuestion[];
}

/** A rating: guests pick a number from 1 to scale. The TV shows the average after reveal. */
export interface RatingQuestion {
  id: string;
  prompt: string;
}

export interface RatingRound {
  id: string;
  type: "rating";
  title: string;
  questions: RatingQuestion[];
  config: { scale: 5 | 10 };
}

/** Superlatives: guests vote for one person or dish from the listed entries. */
export interface SuperlativeQuestion {
  id: string;
  prompt: string;
  /** Entries that may be voted for. */
  entryIds: string[];
}

export interface SuperlativeRound {
  id: string;
  type: "superlatives";
  title: string;
  questions: SuperlativeQuestion[];
}

/** Head-to-head: two entries, one matchup per question. Guests vote for one of the two. */
export interface HeadToHeadRound {
  id: string;
  type: "head-to-head";
  title: string;
  questions: SuperlativeQuestion[];
}

/** Write-ins: guests type a short anonymous answer. The host shows them one at a time. */
export interface WriteInQuestion {
  id: string;
  prompt: string;
}

export interface WriteInRound {
  id: string;
  type: "write-ins";
  title: string;
  questions: WriteInQuestion[];
  config: { maxLength: number };
}

export type Round =
  | RankedPicksRound
  | TriviaRound
  | PollRound
  | RatingRound
  | SuperlativeRound
  | HeadToHeadRound
  | WriteInRound;

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
