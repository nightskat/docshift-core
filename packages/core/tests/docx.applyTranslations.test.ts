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
    const runs = await readRuns(out);
    expect(runs[0].text).toBe('');
  });

  it('clears extra t-nodes in the same run to prevent corruption', async () => {
    // A run with two t-nodes: <w:r><w:t>Hello</w:t><w:t> world</w:t></w:r>
    const xml = `<w:p xmlns:w="${W}"><w:r><w:t>Hello</w:t><w:t> world</w:t></w:r></w:p>`;
    const buf = await makeDocx(xml);
    const { formatMap } = await extractSegments(buf);

    const out = await applyTranslations(buf, formatMap, ['Xin chào']);
    const runs = await readRuns(out);
    // Should be "Xin chào", not "Xin chào world"
    expect(runs[0].text).toBe('Xin chào');
  });
});
