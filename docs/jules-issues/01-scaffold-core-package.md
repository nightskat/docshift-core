# feat(core): scaffold @docshift/core package with build/test/export baseline

## Context

`@docshift/core` is the pure TypeScript pipeline extracted from the `dich` translation tool.
It will be consumed by: (1) `docshift` Tauri desktop app, (2) `dich-web` Cloudflare Worker.
No Tauri, React, Firebase, or browser-specific APIs anywhere in this package.

## File structure to create

```
packages/core/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── LICENSE          (MIT)
├── src/
│   └── index.ts     (public exports only — see below)
└── tests/
    └── .gitkeep
```

## `package.json` — use exactly

```json
{
  "name": "@docshift/core",
  "version": "0.1.0",
  "description": "Core DOCX translation pipeline for docshift",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "@xmldom/xmldom": "^0.8.11",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "tsup": "^8.2.4",
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  },
  "license": "MIT"
}
```

## `tsup.config.ts` — use exactly

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
```

## `tsconfig.json` — use exactly

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

## `src/index.ts` — stub exports (implementations come in issues 2 and 3)

```typescript
// Stub — filled in by subsequent issues
export type { FormatMap, ExtractResult } from './docx/formatMap';
export { extractSegments } from './docx/extractSegments';
export { applyTranslations } from './docx/applyTranslations';
export type { CoreProvider, TranslateBriefOpts, TranslateOptions, TranslateResultBuffer } from './pipeline/types';
export { translateDocxBuffer } from './pipeline/translateDocxBuffer';
export { primerPrompt, reviewPrompt } from './pipeline/prompts';
```

Create empty placeholder files so TypeScript resolves:
- `src/docx/formatMap.ts` — export empty interfaces for now
- `src/docx/extractSegments.ts` — export stub async function
- `src/docx/applyTranslations.ts` — export stub async function
- `src/pipeline/types.ts` — export empty interfaces
- `src/pipeline/translateDocxBuffer.ts` — export stub async function
- `src/pipeline/prompts.ts` — export stub functions

Stubs must compile. Stub functions should throw `new Error('not implemented')`.

## README.md — minimal

```markdown
# @docshift/core

Core DOCX translation pipeline. Used by [docshift](https://github.com/docshift/docshift) desktop app.

## Install

\`\`\`bash
npm install @docshift/core
\`\`\`

## Usage

\`\`\`typescript
import { translateDocxBuffer } from '@docshift/core';
// Implementation coming in v0.1.0
\`\`\`

## License

MIT
```

## Acceptance criteria

- [ ] `npm run lint` passes (no TypeScript errors)
- [ ] `npm run build` produces `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`
- [ ] `npm run test` passes (no tests yet — just ensure runner exits 0)
- [ ] No imports from `@tauri-apps/*`, `react`, `firebase`, or any browser-UI library
- [ ] `dist/` contents match the `exports` map in package.json
