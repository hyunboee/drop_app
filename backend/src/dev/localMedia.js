// 로컬 개발 전용: AWS 없이 드롭을 테스트하기 위해 S3·Rekognition을 로컬 폴더·무조건 통과로 대신한다.
// DEV_LOCAL_MEDIA=1일 때만 server.js가 사용한다. 실제 S3 업로드·검열 경로는 검증되지 않는다.
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import express, { Router } from 'express';
import { M_06_PHOTO_MAX_BYTES } from '../params.js';

const FILE_RE = /^[0-9a-f-]{36}(\.thumb)?\.jpg$/i;
export const UPLOAD_PATH = '/api/dev-media';

export function createLocalStorage(dir) {
  const path = (key) => join(dir, key);

  // presigned URL 대신 받는 PUT. If-None-Match: * 처럼 이미 있으면 412
  const router = Router();
  router.put(
    '/media/:file',
    express.raw({ type: 'image/jpeg', limit: M_06_PHOTO_MAX_BYTES }),
    async (req, res) => {
      if (!FILE_RE.test(req.params.file) || !Buffer.isBuffer(req.body)) return res.sendStatus(400);
      await mkdir(join(dir, 'media'), { recursive: true });
      try {
        await writeFile(path(`media/${req.params.file}`), req.body, { flag: 'wx' });
      } catch (err) {
        if (err.code === 'EEXIST') return res.sendStatus(412);
        throw err;
      }
      res.sendStatus(200);
    },
  );

  return {
    router,

    async createUploadUrl(key) {
      return { url: `${UPLOAD_PATH}/${key}`, headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' } };
    },

    async headObject(key) {
      try {
        const s = await stat(path(key));
        return { contentLength: s.size, contentType: 'image/jpeg' };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },

    async getObjectStream(key) {
      return createReadStream(path(key));
    },

    async removePendingTag() {},

    async deleteObjects(keys) {
      await Promise.all(keys.map((key) => rm(path(key), { force: true })));
    },
  };
}

export function createLocalModeration() {
  return {
    async moderate() {
      return { rejected: false, labels: [] };
    },
  };
}
