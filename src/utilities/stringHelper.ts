var levenshtein = require("fast-levenshtein");
var unorm = require("unorm");

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

  // Loop through each window in the larger string
  for (let i = 0; i <= len1 - len2; i++) {
    const window = str1.slice(i, i + len2);

    // Check if the Levenshtein distance is below the threshold
    if (levenshtein.get(window, str2) <= maxDist) {
      return true;
    }
  }
  return false;
}

export function areSimilar(str1: string, str2: string) {
  if (!str1 || !str2) return false;

  const cleanedStr1 = cleanAndSort(normalizeString(str1));
  const cleanedStr2 = cleanAndSort(normalizeString(str2));

  const shorter =
    cleanedStr1.length < cleanedStr2.length ? cleanedStr1 : cleanedStr2;
  const longer =
    cleanedStr1.length >= cleanedStr2.length ? cleanedStr1 : cleanedStr2;

  return (
    cleanedStr1 === cleanedStr2 ||
    levenshtein.get(cleanedStr1, cleanedStr2) <= 2 ||
    windowedLevenshtein(longer, shorter, 2)
  );
}
