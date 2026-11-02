/* eslint-disable no-console */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { translateDocxBuffer } from '../src/index';
import { extractSegments } from '../src/docx/extractSegments';
import type { CoreProvider } from '../src/pipeline/types';

const RUN_E2E = process.env.E2E === '1';
const INPUT_PATH = process.env.E2E_INPUT ?? '/tmp/sample.docx';
const OUTPUT_PATH = process.env.E2E_OUTPUT ?? '/tmp/sample-translated.docx';
const TARGET_LANG = process.env.E2E_LANG ?? 'vi';
const OR_PATH = `${process.env.HOME}/conductor/projects/inspection_audit_2025/tools/openrouter_dispatch.py`;
const MODEL = process.env.E2E_MODEL ?? 'google/gemma-3-12b-it';

const live = RUN_E2E ? describe : describe.skip;

live('e2e: translate live DOCX via OpenRouter', () => {
  it('translates a real DOCX end-to-end', async () => {
    expect(existsSync(INPUT_PATH), `input missing at ${INPUT_PATH}`).toBe(true);

    const provider: CoreProvider = {
      async complete(prompt: string): Promise<string> {
        console.log(`[complete] ${prompt.length} chars → ${MODEL}`);
        const res = spawnSync(
          'python3',
          [OR_PATH, '--model', MODEL, '--timeout', '90', '--max-tokens', '2000'],
          { input: prompt, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
        );
        expect(res.status, `OR exit ${res.status}: ${res.stderr}`).toBe(0);
        const out = res.stdout;
        console.log(`[complete] got ${out.length} chars`);
        return out;
      }
    };

    const inputNode = readFileSync(INPUT_PATH);
    const inputBuffer = inputNode.buffer.slice(
      inputNode.byteOffset,
      inputNode.byteOffset + inputNode.byteLength
    );

    const t0 = Date.now();
    const result = await translateDocxBuffer(inputBuffer, provider, TARGET_LANG, {
      glossary: 'API=API\nSDK=SDK',
      rules: 'Vietnamese formal register. Keep technical terms in English.',
      onStage: (s) => console.log(`[stage] ${s} (+${Date.now() - t0}ms)`),
    });
    const elapsed = Date.now() - t0;

    expect(result.buffer.byteLength).toBeGreaterThan(1000);
    expect(result.filename).toBe(`translated-${TARGET_LANG}.docx`);

    writeFileSync(OUTPUT_PATH, Buffer.from(result.buffer));
    console.log(`✅ output ${OUTPUT_PATH} (${result.buffer.byteLength} bytes, ${elapsed}ms)`);

    // Re-extract translated segments to confirm round-trip
    const reExtracted = await extractSegments(result.buffer);
    console.log(`[verify] translated segments: ${JSON.stringify(reExtracted.segments)}`);
    expect(reExtracted.segments.length).toBeGreaterThan(0);
  }, 240_000);
});
