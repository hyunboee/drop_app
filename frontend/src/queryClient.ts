import { QueryClient } from '@tanstack/react-query';

// 재시도는 사용자가 누르는 "다시 시도"로만 한다
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
