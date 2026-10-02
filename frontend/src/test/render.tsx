import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useArStore } from '../stores/ar';
import { useSession } from '../stores/session';

export function renderWithProviders(ui: ReactElement, options: { client?: QueryClient } = {}) {
  const client =
    options.client ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  const rerender = (next: ReactElement) => result.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>);
  return { ...result, rerender, client };
}

export function resetStores() {
  useSession.setState(useSession.getInitialState(), true);
  useArStore.setState(useArStore.getInitialState(), true);
}
