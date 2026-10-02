import { JPEG_QUALITY, M_06_PHOTO_MAX_BYTES, M_07_THUMB_LONG_SIDE_PX, M_13_ORIGINAL_LONG_SIDE_PX } from '../params';

export type FileCheck = { ok: true } | { ok: false; reason: string };

export function checkFile(file: { type: string; size: number }): FileCheck {
  if (!file.type.startsWith('image/')) return { ok: false, reason: '사진 파일만 올릴 수 있어요' };
  if (file.size > M_06_PHOTO_MAX_BYTES) return { ok: false, reason: '사진은 10MB 이하만 올릴 수 있어요' };
  return { ok: true };
}

export function fitSize(width: number, height: number, maxLongSide: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongSide) return { width, height };
  const scale = maxLongSide / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class ImageError extends Error {
  readonly reason: 'decode' | 'encode';
  constructor(reason: 'decode' | 'encode') {
    super(reason === 'decode' ? '사진을 읽을 수 없어요' : '사진을 변환할 수 없어요');
    this.name = 'ImageError';
    this.reason = reason;
  }
}

// <img>로 디코딩해야 EXIF 회전이 적용된 채로 재인코딩된다
function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('decode'));
    };
    img.src = url;
  });
}

function toJpeg(img: HTMLImageElement, maxLongSide: number): Promise<Blob> {
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, maxLongSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageError('encode'))), 'image/jpeg', JPEG_QUALITY);
  });
}

export async function encodeJpeg(file: Blob, maxLongSide: number): Promise<Blob> {
  return toJpeg(await decode(file), maxLongSide);
}

export async function makeUploadImages(file: Blob): Promise<{ original: Blob; thumb: Blob }> {
  const img = await decode(file);
  const original = await toJpeg(img, M_13_ORIGINAL_LONG_SIDE_PX);
  const thumb = await toJpeg(img, M_07_THUMB_LONG_SIDE_PX);
  return { original, thumb };
}
