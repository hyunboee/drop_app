import { vi } from 'vitest';

export interface MockReply {
  status?: number;
  json?: unknown;
  text?: string;
  networkError?: true;
  delayMs?: number;
}
export interface MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials?: string;
}
export interface MockRoute {
  method: string;
  url: string | RegExp;
  reply: MockReply | MockReply[] | ((req: MockRequest) => MockReply | Promise<MockReply>);
}

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 맞지 않아요',
  ACCOUNT_LOCKED: '로그인 시도가 많아 잠시 후 다시 시도해 주세요',
  EMAIL_TAKEN: '이미 가입된 이메일이에요',
  VALIDATION_FAILED: '입력값을 확인해 주세요',
  LOW_ACCURACY: '위치 정확도가 낮아요. 잠시 후 다시 시도해 주세요',
  DROP_TOO_FAR: '내 위치에서 10m 안에만 놓을 수 있어요. 위치를 다시 정해 주세요',
  MODERATION_REJECTED: '올릴 수 없는 사진이에요',
  MODERATION_UNAVAILABLE: '사진 검사를 할 수 없어요. 다시 시도해 주세요',
  MEDIA_ALREADY_USED: '이미 사용된 미디어예요',
  NOT_OWNER: '내 캡슐만 삭제할 수 있어요',
  CAPSULE_NOT_FOUND: '더 이상 볼 수 없는 캡슐이에요',
  INTERNAL_ERROR: '잠시 후 다시 시도해 주세요',
};

export function apiError(code: string, status: number, extra: Record<string, unknown> = {}): MockReply {
  return { status, json: { error: { code, message: MESSAGES[code] ?? code, ...extra } } };
}

const matches = (pattern: string | RegExp, url: string) =>
  typeof pattern === 'string' ? pattern === url : pattern.test(url);

export function mockFetch(routes: MockRoute[]) {
  const calls: MockRequest[] = [];
  const used = new Map<MockRoute, number>();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      let body: unknown = init.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          /* 문자열 그대로 */
        }
      }
      const req: MockRequest = {
        url,
        method,
        headers: (init.headers ?? {}) as Record<string, string>,
        body,
        credentials: init.credentials,
      };
      calls.push(req);

      const route = routes.find((r) => r.method.toUpperCase() === method && matches(r.url, url));
      if (!route) throw new Error(`mockFetch: 매칭되는 라우트 없음 ${method} ${url}`);

      let reply: MockReply;
      if (typeof route.reply === 'function') reply = await route.reply(req);
      else if (Array.isArray(route.reply)) {
        const i = used.get(route) ?? 0;
        used.set(route, i + 1);
        reply = route.reply[Math.min(i, route.reply.length - 1)];
      } else reply = route.reply;

      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      if (reply.networkError) throw new TypeError('Failed to fetch');

      const status = reply.status ?? 200;
      if (status === 204) return new Response(null, { status });
      const text = reply.json !== undefined ? JSON.stringify(reply.json) : (reply.text ?? '');
      return new Response(text, { status });
    }),
  );

  return {
    calls,
    callsTo: (method: string, url: string | RegExp) =>
      calls.filter((c) => c.method === method.toUpperCase() && matches(url, c.url)),
  };
}
