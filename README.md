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

const result = await translateDocxBuffer(buffer, provider, 'en', {
  glossary: 'tín dụng = credit facility',
  rules: 'Keep all numbers. Preserve paragraph structure.',
});
// result.buffer — translated .docx ArrayBuffer
// result.filename — suggested output filename
```

## Architecture

Three-stage pipeline with format preservation:

1. **S1 Primer** — LLM reads a sample, builds domain context (brief)
2. **S2 Translate** — segment-by-segment translation with brief + optional glossary/rules
3. **S3 Audit** — independent review pass (rules only, no glossary — keeps it unbiased)

Formatting (bold, italic, headers, tables) is extracted into a `FormatMap` side-channel before translation and reapplied after. The LLM never sees markup.

## BYOK (Bring Your Own Key)

Implement the `CoreProvider` interface with any LLM:

```typescript
import type { CoreProvider } from '@docshift/core';

const provider: CoreProvider = {
  async complete(prompt) { /* call your LLM */ },
  async translateWithBrief(segments, targetLang, brief, onProgress, opts) {
    /* translate each segment */
  },
};
```

## Support

If this saved you time → [buy me a coffee](https://ko-fi.com/nightskat) ☕

## License

MIT © Tuan Khuc
