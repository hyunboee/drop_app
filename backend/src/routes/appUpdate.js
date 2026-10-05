import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { AppError } from '../errors.js';

const LATEST = 'latest.json';
const APK = 'drop-outdoor.apk';

// 앱 자체 업데이트(밖 앱): 새 설치 파일과 버전 정보를 서버 폴더(updates/)에 두고 앱이 받아 간다.
// 로그인 전에도 확인해야 해서 세션 없이 열려 있다. 올리는 방법은 app/tools/publish_update.py
export function createAppUpdateRouter({ updatesDir }) {
  const router = Router();

  router.get('/latest', async (req, res) => {
    let info;
    try {
      info = JSON.parse(await readFile(join(updatesDir, LATEST), 'utf8'));
    } catch {
      throw new AppError('CAPSULE_NOT_FOUND'); // 올려 둔 버전이 없다
    }
    res.json({ ...info, download_url: '/api/app/download' });
  });

  router.get('/download', async (req, res) => {
    const file = join(updatesDir, APK);
    let size;
    try {
      size = (await stat(file)).size;
    } catch {
      throw new AppError('CAPSULE_NOT_FOUND');
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', size);
    await pipeline(createReadStream(file), res);
  });

  return router;
}
