import { describe, expect, it } from 'vitest';
import { parseNumberedLines } from '../src/pipeline/parseNumberedLines';

describe('parseNumberedLines', () => {
  it('parses dotted numbering', () => {
    expect(parseNumberedLines('1. foo\n2. bar baz\n3. qux')).toEqual([
      'foo',
      'bar baz',
      'qux',
    ]);
  });

  it('accepts parenthesized numbering and trims trailing whitespace', () => {
    expect(parseNumberedLines('1) alpha   \n2) beta   ')).toEqual(['alpha', 'beta']);
  });

  it('preserves continuation lines including indentation', () => {
    expect(
      parseNumberedLines('1. first line\nsecond line\n  third line\n2. next')
    ).toEqual(['first line\nsecond line\n  third line', 'next']);
  });

  it('ignores unnumbered preamble before the first item', () => {
    expect(
      parseNumberedLines('Preface\n\n1. one\n\nstill one\n2. two')
    ).toEqual(['one\n\nstill one', 'two']);
  });

  it('keeps empty numbered entries when needed for count alignment', () => {
    expect(parseNumberedLines('1.\n2. value')).toEqual(['', 'value']);
  });

  it('folds out-of-sequence "1." inside an existing entry as continuation', () => {
    // LLM emits "1. preamble", then accidentally restarts with "1." again, then "2."
    // Expected: only the first "1." starts entry 1; the inner "1." gets folded.
    // The valid "2." then closes entry 1 and opens entry 2.
    expect(
      parseNumberedLines('1. Here is the translation:\n1. first\n2. second')
    ).toEqual(['Here is the translation:\n1. first', 'second']);
  });

  it('skipped numbers (1, 3) → "3." is folded as continuation, not entry 2', () => {
    expect(
      parseNumberedLines('1. one\n3. surprise\n2. two')
    ).toEqual(['one\n3. surprise', 'two']);
  });

  it('internal "Step 5:" or similar does NOT trigger new entry', () => {
    expect(
      parseNumberedLines('1. Run Step 5: do thing\n  also Step 6: more\n2. next')
    ).toEqual(['Run Step 5: do thing\n  also Step 6: more', 'next']);
  });

  it('preserves legitimate "Translation:" / "Original:" content (Codex round 2 BLOCKER #1)', () => {
    // A previous defense stripped these labels as artifacts, silently
    // corrupting legitimate user text. Removed in v0.1.0.
    expect(
      parseNumberedLines('1. Translation: A New Hope\n2. Original: Star Wars\n3. Refined: a draft')
    ).toEqual([
      'Translation: A New Hope',
      'Original: Star Wars',
      'Refined: a draft',
    ]);
  });

  it('does NOT treat indented "   N." continuation lines as new entries (Gemini r4 BLOCKER)', () => {
    // LLM may emit translations whose continuation lines start with spaces
    // then a number — e.g. "   2. step" inside a numbered list inside one
    // segment. The header must be anchored at col 0 to avoid mis-detection.
    expect(
      parseNumberedLines('1. first\n   2. nested step\n   3. another nested\n2. real second')
    ).toEqual([
      'first\n   2. nested step\n   3. another nested',
      'real second',
    ]);
  });

  it('preserves "Translation:" prefix on continuation lines too', () => {
    expect(
      parseNumberedLines('1. The book is called\n   Translation: A New Hope\n2. End')
    ).toEqual([
      'The book is called\n   Translation: A New Hope',
      'End',
    ]);
  });
});
