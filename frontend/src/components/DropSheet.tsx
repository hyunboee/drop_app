import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { DropStepDone } from './DropStepDone';
import { DropStepPhoto } from './DropStepPhoto';
import { DropStepProgress } from './DropStepProgress';
import { DropStepTitle } from './DropStepTitle';
import type { Anchor } from './FabMenu';

interface Props {
  // 위치·방향을 아직 정하지 않았으면 null. 1단계 "다음"에서 onPlace로 W-13을 연다 (FE-14)
  anchor: Anchor | null;
  // W-13 동안은 시트를 그리지 않지만 사진·제목 상태는 유지한다
  hidden?: boolean;
  onPlace?(file: File): void;
  onClose(): void;
}

export function DropSheet({ anchor, hidden = false, onPlace, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<{ id: string; expires_at: string } | null>(null);

  const next = () => {
    setStep(2);
    if (!anchor && file) onPlace?.(file);
  };

  if (hidden) return null;
  return (
    // 업로드·검열 중(3단계)에는 닫기를 막는다
    <BottomSheet step={step} onClose={step === 3 ? undefined : onClose}>
      {step === 1 && <DropStepPhoto file={file} onFile={setFile} onNext={next} />}
      {step === 2 && file && (
        <DropStepTitle file={file} title={title} onTitle={setTitle} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && file && anchor && (
        <DropStepProgress
          file={file}
          title={title}
          anchor={anchor}
          onClose={onClose}
          onReselect={() => {
            setFile(null);
            setStep(1);
          }}
          onDone={(r) => {
            setResult(r);
            setStep(4);
          }}
        />
      )}
      {step === 4 && result && <DropStepDone title={title} expiresAt={result.expires_at} onConfirm={onClose} />}
    </BottomSheet>
  );
}
