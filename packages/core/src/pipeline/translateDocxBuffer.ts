import { extractSegments } from '../docx/extractSegments';
import { applyTranslations } from '../docx/applyTranslations';
import { primerPrompt, reviewPrompt } from './prompts';
import { parseNumberedLines } from './parseNumberedLines';
import type { CoreProvider, TranslateOptions, TranslateResultBuffer } from './types';

const PRIMER_SAMPLE_CHARS = 1000;

/**
 * Fixed allowlist of target languages: BCP-47 code → canonical English name.
 * Only the canonical name is ever interpolated into prompts, so caller input
 * never reaches the LLM verbatim (prompt-injection guard).
 */
const LANGUAGES: Readonly<Record<string, string>> = {
  vi: 'Vietnamese',
  en: 'English',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  zh: 'Chinese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  km: 'Khmer',
  lo: 'Lao',
};

const BY_CODE = new Map(Object.entries(LANGUAGES).map(([c, n]) => [c.toLowerCase(), { code: c, name: n }]));
// Exact canonical names (incl. regional, e.g. "English (US)") stay accepted for
// backward compatibility; they are fixed strings, so no free text reaches prompts.
const BY_NAME = new Map(Object.entries(LANGUAGES).map(([c, n]) => [n.toLowerCase(), { code: c, name: n }]));

/** Resolve targetLang against the allowlist; throw on anything else. */
export function resolveTargetLang(targetLang: unknown): { code: string; name: string } {
  const key = typeof targetLang === 'string' ? targetLang.trim().toLowerCase() : '';
  const hit = BY_CODE.get(key) ?? BY_NAME.get(key);
  if (!hit) {
    throw new Error(
      `Invalid targetLang: expected one of ${Object.keys(LANGUAGES).join(', ')} (or its exact English name, e.g. "English (US)").`,
    );
  }
  return hit;
}

export async function translateDocxBuffer(
  input: ArrayBuffer,
  provider: CoreProvider,
  targetLang: string,
  options?: TranslateOptions,
): Promise<TranslateResultBuffer> {
  const lang = resolveTargetLang(targetLang);
  const { onStage, onProgress, glossary, rules } = options ?? {};

  onStage?.('extracting');
  const { segments, formatMap } = await extractSegments(input);

  onStage?.('priming');
  const sample = segments.join(' ').slice(0, PRIMER_SAMPLE_CHARS);
  const readingNotes = await provider.complete(primerPrompt(sample, glossary));

  onStage?.('translating');
  const rawTranslations = await provider.translateWithBrief(
    segments, lang.name, readingNotes, onProgress,
    { glossary, rules },
  );

  onStage?.('reviewing');
  const reviewedRaw = await provider.complete(
    reviewPrompt(segments, rawTranslations, lang.name, rules),
  );
  const finalTranslations = parseNumberedLines(reviewedRaw, rawTranslations);

  onStage?.('rebuilding');
  let buffer: ArrayBuffer;
  let fallback = false;
  try {
    buffer = await applyTranslations(input, formatMap, finalTranslations);
  } catch (err) {
    // 🛡️ Sentinel: Do not log the raw error object to prevent leaking sensitive document text (PII)
    // or stack traces into server logs. The error contains document text fingerprints.
    console.error('applyTranslations failed securely, returning original buffer.', err instanceof Error ? err.message : '');
    buffer = input;
    fallback = true;
  }

  onStage?.('done');
  // On fallback the buffer is the untranslated original: say so, and never label it "translated".
  return fallback
    ? { buffer, filename: 'original.docx', fallback: true }
    : { buffer, filename: `translated-${lang.code}.docx`, fallback: false };
}
