var levenshtein = require("fast-levenshtein");

export function cleanAndSort(str: string) {
  return str.split(" ").sort().join(" ").toLowerCase();
}

export function areSimilar(str1: string, str2: string) {
  const cleanedStr1 = cleanAndSort(str1);
  const cleanedStr2 = cleanAndSort(str2);

  return (
    cleanedStr1 === cleanedStr2 ||
    levenshtein.get(cleanedStr1, cleanedStr2) <= 2 ||
    cleanedStr1.includes(cleanedStr2) ||
    cleanedStr2.includes(cleanedStr1)
  );
}
