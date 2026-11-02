/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { translateDocxBuffer } from '../src/index';
import type { CoreProvider } from '../src/pipeline/types';

const OR_PATH = `${process.env.HOME}/conductor/projects/inspection_audit_2025/tools/openrouter_dispatch.py`;
const MODEL = process.env.E2E_MODEL ?? 'google/gemma-3-12b-it';

const provider: CoreProvider = {
  async complete(prompt: string): Promise<string> {
    console.log(`[provider.complete] sending ${prompt.length} chars to ${MODEL}…`);
    const res = spawnSync(
      'python3',
      [OR_PATH, '--model', MODEL, '--timeout', '90', '--max-tokens', '2000'],
      {
        input: prompt,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    if (res.status !== 0) {
      console.error('[provider.complete] non-zero exit', res.status);
      console.error('stderr:', res.stderr);
      throw new Error(`OR dispatch failed: ${res.stderr}`);
    }
    const out = res.stdout;
    console.log(`[provider.complete] got ${out.length} chars`);
    return out;
  }
};

async function main(): Promise<void> {
  const inputPath = process.argv[2] ?? '/tmp/sample.docx';
  const outputPath = process.argv[3] ?? '/tmp/sample-translated.docx';
  const targetLang = process.argv[4] ?? 'vi';

  console.log('=== docshift-core e2e test ===');
  console.log('Input :', inputPath);
  console.log('Output:', outputPath);
  console.log('Lang  :', targetLang);
  console.log('Model :', MODEL);
  console.log('');

  const inputNode = readFileSync(inputPath);
  const inputBuffer = inputNode.buffer.slice(
    inputNode.byteOffset,
    inputNode.byteOffset + inputNode.byteLength
  );

  const t0 = Date.now();
  const result = await translateDocxBuffer(inputBuffer, provider, targetLang, {
    glossary: 'API=API\nSDK=SDK',
    rules: 'Vietnamese formal register. Keep technical terms in English.',
    onStage: (s) => console.log(`[stage] ${s} (+${Date.now() - t0}ms)`),
  });
  const elapsed = Date.now() - t0;

  writeFileSync(outputPath, Buffer.from(result.buffer));
  console.log('');
  console.log('=== SUCCESS ===');
  console.log('Filename:', result.filename);
  console.log('Output  :', outputPath, `(${result.buffer.byteLength} bytes)`);
  console.log('Elapsed :', `${elapsed}ms`);
}

main().catch((err) => {
  console.error('=== FAIL ===');
  console.error(err);
  process.exit(1);
});
