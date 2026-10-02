import { useEffect, useState } from 'react';
import { clampToCodePoints, codePointLength } from '../lib/text';
import { M_11_TITLE_MAX_LENGTH, M_11_TITLE_MIN_LENGTH } from '../params';
import { Button } from './Button';
import styles from './DropSheet.module.css';
import { UnderlineInput } from './UnderlineInput';

interface Props {
  file: File;
  title: string;
  onTitle(title: string): void;
  onBack(): void;
  onNext(): void;
}

export function DropStepTitle({ file, title, onTitle, onBack, onNext }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const length = codePointLength(title);
  return (
    <div>
      {preview && <img className={styles.thumb} src={preview} alt="선택한 사진" />}
      <UnderlineInput
        label="제목"
        value={title}
        onChange={(v) => onTitle(clampToCodePoints(v, M_11_TITLE_MAX_LENGTH))}
        counter={{ current: length, max: M_11_TITLE_MAX_LENGTH }}
      />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack}>‹ 이전</Button>
        <Button disabled={length < M_11_TITLE_MIN_LENGTH} onClick={onNext}>드롭하기</Button>
      </div>
    </div>
  );
}
