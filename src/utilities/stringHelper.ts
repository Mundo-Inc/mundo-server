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

export function trimQuotes(str: string) {
  return str.replace(/^"|"$/g, "");
}
