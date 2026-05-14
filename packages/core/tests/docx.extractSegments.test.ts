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
