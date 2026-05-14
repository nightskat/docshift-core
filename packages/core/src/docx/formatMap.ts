export interface FormatMap {
  kind: 'uniform' | 'mixed';
  fingerprint: string;   // "${text.length}:${text.slice(0,32)}" — alignment guard
  paragraphStyle?: string;
  /** Present only for mixed paragraphs. One entry per non-empty run. */
  runs?: { chars: number; rPrXml: string }[];
}

export interface ExtractResult {
  segments: string[];   // plain text — no format markers
  formatMap: FormatMap[];
}
