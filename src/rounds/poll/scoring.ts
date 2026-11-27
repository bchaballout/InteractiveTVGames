// Poll and superlatives: count how many guests picked each choice. No right answer.

export function tallyChoices(choiceCount: number, choices: readonly number[]): number[] {
  const counts = new Array<number>(choiceCount).fill(0);
  for (const c of choices) {
    if (c >= 0 && c < choiceCount) counts[c]! += 1;
  }
  return counts;
}

/** The choice with the most votes. Ties return every tied choice, so the TV can show a tie. */
export function leaders(counts: readonly number[]): number[] {
  const top = Math.max(0, ...counts);
  if (top === 0) return [];
  return counts.flatMap((c, i) => (c === top ? [i] : []));
}
