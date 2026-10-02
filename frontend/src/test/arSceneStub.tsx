interface StubFrame {
  id: string;
  title: string;
  openable: boolean;
  remainingLabel: string | null;
}

interface StubProps {
  frames: StubFrame[];
  onTap(id: string): void;
  placeAt?: { lat: number; lng: number } | null;
  onPlaceMove?(target: { lat: number; lng: number }): void;
}

// 테스트가 프레임 끌기(onPlaceMove)를 직접 부를 수 있게 마지막 props를 남긴다
export const lastArSceneProps: { current: StubProps | null } = { current: null };

export function ArSceneStub(props: StubProps) {
  lastArSceneProps.current = props;
  const { frames, onTap, placeAt } = props;
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
      {placeAt && <div data-testid="place-frame" data-lat={placeAt.lat} data-lng={placeAt.lng} />}
    </>
  );
}
