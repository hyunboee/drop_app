import { join } from 'node:path';
import express from 'express';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
import { createModeration } from './aws/moderation.js';
import { createStorage } from './aws/storage.js';
import { createLocalModeration, createLocalStorage, UPLOAD_PATH } from './dev/localMedia.js';

const config = loadConfig();
const pool = createPool(config);
const aws = { region: config.awsRegion, bucket: config.s3Bucket };
// 로컬 개발 전용: DEV_LOCAL_MEDIA=1이면 사진은 backend/.dev-media에 저장하고 검열은 통과시킨다
const local = process.env.DEV_LOCAL_MEDIA === '1';
const storage = local ? createLocalStorage(join(import.meta.dirname, '../.dev-media')) : createStorage(aws);
const moderation = local ? createLocalModeration() : createModeration(aws);

const app = createApp({ pool, storage, moderation, ipHashSecret: config.ipHashSecret });
if (local) express().use(UPLOAD_PATH, storage.router).use(app).listen(config.port);
else app.listen(config.port);
