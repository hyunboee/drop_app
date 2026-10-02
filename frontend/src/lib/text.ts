// 서버 M-11과 같은 기준(코드포인트)으로 센다
export function codePointLength(s: string): number {
  return [...s].length;
}

export function clampToCodePoints(s: string, max: number): string {
  return [...s].slice(0, max).join('');
}

export function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일까지 보여요`;
}
