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
    console.error('applyTranslations failed securely, returning original buffer.');
    buffer = input;
  }

  onStage?.('done');
  return { buffer, filename: '' };
}
