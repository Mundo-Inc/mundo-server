export function roundUpToTwoDecimals(num: number): number {
  return Math.ceil(num * 100) / 100;
}
