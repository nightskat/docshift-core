export function parseNumberedLines(raw: string, fallback: string[]): string[] {
  const lines = raw.split('\n').filter(l => /^\[\d+\]/.test(l));
  if (lines.length !== fallback.length) return fallback;
  return lines.map(l => l.replace(/^\[\d+\]\s*/, ''));
}
