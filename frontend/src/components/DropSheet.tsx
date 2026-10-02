import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { DropStepDone } from './DropStepDone';
import { DropStepPhoto } from './DropStepPhoto';
import { DropStepProgress } from './DropStepProgress';
import { DropStepTitle } from './DropStepTitle';
import type { Anchor } from './FabMenu';

export function DropSheet({ anchor, onClose }: { anchor: Anchor; onClose(): void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<{ id: string; expires_at: string } | null>(null);

  return (
    // 업로드·검열 중(3단계)에는 닫기를 막는다
    <BottomSheet step={step} onClose={step === 3 ? undefined : onClose}>
      {step === 1 && <DropStepPhoto file={file} onFile={setFile} onNext={() => setStep(2)} />}
      {step === 2 && file && (
        <DropStepTitle file={file} title={title} onTitle={setTitle} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && file && (
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
