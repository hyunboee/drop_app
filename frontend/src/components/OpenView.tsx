import { useEffect, useRef } from 'react';
import { useDeleteCapsule, useOpenCapsule, type NearbyCapsule } from '../api/capsules';
import { ApiError, messageOf } from '../api/client';
import { log } from '../lib/log';
import type { GeoPosition } from '../stores/ar';
import { Button } from './Button';
import type { NoticeState } from './Notice';
import styles from './OpenView.module.css';

interface Props {
  capsule: NearbyCapsule;
  position: GeoPosition;
  onClose(): void;
  onNotice(notice: NoticeState): void;
}

function noticeOf(error: unknown): NoticeState {
  if (error instanceof ApiError) {
    if (error.code === 'OUT_OF_RANGE') {
      const m = error.extra.remaining_m;
      return { kind: 'out_of_range', remainingM: typeof m === 'number' ? m : 0 };
    }
    if (error.code === 'LOW_ACCURACY') return { kind: 'open_remeasure' };
    if (error.code === 'CAPSULE_NOT_FOUND') return { kind: 'not_found' };
  }
  return { kind: 'message', text: messageOf(error) };
}

export function OpenView({ capsule, position, onClose, onNotice }: Props) {
  const open = useOpenCapsule();
  const del = useDeleteCapsule();
  const started = useRef(false);

  const fail = (error: unknown) => {
    onNotice(noticeOf(error));
    onClose();
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    open.mutate({ id: capsule.id, lat: position.lat, lng: position.lng, accuracy: position.accuracy }, { onError: fail });
  }, []);

  const remove = () => {
    if (!window.confirm('삭제하면 되돌릴 수 없어요')) return;
    del.mutate({ id: capsule.id }, { onSuccess: onClose, onError: fail });
  };

  return (
    <div className={styles.view}>
      <header className={styles.head}>
        <h2 className={styles.title}>{capsule.title}</h2>
        <button type="button" className={styles.close} aria-label="열람 닫기" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className={styles.body}>
        {!open.data && <p role="status" aria-label="열람 확인 중" className={styles.loading} />}
        {open.data && (
          <img
            className={styles.photo}
            src={open.data.media_url}
            alt={capsule.title}
            onError={() => {
              log.error('open', new Error('image load failed'), { id: capsule.id });
              onNotice({ kind: 'message', text: '사진을 불러오지 못했어요' });
              onClose();
            }}
          />
        )}
      </div>
      {capsule.is_mine && (
        <div className={styles.foot}>
          <Button variant="text" danger loading={del.isPending} onClick={remove}>삭제</Button>
        </div>
      )}
    </div>
  );
}
