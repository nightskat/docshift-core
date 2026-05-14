import JSZip from 'jszip';
import type { FormatMap } from './formatMap';
import { W, parseXml, serializeXml, getRuns, fingerprint, DOCX_TEXT_PARTS } from '../internal/xml';
import { distributeRuns } from '../internal/distributeRuns';
import { assertCountMatch } from '../internal/guards';

export async function applyTranslations(
  buffer: ArrayBuffer,
  formatMap: FormatMap[],
  translated: string[],
): Promise<ArrayBuffer> {
  assertCountMatch(formatMap, translated);

  const zip = await JSZip.loadAsync(buffer);
  const targetFiles = Object.keys(zip.files).filter(name => DOCX_TEXT_PARTS.test(name));
  if (!targetFiles.includes('word/document.xml')) {
    throw new Error('Invalid .docx: missing word/document.xml');
  }

  let segIdx = 0;

  for (const fname of targetFiles) {
    const xml = await zip.file(fname)!.async('text');
    const doc = parseXml(xml);
    const paras = Array.from(doc.getElementsByTagNameNS(W, 'p')) as Element[];

    for (const para of paras) {
      const runs = getRuns(para);
      const fullText = runs.map(r => r.text).join('').trim();
      if (!fullText || segIdx >= formatMap.length) continue;

      const fmt = formatMap[segIdx];
      if (fingerprint(fullText) !== fmt.fingerprint) {
        throw new Error(
          `Format map misalignment at segment ${segIdx}: ` +
          `expected "${fmt.fingerprint}", got "${fingerprint(fullText)}"`
        );
      }
      const trans = translated[segIdx] ?? '';
      segIdx++;

      if (!trans) continue;

      if (fmt.kind === 'uniform') {
        let placed = false;
        for (const run of runs) {
          const tNodes = run.element.getElementsByTagNameNS(W, 't');
          if (!placed && run.text) {
            if (tNodes[0]) tNodes[0].textContent = trans;
            placed = true;
          } else {
            for (let i = 0; i < tNodes.length; i++) tNodes[i].textContent = '';
          }
        }
      } else {
        const nonEmptyRuns = runs.filter(r => r.text.length > 0);
        const lengths = nonEmptyRuns.map(r => r.text.length);
        const distributed = distributeRuns(trans, lengths);

        if (distributed) {
          let distIdx = 0;
          for (const run of runs) {
            const tNodes = run.element.getElementsByTagNameNS(W, 't');
            if (run.text) {
              if (tNodes[0]) tNodes[0].textContent = distributed[distIdx++] ?? '';
              for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = '';
            } else {
              for (let i = 0; i < tNodes.length; i++) tNodes[i].textContent = '';
            }
          }
        } else {
          // Fewer words than runs: put all text in first run
          let placed = false;
          for (const run of runs) {
            const tNodes = run.element.getElementsByTagNameNS(W, 't');
            if (!placed && run.text) {
              if (tNodes[0]) tNodes[0].textContent = trans;
              placed = true;
            } else {
              for (let i = 0; i < tNodes.length; i++) tNodes[i].textContent = '';
            }
          }
        }
      }
    }

    zip.file(fname, serializeXml(doc));
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}
