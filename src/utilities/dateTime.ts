/**
 * Generates a random future `Date` object within a specific range.
 * @param seconds The total seconds from now to define the upper range of the future date.
 * @param offsetInSeconds The seconds from now to start the range from which the future date can be chosen.
 * @returns A random future `Date` object between now + offsetInSeconds and now + seconds.
 */
export function getRandomDateInRange(
  seconds: number,
  offsetInSeconds: number
): Date {
  const now = Date.now();
  const startTime = now + offsetInSeconds * 1000;
  const endTime = now + seconds * 1000;

  const randomTimeInMs = startTime + Math.random() * (endTime - startTime);

  return new Date(randomTimeInMs);
}
