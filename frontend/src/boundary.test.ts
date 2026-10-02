// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// import.meta.glob(?raw)는 커버리지 리포트에서 파일을 가리므로 node:fs로 읽는다(계획 0절·1.6)
const SRC = new URL('./', import.meta.url);

interface SrcFile {
  path: string; // src 기준 상대 경로 (예: lib/geo.ts)
  text: string;
}

function walk(dir: URL, prefix: string): SrcFile[] {
  let names: string[];
  try {
    names = readdirSync(dir) as string[];
  } catch {
    return []; // 폴더가 아직 없으면 검사할 파일 없음
  }
  const out: SrcFile[] = [];
  for (const name of names) {
    if (name.includes('.')) {
      out.push({ path: prefix + name, text: readFileSync(new URL(name, dir), 'utf8') as string });
    } else {
      out.push(...walk(new URL(name + '/', dir), prefix + name + '/'));
    }
  }
  return out;
}

const all = walk(SRC, '');
const isTest = (f: SrcFile) => /\.test\.tsx?$/.test(f.path) || f.path.startsWith('test/');
const product = all.filter((f) => !isTest(f));

function offenders(files: SrcFile[], pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(f.text)).map((f) => f.path);
}

describe('경계 규칙(소스 검사)', () => {
  it('FE-01 소스 파일을 실제로 읽었다(검사가 공회전하지 않음)', () => {
    expect(product.length).toBeGreaterThan(5);
    expect(product.some((f) => f.path === 'main.tsx')).toBe(true);
  });

  it('FE-01 aframe·@ar-js-org를 import하는 파일은 src/ar/ 안에만 있다', () => {
    const outside = product.filter((f) => !f.path.startsWith('ar/'));
    expect(offenders(outside, /from\s+['"](aframe|@ar-js-org)/)).toEqual([]);
    expect(offenders(outside, /import\s+['"](aframe|@ar-js-org)/)).toEqual([]);
  });

  it('FE-01 src/ar/**에 api import·거리/열람/프레임 계산이 없다', () => {
    const ar = product.filter((f) => f.path.startsWith('ar/'));
    expect(offenders(ar, /from\s+['"]\.\.\/api/)).toEqual([]);
    expect(offenders(ar, /distanceM|judgeOpen|frameState/)).toEqual([]);
  });

  it('FE-01 src/lib/**에 react·fetch·api·stores 의존이 없다', () => {
    const lib = product.filter((f) => f.path.startsWith('lib/'));
    expect(offenders(lib, /from\s+['"]react/)).toEqual([]);
    expect(offenders(lib, /fetch\(/)).toEqual([]);
    expect(offenders(lib, /from\s+['"]\.\.\/api/)).toEqual([]);
    expect(offenders(lib, /from\s+['"]\.\.\/stores/)).toEqual([]);
  });

  it('FE-01 console.·localStorage·sessionStorage는 lib/log.ts 밖에서 쓰지 않는다', () => {
    const others = product.filter((f) => f.path !== 'lib/log.ts');
    expect(offenders(others, /\bconsole\./)).toEqual([]);
    expect(offenders(others, /\blocalStorage\b/)).toEqual([]);
    expect(offenders(others, /\bsessionStorage\b/)).toEqual([]);
  });

  it('FE-01 #-리터럴 색상과 rgba(는 styles/tokens.css 밖에 없다(CSS 포함)', () => {
    const others = product.filter((f) => f.path !== 'styles/tokens.css');
    expect(offenders(others, /#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
    expect(offenders(others, /rgba\(/)).toEqual([]);
  });
  it('FE-07 vite.config.ts coverage.exclude에 src/ar/**가 있고, 제품 코드 제외는 이것뿐', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8') as string;
    const block = /exclude:\s*\[([^\]]*)\]/.exec(config);
    expect(block).not.toBeNull();
    const items = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(items).toContain('src/ar/**');
    const productExcludes = items.filter((i) => !i.startsWith('src/test/') && !i.includes('.test.') && !i.endsWith('.d.ts'));
    expect(productExcludes).toEqual(['src/ar/**']);
  });

  it('FE-07 ArScene은 ArScreen에서만 React.lazy로 불러오고 screens/는 타입만 정적 import한다', () => {
    const arScreen = product.find((f) => f.path === 'screens/ArScreen.tsx')!;
    expect(arScreen.text).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\.\/ar\/ArScene['"]\s*\)\s*\)/);
    const screens = product.filter((f) => f.path.startsWith('screens/'));
    // import type 이외의 정적 import 금지
    expect(offenders(screens, /^import\s+(?!type)[^;]*from\s+['"]\.\.\/ar\//m)).toEqual([]);
  });
});
