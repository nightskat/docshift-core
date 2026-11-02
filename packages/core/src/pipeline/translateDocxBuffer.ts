import { extractSegments } from '../docx/extractSegments';
import { applyTranslations } from '../docx/applyTranslations';
import { primerPrompt, reviewPrompt } from './prompts';
import { parseNumberedLines } from './parseNumberedLines';
import type { CoreProvider, TranslateOptions, TranslateResultBuffer } from './types';

const PRIMER_SAMPLE_CHARS = 1000;
const MAX_TARGET_LANG_LENGTH = 64;

/**
 * Reject targetLang values that could inject instructions into the S3 prompt
 * (newlines/control chars) or are empty/oversized. Language names such as
 * "Vietnamese" or "English (US)" remain valid.
 */
function validateTargetLang(targetLang: string): void {
  if (
    typeof targetLang !== 'string' ||
    targetLang.trim() === '' ||
    targetLang.length > MAX_TARGET_LANG_LENGTH ||
    /[\u0000-\u001f\u007f\u2028\u2029]/.test(targetLang)
  ) {
    throw new Error('Invalid targetLang: expected a short single-line language name or code.');
  }
}

export async function translateDocxBuffer(
  input: ArrayBuffer,
  provider: CoreProvider,
  targetLang: string,
  options?: TranslateOptions,
): Promise<TranslateResultBuffer> {
  validateTargetLang(targetLang);
  const { onStage, onProgress, glossary, rules } = options ?? {};

  onStage?.('extracting');
  const { segments, formatMap } = await extractSegments(input);

  onStage?.('priming');
  const sample = segments.join(' ').slice(0, PRIMER_SAMPLE_CHARS);
  const readingNotes = await provider.complete(primerPrompt(sample, glossary));

  onStage?.('translating');
  const rawTranslations = await provider.translateWithBrief(
    segments, targetLang, readingNotes, onProgress,
    { glossary, rules },
  );

  onStage?.('reviewing');
  const reviewedRaw = await provider.complete(
    reviewPrompt(segments, rawTranslations, targetLang, rules),
  );
  const finalTranslations = parseNumberedLines(reviewedRaw, rawTranslations);

  onStage?.('rebuilding');
  let buffer: ArrayBuffer;
  try {
    buffer = await applyTranslations(input, formatMap, finalTranslations);
  } catch (err) {
    // 🛡️ Sentinel: Do not log the raw error object to prevent leaking sensitive document text (PII)
    // or stack traces into server logs. The error contains document text fingerprints.
    console.error('applyTranslations failed securely, returning original buffer.', err instanceof Error ? err.message : '');
    buffer = input;
  }

  onStage?.('done');
  return { buffer, filename: '' };
}
