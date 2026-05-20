/** Distribute translated text across runs proportionally by original char count.
 *  Splits at word boundaries. Returns null when fewer words than non-empty runs. */
export function distributeRuns(translated: string, runLengths: number[]): string[] | null {
  let total = 0;
  let nonEmptyCount = 0;
  for (let i = 0; i < runLengths.length; i++) {
    const l = runLengths[i];
    total += l;
    if (l > 0) nonEmptyCount++;
  }

  if (total === 0) return null;
  if (nonEmptyCount <= 1) return null;
  const words = translated.split(/\s+/);
  if (words.length < nonEmptyCount) return null;

  const result: string[] = [];
  let wordIdx = 0;
  for (let i = 0; i < runLengths.length; i++) {
    if (runLengths[i] === 0) { result.push(''); continue; }
    const isLast = runLengths.slice(i + 1).every(l => l === 0);
    if (isLast) {
      result.push(words.slice(wordIdx).join(' '));
    } else {
      const target = Math.max(1, Math.round(words.length * runLengths[i] / total));
      const end = Math.min(wordIdx + target, words.length);
      result.push(words.slice(wordIdx, end).join(' '));
      wordIdx = end;
    }
  }
  // Add trailing space to all but last non-empty run
  let lastNe = -1;
  for (let i = result.length - 1; i >= 0; i--) { if (result[i]) { lastNe = i; break; } }
  for (let i = 0; i < result.length; i++) {
    if (result[i] && i !== lastNe) result[i] += ' ';
  }
  return result;
}
