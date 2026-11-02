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

## Architecture — 2-stage pipeline

```
input .docx
  │
  ├─ extractSegments()  →  { segments: string[], formatMap: FormatMap[] }
  │                         FormatMap held aside — LLM never sees it
  │
  ├─ Primer Stage: primerPrompt()  →  provider.complete()  →  primerTranslations[]
  │     (Translates all segments in a single pass, with glossary)
  │
  ├─ Review Stage: reviewPrompt()  →  provider.complete()  →  finalTranslations[]
  │     (Refines the primer translations, with glossary and rules)
  │
  └─ applyTranslations(formatMap, finalTranslations)  →  output .docx
        Fallback: if throws → return original buffer unchanged
```

---

## Key invariants (never break these)

1. `formatMap.length === segments.length` always — enforced by `extractSegments`
2. `translated.length === formatMap.length` — `assertCountMatch` throws if violated
3. `fingerprint(fullText) === fmt.fingerprint` — throws `"misalignment"` if docx mutated between extract and apply
4. Both Primer and Review stages receive the glossary to ensure consistency.
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

- **Glossary**: comma-separated `source=target` pairs. Injected into both the Primer and Review prompts.
- **Rules**: free-text. Injected into the Review prompt only.
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
