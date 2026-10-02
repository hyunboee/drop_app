import { describe, it, expect, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

vi.mock('./App', async () => {
  const { createElement } = await import('react');
  const App = () => createElement('main', { 'data-app': 'mock' });
  return { App, default: App };
});

describe('main', () => {
  it('FE-01 #root에 App 마운트', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    await waitFor(() => expect(document.querySelector('#root [data-app="mock"]')).not.toBeNull());
  });
});
