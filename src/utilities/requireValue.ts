export function ensureExists<T>(value: T | null | undefined, error: Error): T {
  if (value === null || value === undefined) {
    throw error;
  }
  return value;
}

export function ensureNonEmptyString(
  value: string | null | undefined,
  error: Error
): string {
  if (value === null || value === undefined || value === "") {
    throw error;
  }
  return value;
}
