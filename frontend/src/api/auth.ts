import { useMutation, useQuery } from '@tanstack/react-query';
import { useSession, type User } from '../stores/session';
import { api, handleUnauthorized, type ApiError } from './client';

interface Consents {
  agree_terms: true;
  agree_location: true;
  agree_age: true;
}

export function useSignup() {
  return useMutation<User, ApiError, { email: string; password: string } & Consents>({
    mutationFn: (body) => api<User>('/api/auth/signup', { method: 'POST', body }),
  });
}

export function useLogin() {
  return useMutation<User, ApiError, { email: string; password: string }>({
    mutationFn: (body) => api<User>('/api/auth/login', { method: 'POST', body }),
  });
}

// 실패하면 로그인 상태 유지(쿠키를 JS가 지울 수 없음)
export function useLogout() {
  return useMutation<void, ApiError, void>({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: handleUnauthorized,
  });
}

// 성공 시 queryFn 안에서 로그인 상태를 세팅한다(부팅 때 W-01이 깜빡이지 않도록 effect 미사용)
export function useMe() {
  return useQuery<User, ApiError>({
    queryKey: ['me'],
    queryFn: async () => {
      const user = await api<User>('/api/me');
      useSession.getState().setLoggedIn(user);
      return user;
    },
    staleTime: Infinity,
    retry: false,
  });
}
