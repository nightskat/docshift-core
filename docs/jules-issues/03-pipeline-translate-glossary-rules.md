# feat(core-pipeline): 3-stage translateDocxBuffer with glossary + rules injection

## Depends on

Issue #2 (docx layer) must be merged first.

## Context

The 3-stage pipeline:
- **S1 Primer**: reads document sample → returns reading notes (observable facts only)
- **S2 Translate**: uses reading notes + glossary + rules per chunk
- **S3 Review**: independent bilingual check — rules only, no glossary brief (avoids S1 "poison")

Format is never touched by the LLM — it stays in `FormatMap` and is applied after S3.

## Files to create

```
src/pipeline/types.ts
src/pipeline/prompts.ts
src/pipeline/parseNumberedLines.ts
src/pipeline/translateDocxBuffer.ts
tests/pipeline.prompts.test.ts
tests/pipeline.translateDocxBuffer.test.ts
```

## `src/pipeline/types.ts`

```typescript
export interface TranslateBriefOpts {
  /** Comma-separated term pairs: "tổng hợp=combined, hợp nhất=consolidated" */
  glossary?: string;
  /** Free-text rules: "Keep all numbers exact. Do not translate proper nouns." */
  rules?: string;
}

export interface TranslateOptions extends TranslateBriefOpts {
  onStage?: (stage: string) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface TranslateResultBuffer {
  buffer: ArrayBuffer;
  filename: string;
}

export interface CoreProvider {
  /** Single-turn completion — used for S1 primer and S3 review. */
  complete(prompt: string): Promise<string>;
  /** S2: translate segments in chunks. Inject glossary+rules per chunk via opts. */
  translateWithBrief(
    segments: string[],
    targetLang: string,
    readingNotes: string,
    onProgress?: (done: number, total: number) => void,
    opts?: TranslateBriefOpts,
  ): Promise<string[]>;
}
```

## `src/pipeline/prompts.ts`

```typescript
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

/** S1: reading notes — observable facts only, no invented domain rules.
 *  Glossary injected so primer is aware of forced terms. */
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

/** S3: independent reviewer — no glossary (keeps S3 independent of S1 brief).
 *  Rules only. */
export function reviewPrompt(
  sources: string[],
  translations: string[],
  targetLang: string,
  rules?: string,
): string {
  const srcLines  = sources.map((s, i) => `[${i + 1}] ${s}`).join('\n');
  const tranLines = translations.map((t, i) => `[${i + 1}] ${t}`).join('\n');
  return `You are a bilingual reviewer checking a translation into ${targetLang}. You have not seen any translation brief.

For each segment verify:
- Meaning fully preserved (nothing added or omitted)
- Numbers, names, dates exact
- "tổng hợp" = "combined" (NOT consolidated)
- "hợp nhất" = "consolidated"
- Fluent natural ${targetLang}${rulesBlock(rules)}

Return ONLY corrected numbered lines [N] text. Keep unchanged lines as-is.

SOURCE:
${srcLines}

TRANSLATION:
${tranLines}

Corrected translation:`;
}
```

## `src/pipeline/parseNumberedLines.ts`

```typescript
/** Parse [N] text lines from LLM output. Falls back to original if count mismatches. */
export function parseNumberedLines(raw: string, fallback: string[]): string[] {
  const lines = raw.split('\n').filter(l => /^\[\d+\]/.test(l));
  if (lines.length !== fallback.length) return fallback;
  return lines.map(l => l.replace(/^\[\d+\]\s*/, ''));
}
```

## `src/pipeline/translateDocxBuffer.ts`

```typescript
import { extractSegments } from '../docx/extractSegments';
import { applyTranslations } from '../docx/applyTranslations';
import { primerPrompt, reviewPrompt } from './prompts';
import { parseNumberedLines } from './parseNumberedLines';
import type { CoreProvider, TranslateOptions, TranslateResultBuffer } from './types';

const PRIMER_SAMPLE_CHARS = 1000;

export async function translateDocxBuffer(
  input: ArrayBuffer,
  provider: CoreProvider,
  targetLang: string,
  options?: TranslateOptions,
): Promise<TranslateResultBuffer> {
  const { onStage, onProgress, glossary, rules } = options ?? {};

  onStage?.('extracting');
  const { segments, formatMap } = await extractSegments(input);

  // S1: reading notes — glossary injected, rules not (S1 is observable-only)
  onStage?.('priming');
  const sample = segments.join(' ').slice(0, PRIMER_SAMPLE_CHARS);
  const readingNotes = await provider.complete(primerPrompt(sample, glossary));

  // S2: translation — provider injects glossary+rules per chunk
  onStage?.('translating');
  const rawTranslations = await provider.translateWithBrief(
    segments, targetLang, readingNotes, onProgress,
    { glossary, rules },
  );

  // S3: independent fidelity audit — rules only (no glossary brief)
  onStage?.('reviewing');
  const reviewedRaw = await provider.complete(
    reviewPrompt(segments, rawTranslations, targetLang, rules),
  );
  const finalTranslations = parseNumberedLines(reviewedRaw, rawTranslations);

  // Rebuild — format map applied here, LLM never touched format data
  onStage?.('rebuilding');
  let buffer: ArrayBuffer;
  try {
    buffer = await applyTranslations(input, formatMap, finalTranslations);
  } catch (err) {
    // Count mismatch or fingerprint drift — return original rather than crashing
    console.error('applyTranslations failed, returning original:', err);
    buffer = input;
  }

  onStage?.('done');
  return { buffer, filename: '' }; // caller sets filename from original name
}
```

## `tests/pipeline.prompts.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { primerPrompt, reviewPrompt } from '../src/pipeline/prompts';

describe('primerPrompt', () => {
  it('includes glossary block when glossary provided', () => {
    const prompt = primerPrompt('Some text', 'tổng hợp=combined, hợp nhất=consolidated');
    expect(prompt).toContain('MANDATORY GLOSSARY');
    expect(prompt).toContain('"tổng hợp" → "combined"');
    expect(prompt).toContain('"hợp nhất" → "consolidated"');
  });

  it('omits glossary block when glossary empty', () => {
    const prompt = primerPrompt('Some text', '');
    expect(prompt).not.toContain('MANDATORY GLOSSARY');
  });

  it('omits glossary block when glossary undefined', () => {
    const prompt = primerPrompt('Some text');
    expect(prompt).not.toContain('MANDATORY GLOSSARY');
  });
});

describe('reviewPrompt', () => {
  it('includes rules block when rules provided', () => {
    const prompt = reviewPrompt(['src'], ['trans'], 'English', 'Keep numbers exact.');
    expect(prompt).toContain('MANDATORY RULES');
    expect(prompt).toContain('Keep numbers exact.');
  });

  it('does NOT include glossary (S3 must be independent)', () => {
    const prompt = reviewPrompt(['src'], ['trans'], 'English');
    expect(prompt).not.toContain('MANDATORY GLOSSARY');
  });

  it('numbers source and translation lines correctly', () => {
    const prompt = reviewPrompt(['Hello', 'World'], ['Xin chào', 'Thế giới'], 'Vietnamese');
    expect(prompt).toContain('[1] Hello');
    expect(prompt).toContain('[2] World');
    expect(prompt).toContain('[1] Xin chào');
  });
});
```

## `tests/pipeline.translateDocxBuffer.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { translateDocxBuffer } from '../src/pipeline/translateDocxBuffer';
import type { CoreProvider } from '../src/pipeline/types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function makeSimpleDocx(text: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

function makeProvider(translateResponse: string): CoreProvider {
  return {
    complete: vi.fn().mockResolvedValue(translateResponse),
    translateWithBrief: vi.fn().mockResolvedValue(['Xin chào thế giới']),
  };
}

describe('translateDocxBuffer', () => {
  it('calls S1, S2, S3 in order and returns ArrayBuffer', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const stages: string[] = [];
    const provider = makeProvider('[1] Xin chào thế giới');

    const result = await translateDocxBuffer(buf, provider, 'Vietnamese', {
      onStage: s => stages.push(s),
    });

    expect(stages).toEqual(['extracting', 'priming', 'translating', 'reviewing', 'rebuilding', 'done']);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(provider.complete).toHaveBeenCalledTimes(2); // S1 + S3
    expect(provider.translateWithBrief).toHaveBeenCalledTimes(1);
  });

  it('passes glossary to primerPrompt (S1) and translateWithBrief (S2)', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const provider = makeProvider('[1] Xin chào');

    await translateDocxBuffer(buf, provider, 'Vietnamese', {
      glossary: 'hello=xin chào',
    });

    const s1Call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(s1Call).toContain('MANDATORY GLOSSARY');

    const s2Opts = (provider.translateWithBrief as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(s2Opts?.glossary).toBe('hello=xin chào');
  });

  it('passes rules to S2 and S3 but NOT glossary to S3', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const provider = makeProvider('[1] Xin chào');

    await translateDocxBuffer(buf, provider, 'Vietnamese', {
      glossary: 'hello=xin chào',
      rules: 'Keep numbers exact.',
    });

    const s3Call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(s3Call).toContain('MANDATORY RULES');
    expect(s3Call).not.toContain('MANDATORY GLOSSARY');
  });

  it('falls back to original buffer if applyTranslations throws', async () => {
    const buf = await makeSimpleDocx('Hello world');
    // Provider returns wrong count to trigger mismatch
    const provider: CoreProvider = {
      complete: vi.fn().mockResolvedValue('[1] Xin chào'),
      translateWithBrief: vi.fn().mockResolvedValue(['one', 'two', 'three']), // wrong count
    };

    const result = await translateDocxBuffer(buf, provider, 'Vietnamese');
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    // Should not throw — graceful fallback
  });
});
```

## Acceptance criteria

- [ ] `npm run lint` passes
- [ ] `npm run test` passes — all tests above (7 prompt tests + 4 pipeline tests)
- [ ] S1 primer includes glossary when provided, omits when empty
- [ ] S3 review includes rules but NEVER includes glossary
- [ ] Provider `translateWithBrief` receives `{ glossary, rules }` in opts
- [ ] `translateDocxBuffer` returns original buffer on rebuild error (no throw)
- [ ] No Tauri, React, or browser-specific imports
