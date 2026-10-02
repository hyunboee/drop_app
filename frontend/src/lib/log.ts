// console을 쓰는 유일한 파일. 호출은 항상, 출력은 개발 환경에서만.
const on = () => import.meta.env.DEV;

export const log = {
  debug(scope: string, ...data: unknown[]): void {
    if (on()) console.debug(`[${scope}]`, ...data);
  },
  info(scope: string, ...data: unknown[]): void {
    if (on()) console.info(`[${scope}]`, ...data);
  },
  warn(scope: string, ...data: unknown[]): void {
    if (on()) console.warn(`[${scope}]`, ...data);
  },
  error(scope: string, error: unknown, ...data: unknown[]): void {
    if (on()) console.error(`[${scope}]`, error, ...data);
  },
};
