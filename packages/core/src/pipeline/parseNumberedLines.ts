export function parseNumberedLines(raw: string, fallback: string[]): string[] {
  const pairs: Array<[number, string]> = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\[(\d+)\]\s*(.*)/);
    if (m) pairs.push([parseInt(m[1], 10), m[2]]);
  }
  if (pairs.length !== fallback.length) return fallback;
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map(p => p[1]);
}
