interface StubFrame {
  id: string;
  title: string;
  openable: boolean;
  remainingLabel: string | null;
}

export function ArSceneStub({ frames, onTap }: { frames: StubFrame[]; onTap(id: string): void }) {
  return (
    <>
      {frames.map((f) => (
        <button
          key={f.id}
          type="button"
          data-testid={'frame-' + f.id}
          data-openable={String(f.openable)}
          data-remaining-label={f.remainingLabel ?? ''}
          onClick={() => onTap(f.id)}
        >
          {f.title}
        </button>
      ))}
    </>
  );
}
