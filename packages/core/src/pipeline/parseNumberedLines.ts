/**
 * Parse an LLM's numbered-list output into segments.
 *
 * Strategy: track the next expected sequence number. Only treat a line as a new
 * entry when its number matches the expected next one (1, 2, 3, ...). Stray
 * numbered tokens that break the sequence (e.g. an LLM preamble like
 * "1. Here is the translation:" followed by the real "1. ..." list, or an
 * internal "Step 5:" inside a translation) are folded into the current entry
 * as continuation lines instead of starting a new one.
 *
 * Accepts both `N.` and `N)` markers.
 *
 * Note on artifact stripping: a previous version stripped labels like
 * "Refined:" / "Translation:" as defense-in-depth against small-model
 * pollution. That was removed because it silently corrupted legitimate
 * user content (e.g. a paragraph that genuinely starts with
 * "Translation: A New Hope"). The `reviewPrompt` "Output format" block
 * is the only defense now — capable models (Gemini Pro / Claude / GPT-4)
 * honor it. Small models that emit redundant labels are documented as
 * unsupported in v0.1.0.
 */
export function parseNumberedLines(text: string): string[] {
  const entries: string[] = [];
  const lines = text.split(/\r?\n/);
  let current: string[] | null = null;
  let nextExpected = 1;

  // Require number at col 0 (no leading whitespace) so that LLM-emitted
  // continuation lines like "   2. text" (indented) are NOT mis-read as
  // new entry starts. Gemini r4 BLOCKER fix.
  const headerPattern = /^(\d+)[\.\)]\s*(.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.match(headerPattern);

    if (match && Number(match[1]) === nextExpected) {
      if (current) entries.push(current.join('\n').replace(/\n+$/, ''));
      current = [];
      const rest = match[2];
      if (rest) current.push(rest);
      nextExpected += 1;
      continue;
    }

    if (!current) continue;

    if (line.length === 0) {
      current.push('');
    } else {
      current.push(line);
    }
  }

  if (current) entries.push(current.join('\n').replace(/\n+$/, ''));

  return entries;
}
