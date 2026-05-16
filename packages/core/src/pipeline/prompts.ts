/**
 * Escape a segment so its leading `N.` or `N)` cannot be misread by the LLM
 * as a new numbered-list item nor by `parseNumberedLines` on round-trip.
 * Only the line-starts are escaped; mid-line numbers are left alone.
 *
 * Uses a zero-width space (`\u200b`) as the escape character, which is
 * safer than a backslash as it's highly unlikely to appear in source text.
 */
function escapeLeadingNumbers(segment: string): string {
  // $1: whitespace, $2: number, $3: . or )
  return segment.replace(/^(\s*)(\d+)([\.\)])/gm, '$1$2\u200b$3');
}

/**
 * Reverse `escapeLeadingNumbers`: strip a zero-width space that appears between
 * a line-leading number and its `.` or `)` punctuation. Only line-leading
 * escapes are removed.
 *
 * Used after `parseNumberedLines` so the final DOCX never carries the
 * internal escape artifact.
 */
export function unescapeLeadingNumbers(text: string): string {
  return text.replace(/^(\s*)(\d+)\u200b([\.\)])/gm, '$1$2$3');
}

function appendSegment(parts: string[], index: number, segment: string): void {
  const escaped = escapeLeadingNumbers(segment);
  const lines = escaped.split('\n');
  parts.push(`${index + 1}. ${lines[0] ?? ''}`);
  for (const cont of lines.slice(1)) {
    parts.push(`   ${cont}`);
  }
}

export function primerPrompt(segments: string[], glossary?: string): string {
  const parts: string[] = [
    'Translate each numbered DOCX segment into the target language.',
    'Preserve meaning, tone, and formatting-sensitive boundaries.',
    `Return only a numbered list with exactly ${segments.length} items.`,
  ];

  const trimmedGlossary = glossary?.trim();
  if (trimmedGlossary) {
    parts.push('', 'Glossary:', trimmedGlossary);
  }

  parts.push('', 'Segments:');
  for (const [index, segment] of segments.entries()) {
    appendSegment(parts, index, segment);
  }

  return parts.join('\n');
}

export function reviewPrompt(
  segments: string[],
  translations: string[],
  rules?: string,
  glossary?: string,
): string {
  const parts: string[] = [
    'Review each first-pass DOCX translation against its original segment.',
    'Correct mistakes, improve fluency, and keep the meaning aligned with the source.',
    `Return only a numbered list with exactly ${segments.length} refined translations.`,
  ];

  const trimmedGlossary = glossary?.trim();
  if (trimmedGlossary) {
    parts.push('', 'Glossary (must be respected):', trimmedGlossary);
  }

  const trimmedRules = rules?.trim();
  if (trimmedRules) {
    parts.push('', 'Rules:', trimmedRules);
  }

  parts.push(
    '',
    'Output format:',
    `Output exactly ${segments.length} refined translations as a numbered list.`,
    "Do NOT prefix entries with 'Refined:', 'Original:', 'Translation:', or any label.",
    'Each item is one line: `N. <refined translation only>` (continuation lines OK for multi-paragraph segments).',
  );

  parts.push('', 'Segment pairs:');
  for (const [index, segment] of segments.entries()) {
    const escapedSegment = escapeLeadingNumbers(segment);
    const origLines = escapedSegment.split('\n');
    parts.push(`${index + 1}. Original: ${origLines[0] ?? ''}`);
    for (const cont of origLines.slice(1)) {
      parts.push(`              ${cont}`);
    }
    const firstPass = translations[index] ?? '';
    const fpLines = firstPass.split('\n');
    parts.push(`   First pass: ${fpLines[0] ?? ''}`);
    for (const cont of fpLines.slice(1)) {
      parts.push(`              ${cont}`);
    }
  }

  return parts.join('\n');
}
