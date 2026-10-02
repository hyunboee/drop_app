import { describe, it, expect } from 'vitest';
import { clampToCodePoints, codePointLength, formatExpiry } from './text';

describe('text', () => {
  it('FE-09 FR-07 codePointLength는 코드포인트 기준(서버 M-11과 같음)', () => {
    expect(codePointLength('')).toBe(0);
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('👍a')).toBe(2);
    expect('👍a'.length).toBe(3);
  });

  it('FE-09 FR-07 clampToCodePoints는 이모지를 깨지 않고 자른다', () => {
    expect(clampToCodePoints('👍👍👍', 2)).toBe('👍👍');
    expect(clampToCodePoints('abcdef', 3)).toBe('abc');
  });

  it('FE-09 FR-07 clampToCodePoints는 한도 이하면 그대로', () => {
    expect(clampToCodePoints('abc', 3)).toBe('abc');
    expect(clampToCodePoints('', 3)).toBe('');
  });

  it('FE-10 FR-07 formatExpiry는 로컬 기준 "M월 D일까지 보여요"', () => {
    expect(formatExpiry(new Date(2026, 10, 30, 12).toISOString())).toBe('11월 30일까지 보여요');
    expect(formatExpiry(new Date(2027, 0, 5, 12).toISOString())).toBe('1월 5일까지 보여요');
  });
});
