import { vi, type Mock } from 'vitest';

export function installFakeCanvas(opts: {
  width: number;
  height: number;
  decodeFails?: boolean;
  toBlobNull?: boolean;
}): { drawImage: Mock; toBlobCalls: { type: string; quality: number; canvasWidth: number; canvasHeight: number }[] } {
  const drawImage: Mock = vi.fn();
  const toBlobCalls: { type: string; quality: number; canvasWidth: number; canvasHeight: number }[] = [];

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = opts.width;
    naturalHeight = opts.height;
    set src(_: string) {
      setTimeout(() => (opts.decodeFails ? this.onerror?.() : this.onload?.()), 0);
    }
  }
  vi.stubGlobal('Image', FakeImage);

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    toBlobCalls.push({ type: type ?? '', quality: quality ?? 0, canvasWidth: this.width, canvasHeight: this.height });
    cb(opts.toBlobNull ? null : new Blob(['x'], { type }));
  });

  return { drawImage, toBlobCalls };
}
