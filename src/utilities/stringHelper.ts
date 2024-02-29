import levenshtein from "fast-levenshtein";
import unorm from "unorm";

export function cleanAndSort(str: string) {
  return str.split(" ").sort().join(" ").toLowerCase();
}

export function normalizeString(str: string) {
  return unorm.nfd(str).replace(/[\u0300-\u036f]/g, "");
}

export function windowedLevenshtein(
  str1: string,
  str2: string,
  maxDist: number
) {
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1 - len2; i++) {
    const window = str1.slice(i, i + len2);
    if (levenshtein.get(window, str2) <= maxDist) {
      return true;
    }
  }
  return false;
}

export function getLevenshteinThreshold(length: number): number {
  if (length <= 3) {
    return 0; // strict for short strings
  } else if (length <= 5) {
    return 1; // moderately strict for medium strings
  } else {
    return 2; // more lenient for longer strings
  }
}
function trimLC(str: string) {
  return str.trim().toLowerCase();
}

export function areSimilar(str1: string, str2: string) {
  if (!str1 || !str2) return false;

  const cleanedStr1 = cleanAndSort(normalizeString(str1));
  const cleanedStr2 = cleanAndSort(normalizeString(str2));

  const shorter =
    cleanedStr1.length < cleanedStr2.length ? cleanedStr1 : cleanedStr2;
  const longer =
    cleanedStr1.length >= cleanedStr2.length ? cleanedStr1 : cleanedStr2;

  const levThreshold = getLevenshteinThreshold(shorter.length);
  return (
    trimLC(str1).includes(trimLC(str2)) ||
    trimLC(str2).includes(trimLC(str1)) ||
    cleanedStr1 === cleanedStr2 ||
    levenshtein.get(trimLC(str1), trimLC(str2)) <= levThreshold
    // windowedLevenshtein(longer, shorter, levThreshold)
  );
}

export function areStrictlySimilar(str1: string, str2: string) {
  if (!str1 || !str2) return false;
  const cleanedStr1 = str1.trim().toLowerCase();
  const cleanedStr2 = str2.trim().toLowerCase();
  return (
    cleanedStr1.includes(cleanedStr2) ||
    cleanedStr2.includes(cleanedStr1) ||
    cleanedStr1 === cleanedStr2
  );
}

export function getFormattedDateTime(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() returns month from 0 to 11
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Pad single digits with leading zero
  const monthFormatted = month.toString().padStart(2, "0");
  const dayFormatted = day.toString().padStart(2, "0");
  const hoursFormatted = hours.toString().padStart(2, "0");
  const minutesFormatted = minutes.toString().padStart(2, "0");

  return `${year}-${monthFormatted}-${dayFormatted}--${hoursFormatted}-${minutesFormatted}`;
}
