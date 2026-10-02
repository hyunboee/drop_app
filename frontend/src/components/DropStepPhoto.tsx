import { useEffect, useState } from 'react';
import { checkFile } from '../lib/image';
import { Button } from './Button';
import styles from './DropSheet.module.css';

interface Props {
  file: File | null;
  onFile(file: File | null): void;
  onNext(): void;
}

export function DropStepPhoto({ file, onFile, onNext }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const check = checkFile(f);
    if (check.ok) {
      setError(null);
      onFile(f);
    } else {
      setError(check.reason);
      onFile(null);
    }
  };

  return (
    <div>
      <p className={styles.title}>사진을 선택하세요</p>
      <label className={styles.drop}>
        {preview ? <img className={styles.preview} src={preview} alt="선택한 사진" /> : <span>탭하여 사진 선택</span>}
        <input
          className={styles.file}
          type="file"
          accept="image/*"
          aria-label="사진 선택"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <Button disabled={!file} onClick={onNext}>다음</Button>
    </div>
  );
}
