import { describe, it, expect, vi } from 'vitest';
import { log } from './log';

function spies() {
  return {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
}

describe('log', () => {
  it('FE-01 DEV에서 debug/info/warn/error가 [scope] 형식으로 console 호출', () => {
    const s = spies();
    const err = new Error('boom');
    log.debug('a', 1);
    log.info('b', 2);
    log.warn('c', 3);
    log.error('d', err, { x: 1 });
    expect(s.debug).toHaveBeenCalledWith('[a]', 1);
    expect(s.info).toHaveBeenCalledWith('[b]', 2);
    expect(s.warn).toHaveBeenCalledWith('[c]', 3);
    expect(s.error).toHaveBeenCalledWith('[d]', err, { x: 1 });
  });

  it("FE-01 vi.stubEnv('DEV', false)에서는 네 함수 모두 console 호출 없음", () => {
    vi.stubEnv('DEV', false);
    const s = spies();
    log.debug('a', 1);
    log.info('b', 2);
    log.warn('c', 3);
    log.error('d', new Error('boom'));
    expect(s.debug).not.toHaveBeenCalled();
    expect(s.info).not.toHaveBeenCalled();
    expect(s.warn).not.toHaveBeenCalled();
    expect(s.error).not.toHaveBeenCalled();
  });

  it('FE-01 DEV 값은 호출 시점에 읽는다(같은 모듈에서 켜고 끄기)', () => {
    const s = spies();
    vi.stubEnv('DEV', false);
    log.warn('x');
    vi.stubEnv('DEV', true);
    log.warn('x');
    expect(s.warn).toHaveBeenCalledTimes(1);
  });
});
