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
Schema version 1 has seven round types: `ranked-picks`, `trivia`, `poll`, `rating`, `superlatives`, `head-to-head` and `write-ins`. See `round-types.md` for what guests and the TV see.

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

### `trivia`

```json
{
  "id": "world-capitals",
  "type": "trivia",
  "title": "World capitals",
  "config": { "questionSeconds": 20, "speedBonusMax": 50 },
  "questions": [
    { "id": "q-japan", "prompt": "What is the capital of Japan?", "choices": ["Kyoto", "Osaka", "Tokyo"], "correctIndex": 2, "points": 100 }
  ]
}
```

- Each question is one screen. The host moves question by question and reveals the answer.
- `questionSeconds`: time to answer, from 5 to 300. Answers after the time are refused.
- `speedBonusMax`: a correct answer earns `points` plus a bonus that shrinks from this maximum to zero at the time limit.
- `correctIndex`: 0 is the first choice. The answer is hidden from guests and the TV until the host reveals it.
- Guests may enter a name for the scoreboard. Scores are shown only for revealed questions.

### `poll`

```json
{ "id": "snacks", "type": "poll", "title": "Snacks", "questions": [
  { "id": "best", "prompt": "Best office snack?", "choices": ["Popcorn", "Fruit", "Cookies"] } ] }
```

Choices: 2 to 8. Results are live and there is no right answer.

### `rating`

```json
{ "id": "vibe", "type": "rating", "title": "Vibe", "config": { "scale": 5 },
  "questions": [ { "id": "week", "prompt": "How was this week?" } ] }
```

`scale` is 5 or 10. Guests pick a whole number from 1 to scale. The average is shown after reveal.

### `superlatives` and `head-to-head`

```json
{ "id": "awards", "type": "superlatives", "title": "Most likely to…",
  "questions": [ { "id": "reply-all", "prompt": "Most likely to reply-all by accident", "entryIds": ["priya", "sam", "lee"] } ] }
```

Superlatives need at least 2 entries. Head-to-head needs exactly 2. Entries are listed in `entries` at the top of the game.

### `write-ins`

```json
{ "id": "wins", "type": "write-ins", "title": "Biggest win", "config": { "maxLength": 80 },
  "questions": [ { "id": "win", "prompt": "What was your biggest win this year?" } ] }
```

Guests type anonymous answers. Only the host sees them all, and chooses which to show on the TV, one at a time.
