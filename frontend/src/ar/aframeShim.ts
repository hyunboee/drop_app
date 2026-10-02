// aframe 1.8.0의 ESM 빌드는 default export만 있어 AR.js의 `import { registerComponent } from 'aframe'`가 실패한다.
// vite.config.ts가 'aframe'를 이 파일로 바꿔 named export를 붙여 준다.
// @ts-expect-error 타입 없는 실제 ESM 빌드(exports 맵 때문에 상대 경로로 지정)
import AFRAME from '../../node_modules/aframe/dist/aframe-master.module.min.js';

export default AFRAME;
export const registerComponent: (name: string, definition: object) => unknown = AFRAME.registerComponent;
