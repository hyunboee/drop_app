import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import { AppError } from '../errors.js';

const DOCS = ['terms', 'privacy', 'location'];

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 약관·개인정보 처리방침·위치정보 이용약관. 로그인 전(가입 화면)에도 보여야 해서 세션 없이 연다.
// 앱은 JSON(/api/legal/:doc)으로, 구글 로그인 동의 화면 등은 웹 페이지(/legal/:doc)로 연결한다. 원문은 backend/legal/*.md
export function createLegalRouters({ legalDir }) {
  const load = async (doc) => {
    if (!DOCS.includes(doc)) throw new AppError('CAPSULE_NOT_FOUND');
    const text = await readFile(join(legalDir, `${doc}.md`), 'utf8');
    const [title, ...rest] = text.split('\n');
    return { title: title.trim(), body: rest.join('\n').trim() };
  };

  const api = Router();
  api.get('/:doc', async (req, res) => {
    res.json(await load(req.params.doc));
  });

  const web = Router();
  web.get('/:doc', async (req, res) => {
    const { title, body } = await load(req.params.doc);
    res.type('html').send(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${escapeHtml(title)}</title><style>body{max-width:720px;margin:0 auto;padding:24px 16px;font:15px/1.7 -apple-system,'Noto Sans KR','Malgun Gothic',sans-serif;color:#222}` +
        `h1{font-size:22px}.t{white-space:pre-wrap}</style></head><body><h1>${escapeHtml(title)}</h1><div class="t">${escapeHtml(body)}</div></body></html>`,
    );
  });

  return { api, web };
}
