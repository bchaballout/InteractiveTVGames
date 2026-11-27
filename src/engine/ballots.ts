// Ballot storage with one-vote-per-browser enforcement.
//
// Rules:
// - One ballot per (round, voter). A second submission from the same voter is
//   rejected, unless it is an exact retry of the same ballot (idempotent), which
//   returns the stored result instead of an error. That lets a phone retry a
//   dropped connection without ever double-counting.
// - The check and the write happen in one step, so two simultaneous requests
//   cannot both succeed. A real database should enforce this with a UNIQUE
//   constraint on (round_id, voter_id); this in-memory store mirrors that rule.

export type SubmitResult =
  | { status: "accepted" }
  | { status: "already-submitted" }
  | { status: "conflict" };

export class BallotBox<TBallot extends string[] | string> {
  private readonly byKey = new Map<string, TBallot>();

  submit(roundId: string, voterId: string, ballot: TBallot): SubmitResult {
    const key = `${roundId}\u0000${voterId}`;
    const existing = this.byKey.get(key);
    if (existing === undefined) {
      this.byKey.set(key, ballot);
      return { status: "accepted" };
    }
    // Same ballot sent again (for example a retry): accept quietly, count once.
    if (JSON.stringify(existing) === JSON.stringify(ballot)) {
      return { status: "accepted" };
    }
    return { status: "already-submitted" };
  }

  /** All ballots for a round, in the order they were first stored. */
  forRound(roundId: string): TBallot[] {
    const prefix = `${roundId}\u0000`;
    const out: TBallot[] = [];
    for (const [key, ballot] of this.byKey) {
      if (key.startsWith(prefix)) out.push(ballot);
    }
    return out;
  }
}
