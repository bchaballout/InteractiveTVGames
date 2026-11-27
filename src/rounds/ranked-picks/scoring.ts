// Ranked picks: each guest ranks up to `maxPicks` distinct entries.
// Rank 1 earns points[0], rank 2 earns points[1], and so on.
// Entries with equal totals share a rank using standard competition ranking
// (1, 1, 3 ... not 1, 1, 2), so two dishes tied for first are both "1st".

import type { RankedPicksConfig } from "../../engine/types.js";

/** A ballot is the ordered list of entry ids a guest picked, best first. */
export type RankedBallot = readonly string[];

export interface ScoredEntry {
  entryId: string;
  points: number;
  rank: number;
}

export function scoreRankedPicks(
  entryIds: readonly string[],
  ballots: readonly RankedBallot[],
  config: RankedPicksConfig,
): ScoredEntry[] {
  const totals = new Map<string, number>(entryIds.map((id) => [id, 0]));

  for (const ballot of ballots) {
    const seen = new Set<string>();
    ballot.slice(0, config.maxPicks).forEach((entryId, position) => {
      // Ignore anything the guest should not have been able to pick.
      if (!totals.has(entryId) || seen.has(entryId)) return;
      seen.add(entryId);
      totals.set(entryId, (totals.get(entryId) ?? 0) + (config.points[position] ?? 0));
    });
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const result: ScoredEntry[] = [];
  let previousPoints: number | undefined;
  let currentRank = 0;
  sorted.forEach(([entryId, points], index) => {
    if (points !== previousPoints) {
      currentRank = index + 1; // competition ranking: skip ranks after a tie
      previousPoints = points;
    }
    result.push({ entryId, points, rank: currentRank });
  });
  return result;
}
