import { CoreProvider, TranslateOptions, TranslateResultBuffer } from './types';

export async function translateDocxBuffer(
  buffer: ArrayBuffer,
  provider: CoreProvider,
  targetLang: string,
  options?: TranslateOptions,
): Promise<TranslateResultBuffer> {
  throw new Error('not implemented');
}
