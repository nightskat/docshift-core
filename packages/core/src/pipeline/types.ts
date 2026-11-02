export interface CoreProvider {
  complete(prompt: string): Promise<string>;
}

export interface TranslateBriefOpts {
  glossary?: string;
  rules?: string;
}

export interface TranslateOptions extends TranslateBriefOpts {
  onStage?: (stage: string) => void;
}

export interface TranslateResultBuffer {
  buffer: ArrayBuffer;
  filename: string;
}
