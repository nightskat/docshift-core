import { describe, it, expect } from 'vitest';
import { primerPrompt, reviewPrompt } from '../src/pipeline/prompts';

describe('primerPrompt', () => {
  it('includes glossary block when glossary provided', () => {
    const prompt = primerPrompt('Some text', 'tổng hợp=combined, hợp nhất=consolidated');
    expect(prompt).toContain('MANDATORY GLOSSARY');
    expect(prompt).toContain('"tổng hợp" → "combined"');
  });

  it('omits glossary block when glossary is empty string', () => {
    expect(primerPrompt('Some text', '')).not.toContain('MANDATORY GLOSSARY');
  });

  it('omits glossary block when glossary is undefined', () => {
    expect(primerPrompt('Some text')).not.toContain('MANDATORY GLOSSARY');
  });
});

describe('reviewPrompt', () => {
  it('includes rules block when rules provided', () => {
    const prompt = reviewPrompt(['src'], ['trans'], 'English', 'Keep numbers exact.');
    expect(prompt).toContain('MANDATORY RULES');
    expect(prompt).toContain('Keep numbers exact.');
  });

  it('does NOT include glossary (S3 must stay independent of S1)', () => {
    expect(reviewPrompt(['src'], ['trans'], 'English')).not.toContain('MANDATORY GLOSSARY');
  });

  it('numbers source and translation lines correctly', () => {
    const prompt = reviewPrompt(['Hello', 'World'], ['Xin chào', 'Thế giới'], 'Vietnamese');
    expect(prompt).toContain('[1] Hello');
    expect(prompt).toContain('[2] World');
    expect(prompt).toContain('[1] Xin chào');
  });
});

import { parseNumberedLines } from '../src/pipeline/parseNumberedLines';

describe('parseNumberedLines', () => {
  it('returns lines in numeric order even if LLM reorders them', () => {
    const raw = '[2] Second\n[1] First\n[3] Third';
    expect(parseNumberedLines(raw, ['a', 'b', 'c'])).toEqual(['First', 'Second', 'Third']);
  });

  it('falls back when count mismatches', () => {
    const fallback = ['a', 'b'];
    expect(parseNumberedLines('[1] only one', fallback)).toEqual(fallback);
  });
});
