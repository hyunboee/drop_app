# Drop 프로젝트 구조 설계 원칙

> 출처: `1-domain-definition.md`(도메인 정의서 v1.1), `2-PRD.md`(PRD v1.2), `3-user-scenario.md`(시나리오 v0.6), `4-wireframes.md`(와이어프레임 v0.7), `8-plan.md`(실행 계획 v0.7), `.claude/skills/develop-backend`·`develop-frontend` SKILL. 수치는 PRM-xx(도메인 정의서 5.3)·M-xx(PRD 4.1) ID로만 참조한다. 스택 밖 최소 도구는 PRD 6장 "빌드·테스트 도구" 행으로 승인된 것만 쓴다. 결정 근거는 7장에 있다.

## 0. 변경 이력

| 버전 | 일자 | 변경자 | 변경내용 |
|---|---|---|---|
| 0.1 | 2026-10-01 | Claude Code | 초안 작성 |
| 0.2 | 2026-10-01 | Claude Code | 확인 필요 21건 결정 반영: 빌드·테스트 도구 확정, 세션 쿠키, EC2+Cloudflare 배포, UUID S3 키와 조건부 쓰기, JPEG 재인코딩, 원본·썸네일 검열(M-14), IP 해시, 7장을 결정 내역으로 변경. 읽기 Presigned URL(M-12)안을 폐기하고 Express 미디어 프록시(`/api/media/:mediaId`, 열람 기록 확인, `private` 캐시)로 대체 |
| 0.3 | 2026-10-01 | Claude Code | 아키텍처·ERD 결정 반영: PostgreSQL은 RDS 단일 인스턴스, 열람 확인 순서 401 → 404 → 422 → 403 확정, 로그인 잠금은 프로세스 메모리 카운터, 증명 ID 컬럼 미보유, 마이그레이션 이력 테이블 `schema_migrations`, 로그인 성공 시 만료 세션 삭제 |
| 0.4 | 2026-10-01 | Claude Code | 문서 정합성 점검: 출처 문서 버전 갱신, 5.2 입력 검증에 heading 범위 추가(ERD 1.3 CHECK와 일치), 6.1 docs 목록에 아키텍처 다이어그램·ERD 추가 |
| 0.5 | 2026-10-01 | Claude Code | 문서 정합성 점검 미정 사항 반영: 에러 코드 `MEDIA_FORBIDDEN` 추가, 열람 확인 순서에 400(입력 검증) 위치 확정 |
| 0.6 | 2026-10-01 | Claude Code | 실행 계획(8-plan.md) 결정 반영: 계획 경로 `8-plan.md`, 개발 의존성 3개 추가, `GET /api/me`·`MEDIA_ALREADY_USED` 추가, 남은 거리 표시 올림, S3 CORS 범위, migrate 트랜잭션 방식, 스타일 가이드 `9-style-guide.md` |
| 0.7 | 2026-10-02 | Claude Code | 드롭 위치 직접 배치(PRD v1.1 FR-03) 반영: 에러 코드 `DROP_TOO_FAR`(422) 추가 |

---

## 1. 최상위 원칙 (모든 스택 공통)

| ID | 원칙 | 근거 |
|---|---|---|
| P-01 | **단순함 우선.** 1인 2일 MVP다. 지금 FR을 만족하는 최소 코드만 쓰고, 한 번만 쓰는 추상화·DI 컨테이너·마이크로서비스·이벤트 버스·캐시 서버(Redis 등)는 만들지 않는다 | PRD 1.2, 8장 |
| P-02 | **후속 단계를 미리 만들지 않는다.** 결제·열람권·지갑·정산·프라이빗·신고·관리자용 빈 디렉토리, 스텁, 테이블, 컬럼(예: `view_price`, `visibility`), 설정 키를 두지 않는다. 필요해질 때 그 FR과 함께 추가한다 | PRD 3.2, FR-12 |
| P-03 | **서버가 진실의 원천이다.** 열람 반경 판정, 검열 상태, 만료 판정, 소유자 확인, 입력 검증은 모두 서버에서 한다. 클라이언트 계산(남은 거리, 파일 사전 검사)은 안내용일 뿐이다 | NFR-08, FR-04, FR-10, PRD 7장 |
| P-04 | **문서 ID 추적성.** 규칙을 구현한 코드·테스트에는 근거 ID(FR·NFR·BR·INV·PRM·M·Q)를 주석이나 테스트 이름에 남긴다. 문서와 코드가 다르면 문서를 먼저 고친 뒤 코드를 바꾼다 | 도메인 정의서 5.3, OQ-24 |
| P-05 | **수치는 한 곳에서.** PRM·M 값은 백엔드·프론트엔드 각각 파라미터 파일 하나에만 상수로 두고 ID를 이름·주석에 붙인다. 본문 코드에 숫자를 직접 쓰지 않는다 | 도메인 정의서 5.3, PRD 4.1 |
| P-06 | **기술 스택은 PRD 6장만 쓴다.** 목록 밖 라이브러리·서비스(Firebase, MongoDB, Prisma, ORM, 인증·지도·이미지 처리 라이브러리 등)는 쓰지 않는다. 표준 라이브러리·브라우저 기본 기능(`crypto`, `fetch`, Canvas, `confirm`)을 먼저 쓴다 | PRD 6장, Q-05, Q-06 |
| P-07 | **비밀정보·개인정보는 기본적으로 감춘다.** 시크릿은 서버에만 두고, 로그·응답에 비밀번호·토큰·정밀 좌표·IP 원문을 남기지 않는다 | NFR-07, PRV-03, PRV-04, PRV-07 |
| P-08 | **동작하는 흐름을 먼저 끝까지.** 드롭 → 업로드 → 검열 → 게시 → 조회 → 열람의 핵심 흐름을 실기기에서 검증하는 것이 완료 기준이다 | PRD 1.2, 1.3, 8장 |

---

## 2. 의존성/레이어 원칙

### 2.1 백엔드 (Node.js + JavaScript + Express)

```
routes ──▶ services ──▶ repositories ──▶ db (pg Pool)
              │
              ├──▶ aws/ (S3, Rekognition 래퍼)
              └──▶ lib/ (순수 함수: 거리, 검증, 시간)
```

| 규칙 | 근거 |
|---|---|
| 레이어는 `routes → services → repositories` 3개만 둔다. 화살표 반대 방향 import는 금지한다 | P-01 |
| `routes`: HTTP 입출력만 다룬다. 요청 검증, 세션 확인 미들웨어 적용, 서비스 호출, 상태 코드·JSON 응답. SQL·AWS SDK를 직접 부르지 않는다 | NFR-07 |
| `services`: FR 규칙(판정식, 만료 계산, 게시 순서)을 구현한다. HTTP 객체(`req`, `res`)를 받지 않는다 | FR-06, FR-07, FR-10 |
| `repositories`: SQL을 직접 작성하고 `pg` Pool로 실행한다. 모든 값은 `$1` 파라미터 바인딩으로 넣는다. 문자열 연결로 SQL을 만들지 않는다. ORM·쿼리 빌더 금지 | NFR-07, NFR-04, PRD 6장 |
| 트랜잭션은 한 요청에 쓰기가 둘 이상일 때만 쓴다(`pool.connect()` + `BEGIN/COMMIT/ROLLBACK`, 끝나면 반드시 `release`) | NFR-04 |
| `pg` Pool은 앱 전체에 하나만 만들고 풀 크기 상한을 환경 변수로 둔다 | NFR-04 |
| AWS SDK는 `aws/` 안의 두 모듈(`storage.js`=S3: Presigned PUT 발급·HeadObject·GetObject 스트림·태그 제거·DeleteObject, `moderation.js`=Rekognition)에서만 import한다. 서비스는 이 모듈의 함수만 부르고, 테스트는 이 모듈만 대체한다 | PRD 6장, 4장 테스트 원칙 |
| 미디어 읽기는 `routes/media.js`가 권한을 확인한 뒤 `storage.js`의 GetObject 스트림을 응답으로 흘려보낸다(파일 전체를 메모리에 올리지 않음) | NFR-05, NFR-08 |
| `lib/`은 다른 레이어를 import하지 않는 순수 함수만 둔다 | P-01 |
| 세션 확인은 미들웨어 하나로 모든 `/api` 경로(헬스 체크·가입·로그인 제외)에 적용한다 | FR-01, BR-01 |

### 2.2 프론트엔드 (React 19 + TypeScript + Zustand + TanStack Query)

```
screens ──▶ components ──▶ (stores | api | lib)
   │
   └──▶ ar/ (A-Frame + AR.js 장면 래퍼) ──▶ lib
api ──▶ lib
```

| 규칙 | 근거 |
|---|---|
| 서버 데이터(주변 목록, 열람 결과, 게시 결과)는 TanStack Query로만 다룬다. Zustand에 복사하지 않는다 | PRD 6장 |
| Zustand는 앱 전역 UI·AR 상태(로그인 여부, 현재 화면, 권한 결과, 위치·accuracy·heading)만 둔다. 세션 토큰은 HttpOnly 쿠키라 JS에서 다루지 않는다. 한 컴포넌트에서만 쓰는 상태(드롭 시트 단계, 입력값)는 `useState`로 둔다 | PRD 6장, FR-01, P-01 |
| 라우터 라이브러리를 쓰지 않는다. 화면(W-01~W-12) 전환은 Zustand 상태로 한다. 홈·탭이 없고 화면 수가 적다 | PRD 6장, 7장, 와이어프레임 2장 |
| `api/`는 `fetch` 하나를 감싼 클라이언트와 FR별 Query/Mutation 훅만 둔다. 401을 받으면 로그인 상태를 지우고 W-01로 보낸다 | FR-01, W-05 |
| A-Frame·AR.js DOM 조작은 `ar/` 안에만 둔다. `ar/`은 로직 없는 얇은 장면 래퍼로, props로 받은 캡슐 목록을 그리고 탭 이벤트만 올려 보낸다. 거리·배치·표시 구분 계산은 `lib/`으로 뺀다. `api/`를 직접 부르지 않는다 | FR-09, PRD 6장, 4.3 |
| `lib/`은 React·네트워크 의존이 없는 순수 함수만 둔다(남은 거리, 파일 사전 검사, JPEG 재인코딩·썸네일 크기 계산). 남은 거리는 계산값 그대로 쓰고(서버 `remaining_m`도 계산값), 화면 표시만 정수 m로 올림(ceil)한다 | PRD 7장, FR-04, FR-10 |

### 2.3 의존성 추가 규칙

| 규칙 | 근거 |
|---|---|
| 런타임 의존성은 PRD 6장 목록(`react`, `zustand`, `@tanstack/react-query`, A-Frame·AR.js npm 패키지, `express`(5), `pg`, 공식 AWS SDK의 S3·Rekognition·presigner 모듈)으로 한정한다 | PRD 6장 |
| 개발 의존성은 PRD 6장 "빌드·테스트 도구" 행(Vite, Vitest, `@vitest/coverage-v8`, React Testing Library, jsdom, TypeScript, `@types/react`, `@types/react-dom`)으로 한정한다. 백엔드 테스트는 Node 내장 기능만 쓴다 | PRD 6장 |
| AWS SDK는 필요한 서비스 모듈만 설치한다(전체 SDK 금지). A-Frame·AR.js도 npm으로 설치해 버전을 고정하고 CDN 스크립트를 쓰지 않는다 | PRD 6장 |
| 몇 줄로 해결되는 기능(검증, 로그, 쿠키 파싱, 거리 계산)은 직접 작성한다 | P-06 |
| 새 의존성은 사용자 승인 후, PRD 6장과 이 문서에 먼저 반영한 다음 설치한다 | PRD 6장 |
| 버전은 lock 파일로 고정하고 커밋한다 | 재현성 |

---

## 3. 코드/네이밍 원칙

### 3.1 파일·식별자

| 대상 | 규칙 | 예 |
|---|---|---|
| 디렉토리 | 소문자, 복수형 | `routes/`, `services/`, `screens/` |
| React 컴포넌트 파일 | PascalCase `.tsx`, 파일당 컴포넌트 1개 | `LoginScreen.tsx`, `FabMenu.tsx` |
| 그 밖의 파일 | camelCase (백엔드 `.js`, 프론트 `.ts`) | `capsules.js`, `geo.ts` |
| 테스트 파일 | 대상 파일명 + `.test` | `geo.test.js`, `LoginScreen.test.tsx` |
| 함수·변수 | camelCase, 함수는 동사로 시작 | `findNearbyCapsules`, `judgeOpen` |
| React 훅 | `use` 접두어 | `useNearbyCapsules` |
| 상수(PRM·M) | UPPER_SNAKE, ID 접두어 + 단위 접미어 | `PRM_01_OPEN_RADIUS_M`, `M_03_UPLOAD_URL_TTL_SEC` |
| 타입(TS) | PascalCase | `NearbyCapsule` |

### 3.2 DB

| 규칙 | 근거 |
|---|---|
| 테이블은 snake_case 복수형: `users`, `sessions`, `capsules`, `view_records` (MVP는 이 4개 + 마이그레이션 적용 이력 테이블 `schema_migrations`만) | PRD 8장, P-02 |
| 컬럼은 snake_case. PK는 `id`(`uuid`, `gen_random_uuid()`), FK는 `<단수>_id`, 시각은 `<동사>_at`(`timestamptz`) | INV-02, INV-06 |
| 상태값은 `text` + `CHECK` 제약, 값은 도메인 이름의 대문자. MVP `capsules.status`는 `ACTIVE`/`DELETED`만 두고, 만료는 `expires_at > now()` 조건으로 판정한다(상태 갱신 배치 없음) | 도메인 정의서 6장, FR-08, BR-11 |
| 인덱스 이름은 `idx_<테이블>_<컬럼>`. 좌표는 위도·경도 B-tree 인덱스로 범위를 먼저 좁히고 SQL로 거리를 계산한다(PostGIS 미사용) | NFR-04, Q-06 |
| 시각 기준은 DB `now()` 하나로 통일한다. `expires_at`은 게시 시 PRM-06 기준으로 계산해 저장한다 | FR-07, PRM-06 |
| 열람 기록의 IP는 원문을 저장하지 않고 `ip_hash`(HMAC-SHA256) 컬럼에 저장한다. 현장 증명 ID 컬럼은 두지 않고 현장 증명을 도입할 때 추가한다 | FR-10, PRV-04, P-02 |
| 무결성은 앱 코드보다 DB 제약(`UNIQUE(email)`, `NOT NULL`, `CHECK`, FK)으로 먼저 지킨다 | FR-01 |

### 3.3 API

| 규칙 | 근거 |
|---|---|
| 경로는 `/api` 접두어, 복수 명사, kebab-case. 상태를 바꾸는 행위는 하위 경로 `POST`로 표현한다 | — |
| JSON 필드는 DB 컬럼과 같은 snake_case를 그대로 쓴다(변환 코드 없음) | FR-07(`expires_at`), P-01 |
| 에러 응답은 `{ "error": { "code": "UPPER_SNAKE", "message": "사용자 안내 문구" } }` 하나로 통일한다. 추가 정보는 같은 객체에 둔다(예: `remaining_m`) | FR-10, W-12 |

MVP 엔드포인트 (이 외에는 만들지 않는다)

| 메서드·경로 | FR |
|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` | FR-01 |
| `GET /api/me` (세션 쿠키로 현재 사용자 `{ id, email }` 200, 없으면 401. 앱 시작 시 W-01/W-03 분기) | FR-01 |
| `POST /api/uploads` (원본·썸네일 Presigned URL 발급) | FR-04 |
| `GET /api/media/:mediaId` (원본, 열람 기록 또는 소유자만), `GET /api/media/:mediaId/thumb` (썸네일) | FR-08, FR-10, NFR-05, NFR-08 |
| `POST /api/capsules` (검열 + 게시) | FR-06, FR-07 |
| `GET /api/capsules/nearby?lat=&lng=` | FR-08 |
| `POST /api/capsules/:id/open` | FR-10 |
| `DELETE /api/capsules/:id` (P1) | FR-11 |
| `GET /api/health` | 5장 |

에러 코드 (MVP)

| 코드 | HTTP | 근거 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | FR-01, BR-01 |
| `INVALID_CREDENTIALS` | 401 | FR-01 (계정 존재 여부와 무관하게 같은 메시지) |
| `ACCOUNT_LOCKED` | 429 | FR-01, M-05 |
| `EMAIL_TAKEN` | 409 | FR-01 |
| `VALIDATION_FAILED` | 400 | FR-04, FR-07, M-06, M-10, M-11 |
| `GRADE_NOT_ALLOWED` | 400 | FR-07, Q-04 |
| `LOW_ACCURACY` | 422 | FR-03, FR-10, PRM-03 |
| `DROP_TOO_FAR` | 422 | FR-03, PRM-20 (앵커가 드롭하는 사람 위치에서 배치 반경을 넘음) |
| `OUT_OF_RANGE` | 403 (`remaining_m` 포함) | FR-10, NFR-08 |
| `MODERATION_REJECTED` | 422 | FR-06, M-14 |
| `MODERATION_UNAVAILABLE` | 503 | FR-06, M-09 |
| `MEDIA_ALREADY_USED` | 409 | FR-06 (다른 유저의 캡슐이 이미 그 `media_id`를 씀. 같은 유저의 재요청은 기존 캡슐을 200으로 반환) |
| `NOT_OWNER` | 403 | FR-11 |
| `MEDIA_FORBIDDEN` | 403 | FR-10, NFR-08 (열람 기록 없는 원본 요청) |
| `CAPSULE_NOT_FOUND` | 404 | FR-10, FR-11 |
| `INTERNAL_ERROR` | 500 | — |

### 3.4 주석

| 규칙 | 근거 |
|---|---|
| "무엇"이 아니라 "왜"를 쓴다. 규칙 구현부에는 근거 ID를 한 줄로 남긴다(예: `// FR-10, 도메인 5.4 판정식`) | P-04 |
| MVP라서 의도적으로 생략·단순화한 곳은 `// MVP 단순화(Q-11): ...`처럼 결정 ID와 한계를 적는다 | PRD 3.2, Q-11 |
| 주석 처리한 코드, TODO 더미, 사용하지 않는 코드는 커밋하지 않는다 | P-02 |

---

## 4. 테스트/품질 원칙

### 4.1 공통

| 규칙 | 근거 |
|---|---|
| `backend/`, `frontend/` 각각 라인 커버리지 **90% 이상**을 완료 조건으로 한다. 커버리지 제외는 프론트 `ar/` 하나뿐이다(4.3) | develop-backend·develop-frontend SKILL |
| 테스트 이름에 근거 ID를 넣는다(예: `FR-10 반경 경계값에서 열람 허용`) | P-04 |
| 경계값(같음/1 초과)과 거부 경로를 성공 경로만큼 테스트한다 | NFR-08 |
| 외부 서비스(S3, Rekognition)는 `aws/` 래퍼만 대체하고, 실제 AWS를 테스트에서 호출하지 않는다 | 2.1 |

### 4.2 백엔드

| 구분 | 방식 | 대상 |
|---|---|---|
| 러너 | Node 24.2 이상의 내장 `node:test` + `node:assert`, 대체는 `node:test`의 `mock`, 커버리지는 내장 커버리지(`--experimental-test-coverage`, 임계값 옵션) | — |
| 단위 | `lib/`, `services/`의 순수 로직 | 거리 계산·위경도 범위 박스(FR-08, NFR-04), 열람 판정식 `d − min(accuracy, PRM-03 보정 상한) ≤ PRM-01`과 재측정 기준(FR-10, PRM-03), 만료 계산(FR-07, PRM-06), `crypto.scrypt` 해시·검증과 세션 토큰(FR-01, Q-05), 연속 실패 잠금(M-05), IP HMAC 해시(FR-10), 입력 검증(M-06, M-10, M-11, 등급) |
| 통합 | `app`을 임의 포트로 띄우고 내장 `fetch`로 HTTP 호출 + 실제 테스트 DB | 401/409/429, 세션 쿠키 속성(FR-01), 업로드 URL 발급(FR-04), 게시 성공·원본 또는 썸네일 검열 거부(422)·503(FR-06), 주변 조회에서 만료·삭제·미검열 제외(FR-08, BR-11, BR-33), 정확도 부족 422·반경 밖 403·404·열람 기록 저장(FR-10, NFR-08), 미디어 프록시: 비로그인 401·열람 기록 없는 원본 403·소유자 200·만료·삭제 404·`Cache-Control: private, max-age=31536000, immutable` 헤더(NFR-05, NFR-08), 소유자만 삭제·S3 객체 삭제 호출(FR-11) |
| DB | PostgreSQL 17 테스트 전용 DB에 마이그레이션을 적용하고, 테스트 파일마다 `TRUNCATE`로 비운다. repository SQL은 대체하지 않고 실제 DB로 검증한다 | NFR-04, NFR-07 |

### 4.3 프론트엔드

| 구분 | 방식 | 대상 |
|---|---|---|
| 러너 | Vitest + React Testing Library + jsdom | — |
| 단위 | `lib/`, `stores/` | 남은 거리 `max(0, d − min(accuracy, PRM-03) − PRM-01)`(PRD 7장, 계산값 그대로)와 표시용 정수 m 올림(ceil), 열람 가능/불가 프레임 구분, 파일 사전 검사(FR-04, M-06), 재인코딩·썸네일 크기 계산(M-13, M-07) |
| 컴포넌트 | `fetch` 대체 | 가입 버튼 활성 조건(필수 동의 3개, M-10), 로그인 실패·잠금 메시지(FR-01), 권한 거부 화면(FR-02), 드롭 시트 단계·재시도(W-07~W-10), 정확도 배너(PRD 7장), 열람·404 안내(W-11, W-12), 소유자만 삭제 버튼(FR-11), 401 시 W-01 이동 |
| 공통 공식 | 거리·판정식은 백·프론트가 따로 구현하므로 같은 입력·기대값 표로 양쪽을 테스트한다 | PRD 7장, NFR-08 |
| 커버리지 제외 | `ar/`의 A-Frame 장면 래퍼만 제외한다. jsdom에서 렌더링할 수 없으므로 로직을 두지 않고 실기기 체크리스트(4.4)로 검증한다 | NFR-09 |

### 4.4 실기기·부하

| 규칙 | 근거 |
|---|---|
| 실기기 테스트: 배포 환경(5.2)에서 iOS Safari·Android Chrome 실기기로 드롭→열람 전 흐름, AR 프레임 표시·탭, 재방문 표시율, 재열람 시 브라우저 캐시 사용을 확인하고 결과를 실행 계획 문서(`docs/8-plan.md`)의 완료 조건에 기록한다 | NFR-09, PRD 1.3, NFR-05 |
| 부하 테스트: 캡슐 시드를 SQL(`generate_series`)로 넣고, 내장 `fetch`를 쓰는 Node 스크립트로 주변 조회·열람 API의 p95·오류율과 DB 커넥션 수를 측정한다. MVP 완료 직후 첫 작업으로 한다 | NFR-01, NFR-02, NFR-04, PRD 8장 |

---

## 5. 설정/보안/운영 원칙

### 5.1 설정

| 규칙 | 근거 |
|---|---|
| 설정은 환경 변수로만 받고, 백엔드 시작 시 한 모듈에서 읽어 누락이면 즉시 종료한다 | — |
| 백엔드 변수: `PORT`, `DATABASE_URL`, `DB_POOL_MAX`(기본 10, NFR-01 부하 테스트로 조정), `AWS_REGION`, `S3_BUCKET`, `IP_HASH_SECRET`. AWS 자격 증명은 EC2 인스턴스 역할(임시 자격 증명)을 SDK 기본 자격 증명 체인으로 받고, 장기 액세스 키를 만들거나 코드·저장소에 두지 않는다 | NFR-04, NFR-07, FR-10 |
| 프론트엔드에는 시크릿을 두지 않는다. 빌드 시 노출되는 환경 변수는 원칙적으로 0개이며, API는 같은 출처의 `/api`로 부른다 | NFR-07 |
| `.env`는 커밋하지 않고, 변수 이름만 적은 `.env.example`을 커밋한다 | NFR-07 |

### 5.2 보안

| 규칙 | 근거 |
|---|---|
| 배포는 AWS EC2 단일 인스턴스에서 Express가 API와 프론트 빌드 결과(`dist`)를 같은 출처로 서빙한다. CORS 미들웨어를 두지 않는다. PostgreSQL은 AWS RDS for PostgreSQL 17 단일 인스턴스(관리형 자동 백업, EC2와 같은 VPC의 비공개 서브넷, 외부 접근 없음)로 두어 백업·패치를 직접 하지 않는다 | PRD 6장, P-06 |
| HTTPS는 Cloudflare 프록시 + Origin Certificate(Full strict)로 한다. 로컬 개발은 데스크톱 `localhost`(보안 컨텍스트)에서 하고 Vite 개발 서버가 `/api`를 백엔드로 프록시한다. 실기기 테스트는 배포 환경에서 한다(mkcert·터널 등 추가 도구 없음) | NFR-07, PRD 6장, 8장 |
| 비밀번호는 `crypto.scrypt` + 사용자별 랜덤 salt로 저장하고 `timingSafeEqual`로 비교한다 | FR-01, Q-05 |
| 세션 토큰은 `crypto.randomBytes`로 만들고 DB `sessions`에는 SHA-256 해시를 저장한다. 토큰은 `HttpOnly; Secure; SameSite=Strict` 쿠키로만 전달하고(JS·`localStorage`에 두지 않음), 쿠키는 `req.headers.cookie`를 직접 파싱한다. 유효 기간은 M-04, 로그아웃 시 행을 삭제하고 쿠키를 지운다. 세션 조회는 항상 `expires_at > now()` 조건을 붙이고, 만료 세션은 배치 없이 로그인 성공 시 `DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()`로 지운다 | FR-01, Q-05 |
| 로그인 실패는 계정 존재 여부와 관계없이 같은 메시지로 응답하고, M-05로 잠근다(429). 실패 횟수는 Express 프로세스 메모리의 `Map`(키: 소문자 이메일, 가입 여부와 무관하게 똑같이 셈)에 두어 미가입 이메일도 같은 조건에서 429가 나온다. ponytail: 단일 인스턴스 메모리 카운터라 재시작 시 초기화된다, 인스턴스가 늘면 DB 테이블로 옮긴다 | FR-01, M-05 |
| 모든 입력은 route에서 형식·범위를 직접 검증한다(검증 라이브러리 없음). 위경도·accuracy·heading 범위, 제목 길이(M-11), 등급, 파일 크기(M-06) | FR-04, FR-07, P-06 |
| 사진은 브라우저가 Canvas로 JPEG 재인코딩(긴 변 M-13)해 원본으로 올리고, 썸네일(M-07)도 JPEG로 만든다. EXIF(GPS 포함)는 재인코딩으로 제거된다 | FR-04, PRV-07 |
| S3 버킷은 비공개이고 브라우저에 S3 URL을 주지 않는다. 키는 서버가 캡슐 미디어마다 발급한 UUID(`mediaId`)로 정하며(원본 `media/{mediaId}.jpg`, 썸네일 `media/{mediaId}.thumb.jpg`) 재사용하지 않는다. 업로드 Presigned URL(M-03, 짧은 유효 시간이라 EC2 인스턴스 역할의 임시 자격 증명으로 충분)에는 `Content-Type: image/jpeg`, `status=pending` 태그, `If-None-Match: *`(조건부 쓰기)를 서명해 같은 키의 두 번째 PUT이 412로 실패하게 한다(검열 후 바꿔치기 차단) | NFR-05, NFR-07, FR-04, M-08 |
| S3 버킷 CORS는 AllowedOrigins = 서비스 도메인 하나, AllowedMethods = `PUT`, AllowedHeaders = Presigned URL에 서명된 헤더만(`Content-Type`, `If-None-Match`, `x-amz-tagging`)으로 둔다 | FR-04, NFR-07 |
| 게시 시 서버가 `HeadObject`로 크기·형식을 다시 확인하고, Rekognition은 S3 원본·썸네일을 직접 참조해 M-14 기준, M-09 제한 시간으로 검사한다. 둘 다 통과하면 태그 제거 → 캡슐 행 생성 순서로 처리한다(행이 있는데 객체가 지워지는 일 방지). 거부(422)·실패(503) 시 행을 만들지 않는다 | FR-04, FR-06, BR-33 |
| 읽기는 Express 프록시(`GET /api/media/:mediaId`, `/thumb`)로만 한다. 둘 다 세션 쿠키가 필요하다. 원본은 그 뷰어의 해당 캡슐 열람 기록이 있거나 소유자일 때만 200, 아니면 403이다(FR-10 판정 통과자만 원본을 받음, SQL 한 줄 확인). 만료·삭제 캡슐이면 404다 | NFR-08, FR-10 |
| 미디어 응답은 `Cache-Control: private, max-age=31536000, immutable`로 준다. URL이 영구히 같아 재열람 시 브라우저 캐시를 쓰고, `private`이라 Cloudflare 등 공유 캐시는 저장하지 않는다(권한 우회 방지) | NFR-05, NFR-06 |
| FR-11 삭제 시 원본·썸네일 S3 객체를 `DeleteObject`로 지운다(키 공유 없음). 만료 캡슐 객체는 MVP에서 남겨 두고 후속에서 정리한다 | FR-11 |
| 열람 기록 IP는 `IP_HASH_SECRET`으로 HMAC-SHA256 해시해 저장한다(같은 IP 비교만 필요) | FR-10, PRV-04 |
| 열람 판정·만료(`expires_at > now()`)·상태·소유자 확인은 SQL·서비스에서 매 요청 다시 한다. 열람 요청 확인 순서는 401 → 400 → 404 → 422 → 403으로 확정한다(존재하지 않는 캡슐에 정확도 안내를 먼저 하지 않음) | NFR-08, FR-08, FR-10, FR-11 |

### 5.3 운영 (최소)

| 규칙 | 근거 |
|---|---|
| 로그는 `console`로 한 줄 JSON(시각, 레벨, 메서드, 경로, 상태, 소요 ms, 에러 코드)을 stdout에 쓴다. 로그 라이브러리 없음 | P-06 |
| 로그에 비밀번호, 세션 토큰·쿠키, Presigned URL, 이메일 원문, 정밀 좌표, IP 원문을 남기지 않는다(이메일은 마스킹, 좌표는 생략) | PRV-03, PRV-04, PRV-07 |
| 500 응답에는 내부 메시지·스택을 담지 않고 `INTERNAL_ERROR`만 준다. 상세는 서버 로그에만 남긴다 | NFR-07 |
| 헬스 체크 `GET /api/health`는 `SELECT 1` 성공 여부만 반환한다. 메트릭 수집·APM은 두지 않는다 | P-01 |
| Cloudflare 프록시 뒤에서 실행하므로 Express `trust proxy`를 설정해 실제 클라이언트 IP로 해시를 만든다 | FR-10, INV-06 |
| 마이그레이션은 번호 붙은 `.sql` 파일(`db/migrations/`)을 순서대로 적용하는 `scripts/migrate.js`로 실행하고, 적용 이력을 `schema_migrations(filename text PK, applied_at timestamptz NOT NULL DEFAULT now())` 테이블에 남긴다. `migrate.js`는 시작 시 이 테이블을 `CREATE TABLE IF NOT EXISTS`로 만들고, 파일 실행과 이력 INSERT를 한 트랜잭션으로 묶는다(파일 안에는 `BEGIN/COMMIT`을 두지 않음). `001_init.sql`은 `docs/schema.sql`을 그대로 복사한 것이다. 이미 적용한 파일은 고치지 않고 새 번호로 추가한다 | P-06 |

---

## 6. 디렉토리 구조

MVP FR(FR-01~11)에 필요한 것만 둔다. 후속 단계용 디렉토리는 만들지 않는다(P-02).

### 6.1 저장소 최상위

```
drop_app/
├── docs/        # 도메인 정의서, PRD, 시나리오, 와이어프레임, 이 문서, 아키텍처 다이어그램, ERD, 실행 계획(8-plan.md), 스타일 가이드(9-style-guide.md, 실행 계획 FE-00)
├── frontend/    # React 웹앱 + WebAR
└── backend/     # Express API 서버 (프론트 dist도 서빙)
```

### 6.2 backend/

```
backend/
├── package.json
├── .env.example
├── db/
│   ├── migrations/        # 001_init.sql 등 번호 붙은 SQL (users, sessions, capsules, view_records)
│   └── seed-load.sql      # 부하 테스트용 시드 (NFR-01, MVP 완료 직후)
├── scripts/
│   ├── migrate.js         # 마이그레이션 실행 스크립트
│   └── load-test.js       # 내장 fetch 부하 테스트 (NFR-01, MVP 완료 직후)
├── src/
│   ├── server.js          # 포트 열기만 담당
│   ├── app.js             # Express 앱 조립(미들웨어, 라우트, 에러 핸들러, 프론트 dist 정적 서빙). 테스트에서 재사용
│   ├── config.js          # 환경 변수 읽기·검증
│   ├── params.js          # PRM·M 상수 (ID 주석)
│   ├── db.js              # pg Pool 하나
│   ├── errors.js          # 에러 코드·HTTP 상태 매핑, 에러 응답 형식
│   ├── middleware/
│   │   └── auth.js        # 세션 쿠키 확인 (FR-01)
│   ├── routes/            # auth.js, uploads.js, capsules.js, media.js(미디어 프록시) (HTTP 입출력·입력 검증)
│   ├── services/          # auth.js, uploads.js, capsules.js, media.js(원본 열람 권한 확인) (FR 규칙)
│   ├── repositories/      # users.js, sessions.js, capsules.js, viewRecords.js (SQL)
│   ├── aws/               # storage.js(S3, GetObject 스트림 포함), moderation.js(Rekognition)
│   └── lib/               # geo.js(거리·범위 박스), log.js(JSON 로그)
└── test/
    ├── helpers/           # 테스트 DB 준비·정리, 앱 기동
    ├── unit/              # lib·services 단위 테스트
    └── integration/       # HTTP + 실제 DB 통합 테스트
```

### 6.3 frontend/

```
frontend/
├── package.json
├── index.html
├── tsconfig.json
├── vite.config.ts         # Vite 빌드, 개발 중 /api 프록시, Vitest 설정
├── public/                # 정적 파일(3D 프레임 에셋 등)
└── src/
    ├── main.tsx           # QueryClient·루트 렌더링
    ├── App.tsx            # 상태 기반 화면 전환 (W-01~W-05)
    ├── params.ts          # PRM·M 상수 (ID 주석, 백엔드와 같은 값)
    ├── api/               # client.ts(fetch·401 처리), auth.ts, uploads.ts, capsules.ts (Query/Mutation 훅)
    ├── stores/            # session.ts(로그인 여부·화면), ar.ts(권한·위치·accuracy·heading)
    ├── screens/           # LoginScreen, SignupScreen, StartScreen, PermissionDeniedScreen, ArScreen
    ├── components/        # Fab, FabMenu, DropSheet(W-07~W-10), OpenView(W-11), Notice(W-12), AccuracyBanner
    ├── ar/                # ArScene.tsx(로직 없는 A-Frame·AR.js 장면 래퍼, 커버리지 제외), 커스텀 요소 JSX 타입 선언
    └── lib/               # geo.ts(남은 거리·표시 구분), image.ts(사전 검사·Canvas JPEG 재인코딩·썸네일)
```

테스트 파일은 대상 파일 옆에 `*.test.ts(x)`로 둔다.

---

## 7. 결정 내역

v0.1의 확인 필요 21건을 아래와 같이 결정했다.

| # | 항목 | 결정 | 반영 위치 |
|---|---|---|---|
| 1 | 프론트 빌드 | Vite (React 앱에 필요한 최소 빌드 도구) | PRD 6장, 2.3, 6.3 |
| 2 | 프론트 테스트 | Vitest + React Testing Library + jsdom | PRD 6장, 4.3 |
| 3 | 백엔드 테스트 | `node:test` + `node:assert` + 내장 커버리지, Node 24.2 이상 | PRD 6장, 4.2 |
| 4 | Express 버전 | Express 5 | PRD 6장, 2.3 |
| 5 | 마이그레이션 | 번호 `.sql` + `scripts/migrate.js` + 적용 이력 테이블 | 3.2, 5.3, 6.2 |
| 6 | A-Frame·AR.js | npm 패키지로 설치(버전 고정), CDN 미사용 | PRD 6장, 2.3 |
| 7 | `ar/` 커버리지 | 로직 없는 얇은 래퍼만 커버리지 제외, 실기기 체크리스트로 대체. 로직은 `lib/`(90% 대상). 제외는 `ar/` 하나뿐 | 2.2, 4.1, 4.3 |
| 8 | 부하 테스트 | 내장 `fetch` Node 스크립트 | 4.4, 6.2 |
| 9 | 세션 토큰 | `HttpOnly; Secure; SameSite=Strict` 쿠키(같은 출처 전제), `localStorage` 미사용 | PRD FR-01, 2.2, 5.2 |
| 10 | 배포·HTTPS | EC2 단일 인스턴스, Express가 API·`dist` 같은 출처 서빙, Cloudflare 프록시 + Origin Certificate(Full strict). 로컬은 `localhost`, 실기기는 배포 환경 | PRD 6장·8장, 5.2 |
| 11 | 읽기 경로와 캐시 | 버킷 비공개 유지, 장기 키 없음. Express가 인스턴스 역할로 GetObject해 `/api/media/:mediaId`(원본: 열람 기록·소유자만, 아니면 403, 만료·삭제 404)와 `/thumb`로 스트리밍. `Cache-Control: private, max-age=31536000, immutable`. 읽기 Presigned URL(M-12)안은 폐기 | PRD FR-10·NFR-05·NFR-06·4.1, 와이어프레임 W-11, 2.1, 3.3, 4.2, 5.2, 6.2 |
| 12 | 원본 형식 | 브라우저 Canvas로 JPEG 재인코딩(M-13). HEIC·WebP 입력과 EXIF 노출 해결 | PRD FR-04·4.1, 와이어프레임 W-07, 5.2 |
| 13 | 썸네일 | JPEG로 생성, 원본·썸네일 모두 검열해 둘 다 통과해야 게시 | PRD FR-04·FR-06, 5.2 |
| 14 | 검열 기준 | M-14 초기값(운영 데이터로 조정) | PRD 4.1·FR-06, 5.2 |
| 15 | S3 키·덮어쓰기 | 서버 발급 UUID 키(재사용 없음) + Presigned PUT `If-None-Match: *`. 콘텐츠 해시 키·SHA-256 체크섬안 폐기 | PRD NFR-05·FR-04, 5.2 |
| 16 | 만료 상태 | `expires_at > now()` 조건 판정, 상태 갱신 배치 없음 | 3.2, 5.2 |
| 17 | 상태 코드 | 잠금 429, 정확도 부족 422, 검열 거부 422 | PRD FR-01·FR-03·FR-06·FR-10, 3.3 |
| 18 | 풀 크기 | `DB_POOL_MAX` 기본 10(pg 기본값), 부하 테스트로 조정 | 5.1 |
| 19 | 열람 기록 IP | 원문 저장 금지, 서버 비밀값 HMAC-SHA256 해시 | PRD FR-10, 3.2, 5.2 |
| 20 | 삭제 시 S3 객체 | FR-11 삭제 시 원본·썸네일 `DeleteObject`. 만료 캡슐 객체는 후속 정리 | PRD FR-11, 5.2 |
| 21 | 문서 번호·스타일 가이드 | 이 문서는 `5-project-principle.md` 유지, 실행 계획은 `docs/8-plan.md`로 별도 작성. 스타일 가이드는 프론트 UI 개발 전에 `docs/9-style-guide.md`로 작성(실행 계획 FE-00) | 6.1, 4.4 |
