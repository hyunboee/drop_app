import { useEffect, useRef, useState } from 'react';
import { useCreateCapsule } from '../api/capsules';
import { ApiError, messageOf } from '../api/client';
import { useUploadMedia } from '../api/uploads';
import { ImageError, makeUploadImages } from '../lib/image';
import { log } from '../lib/log';
import { Button } from './Button';
import styles from './DropSheet.module.css';
import type { Anchor } from './FabMenu';

interface Props {
  file: File;
  title: string;
  anchor: Anchor;
  onClose(): void;
  onReselect(): void;
  onDone(result: { id: string; expires_at: string }): void;
}

type Stage = 'prepare' | 'upload' | 'publish';
type Failure = { message: string; action: 'retry' | 'reselect' | 'confirm' };

function failureOf(stage: Stage, error: unknown): Failure {
  if (error instanceof ImageError) return { message: '사진을 읽을 수 없어요. 다른 사진을 선택해 주세요', action: 'reselect' };
  if (stage !== 'publish') return { message: '업로드에 실패했어요', action: 'retry' };
  const message = messageOf(error);
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'MODERATION_REJECTED' || code === 'LOW_ACCURACY' || code === 'DROP_TOO_FAR') return { message, action: 'confirm' };
  if (code === 'VALIDATION_FAILED' || code === 'MEDIA_ALREADY_USED') return { message, action: 'reselect' };
  return { message, action: 'retry' };
}

function Row({ icon, children }: { icon: 'spin' | 'check' | 'error'; children: string }) {
  return (
    <div className={styles.row}>
      <span className={styles[icon]} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function DropStepProgress({ file, title, anchor, onClose, onReselect, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('prepare');
  const [failure, setFailure] = useState<Failure | null>(null);
  const blobs = useRef<{ original: Blob; thumb: Blob } | null>(null);
  const mediaId = useRef<string | null>(null);
  const started = useRef(false);
  const alive = useRef(true);
  const upload = useUploadMedia();
  const create = useCreateCapsule();

  // 재시도는 실패한 단계부터: 인코딩·업로드 결과가 남아 있으면 건너뛴다(게시만 다시 하면 서버가 멱등 처리)
  const run = async () => {
    let current: Stage = 'prepare';
    setFailure(null);
    try {
      if (!blobs.current) blobs.current = await makeUploadImages(file);
      if (!mediaId.current) {
        current = 'upload';
        setStage('upload');
        mediaId.current = await upload.mutateAsync(blobs.current);
      }
      current = 'publish';
      setStage('publish');
      const result = await create.mutateAsync({ media_id: mediaId.current, title, ...anchor });
      if (alive.current) onDone(result);
    } catch (error) {
      log.error('drop', error, { stage: current });
      if (alive.current) setFailure(failureOf(current, error));
    }
  };

  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true;
      void run();
    }
    return () => {
      alive.current = false;
    };
  }, []);

  if (failure) {
    return (
      <div>
        <div role="alert" className={styles.row}>
          <span className={styles.error} aria-hidden="true" />
          <span>{failure.message}</span>
        </div>
        <div className={styles.actions}>
          {failure.action === 'retry' && (
            <>
              <Button variant="secondary" onClick={onClose}>취소</Button>
              <Button onClick={() => void run()}>다시 시도</Button>
            </>
          )}
          {failure.action === 'reselect' && <Button variant="secondary" onClick={onReselect}>사진 다시 선택</Button>}
          {failure.action === 'confirm' && <Button onClick={onClose}>확인</Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Row icon={stage === 'publish' ? 'check' : 'spin'}>사진 업로드 중…</Row>
      {stage === 'publish' && <Row icon="spin">검열 확인 중…</Row>}
    </div>
  );
}
