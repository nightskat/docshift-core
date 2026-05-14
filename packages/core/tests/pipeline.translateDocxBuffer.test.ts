import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { translateDocxBuffer } from '../src/pipeline/translateDocxBuffer';
import type { CoreProvider } from '../src/pipeline/types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function makeSimpleDocx(text: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('translateDocxBuffer', () => {
  it('calls S1, S2, S3 in order and returns ArrayBuffer', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const stages: string[] = [];
    const provider: CoreProvider = {
      complete: vi.fn().mockResolvedValue('[1] Xin chào thế giới'),
      translateWithBrief: vi.fn().mockResolvedValue(['Xin chào thế giới']),
    };

    const result = await translateDocxBuffer(buf, provider, 'Vietnamese', {
      onStage: s => stages.push(s),
    });

    expect(stages).toEqual(['extracting', 'priming', 'translating', 'reviewing', 'rebuilding', 'done']);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(provider.translateWithBrief).toHaveBeenCalledTimes(1);
  });

  it('injects glossary into S1 prompt and S2 opts, but NOT S3', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const provider: CoreProvider = {
      complete: vi.fn().mockResolvedValue('[1] Xin chào'),
      translateWithBrief: vi.fn().mockResolvedValue(['Xin chào']),
    };

    await translateDocxBuffer(buf, provider, 'Vietnamese', {
      glossary: 'hello=xin chào',
      rules: 'Keep numbers exact.',
    });

    const s1Prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(s1Prompt).toContain('MANDATORY GLOSSARY');

    const s3Prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(s3Prompt).not.toContain('MANDATORY GLOSSARY');
    expect(s3Prompt).toContain('MANDATORY RULES');

    const s2Opts = (provider.translateWithBrief as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(s2Opts?.glossary).toBe('hello=xin chào');
  });

  it('falls back to original buffer if applyTranslations throws (count mismatch)', async () => {
    const buf = await makeSimpleDocx('Hello world');
    const provider: CoreProvider = {
      complete: vi.fn().mockResolvedValue('[1] Xin chào'),
      translateWithBrief: vi.fn().mockResolvedValue(['one', 'two', 'three']), // wrong count
    };

    const result = await translateDocxBuffer(buf, provider, 'Vietnamese');
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
