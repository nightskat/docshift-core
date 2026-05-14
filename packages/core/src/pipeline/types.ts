export interface CoreProvider {
  complete(prompt: string): Promise<string>;
  translateWithBrief(
    segments: string[],
    targetLang: string,
    readingNotes: string,
    onProgress?: (done: number, total: number) => void,
    opts?: { glossary?: string; rules?: string },
  ): Promise<string[]>;
}

export interface TranslateBriefOpts {
  glossary?: string;
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
