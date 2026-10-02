import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoScreen } from './PhotoScreen';

describe('PhotoScreen', () => {
  it('FE-02 children을 렌더링한다', () => {
    render(<PhotoScreen><p>내용</p></PhotoScreen>);
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('FE-02 wordmark이면 "DROP"과 태그라인을 표시', () => {
    render(<PhotoScreen wordmark><p>내용</p></PhotoScreen>);
    expect(screen.getByText('DROP')).toBeTruthy();
    expect(screen.getByText('그 자리에 묻어 둔 기억')).toBeTruthy();
  });

  it('FE-02 wordmark가 없으면 워드마크를 표시하지 않는다', () => {
    render(<PhotoScreen><p>내용</p></PhotoScreen>);
    expect(screen.queryByText('DROP')).toBeNull();
    expect(screen.queryByText('그 자리에 묻어 둔 기억')).toBeNull();
  });

  it('FE-02 blurred 분기도 children을 그대로 렌더링한다', () => {
    render(<PhotoScreen blurred><p>흐린 배경</p></PhotoScreen>);
    expect(screen.getByText('흐린 배경')).toBeTruthy();
  });
});
