import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OpenView } from './OpenView';
import { log } from '../lib/log';
import { mockFetch, apiError, type MockReply } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';
import { nearby, pos } from '../test/samples';

const OPEN = '/api/capsules/c1/open';
const OK: MockReply = { json: { media_url: '/api/media/m1' } };

function setup(over: { is_mine?: boolean; open?: MockReply; extra?: Parameters<typeof mockFetch>[0] } = {}) {
  const f = mockFetch([
    { method: 'POST', url: OPEN, reply: over.open ?? OK },
    ...(over.extra ?? []),
  ]);
  const props = { onClose: vi.fn(), onNotice: vi.fn() };
  const position = pos({ lat: 37.5, lng: 127.1, accuracy: 8 });
  const capsule = nearby({ id: 'c1', title: '우리 동네', is_mine: over.is_mine ?? false });
  const ui = <OpenView capsule={capsule} position={position} {...props} />;
  const view = renderWithProviders(ui);
  return { f, ...props, ...view, ui };
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('OpenView 열람 (FE-11)', () => {
  it('FE-11 FR-10 판정 중에는 로딩(role=status)과 제목을 보이고, 200이면 이미지로 바뀐다', async () => {
    setup({ open: { ...OK, delayMs: 40 } });
    expect(screen.getByRole('status', { name: '열람 확인 중' })).toBeTruthy();
    expect(screen.getByText('우리 동네')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();

    const img = await screen.findByAltText('우리 동네');
    expect(img.getAttribute('src')).toBe('/api/media/m1');
    expect(screen.queryByRole('status', { name: '열람 확인 중' })).toBeNull();
  });

  it('FE-11 FR-10 마운트 시 탭 시점 좌표·accuracy로 /open을 한 번만 호출(리렌더해도)', async () => {
    const { f, rerender, ui } = setup();
    await screen.findByAltText('우리 동네');
    rerender(ui);
    const calls = f.callsTo('POST', OPEN);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ lat: 37.5, lng: 127.1, accuracy: 8 });
  });

  it('FE-11 "열람 닫기"가 onClose', async () => {
    const { onClose } = setup();
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '열람 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-11 이미지 로드 실패 → message 안내 + 닫기 + log.error', async () => {
    const { onNotice, onClose } = setup();
    fireEvent.error(await screen.findByAltText('우리 동네'));
    expect(onNotice).toHaveBeenCalledWith({ kind: 'message', text: '사진을 불러오지 못했어요' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-11 FR-10 403 OUT_OF_RANGE remaining_m=7.24 → out_of_range(7.24) + 닫기', async () => {
    const { onNotice, onClose } = setup({ open: apiError('OUT_OF_RANGE', 403, { remaining_m: 7.24 }) });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: 'out_of_range', remainingM: 7.24 }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('FE-11 403 OUT_OF_RANGE인데 remaining_m이 숫자가 아니면 0', async () => {
    const { onNotice } = setup({ open: apiError('OUT_OF_RANGE', 403, { remaining_m: '7' }) });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: 'out_of_range', remainingM: 0 }));
  });

  it('FE-11 FR-03 422 LOW_ACCURACY → open_remeasure + 닫기', async () => {
    const { onNotice, onClose } = setup({ open: apiError('LOW_ACCURACY', 422) });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: 'open_remeasure' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-11 404 CAPSULE_NOT_FOUND → not_found + 닫기', async () => {
    const { onNotice, onClose } = setup({ open: apiError('CAPSULE_NOT_FOUND', 404) });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: 'not_found' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-11 500 → message(서버 문구) + 닫기', async () => {
    const { onNotice, onClose } = setup({ open: apiError('INTERNAL_ERROR', 500) });
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({ kind: 'message', text: '잠시 후 다시 시도해 주세요' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-11 네트워크 오류 → message(네트워크 문구) + 닫기', async () => {
    const { onNotice, onClose } = setup({ open: { networkError: true } });
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({ kind: 'message', text: '네트워크 연결을 확인해 주세요' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('OpenView 삭제 (FE-12)', () => {
  const DELETE = '/api/capsules/c1';

  it('FE-12 FR-11 is_mine:false면 삭제 버튼이 없다', async () => {
    setup({ is_mine: false });
    await screen.findByAltText('우리 동네');
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('FE-12 FR-11 confirm 취소면 DELETE 요청이 없다', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const { f, onClose } = setup({ is_mine: true });
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(confirm).toHaveBeenCalledWith('삭제하면 되돌릴 수 없어요');
    await new Promise((r) => setTimeout(r, 20));
    expect(f.callsTo('DELETE', DELETE)).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('FE-12 FR-11 confirm 확인 → DELETE 후 204면 onClose', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { f, onClose, onNotice } = setup({
      is_mine: true,
      extra: [{ method: 'DELETE', url: DELETE, reply: { status: 204 } }],
    });
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(f.callsTo('DELETE', DELETE)).toHaveLength(1);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('FE-12 FR-11 삭제 404 → not_found + 닫기', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { onClose, onNotice } = setup({
      is_mine: true,
      extra: [{ method: 'DELETE', url: DELETE, reply: apiError('CAPSULE_NOT_FOUND', 404) }],
    });
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: 'not_found' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-12 FR-11 삭제 403 NOT_OWNER → message(서버 문구) + 닫기', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { onClose, onNotice } = setup({
      is_mine: true,
      extra: [{ method: 'DELETE', url: DELETE, reply: apiError('NOT_OWNER', 403) }],
    });
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({ kind: 'message', text: '내 캡슐만 삭제할 수 있어요' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-12 삭제 네트워크 오류 → message + 닫기', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { onClose, onNotice } = setup({
      is_mine: true,
      extra: [{ method: 'DELETE', url: DELETE, reply: { networkError: true } }],
    });
    await screen.findByAltText('우리 동네');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({ kind: 'message', text: '네트워크 연결을 확인해 주세요' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
