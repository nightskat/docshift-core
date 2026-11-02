import { describe, it, expect } from 'vitest';
import { primerPrompt, reviewPrompt, unescapeLeadingNumbers } from '../src/pipeline/prompts';

describe('pipeline.prompts', () => {
  it('builds primer prompt with glossary', () => {
    expect(primerPrompt(['Hello', 'World'], 'doctor=bác sĩ')).toMatchInlineSnapshot(`
      "Translate each numbered DOCX segment into the target language.
      Preserve meaning, tone, and formatting-sensitive boundaries.
      Return only a numbered list with exactly 2 items.

      Glossary:
      doctor=bác sĩ

      Segments:
      1. Hello
      2. World"
    `);
  });

  it('builds primer prompt without glossary', () => {
    expect(primerPrompt(['One segment'])).toMatchInlineSnapshot(`
      "Translate each numbered DOCX segment into the target language.
      Preserve meaning, tone, and formatting-sensitive boundaries.
      Return only a numbered list with exactly 1 items.

      Segments:
      1. One segment"
    `);
  });

  it('builds review prompt with rules', () => {
    expect(
      reviewPrompt(['Hello'], ['Xin chao'], 'Use formal register.')
    ).toMatchInlineSnapshot(`
      "Review each first-pass DOCX translation against its original segment.
      Correct mistakes, improve fluency, and keep the meaning aligned with the source.
      Return only a numbered list with exactly 1 refined translations.

      Rules:
      Use formal register.

      Output format:
      Output exactly 1 refined translations as a numbered list.
      Do NOT prefix entries with 'Refined:', 'Original:', 'Translation:', or any label.
      Each item is one line: \`N. <refined translation only>\` (continuation lines OK for multi-paragraph segments).

      Segment pairs:
      1. Original: Hello
         First pass: Xin chao"
    `);
  });

  it('builds review prompt without rules', () => {
    expect(reviewPrompt(['A', 'B'], ['X', 'Y'])).toMatchInlineSnapshot(`
      "Review each first-pass DOCX translation against its original segment.
      Correct mistakes, improve fluency, and keep the meaning aligned with the source.
      Return only a numbered list with exactly 2 refined translations.

      Output format:
      Output exactly 2 refined translations as a numbered list.
      Do NOT prefix entries with 'Refined:', 'Original:', 'Translation:', or any label.
      Each item is one line: \`N. <refined translation only>\` (continuation lines OK for multi-paragraph segments).

      Segment pairs:
      1. Original: A
         First pass: X
      2. Original: B
         First pass: Y"
    `);
  });

  it('builds review prompt with glossary (Gemini P1 #10 fix)', () => {
    expect(
      reviewPrompt(['Hello'], ['Xin chao'], undefined, 'doctor=bác sĩ')
    ).toMatchInlineSnapshot(`
      "Review each first-pass DOCX translation against its original segment.
      Correct mistakes, improve fluency, and keep the meaning aligned with the source.
      Return only a numbered list with exactly 1 refined translations.

      Glossary (must be respected):
      doctor=bác sĩ

      Output format:
      Output exactly 1 refined translations as a numbered list.
      Do NOT prefix entries with 'Refined:', 'Original:', 'Translation:', or any label.
      Each item is one line: \`N. <refined translation only>\` (continuation lines OK for multi-paragraph segments).

      Segment pairs:
      1. Original: Hello
         First pass: Xin chao"
    `);
  });

  it('escapes leading numbers in segments (Gemini P1 #3 fix)', () => {
    // Segment starts with "1. ", which would create nested numbering
    const out = primerPrompt(['1. nested item', 'normal text']);
    expect(out).toContain('1. 1\u200b. nested item');
    expect(out).toContain('2. normal text');
  });

  it('preserves multi-line segments with continuation indent', () => {
    const out = primerPrompt(['line A\nline B', 'second segment']);
    expect(out).toContain('1. line A\n   line B');
    expect(out).toContain('2. second segment');
  });

  it('unescapeLeadingNumbers reverses line-leading escape', () => {
    expect(unescapeLeadingNumbers('1\u200b. foo')).toBe('1. foo');
  });

  it('unescapeLeadingNumbers leaves mid-line characters untouched', () => {
    // Only line-leading `N.` escapes are reversed; other content stays.
    expect(unescapeLeadingNumbers('hello 1\u200b. world')).toBe('hello 1\u200b. world');
  });

  it('reviewPrompt instructs the model not to prefix entries with labels', () => {
    const out = reviewPrompt(['Hello'], ['Xin chao']);
    expect(out).toContain('Do NOT prefix entries with');
  });

  it('reviewPrompt indents multi-line Original + First pass (Gemini r3 BLOCKER #1)', () => {
    const out = reviewPrompt(['line A\nline B'], ['xin chào\nthế giới']);
    // Continuation lines must align under the label content, not bleed to col 0
    expect(out).toContain('1. Original: line A\n              line B');
    expect(out).toContain('   First pass: xin chào\n              thế giới');
  });
});
