import { mock } from 'node:test';
import { Readable } from 'node:stream';

const UPLOAD_HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };

export function createFakeStorage(overrides = {}) {
  const defaults = {
    createUploadUrl: async (key) => ({
      url: `https://fake-s3.test/${key}?X-Amz-Signature=fake`,
      headers: { ...UPLOAD_HEADERS },
    }),
    headObject: async () => ({ contentLength: 1000, contentType: 'image/jpeg' }),
    getObjectStream: (key) => Readable.from([Buffer.from(`body:${key}`)]),
    removePendingTag: async () => undefined,
    deleteObjects: async () => undefined,
  };
  return Object.fromEntries(
    Object.entries(defaults).map(([name, impl]) => [name, mock.fn(overrides[name] ?? impl)]),
  );
}

export function createFakeModeration(moderateImpl) {
  return { moderate: mock.fn(moderateImpl ?? (async () => ({ rejected: false, labels: [] }))) };
}
