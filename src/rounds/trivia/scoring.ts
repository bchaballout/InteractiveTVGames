// Trivia: each question has one correct choice. A correct answer earns the question's points,
// plus a speed bonus that shrinks to zero at the time limit. A wrong answer earns nothing.

import type { TriviaConfig, TriviaQuestion } from "../../engine/types.js";

export interface TriviaAnswer {
  /** Index of the chosen answer. */
  choice: number;
  /** Milliseconds from the question opening to the answer reaching the server. */
  elapsedMs: number;
}

export function scoreTriviaAnswer(question: TriviaQuestion, config: TriviaConfig, answer: TriviaAnswer): number {
  if (answer.choice !== question.correctIndex) return 0;
  const limitMs = config.questionSeconds * 1000;
  const speedFraction = Math.min(1, Math.max(0, 1 - answer.elapsedMs / limitMs));
  return question.points + Math.round(config.speedBonusMax * speedFraction);
}

/** How many guests picked each choice. Anonymous: no names, only counts. */
export function countChoices(choiceCount: number, answers: readonly TriviaAnswer[]): number[] {
  const counts = new Array<number>(choiceCount).fill(0);
  for (const a of answers) {
    if (a.choice >= 0 && a.choice < choiceCount) counts[a.choice]! += 1;
  }
  return counts;
}
