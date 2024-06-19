export async function fakeObjectIdString(): Promise<string> {
  return Math.random().toString(16).substring(2, 14).padEnd(24, "0");
}
