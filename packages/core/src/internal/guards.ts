export function assertCountMatch(formatMap: unknown[], translated: unknown[]): void {
  if (translated.length !== formatMap.length) {
    throw new Error(
      `Translation count mismatch: expected ${formatMap.length}, got ${translated.length}`
    );
  }
}
