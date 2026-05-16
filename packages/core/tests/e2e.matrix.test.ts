/* eslint-disable no-console */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { translateDocxBuffer } from '../src/index';
import { extractSegments } from '../src/docx/extractSegments';
import type { CoreProvider } from '../src/pipeline/types';

const RUN_E2E = process.env.E2E_MATRIX === '1';
const OR_PATH = `${process.env.HOME}/conductor/projects/inspection_audit_2025/tools/openrouter_dispatch.py`;
const MODEL = process.env.E2E_MODEL ?? 'google/gemma-3-12b-it';

const cases = [
  { id: 'A', label: 'headings + bold/italic', input: '/tmp/test-A-formatting.docx' },
  { id: 'B', label: 'bullet list', input: '/tmp/test-B-bullets.docx' },
  { id: 'C', label: 'table 3x2', input: '/tmp/test-C-table.docx' },
  { id: 'D', label: 'long doc 15 paragraphs', input: '/tmp/test-D-long.docx' },
  { id: 'E', label: 'segments starting with "1." (escape test)', input: '/tmp/test-E-numbered.docx' },
];

const makeProvider = (caseId: string): CoreProvider => ({
  async complete(prompt: string): Promise<string> {
    console.log(`[${caseId}] complete ${prompt.length}c → ${MODEL}`);
    const res = spawnSync(
      'python3',
      [OR_PATH, '--model', MODEL, '--timeout', '120', '--max-tokens', '3000'],
      { input: prompt, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    if (res.status !== 0) throw new Error(`OR exit ${res.status}: ${res.stderr}`);
    return res.stdout;
  }
});

const matrix = RUN_E2E ? describe : describe.skip;

matrix('e2e matrix: 5 DOCX variants', () => {
  for (const c of cases) {
    it(`${c.id}: ${c.label}`, async () => {
      expect(existsSync(c.input), `input missing: ${c.input}`).toBe(true);

      const outputPath = `/tmp/test-${c.id}-translated.docx`;
      const provider = makeProvider(c.id);

      const inputNode = readFileSync(c.input);
      const inputBuffer = inputNode.buffer.slice(
        inputNode.byteOffset,
        inputNode.byteOffset + inputNode.byteLength
      );

      // Pre-extract segments to know expected count
      const pre = await extractSegments(inputBuffer);
      console.log(`[${c.id}] input segments (${pre.segments.length}):`, pre.segments);

      const t0 = Date.now();
      const result = await translateDocxBuffer(inputBuffer, provider, 'vi', {
        glossary: 'API=API\nSDK=SDK\nnpm=npm',
        rules: 'Vietnamese formal register. Keep technical terms in English.',
        onStage: (s) => console.log(`[${c.id}] stage ${s} (+${Date.now() - t0}ms)`),
      });
      const elapsed = Date.now() - t0;

      writeFileSync(outputPath, Buffer.from(result.buffer));

      const post = await extractSegments(result.buffer);
      console.log(`[${c.id}] OUTPUT (${post.segments.length} segs, ${elapsed}ms):`, post.segments);
      console.log(`[${c.id}] saved: ${outputPath} (${result.buffer.byteLength}B)`);

      expect(post.segments.length).toBe(pre.segments.length);
      expect(result.filename).toBe('translated-vi.docx');
      expect(result.buffer.byteLength).toBeGreaterThan(1000);
    }, 240_000);
  }
});
