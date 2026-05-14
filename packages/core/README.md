# @docshift/core

> Format-preserving DOCX translation pipeline. Extracts text, translates via your LLM provider, rebuilds the original formatting.

[![npm](https://img.shields.io/npm/v/@docshift/core)](https://www.npmjs.com/package/@docshift/core)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/nightskat)

## Install

```bash
npm install @docshift/core
```

## Quick start

```typescript
import { translateDocxBuffer } from '@docshift/core';
import type { CoreProvider } from '@docshift/core';

const provider: CoreProvider = {
  async complete(prompt) { /* call your LLM, return response string */ },
  async translateWithBrief(segments, targetLang, readingNotes, onProgress, opts) {
    /* translate segments in chunks, inject opts.glossary + opts.rules */
    return segments.map(() => '');
  },
};

const fs = await import('fs/promises');
const input = (await fs.readFile('document.docx')).buffer;

const { buffer } = await translateDocxBuffer(input, provider, 'English', {
  glossary: 'tổng hợp=combined, hợp nhất=consolidated',
  rules: 'Keep all numbers in original format.',
  onStage: stage => console.log('Stage:', stage),
  onProgress: (done, total) => console.log(`${done}/${total} segments`),
});

await fs.writeFile('document_en.docx', Buffer.from(buffer));
```

## API

### `translateDocxBuffer(input, provider, targetLang, options?)`

| Param | Type | Description |
|---|---|---|
| `input` | `ArrayBuffer` | Source `.docx` file bytes |
| `provider` | `CoreProvider` | LLM adapter — must implement `complete` + `translateWithBrief` |
| `targetLang` | `string` | Target language name, e.g. `"English"` |
| `options.glossary` | `string?` | Comma-separated `source=target` pairs |
| `options.rules` | `string?` | Free-text translation rules |
| `options.onStage` | `(stage: string) => void?` | Stage callback: extracting → priming → translating → reviewing → rebuilding → done |
| `options.onProgress` | `(done, total) => void?` | Per-segment progress |

Returns `Promise<{ buffer: ArrayBuffer; filename: string }>`.
On rebuild failure, returns original `buffer` unchanged (never throws).

## Support

If this saved you time → [buy me a coffee](https://ko-fi.com/nightskat) ☕

## License

MIT © Tuan Khuc
