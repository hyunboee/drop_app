import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
import { createModeration } from './aws/moderation.js';
import { createStorage } from './aws/storage.js';

const config = loadConfig();
const pool = createPool(config);
const aws = { region: config.awsRegion, bucket: config.s3Bucket };
const storage = createStorage(aws);
const moderation = createModeration(aws);

createApp({ pool, storage, moderation, ipHashSecret: config.ipHashSecret }).listen(config.port);
