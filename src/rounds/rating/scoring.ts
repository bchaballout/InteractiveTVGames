// Rating: guests pick a whole number from 1 to scale. The average is rounded to one decimal place.

export function tallyRatings(scale: number, ratings: readonly number[]): number[] {
  const counts = new Array<number>(scale).fill(0);
  for (const r of ratings) {
    if (Number.isInteger(r) && r >= 1 && r <= scale) counts[r - 1]! += 1;
  }
  return counts;
}

export function averageRating(ratings: readonly number[]): number | undefined {
  if (ratings.length === 0) return undefined;
  const total = ratings.reduce((a, b) => a + b, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}
