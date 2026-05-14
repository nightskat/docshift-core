# ci(release): CI + npm publish workflow for @docshift/core

## Depends on

Issue #3 (pipeline) must be merged first.

## Files to create

```
.github/workflows/ci.yml
.github/workflows/publish.yml
```

## `.github/workflows/ci.yml`

Runs on every push and pull request to `main`.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint (type check)
        run: npm run lint

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

      - name: Verify dist exports
        run: |
          node -e "const m = require('./dist/index.cjs'); console.log('CJS OK:', Object.keys(m).join(', '));"
```

## `.github/workflows/publish.yml`

Runs on release tags (`v*`). Publishes to npm with provenance.

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read
  id-token: write   # required for npm provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Lint + test + build (prepublishOnly runs automatically)
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## README.md — update with install + usage section

Add this section after the title/tagline:

```markdown
## Install

\`\`\`bash
npm install @docshift/core
\`\`\`

## Quick start

\`\`\`typescript
import { translateDocxBuffer } from '@docshift/core';
import type { CoreProvider } from '@docshift/core';

// Implement CoreProvider with your preferred LLM
const provider: CoreProvider = {
  async complete(prompt) { /* call your LLM */ return ''; },
  async translateWithBrief(segments, targetLang, readingNotes, onProgress, opts) {
    /* translate segments, inject opts.glossary + opts.rules per chunk */
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
\`\`\`

## API

### `translateDocxBuffer(input, provider, targetLang, options?)`

| Param | Type | Description |
|---|---|---|
| `input` | `ArrayBuffer` | Source `.docx` file bytes |
| `provider` | `CoreProvider` | LLM adapter implementing `complete` + `translateWithBrief` |
| `targetLang` | `string` | Target language name, e.g. `"English"` |
| `options.glossary` | `string?` | Comma-separated `source=target` pairs |
| `options.rules` | `string?` | Free-text translation rules |
| `options.onStage` | `(stage: string) => void` | Progress stage callback |
| `options.onProgress` | `(done, total) => void` | Segment progress callback |

Returns `Promise<{ buffer: ArrayBuffer; filename: string }>`.
```

## Acceptance criteria

- [ ] `ci.yml` triggers on push and PR to main
- [ ] `ci.yml` runs lint → test → build → verify dist exports in sequence
- [ ] `publish.yml` triggers on `v*` tags only
- [ ] `publish.yml` uses `id-token: write` for npm provenance
- [ ] `publish.yml` uses `NPM_TOKEN` secret (not hardcoded)
- [ ] README install + API section added
- [ ] No secrets or credentials in any committed file
