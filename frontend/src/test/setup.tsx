import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { restoreBrowserMocks } from './browser';

// A-Frame 실물은 어떤 테스트에서도 로드하지 않는다
vi.mock('../ar/ArScene', async () => ({ default: (await import('./arSceneStub')).ArSceneStub }));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  restoreBrowserMocks();
});
