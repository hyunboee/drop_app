import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DropSheet } from './DropSheet';
import { M_06_PHOTO_MAX_BYTES } from '../params';
import { log } from '../lib/log';
import { mockFetch } from '../test/mockFetch';
import { installFakeCanvas } from '../test/canvas';
import { renderWithProviders, resetStores } from '../test/render';

const ANCHOR = { lat: 37.5, lng: 127.1, accuracy: 8, heading: 90, user_lat: 37.50003, user_lng: 127.1 };
const HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };
const EXPIRES = new Date(2026, 10, 30, 12).toISOString();

function flowRoutes(capsulesStatus = 201) {
  return [
    {
      method: 'POST',
      url: '/api/uploads',
      reply: {
        json: {
          media_id: 'm1',
          original: { url: 'https://s3.example/o', headers: HEADERS },
          thumb: { url: 'https://s3.example/t', headers: HEADERS },
        },
      },
    },
    { method: 'PUT', url: /^https:\/\/s3\.example\/[ot]$/, reply: { status: 200 } },
    { method: 'POST', url: '/api/capsules', reply: { status: capsulesStatus, json: { id: 'c9', expires_at: EXPIRES } } },
  ];
}

const jpeg = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const sized = (size: number, type = 'image/jpeg') => {
  const file = new File(['x'], 'big.jpg', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};
const pick = (file: File) => fireEvent.change(screen.getByLabelText('사진 선택'), { target: { files: [file] } });
const next = () => screen.getByRole('button', { name: '다음' }) as HTMLButtonElement;
const dropBtn = () => screen.getByRole('button', { name: '드롭하기' }) as HTMLButtonElement;
const typeTitle = (value: string) => fireEvent.change(screen.getByLabelText('제목'), { target: { value } });

function setup() {
  const onClose = vi.fn();
  const view = renderWithProviders(<DropSheet anchor={ANCHOR} onClose={onClose} />);
  return { onClose, ...view };
}

function toStep2() {
  pick(jpeg());
  fireEvent.click(next());
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
  installFakeCanvas({ width: 4000, height: 3000 });
});

describe('DropSheet 1단계 사진 선택 (W-07)', () => {
  it('FE-09 초기: "1/4", 안내 문구, 영역 문구, 다음 비활성', () => {
    setup();
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByText('사진을 선택하세요')).toBeTruthy();
    expect(screen.getByText('탭하여 사진 선택')).toBeTruthy();
    expect(next().disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('FE-09 FR-04 text/plain 선택 → 안내 문구, 다음 비활성, 미리보기 없음', () => {
    setup();
    pick(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert').textContent).toBe('사진 파일만 올릴 수 있어요');
    expect(next().disabled).toBe(true);
    expect(screen.queryByAltText('선택한 사진')).toBeNull();
  });

  it('FE-09 FR-04 M-06 초과(+1) → 10MB 안내, 다음 비활성', () => {
    setup();
    pick(sized(M_06_PHOTO_MAX_BYTES + 1));
    expect(screen.getByRole('alert').textContent).toBe('사진은 10MB 이하만 올릴 수 있어요');
    expect(next().disabled).toBe(true);
  });

  it('FE-09 FR-04 경계: 정확히 M-06은 통과', () => {
    setup();
    pick(sized(M_06_PHOTO_MAX_BYTES));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(next().disabled).toBe(false);
  });

  it('FE-09 FR-04 선택 후 미리보기·다음 활성, 클릭 시 "2/4"', () => {
    setup();
    expect(next().disabled).toBe(true);
    pick(jpeg());
    expect(screen.getByAltText('선택한 사진').getAttribute('src')).toBe('blob:mock');
    expect(next().disabled).toBe(false);
    fireEvent.click(next());
    expect(screen.getByText('2/4')).toBeTruthy();
  });

  it('FE-09 FR-04 새 파일을 고르면 이전 오류가 사라지고, 오류 파일을 다시 고르면 미리보기가 사라진다', () => {
    setup();
    pick(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    pick(jpeg());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByAltText('선택한 사진')).toBeTruthy();
    pick(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(screen.queryByAltText('선택한 사진')).toBeNull();
    expect(next().disabled).toBe(true);
  });

  it('FE-09 파일을 고르지 않은 change(취소)는 상태를 바꾸지 않는다', () => {
    setup();
    fireEvent.change(screen.getByLabelText('사진 선택'), { target: { files: [] } });
    expect(next().disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('FE-09 언마운트 시 미리보기 objectURL을 revoke', () => {
    const { unmount } = setup();
    pick(jpeg());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('FE-09 "시트 닫기"가 onClose, 등급·열람가·공개 범위 입력 없음', () => {
    const { onClose } = setup();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DropSheet 2단계 제목 (W-08)', () => {
  it('FE-09 FR-07 제목 0자면 드롭하기 비활성, 카운터 "0/40", 썸네일 표시', () => {
    setup();
    toStep2();
    expect(screen.getByText('0/40')).toBeTruthy();
    expect(dropBtn().disabled).toBe(true);
    expect(screen.getByAltText('선택한 사진')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('FE-09 FR-07 제목 1자면 드롭하기 활성, 카운터 갱신', () => {
    setup();
    toStep2();
    typeTitle('가');
    expect(dropBtn().disabled).toBe(false);
    expect(screen.getByText('1/40')).toBeTruthy();
    typeTitle('');
    expect(dropBtn().disabled).toBe(true);
  });

  it('FE-09 FR-07 공백 한 글자도 1자로 센다(서버 규칙과 동일, trim 안 함)', () => {
    setup();
    toStep2();
    typeTitle(' ');
    expect(dropBtn().disabled).toBe(false);
  });

  it('FE-09 FR-07 M-11: 41번째 글자 입력은 잘려 "40/40"', () => {
    setup();
    toStep2();
    typeTitle('a'.repeat(45));
    expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('a'.repeat(40));
    expect(screen.getByText('40/40')).toBeTruthy();
  });

  it('FE-09 FR-07 M-11은 코드포인트 기준: 이모지 41개 입력은 40개로 잘리고 깨지지 않는다', () => {
    setup();
    toStep2();
    typeTitle('😀'.repeat(41));
    const value = (screen.getByLabelText('제목') as HTMLInputElement).value;
    expect([...value]).toHaveLength(40);
    expect(value).toBe('😀'.repeat(40));
    expect(screen.getByText('40/40')).toBeTruthy();
  });

  it('FE-09 FR-04 "‹ 이전"은 1단계로 돌아가고 사진을 유지(다음 활성)', () => {
    setup();
    toStep2();
    typeTitle('제목');
    fireEvent.click(screen.getByRole('button', { name: '‹ 이전' }));
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByAltText('선택한 사진')).toBeTruthy();
    expect(next().disabled).toBe(false);
  });

  it('FE-09 2단계 "시트 닫기"가 onClose', () => {
    const { onClose } = setup();
    toStep2();
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DropSheet 3·4단계 (W-09·W-10)', () => {
  it('FE-10 FR-04·FR-06·FR-07 전체 흐름: 3/4에서 닫기 없음 → 4/4 완료 화면(만료일) → 확인이 onClose', async () => {
    const f = mockFetch(flowRoutes());
    const { onClose } = setup();
    toStep2();
    typeTitle('우리 동네');
    fireEvent.click(dropBtn());

    expect(screen.getByText('3/4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '시트 닫기' })).toBeNull();

    expect(await screen.findByText('4/4')).toBeTruthy();
    expect(screen.getByText('캡슐을 남겼어요')).toBeTruthy();
    expect(screen.getByText('우리 동네')).toBeTruthy();
    expect(screen.getByText('11월 30일까지 보여요')).toBeTruthy();
    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/uploads',
      'PUT https://s3.example/o',
      'PUT https://s3.example/t',
      'POST /api/capsules',
    ]);
    expect(f.callsTo('POST', '/api/capsules')[0].body).toEqual({
      media_id: 'm1',
      title: '우리 동네',
      grade: 'BRONZE',
      ...ANCHOR,
    });

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-10 FR-06 /capsules가 200(멱등)이어도 "4/4"', async () => {
    mockFetch(flowRoutes(200));
    setup();
    toStep2();
    typeTitle('제목');
    fireEvent.click(dropBtn());
    expect(await screen.findByText('4/4')).toBeTruthy();
  });

  it('FE-10 4단계에서는 "시트 닫기"가 있어 onClose 가능', async () => {
    mockFetch(flowRoutes());
    const { onClose } = setup();
    toStep2();
    typeTitle('제목');
    fireEvent.click(dropBtn());
    await screen.findByText('4/4');
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-10 FR-04 400/409 "사진 다시 선택" → 1단계, 선택 상태 초기화(다음 비활성)', async () => {
    mockFetch([
      ...flowRoutes().slice(0, 2),
      { method: 'POST', url: '/api/capsules', reply: { status: 409, json: { error: { code: 'MEDIA_ALREADY_USED', message: '이미 사용된 미디어예요' } } } },
    ]);
    setup();
    toStep2();
    typeTitle('제목');
    fireEvent.click(dropBtn());
    await screen.findByText('이미 사용된 미디어예요');
    fireEvent.click(screen.getByRole('button', { name: '사진 다시 선택' }));
    expect(screen.getByText('1/4')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('사진 선택')).toBeTruthy());
  });

  it('FE-10 422 거부 후 "확인"이 onClose', async () => {
    mockFetch([
      ...flowRoutes().slice(0, 2),
      { method: 'POST', url: '/api/capsules', reply: { status: 422, json: { error: { code: 'MODERATION_REJECTED', message: '올릴 수 없는 사진이에요', labels: [] } } } },
    ]);
    const { onClose } = setup();
    toStep2();
    typeTitle('제목');
    fireEvent.click(dropBtn());
    await screen.findByText('올릴 수 없는 사진이에요');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
