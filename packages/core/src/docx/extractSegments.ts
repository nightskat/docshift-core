import JSZip from 'jszip';
import type { ExtractResult, FormatMap } from './formatMap';
import { W, parseXml, getRuns, isUniform, fingerprint, DOCX_TEXT_PARTS } from '../internal/xml';

export async function extractSegments(buffer: ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buffer);
  const targetFiles = Object.keys(zip.files).filter(name => DOCX_TEXT_PARTS.test(name));
  if (!targetFiles.includes('word/document.xml')) {
    throw new Error('Invalid .docx: missing word/document.xml');
  }

  const segments: string[] = [];
  const formatMap: FormatMap[] = [];

  for (const fname of targetFiles) {
    const xml = await zip.file(fname)!.async('text');
    const doc = parseXml(xml);
    const paras = Array.from(doc.getElementsByTagNameNS(W, 'p')) as Element[];

    for (const para of paras) {
      const runs = getRuns(para);
      const fullText = runs.map(r => r.text).join('').trim();
      if (!fullText) continue;

      const fp = fingerprint(fullText);
      if (isUniform(runs)) {
        segments.push(fullText);
        formatMap.push({ kind: 'uniform', fingerprint: fp });
      } else {
        segments.push(fullText);
        formatMap.push({
          kind: 'mixed',
          fingerprint: fp,
          runs: runs.filter(r => r.text.length > 0).map(r => ({ chars: r.text.length, rPrXml: r.rPrXml })),
        });
      }
    }
  }

  return { segments, formatMap };
}
