import 'react';

// A-Frame 커스텀 요소를 JSX에서 쓰기 위한 선언
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': Record<string, unknown>;
      'a-camera': Record<string, unknown>;
      'a-entity': Record<string, unknown>;
      'a-image': Record<string, unknown>;
      'a-plane': Record<string, unknown>;
      'a-text': Record<string, unknown>;
    }
  }
}
