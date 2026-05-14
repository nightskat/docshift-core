export interface FormatMap {
  kind: 'uniform' | 'mixed';
  fingerprint: string;          // `${text.length}:${text.slice(0,32)}`
  paragraphStyle?: string;
  runs?: { chars: number; rPrXml: string }[];  // mixed only
}

export interface ExtractResult {
  segments: string[];
  formatMap: FormatMap[];
}
