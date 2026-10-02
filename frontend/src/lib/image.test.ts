import { describe, it, expect } from 'vitest';
import { checkFile, fitSize, encodeJpeg, makeUploadImages, ImageError } from './image';
import {
  JPEG_QUALITY,
  M_06_PHOTO_MAX_BYTES,
  M_07_THUMB_LONG_SIDE_PX,
  M_13_ORIGINAL_LONG_SIDE_PX,
} from '../params';
import { installFakeCanvas } from '../test/canvas';

describe('checkFile', () => {
  it('FE-05 FR-04 text/plain은 거부(reason)', () => {
    expect(checkFile({ type: 'text/plain', size: 100 })).toEqual({
      ok: false,
      reason: '사진 파일만 올릴 수 있어요',
    });
  });

  it('FE-05 FR-04 type이 빈 문자열이어도 거부', () => {
    expect(checkFile({ type: '', size: 100 }).ok).toBe(false);
  });

  it('FE-05 FR-04 size = M-06은 통과', () => {
    expect(checkFile({ type: 'image/jpeg', size: M_06_PHOTO_MAX_BYTES })).toEqual({ ok: true });
  });

  it('FE-05 FR-04 size = M-06 + 1은 거부', () => {
    expect(checkFile({ type: 'image/jpeg', size: M_06_PHOTO_MAX_BYTES + 1 })).toEqual({
      ok: false,
      reason: '사진은 10MB 이하만 올릴 수 있어요',
    });
  });

  it('FE-05 FR-04 image/heic는 통과(디코딩은 나중)', () => {
    expect(checkFile({ type: 'image/heic', size: 1000 })).toEqual({ ok: true });
  });
});

describe('fitSize', () => {
  it('FE-05 4000x3000, 2048 → 2048x1536 (비율 유지)', () => {
    expect(fitSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it('FE-05 1000x800, 2048 → 그대로(확대 없음)', () => {
    expect(fitSize(1000, 800, 2048)).toEqual({ width: 1000, height: 800 });
  });

  it('FE-05 긴 변이 정확히 상한이면 그대로', () => {
    expect(fitSize(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it('FE-05 세로 사진 3000x4000 → 1536x2048', () => {
    expect(fitSize(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('FE-05 정사각 5000x5000 → 2048x2048', () => {
    expect(fitSize(5000, 5000, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  it('FE-05 극단 비율은 짧은 변이 최소 1', () => {
    expect(fitSize(10000, 1, 2048)).toEqual({ width: 2048, height: 1 });
    expect(fitSize(1, 10000, 2048)).toEqual({ width: 1, height: 2048 });
  });
});

describe('makeUploadImages / encodeJpeg', () => {
  it('FE-05 원본(M-13)·썸네일(M-07) 두 번 그린다', async () => {
    const canvas = installFakeCanvas({ width: 4000, height: 3000 });
    await makeUploadImages(new Blob(['x'], { type: 'image/jpeg' }));
    expect(canvas.toBlobCalls).toHaveLength(2);
    expect(canvas.toBlobCalls[0]).toMatchObject({
      canvasWidth: M_13_ORIGINAL_LONG_SIDE_PX,
      canvasHeight: 1536,
    });
    expect(canvas.toBlobCalls[1]).toMatchObject({
      canvasWidth: M_07_THUMB_LONG_SIDE_PX,
      canvasHeight: 240,
    });
    expect(canvas.drawImage).toHaveBeenCalledTimes(2);
  });

  it('FE-05 작은 사진은 원본을 확대하지 않고 썸네일만 줄인다', async () => {
    const canvas = installFakeCanvas({ width: 1000, height: 800 });
    await makeUploadImages(new Blob(['x'], { type: 'image/png' }));
    expect(canvas.toBlobCalls[0]).toMatchObject({ canvasWidth: 1000, canvasHeight: 800 });
    expect(canvas.toBlobCalls[1]).toMatchObject({ canvasWidth: 320, canvasHeight: 256 });
  });

  it('FE-05 결과 Blob과 toBlob 인자가 image/jpeg, 품질 JPEG_QUALITY', async () => {
    const canvas = installFakeCanvas({ width: 4000, height: 3000 });
    const { original, thumb } = await makeUploadImages(new Blob(['x'], { type: 'image/heic' }));
    expect(original.type).toBe('image/jpeg');
    expect(thumb.type).toBe('image/jpeg');
    for (const c of canvas.toBlobCalls) {
      expect(c.type).toBe('image/jpeg');
      expect(c.quality).toBe(JPEG_QUALITY);
    }
  });

  it('FE-05 encodeJpeg는 지정한 긴 변으로 JPEG Blob을 만든다', async () => {
    const canvas = installFakeCanvas({ width: 4000, height: 3000 });
    const blob = await encodeJpeg(new Blob(['x']), 500);
    expect(blob.type).toBe('image/jpeg');
    expect(canvas.toBlobCalls[0]).toMatchObject({ canvasWidth: 500, canvasHeight: 375 });
  });

  it('FE-05 디코딩 실패는 ImageError(decode), objectURL은 revoke됨', async () => {
    installFakeCanvas({ width: 10, height: 10, decodeFails: true });
    const p = makeUploadImages(new Blob(['x']));
    await expect(p).rejects.toBeInstanceOf(ImageError);
    await expect(p).rejects.toMatchObject({ reason: 'decode' });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('FE-05 toBlob이 null이면 ImageError(encode)', async () => {
    installFakeCanvas({ width: 10, height: 10, toBlobNull: true });
    const p = encodeJpeg(new Blob(['x']), 2048);
    await expect(p).rejects.toBeInstanceOf(ImageError);
    await expect(p).rejects.toMatchObject({ reason: 'encode' });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
