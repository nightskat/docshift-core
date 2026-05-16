import { CoreProvider, TranslateOptions, TranslateResultBuffer } from './types';
import { extractSegments } from '../docx/extractSegments';
import { applyTranslations } from '../docx/applyTranslations';
import { parseNumberedLines } from './parseNumberedLines';
import { primerPrompt, reviewPrompt, unescapeLeadingNumbers } from './prompts';

/**
 * Validate a target language code. Accepts BCP47-like codes:
 * a 2–3 letter primary tag, optionally followed by `-` and a 2–8
 * alphanumeric subtag (region, script, or variant). Rejects anything
 * else — in particular, any input containing whitespace, newlines, or
 * punctuation that could be used to inject instructions into the prompt
 * (BLOCKER #5 fix).
 *
 * Examples accepted: `vi`, `en`, `en-US`, `zh-Hant`, `es-419`.
 * Examples rejected: `vi\nIgnore all`, `English (formal)`, `<script>`.
 */
function validateTargetLang(targetLang: string): void {
  // BCP47-like: 2-3 letter primary tag + zero-or-more 2-8 alphanumeric subtags
  // Accepts: vi, en, en-US, zh-Hant, zh-Hant-TW, sr-Latn-RS, es-419-AR
  // Rejects: any input with whitespace, newlines, punctuation, or pathlike chars
  if (typeof targetLang !== 'string' || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(targetLang)) {
    throw new Error(
      `Invalid targetLang ${JSON.stringify(targetLang)}: expected BCP47-like code (e.g. "vi", "en-US", "zh-Hant-TW").`
    );
  }
}

function assertTranslationCount(stage: string, translations: string[], segmentCount: number): void {
  if (translations.length !== segmentCount) {
    throw new Error(
      `${stage} translation count mismatch: expected ${segmentCount}, got ${translations.length}`
    );
  }
}

export async function translateDocxBuffer(
  buffer: ArrayBuffer,
  provider: CoreProvider,
  targetLang: string,
  options?: TranslateOptions,
): Promise<TranslateResultBuffer> {
  validateTargetLang(targetLang);

  options?.onStage?.('extract');
  const { segments, formatMap } = await extractSegments(buffer);

  if (segments.length === 0) {
    return {
      buffer,
      filename: `translated-${targetLang}.docx`,
    };
  }

  options?.onStage?.('primer');
  const primerOutput = await provider.complete(
    `Target language: ${targetLang}\n\n${primerPrompt(segments, options?.glossary)}`
  );
  const primerTranslations = parseNumberedLines(primerOutput).map(unescapeLeadingNumbers);
  assertTranslationCount('Primer', primerTranslations, segments.length);

  options?.onStage?.('review');
  const reviewOutput = await provider.complete(
    `Target language: ${targetLang}\n\n${reviewPrompt(segments, primerTranslations, options?.rules, options?.glossary)}`
  );
  const finalTranslations = parseNumberedLines(reviewOutput).map(unescapeLeadingNumbers);
  assertTranslationCount('Review', finalTranslations, segments.length);

  options?.onStage?.('apply');
  const translatedBuffer = await applyTranslations(buffer, formatMap, finalTranslations);

  return {
    buffer: translatedBuffer,
    filename: `translated-${targetLang}.docx`,
  };
}
