# feat(core-docx): implement extractSegments + applyTranslations with FormatMap

## Depends on

Issue #1 (scaffold) must be merged first.

## Context

The DOCX layer separates formatting from text. `extractSegments` returns plain text + a
`FormatMap` side-channel. `applyTranslations` uses the `FormatMap` to rebuild run structure
without involving the LLM. The LLM never sees format markers.

## Files to create/replace (stubs from issue #1 → real implementations)

```
src/docx/formatMap.ts
src/docx/extractSegments.ts
src/docx/applyTranslations.ts
src/internal/distributeRuns.ts
src/internal/xml.ts
src/internal/guards.ts
tests/docx.extractSegments.test.ts
tests/docx.applyTranslations.test.ts
```

## `src/docx/formatMap.ts`

```typescript
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
```

## `src/internal/xml.ts`

```typescript
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc as any);
}

export interface RunInfo {
  element: Element;
  text: string;
  rPrXml: string;
}

export function serializeRPr(run: Element): string {
  const rPr = run.getElementsByTagNameNS(W, 'rPr')[0] as Element | undefined;
  return rPr ? new XMLSerializer().serializeToString(rPr as any) : '';
}

export function getRuns(para: Element): RunInfo[] {
  const out: RunInfo[] = [];
  const runs = para.getElementsByTagNameNS(W, 'r');
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i] as Element;
    const tNodes = r.getElementsByTagNameNS(W, 't');
    let text = '';
    for (let j = 0; j < tNodes.length; j++) text += tNodes[j].textContent ?? '';
    out.push({ element: r, text, rPrXml: serializeRPr(r) });
  }
  return out;
}

export function isUniform(runs: RunInfo[]): boolean {
  const nonEmpty = runs.filter(r => r.text.length > 0);
  if (nonEmpty.length <= 1) return true;
  return nonEmpty.every(r => r.rPrXml === nonEmpty[0].rPrXml);
}

export function fingerprint(text: string): string {
  return `${text.length}:${text.slice(0, 32)}`;
}

/** Parts of a .docx that may contain visible text */
export const DOCX_TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes).*\.xml$/;
```

## `src/internal/guards.ts`

```typescript
export function assertCountMatch(formatMap: unknown[], translated: unknown[]): void {
  if (translated.length !== formatMap.length) {
    throw new Error(
      `Translation count mismatch: expected ${formatMap.length}, got ${translated.length}`
    );
  }
}
```

## `src/internal/distributeRuns.ts`

```typescript
/** Distribute translated text across runs proportionally by original char count.
 *  Splits at word boundaries. Returns null when fewer words than non-empty runs. */
export function distributeRuns(translated: string, runLengths: number[]): string[] | null {
  const total = runLengths.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const nonEmptyCount = runLengths.filter(l => l > 0).length;
  if (nonEmptyCount <= 1) return null;
  const words = translated.split(/\s+/);
  if (words.length < nonEmptyCount) return null;

  const result: string[] = [];
  let wordIdx = 0;
  for (let i = 0; i < runLengths.length; i++) {
    if (runLengths[i] === 0) { result.push(''); continue; }
    const isLast = runLengths.slice(i + 1).every(l => l === 0);
    if (isLast) {
      result.push(words.slice(wordIdx).join(' '));
    } else {
      const target = Math.max(1, Math.round(words.length * runLengths[i] / total));
      const end = Math.min(wordIdx + target, words.length);
      result.push(words.slice(wordIdx, end).join(' '));
      wordIdx = end;
    }
  }
  // Add trailing space to all but last non-empty run
  let lastNe = -1;
  for (let i = result.length - 1; i >= 0; i--) { if (result[i]) { lastNe = i; break; } }
  for (let i = 0; i < result.length; i++) {
    if (result[i] && i !== lastNe) result[i] += ' ';
  }
  return result;
}
```

## `src/docx/extractSegments.ts`

```typescript
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
```

## `src/docx/applyTranslations.ts`

```typescript
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
```

## `tests/docx.extractSegments.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { extractSegments } from '../src/docx/extractSegments';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wrapBody(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${inner}</w:body></w:document>`;
}

async function makeDocx(paraXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', wrapBody(paraXml));
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('extractSegments', () => {
  it('extracts plain text from a uniform paragraph', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}"><w:r><w:t>Hello world</w:t></w:r></w:p>`);
    const { segments, formatMap } = await extractSegments(buf);
    expect(segments).toEqual(['Hello world']);
    expect(formatMap[0].kind).toBe('uniform');
    expect(formatMap[0].fingerprint).toContain('11:');
  });

  it('marks mixed paragraph with run lengths', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}">
      <w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>
      <w:r><w:t xml:space="preserve"> plain</w:t></w:r>
    </w:p>`);
    const { segments, formatMap } = await extractSegments(buf);
    expect(segments[0]).toBe('Bold plain');
    expect(formatMap[0].kind).toBe('mixed');
    expect(formatMap[0].runs).toHaveLength(2);
    expect(formatMap[0].runs![0].chars).toBe(4); // 'Bold'
  });

  it('skips empty paragraphs', async () => {
    const buf = await makeDocx(`
      <w:p xmlns:w="${W}"><w:r><w:t>First</w:t></w:r></w:p>
      <w:p xmlns:w="${W}"></w:p>
      <w:p xmlns:w="${W}"><w:r><w:t>Second</w:t></w:r></w:p>
    `);
    const { segments } = await extractSegments(buf);
    expect(segments).toEqual(['First', 'Second']);
  });

  it('throws on missing word/document.xml', async () => {
    const zip = new JSZip();
    zip.file('word/other.xml', '<root/>');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(extractSegments(buf)).rejects.toThrow('Invalid .docx');
  });
});
```

## `tests/docx.applyTranslations.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments } from '../src/docx/extractSegments';
import { applyTranslations } from '../src/docx/applyTranslations';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wrapBody(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${inner}</w:body></w:document>`;
}

async function makeDocx(paraXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', wrapBody(paraXml));
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function readRuns(buf: ArrayBuffer): Promise<{ text: string; bold: boolean }[]> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('text');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.getElementsByTagNameNS(W, 'r') as any).map((r: any) => ({
    text: Array.from(r.getElementsByTagNameNS(W, 't') as any).map((t: any) => t.textContent ?? '').join(''),
    bold: r.getElementsByTagNameNS(W, 'b').length > 0,
  }));
}

describe('applyTranslations', () => {
  it('writes translation into uniform paragraph', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}"><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const { formatMap } = await extractSegments(buf);
    const out = await applyTranslations(buf, formatMap, ['Xin chào']);
    const runs = await readRuns(out);
    expect(runs[0].text).toBe('Xin chào');
  });

  it('preserves bold run boundary via proportional distribution', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}">
      <w:r><w:rPr><w:b/></w:rPr><w:t>Tăng huyết áp</w:t></w:r>
      <w:r><w:t xml:space="preserve"> là bệnh phổ biến.</w:t></w:r>
    </w:p>`);
    const { formatMap } = await extractSegments(buf);
    const out = await applyTranslations(buf, formatMap, [
      'Hypertension is a common disease.',
    ]);
    const runs = await readRuns(out);
    const full = runs.map(r => r.text).join('').trim();
    expect(full).toContain('Hypertension');
    expect(runs.some(r => r.bold && r.text.trim())).toBe(true);
    expect(runs.some(r => !r.bold && r.text.trim())).toBe(true);
  });

  it('throws on count mismatch', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}"><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const { formatMap } = await extractSegments(buf);
    await expect(applyTranslations(buf, formatMap, ['one', 'two'])).rejects.toThrow('mismatch');
  });

  it('returns valid docx buffer on empty translation', async () => {
    const buf = await makeDocx(`<w:p xmlns:w="${W}"><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const { formatMap } = await extractSegments(buf);
    const out = await applyTranslations(buf, formatMap, ['']);
    expect(out).toBeInstanceOf(ArrayBuffer);
  });
});
```

## Acceptance criteria

- [ ] `npm run lint` passes
- [ ] `npm run test` passes — all 8 tests above
- [ ] `applyTranslations` returns valid `.docx` buffer loadable by JSZip
- [ ] Count mismatch throws with message containing "mismatch"
- [ ] Fingerprint mismatch throws with message containing "misalignment"
- [ ] No Web Worker, no Tauri, no React imports
