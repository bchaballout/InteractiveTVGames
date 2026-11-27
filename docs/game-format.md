# Game format (schema version 1)

A game is one JSON file, `game.json`, kept in `examples/<game-name>/` or in your own folder.
The engine checks it with `validateGame()` (`src/engine/validate.ts`) before a room opens.

## Top level

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. Used to migrate older games later. |
| `id` | yes | Lowercase letters, numbers and dashes. |
| `title` | yes | Shown on the TV. |
| `theme` | no | `accent`, `background`, `text` as CSS colours. |
| `entries` | yes | Things guests vote on (dishes, people, options). |
| `rounds` | yes | The rounds, in order. |

## Entries

```json
{ "id": "gravy", "name": "Gravy", "subtitle": "Cook: Uncle Sam" }
```

`id` must be unique. Entries are referred to by `id`, never by position, so adding
one later does not break existing votes.

## Rounds

Every round has `id`, `type`, `title`, and a `config` for its type.
Only `"ranked-picks"` exists in schema version 1.

### `ranked-picks`

```json
{
  "id": "dish-overall",
  "type": "ranked-picks",
  "title": "Overall dish",
  "entryIds": ["gravy", "pot-roast"],
  "config": { "maxPicks": 3, "points": [3, 2, 1] }
}
```

- `entryIds`: which entries may be ranked in this round.
- `maxPicks`: how many distinct entries a guest may rank.
- `points`: points for 1st, 2nd, 3rd... Ranks past the list score 0.
- Ties share a rank with competition ranking: two entries tied for first are both 1st, and the next is 3rd.

## Errors

`validateGame()` returns every problem at once, for example:

```
- entries[0].name is required.
- rounds[0].entryIds refers to unknown entry "ghost-dish".
```
