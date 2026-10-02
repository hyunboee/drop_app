import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { M_02_NEARBY_MIN_INTERVAL_MS } from '../params';
import { useArStore, type GeoPosition } from '../stores/ar';
import { api, type ApiError } from './client';

export interface NearbyCapsule {
  id: string;
  title: string;
  lat: number;
  lng: number;
  thumb_url: string;
  is_mine: boolean;
}

export const nearbyKey = ['nearby'] as const;

// 키는 고정, 좌표는 호출 시점의 최신 위치를 읽는다. 위치가 바뀔 때 M-02가 지났을 때만 다시 조회한다
export function useNearbyCapsules(position: GeoPosition | null) {
  const query = useQuery<NearbyCapsule[], ApiError>({
    queryKey: nearbyKey,
    queryFn: async () => {
      const p = useArStore.getState().position;
      const res = await api<{ capsules: NearbyCapsule[] }>(`/api/capsules/nearby?lat=${p?.lat}&lng=${p?.lng}`);
      return res.capsules;
    },
    enabled: position !== null,
    staleTime: Infinity,
  });

  const { dataUpdatedAt, errorUpdatedAt, isFetching, refetch } = query;
  useEffect(() => {
    const last = Math.max(dataUpdatedAt, errorUpdatedAt);
    if (last !== 0 && !isFetching && Date.now() - last >= M_02_NEARBY_MIN_INTERVAL_MS) {
      void refetch({ cancelRefetch: false });
    }
    // 위치가 바뀔 때만 판단한다(조회 완료·실패로 다시 돌지 않게)
  }, [position]);

  return {
    capsules: query.data ?? [],
    isFetching,
    isFirstLoad: !query.isSuccess && isFetching,
    error: query.error,
  };
}

// M-02를 무시하고 즉시 재조회
export function useRefreshNearby() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: nearbyKey });
}

export function useCreateCapsule() {
  const client = useQueryClient();
  return useMutation<
    { id: string; expires_at: string },
    ApiError,
    { media_id: string; title: string; lat: number; lng: number; accuracy: number; heading: number; user_lat: number; user_lng: number }
  >({
    mutationFn: (body) => api('/api/capsules', { method: 'POST', body: { ...body, grade: 'BRONZE' } }),
    onSuccess: () => client.invalidateQueries({ queryKey: nearbyKey }),
  });
}

export function useOpenCapsule() {
  const client = useQueryClient();
  return useMutation<{ media_url: string }, ApiError, { id: string; lat: number; lng: number; accuracy: number }>({
    mutationFn: ({ id, ...body }) => api(`/api/capsules/${id}/open`, { method: 'POST', body }),
    onError: (error) => {
      if (error.code === 'CAPSULE_NOT_FOUND') void client.invalidateQueries({ queryKey: nearbyKey });
    },
  });
}

export function useDeleteCapsule() {
  const client = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => api(`/api/capsules/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: nearbyKey }),
  });
}
