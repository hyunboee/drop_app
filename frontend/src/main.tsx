import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { queryClient } from './queryClient';

// StrictMode 미사용: watchPosition·업로드 effect의 개발 중 이중 실행 방지
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>,
);
