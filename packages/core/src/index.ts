// Stub — filled in by subsequent issues
export type { FormatMap, ExtractResult } from './docx/formatMap';
export { extractSegments } from './docx/extractSegments';
export { applyTranslations } from './docx/applyTranslations';
export type { CoreProvider, TranslateBriefOpts, TranslateOptions, TranslateResultBuffer } from './pipeline/types';
export { translateDocxBuffer } from './pipeline/translateDocxBuffer';
export { primerPrompt, reviewPrompt } from './pipeline/prompts';
