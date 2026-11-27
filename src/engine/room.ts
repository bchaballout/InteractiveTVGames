// A live room: one running instance of a game definition.
// The room keeps its own QR code and state, separate from the game definition.
// Hosts can add an entry mid-game without changing the room id, the QR code, or
// any existing ballots.

import type { Entry, GameDefinition } from "./types.js";
import { validateGame } from "./validate.js";

export interface Room {
  roomId: string;
  joinCode: string;
  game: GameDefinition;
}

/** Adds an entry to a live room. Existing ballots stay valid because they refer to ids, not positions. */
export function addEntryToRoom(room: Room, entry: Entry, roundIds: string[] = []): Room {
  if (room.game.entries.some((e) => e.id === entry.id)) {
    throw new Error(`An entry with id "${entry.id}" already exists.`);
  }
  const nextGame: GameDefinition = {
    ...room.game,
    entries: [...room.game.entries, entry],
    rounds: room.game.rounds.map((round) =>
      roundIds.includes(round.id) && round.type === "ranked-picks"
        ? { ...round, entryIds: [...round.entryIds, entry.id] }
        : round,
    ),
  };
  const check = validateGame(nextGame);
  if (!check.ok) throw new Error(`Cannot add entry:\n- ${check.errors.join("\n- ")}`);
  return { ...room, game: nextGame };
}
