# AGENTS.md — @docshift/core

## What this repo is

Pure TypeScript pipeline that extracts text from `.docx` files, translates via any LLM, and
rebuilds the `.docx` preserving original run-level formatting (bold, italic, mixed runs).

Consumed by:
- `docshift` — Tauri desktop app (separate repo)
- `dich-web` — Cloudflare Worker API (separate repo)

**Hard constraint:** zero Tauri, React, Firebase, or browser-UI imports anywhere in `src/`.

---

## Stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ^5.6 | Primary language |
| tsup | ^8.2 | Build (ESM + CJS + .d.ts) |
| vitest | ^2.1 | Tests |
| jszip | ^3.10 | Read/write .docx zip |
| @xmldom/xmldom | ^0.8 | Parse/serialize Word XML |
| Node.js | 20 (LTS) | Runtime |

---

## Commands

```bash
npm install       # install deps
npm run lint      # tsc --noEmit (type check only, no emit)
npm run test      # vitest run
npm run build     # tsup → dist/
```

All three must pass before any PR merge. Run in this order: lint → test → build.

---

## File layout

```
src/
  index.ts                    # public exports only
  docx/
    formatMap.ts              # FormatMap + ExtractResult interfaces
    extractSegments.ts        # reads .docx → plain text + FormatMap
    applyTranslations.ts      # FormatMap + translated[] → rebuilt .docx
  internal/
    xml.ts                    # DOMParser/XMLSerializer helpers, getRuns, fingerprint
    distributeRuns.ts         # proportional word distribution across runs
    guards.ts                 # assertCountMatch (throws on length mismatch)
  pipeline/
    types.ts                  # CoreProvider, TranslateBriefOpts, TranslateOptions
    prompts.ts                # primerPrompt (S1), reviewPrompt (S3)
    parseNumberedLines.ts     # parse [N] text from LLM output, fallback-safe
    translateDocxBuffer.ts    # orchestrates S1→S2→S3→rebuild
tests/
  docx.extractSegments.test.ts
  docx.applyTranslations.test.ts
  pipeline.prompts.test.ts
  pipeline.translateDocxBuffer.test.ts
```

---

## Architecture — 3-stage pipeline

```
input .docx
  │
  ├─ extractSegments()  →  { segments: string[], formatMap: FormatMap[] }
  │                         FormatMap held aside — LLM never sees it
  │
  ├─ S1 primerPrompt()  →  provider.complete()  →  readingNotes
  │
  ├─ S2 translateWithBrief()  →  rawTranslations[]
  │     (chunks of 15-20 segments, glossary+rules injected per chunk)
  │
  ├─ S3 reviewPrompt()  →  provider.complete()  →  finalTranslations[]
  │     (independent — rules only, NO glossary brief, avoids S1 "poison")
  │
  └─ applyTranslations(formatMap, finalTranslations)  →  output .docx
        Fallback: if throws → return original buffer unchanged
```

---

## Key invariants (never break these)

1. `formatMap.length === segments.length` always — enforced by `extractSegments`
2. `translated.length === formatMap.length` — `assertCountMatch` throws if violated
3. `fingerprint(fullText) === fmt.fingerprint` — throws `"misalignment"` if docx mutated between extract and apply
4. S3 `reviewPrompt` must NOT include glossary — only `rules` — to stay independent of S1
5. `translateDocxBuffer` must never throw on rebuild failure — catch → return original buffer

---

## FormatMap

```typescript
interface FormatMap {
  kind: 'uniform' | 'mixed';
  fingerprint: string;          // `${text.length}:${text.slice(0,32)}`
  paragraphStyle?: string;
  runs?: { chars: number; rPrXml: string }[];  // mixed only
}
```

Uniform paragraph = all runs have identical `rPrXml` → translated text goes in first run, rest zeroed.
Mixed paragraph = proportional word distribution via `distributeRuns()`.

---

## CoreProvider interface

```typescript
interface CoreProvider {
  complete(prompt: string): Promise<string>;
  translateWithBrief(
    segments: string[],
    targetLang: string,
    readingNotes: string,
    onProgress?: (done: number, total: number) => void,
    opts?: { glossary?: string; rules?: string },
  ): Promise<string[]>;
}
```

Providers are implemented by consumers (docshift, dich-web) — NOT in this package.

---

## Docx XML parts covered

```
word/document.xml       (body)
word/header*.xml        (headers)
word/footer*.xml        (footers)
word/footnotes.xml
word/endnotes.xml
```

Regex: `/^word\/(document|header\d*|footer\d*|footnotes|endnotes).*\.xml$/`

---

## Glossary + Rules injection

- **Glossary**: comma-separated `source=target` pairs. Injected into S1 primer and S2 per-chunk prompt.
- **Rules**: free-text. Injected into S2 per-chunk and S3 review. NOT into S1 primer.
- Both are optional. Empty string → no injection (no empty blocks in prompt).

---

## Test conventions

- One test file per source module (e.g. `docx.extractSegments.test.ts`)
- Use `JSZip` to build minimal `.docx` fixtures inline — no binary fixtures committed
- Mock `CoreProvider` with `vi.fn()` — never make real LLM calls in tests
- Every public function must have at least: happy path, empty/edge, error/throw case

---

## What Jules should NOT do

- Do not add Tauri, React, Next.js, or any UI framework
- Do not use `process.spawn`, `child_process`, or any CLI execution
- Do not add a database, auth layer, or session management
- Do not create a web server or HTTP listener
- Do not change `src/index.ts` exports without updating all downstream types
- Do not bump major versions of dependencies (patch/minor only)
- Do not commit `.env` files or any secrets
- Do not commit `node_modules/`, `dist/`, or any build artifacts — they are in `.gitignore`

---

## Lessons learned (updated 2026-05-14)

**node_modules in git patch (fixed):** First scaffold attempt failed because `.gitignore` was missing. Jules ran `npm install` then included all of `node_modules/` in the changeset (~530MB). Always check `.gitignore` exists before `npm install`. The fix has been applied — `.gitignore` is now in the repo root.

**Monorepo layout:** Source lives in `packages/core/` not repo root. Maintain this structure for all future issues.

**PR review process:** After Jules opens a PR, Codex runs an adversarial review. Jules should read PR comments carefully — they contain findings from the review that may require fixes before merge.
