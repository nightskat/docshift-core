import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('../src/docx/applyTranslations', () => ({
  applyTranslations: vi.fn().mockRejectedValue(new Error('misalignment')),
}));

import { translateDocxBuffer } from '../src/pipeline/translateDocxBuffer';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

describe('pipeline.translateDocxBuffer rebuild fallback (invariant 5)', () => {
  it('returns the original buffer when applyTranslations throws', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const complete = vi.fn<(_: string) => Promise<string>>()
      .mockResolvedValueOnce('1. Xin chao')
      .mockResolvedValueOnce('1. Xin chào');

    const result = await translateDocxBuffer(buffer, { complete }, 'vi');

    expect(result.buffer).toBe(buffer);
    expect(result.filename).toBe('translated-vi.docx');
  });
});
