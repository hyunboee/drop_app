import { useMutation } from '@tanstack/react-query';
import { log } from '../lib/log';
import { api, ApiError } from './client';

export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}
export interface UploadUrls {
  media_id: string;
  original: UploadTarget;
  thumb: UploadTarget;
}

// S3 직접 업로드는 JSON·쿠키가 없고 출처가 달라 api()를 거치지 않는다
async function put(target: UploadTarget, body: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(target.url, { method: 'PUT', headers: target.headers, body });
  } catch (e) {
    log.error('upload', e);
    throw new ApiError('UPLOAD_FAILED', '업로드에 실패했어요', 0);
  }
  if (!res.ok) {
    const error = new ApiError('UPLOAD_FAILED', '업로드에 실패했어요', res.status);
    log.error('upload', error, { status: res.status });
    throw error;
  }
}

export function useUploadMedia() {
  return useMutation<string, ApiError, { original: Blob; thumb: Blob }>({
    mutationFn: async ({ original, thumb }) => {
      const urls = await api<UploadUrls>('/api/uploads', { method: 'POST' });
      await Promise.all([put(urls.original, original), put(urls.thumb, thumb)]);
      return urls.media_id;
    },
  });
}
