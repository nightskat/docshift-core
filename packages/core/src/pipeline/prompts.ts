function glossaryBlock(glossary?: string): string {
  if (!glossary?.trim()) return '';
  const pairs = glossary
    .split(',')
    .map(s => s.trim())
    .filter(s => s.includes('='))
    .map(s => {
      const eq = s.indexOf('=');
      return `- "${s.slice(0, eq).trim()}" → "${s.slice(eq + 1).trim()}"`;
    });
  return pairs.length
    ? `\n\nMANDATORY GLOSSARY (use these translations exactly):\n${pairs.join('\n')}`
    : '';
}

function rulesBlock(rules?: string): string {
  return rules?.trim() ? `\n\nMANDATORY RULES:\n${rules.trim()}` : '';
}

export function primerPrompt(sample: string, glossary?: string): string {
  return `You are preparing reading notes before translating a document. Read the excerpt below.

Report ONLY what is directly visible or strongly implied. Do NOT invent domain rules.

Provide a brief list covering:
- Document type / genre
- Tone / register (formal, informal, technical, literary)
- Apparent target audience
- Proper nouns, org names, titles (copy exactly as written)
- Recurring terms or acronyms (copy exactly)
- Units, currencies, date formats seen
- Items that must NOT be translated (brand names, codes, identifiers)
- Any ambiguity or translation risk${glossaryBlock(glossary)}

Max 200 words. Bullet list only.

DOCUMENT EXCERPT:
${sample}`;
}

export function reviewPrompt(
  sources: string[],
  translations: string[],
  targetLang: string,
  rules?: string,
): string {
  const srcLines = sources.map((s, i) => `[${i + 1}] ${s}`).join('\n');
  const tranLines = translations.map((t, i) => `[${i + 1}] ${t}`).join('\n');
  return `You are a bilingual reviewer checking a translation into ${targetLang}. You have not seen any translation brief.

For each segment verify:
- Meaning fully preserved (nothing added or omitted)
- Numbers, names, dates exact
- Fluent natural ${targetLang}${rulesBlock(rules)}

Return ONLY corrected numbered lines [N] text. Keep unchanged lines as-is.

SOURCE:
${srcLines}

TRANSLATION:
${tranLines}

Corrected translation:`;
}
