import { createApp } from '../../src/app.js';
import { createFakeModeration, createFakeStorage } from './aws.js';

export async function startApp({
  pool,
  storage = createFakeStorage(),
  moderation = createFakeModeration(),
  now = Date.now,
  ipHashSecret = process.env.IP_HASH_SECRET,
} = {}) {
  const app = createApp({ pool, storage, moderation, ipHashSecret, now });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    storage,
    moderation,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

export async function request(url, path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.Cookie = cookie;
  if (typeof body === 'string') {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url + path, init);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const parsed = text === '' ? null : isJson ? JSON.parse(text) : text;
  return { status: res.status, headers: res.headers, body: parsed };
}

export function sidCookie(res) {
  const sid = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  return sid ? sid.split(';')[0] : null;
}
