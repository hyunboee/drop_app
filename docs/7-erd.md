# Drop ERD

> 출처: `1-domain-definition.md`(도메인 정의서 v1.1), `2-PRD.md`(PRD v1.2), `3-user-scenario.md`(시나리오 v0.6), `4-wireframes.md`(와이어프레임 v0.7), `5-project-principle.md`(프로젝트 원칙 v0.7), `6-arch-diagram.md`(아키텍처 v0.6), `10-native-PRD.md`(네이티브 PRD v0.7, 1.6만). 수치는 PRM-xx(도메인 정의서 5.3)·M-xx(PRD 4.1) ID로만 참조한다.

## 변경 이력

| 버전 | 일자 | 변경자 | 변경내용 |
|---|---|---|---|
| 0.1 | 2026-10-01 | Claude Code | 초안 작성 |
| 0.2 | 2026-10-01 | Claude Code | 확인 필요 8건 결정 반영: 잠금 컬럼 삭제(메모리 카운터), 증명 ID 컬럼 삭제, `users.terms_version` 추가, 운영용 테이블 `schema_migrations`, 로그인 성공 시 만료 세션 삭제, 3장을 결정 내역으로 변경 |
| 0.3 | 2026-10-01 | Claude Code | 문서 정합성 점검: 출처 문서 버전을 최신(도메인 v0.8, PRD v0.8, 시나리오 v0.4, 와이어프레임 v0.4, 원칙 v0.4, 아키텍처 v0.3)으로 갱신 |
| 0.4 | 2026-10-02 | Claude Code | 프레임 방향 회전(PRD v1.2 Q-14): `capsules.heading`의 의미를 드롭 시 기기 방향에서 프레임 앞면이 바라보는 방위로 변경. 타입·제약·DDL은 그대로 |
| 0.7 | 2026-10-04 | Claude Code | 실증에서 정한 크기 저장(`13-capsule-dev-plan.md` 17장): 1.7 추가. `capsules.size_m`과 마이그레이션 `003` DDL, 결정 E13(회전은 `heading` 재사용, 결제 관련 컬럼은 N3) |
| 0.6 | 2026-10-04 | Claude Code | 캡슐 디벨롭 기획(`13-capsule-dev-plan.md`) 대조: 1.4 인덱스가 주변 조회의 `opened` 계산(BE-17)에도 쓰임을 명시, 결정 E12(N1.5는 DB 변경 없음, `model_kind` 미도입). 2부의 프라이빗·개봉 날짜·영상·상점 스키마는 결정 전이라 반영하지 않는다 |
| 0.5 | 2026-10-03 | Claude Code | 네이티브 N1(네이티브 PRD v0.3): 1.6 추가. `capsules.cloud_anchor_id`·`geo_pose`, `view_records.plane_match`와 마이그레이션 `002` DDL, 결정 E9~E11. `schema.sql`은 `001`의 원본이라 바꾸지 않는다 |

---

## 1. MVP 물리 ERD

PostgreSQL 17 기준. 테이블은 원칙 3.2의 4개(`users`, `sessions`, `capsules`, `view_records`)만 둔다. 후속 단계 컬럼(`view_price`, `visibility`, `device_id`, `rewarded` 등)은 두지 않는다(P-02). 마이그레이션 적용 이력 테이블은 도메인과 무관해 다이어그램에서 빼고 1.5 운영용 테이블 표에만 적는다(3장 E4).

- mermaid 속성 타입에는 공백을 쓸 수 없어 `double precision`을 동의어 `float8`로 표기한다. 아래 표는 `double precision`으로 적는다.
- 검열 거부(Rejected)·검열 실패·업로드 이탈 캡슐은 행을 만들지 않는다. 행은 원본·썸네일 검열 통과 후 바로 `ACTIVE`로 생성된다(FR-06, 원칙 5.2).

```mermaid
erDiagram
  users ||--o{ sessions : "로그인"
  users ||--o{ capsules : "소유"
  users ||--o{ view_records : "열람"
  capsules ||--o{ view_records : "열람됨"

  users {
    uuid id PK
    text email UK "소문자 정규화"
    text password_salt "scrypt salt"
    text password_hash "scrypt 해시"
    text terms_version "동의한 약관 버전"
    timestamptz created_at
  }

  sessions {
    uuid id PK
    uuid user_id FK
    text token_hash UK "SHA-256, 원문 저장 금지"
    timestamptz created_at
    timestamptz expires_at "created_at + M-04"
  }

  capsules {
    uuid id PK
    uuid user_id FK "소유자"
    uuid media_id UK "S3 키 media/{media_id}.jpg, .thumb.jpg"
    text title
    text grade "BRONZE만"
    float8 lat
    float8 lng
    float8 accuracy "드롭 시 GPS 정확도(m)"
    float8 heading "프레임이 바라보는 방위(도)"
    text status "ACTIVE 또는 DELETED"
    timestamptz published_at
    timestamptz expires_at "published_at + PRM-06"
  }

  view_records {
    uuid id PK
    uuid capsule_id FK
    uuid user_id FK "뷰어"
    float8 lat "뷰어 좌표"
    float8 lng "뷰어 좌표"
    float8 accuracy "뷰어 GPS 정확도(m)"
    text ip_hash "HMAC-SHA256, 원문 저장 금지"
    timestamptz viewed_at
  }
```

### 1.1 users

| 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|
| id | uuid | PK, DEFAULT `gen_random_uuid()` | 원칙 3.2 |
| email | text | NOT NULL, UNIQUE | FR-01(중복 409), 원칙 3.2 |
| password_salt | text | NOT NULL | FR-01, Q-05, 원칙 5.2(사용자별 랜덤 salt) |
| password_hash | text | NOT NULL | FR-01, Q-05 |
| terms_version | text | NOT NULL | FR-01, PRV-07 (동의 시각은 `created_at`) |
| created_at | timestamptz | NOT NULL, DEFAULT `now()` | 원칙 3.2 |

- 잠금(M-05)은 DB에 저장하지 않는다. Express 프로세스 메모리 `Map`(키: 소문자 이메일)에서 가입 여부와 무관하게 세어 미가입 이메일도 같은 조건에서 429가 나온다(FR-01, 3장 E1).
- 이메일은 앱에서 소문자로 정규화한 뒤 저장·조회한다(3장 E6).

### 1.2 sessions

| 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|
| id | uuid | PK, DEFAULT `gen_random_uuid()` | 원칙 3.2 |
| user_id | uuid | NOT NULL, FK → users.id | FR-01 |
| token_hash | text | NOT NULL, UNIQUE | 원칙 5.2(`randomBytes` 토큰의 SHA-256 해시만 저장), Q-05 |
| created_at | timestamptz | NOT NULL, DEFAULT `now()` | 원칙 3.2 |
| expires_at | timestamptz | NOT NULL | FR-01, M-04 |

- 세션 확인: `token_hash = $1 AND expires_at > now()`. `token_hash` UNIQUE 인덱스로 조회한다.
- 로그아웃 시 행을 삭제한다(FR-01).
- 만료 세션 정리: 배치 없이 로그인 성공 시 `DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()`로 그 유저의 만료 세션을 지운다(3장 E7).

### 1.3 capsules

| 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|
| id | uuid | PK, DEFAULT `gen_random_uuid()` | 원칙 3.2, INV-02 |
| user_id | uuid | NOT NULL, FK → users.id (소유자) | INV-02(ownerId), FR-11 |
| media_id | uuid | NOT NULL, UNIQUE | FR-04, NFR-05, 원칙 5.2. 원본 `media/{media_id}.jpg`, 썸네일 `media/{media_id}.thumb.jpg`는 이 값에서 만들고 키 컬럼은 따로 두지 않는다 |
| title | text | NOT NULL | FR-07, M-11 |
| grade | text | NOT NULL, DEFAULT `'BRONZE'` | FR-07, Q-04, BR-06 |
| lat | double precision | NOT NULL | FR-03, NFR-04 |
| lng | double precision | NOT NULL | FR-03, NFR-04 |
| accuracy | double precision | NOT NULL | FR-03, PRM-03 |
| heading | double precision | NOT NULL | FR-03, Q-02, Q-14 (프레임 앞면이 바라보는 방위, 북 0° 시계 방향. `schema.sql` 주석은 마이그레이션과 같게 두려고 바꾸지 않았다) |
| status | text | NOT NULL, DEFAULT `'ACTIVE'` | 원칙 3.2, FR-11 |
| published_at | timestamptz | NOT NULL, DEFAULT `now()` | INV-02, FR-07 |
| expires_at | timestamptz | NOT NULL | FR-07, PRM-06, BR-11 |

- 만료: `expires_at`은 게시 시 `now() + PRM-06(브론즈)`로 계산해 저장하고, 조회·열람·미디어 프록시에서 `status = 'ACTIVE' AND expires_at > now()`로 판정한다. 상태를 `EXPIRED`로 바꾸는 갱신은 없다(원칙 3.2, 7장 #16).
- 삭제(FR-11): 행을 지우지 않고 `status = 'DELETED'`로 바꾼다. 원본·썸네일 S3 객체는 `DeleteObject`로 지운다(원칙 5.2). 열람 기록 FK는 그대로 유지된다.
- MVP 마스터 등급이 없으므로 `expires_at`은 NOT NULL이다(INV-02의 마스터 null은 후속).
- CHECK:
  - `grade = 'BRONZE'` (FR-07, 브론즈 외는 route에서 400 `GRADE_NOT_ALLOWED`)
  - `status IN ('ACTIVE', 'DELETED')` (원칙 3.2)
  - `char_length(title) >= 1` (M-11 상한은 조정 가능한 값이라 route에서 검증, P-05)
  - `lat BETWEEN -90 AND 90`, `lng BETWEEN -180 AND 180`, `accuracy >= 0`, `heading >= 0 AND heading < 360` (원칙 5.2 입력 범위)
  - accuracy의 재측정 기준(PRM-03)은 조정 가능한 값이라 CHECK에 넣지 않고 service에서 422로 거부한다(FR-03).
- 인덱스:
  - `idx_capsules_lat_lng` (lat, lng) B-tree: 주변 조회의 위경도 범위 박스로 먼저 좁힌 뒤 SQL로 거리 계산(FR-08, NFR-04, Q-06)
  - `media_id` UNIQUE 인덱스: 미디어 프록시 `GET /api/media/:mediaId`의 캡슐 조회(NFR-08)

### 1.4 view_records

| 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|
| id | uuid | PK, DEFAULT `gen_random_uuid()` | 원칙 3.2 |
| capsule_id | uuid | NOT NULL, FK → capsules.id | INV-06, FR-10 |
| user_id | uuid | NOT NULL, FK → users.id (뷰어) | INV-06(viewerId), FR-10 |
| lat | double precision | NOT NULL | FR-10 |
| lng | double precision | NOT NULL | FR-10 |
| accuracy | double precision | NOT NULL | FR-10, PRM-03 |
| ip_hash | text | NOT NULL | FR-10, PRV-04, 원칙 3.2·5.2(`IP_HASH_SECRET` HMAC-SHA256) |
| viewed_at | timestamptz | NOT NULL, DEFAULT `now()` | INV-06 |

- 판정(FR-10, 도메인 5.4)을 통과한 열람마다 한 행을 만든다. 같은 뷰어·캡슐도 열람할 때마다 기록하므로 (capsule_id, user_id)에 UNIQUE를 두지 않는다.
- INV-06의 deviceId·rewarded는 MVP 범위 밖(기기 식별 불가 Q-01, 조회 보상 후속)이라 두지 않는다. 현장 증명 ID 컬럼도 두지 않고 현장 증명을 도입할 때 추가한다(P-02, Q-11, 3장 E2). IP는 원문 대신 `ip_hash`만 저장한다.
- CHECK: `lat BETWEEN -90 AND 90`, `lng BETWEEN -180 AND 180`, `accuracy >= 0`.
- 인덱스:
  - `idx_view_records_capsule_id_user_id` (capsule_id, user_id): 원본 미디어 권한 확인 "이 뷰어의 해당 캡슐 열람 기록 존재"(FR-10, NFR-08, 원칙 5.2). `capsule_id` FK 조회도 이 인덱스로 처리한다. 주변 조회 응답의 `opened`(세션 유저의 열람 기록 존재 여부, N1.5)도 이 인덱스로 `EXISTS` 계산한다. 같은 뷰어·캡슐 행이 여러 개일 수 있어 JOIN으로 붙이지 않는다(`8-plan.md` BE-17).

### 1.5 운영용 테이블

도메인과 무관해 1장 다이어그램에는 넣지 않는다(3장 E4).

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| schema_migrations | filename text PK, applied_at timestamptz NOT NULL DEFAULT `now()` | `scripts/migrate.js`의 적용 이력(원칙 5.3) |

### 1.6 네이티브 N1 변경 (마이그레이션 002)

네이티브 PRD FR-N06~N08에 필요한 컬럼만 더한다. 테이블은 늘리지 않는다. 1장 다이어그램과 `schema.sql`은 웹 MVP 기준(`001_init.sql`의 원본)이라 그대로 두고, 이 절이 `backend/db/migrations/002_native_anchor.sql`의 원본이다.

| 테이블 | 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|---|
| capsules | cloud_anchor_id | text | NULL 허용 | FR-N05, FR-N06. ARCore 클라우드 앵커 ID. 웹에서 드롭한 캡슐과 앵커 저장 전 게시분은 NULL |
| capsules | geo_pose | jsonb | NULL 허용 | FR-N05, FR-N06. Geospatial 포즈 `{ lat, lng, alt, qx, qy, qz, qw }`. VPS를 쓸 수 없던 장소는 NULL |
| view_records | plane_match | boolean | NOT NULL, DEFAULT `false` | FR-N08, 도메인 5.4(planeScanMatch). 클라우드 앵커나 Geospatial로 고정된 프레임을 탭했는지 |

```sql
-- 002_native_anchor.sql (네이티브 N1)
ALTER TABLE capsules
  ADD COLUMN cloud_anchor_id text,   -- ARCore 클라우드 앵커 ID (웹 캡슐은 NULL)
  ADD COLUMN geo_pose        jsonb;  -- Geospatial 포즈 { lat, lng, alt, qx, qy, qz, qw } (없으면 NULL)

ALTER TABLE view_records
  ADD COLUMN plane_match boolean NOT NULL DEFAULT false;  -- 앵커로 고정된 프레임을 탭했는지
```

- 두 앵커 컬럼은 서버가 내용을 검증하지 않고 저장만 한다(네이티브 PRD RISK-N06). 형식 검사는 route에서 한다: `cloud_anchor_id`는 1~128자의 영문·숫자·`-`·`_`, `geo_pose`는 일곱 값이 모두 유한한 숫자이고 `lat`·`lng`가 범위 안.
- `geo_pose`의 값은 조회 조건으로 쓰지 않는다. 주변 조회와 거리 판정은 계속 `capsules.lat`·`lng`(프레임 GPS 좌표)로 한다. 그래서 인덱스를 더하지 않는다.
- 클라우드 앵커 만료 시각 컬럼은 두지 않는다. N1은 브론즈만이고 앵커 보관을 PRM-06 이상으로 요청하므로 캡슐 `expires_at`보다 먼저 사라지지 않는다. 실버·마스터 도입 때(네이티브 PRD NQ-05) 추가한다(P-02).
- 세션 테이블은 바뀌지 않는다. 앱은 같은 세션 토큰을 `Authorization` 헤더로 보낼 뿐이다(FR-N01).

---

### 1.7 캡슐 크기 (마이그레이션 003)

`13-capsule-dev-plan.md` FR-X06에 필요한 컬럼 하나만 더한다. 이 절이 `backend/db/migrations/003_capsule_size.sql`의 원본이다.

| 테이블 | 컬럼 | 타입 | 제약 | 근거 ID |
|---|---|---|---|---|
| capsules | size_m | real | NOT NULL, DEFAULT `0.4`, CHECK `size_m BETWEEN 0.1 AND 2.0` | FR-X06, XP-01·XP-02. AR에 그리는 사진의 긴 변 길이(m). 웹에서 드롭한 캡슐과 기존 행은 기본값 |

```sql
-- 003_capsule_size.sql
ALTER TABLE capsules
  ADD COLUMN size_m real NOT NULL DEFAULT 0.4
    CONSTRAINT capsules_size_m_check CHECK (size_m BETWEEN 0.1 AND 2.0);  -- 사진 긴 변 길이(m)
```

- 회전은 컬럼을 더하지 않는다. `capsules.heading`(0~359)이 이미 프레임 앞면의 방위다(FR-X07).
- 가로세로 비율은 저장하지 않는다. 앱이 내려받은 썸네일의 비율로 그린다.
- 유료 열람(`view_price`, 결제 기록)과 등급 CHECK 넓히기는 여기에 넣지 않는다. 실결제(N3)와 함께 2장 개념 ERD를 물리 설계로 옮길 때 추가한다(`13-capsule-dev-plan.md` 17.4, DQ-10).

---

## 2. 후속 단계 개념 ERD

도메인 정의서 5장 애그리거트(INV-01~10) 기준의 **개념 모델**이다. 엔티티와 관계, 키와 핵심 속성 몇 개만 적었고, **실제 테이블·컬럼·타입·인덱스 설계는 하지 않는다.** 실제 설계는 해당 FR을 구현할 때(FR-12, 네이티브 전환 Q-01) 별도로 한다(P-02).

```mermaid
erDiagram
  USER ||--o{ DEVICE : "사용"
  USER ||--o{ CAPSULE : "소유"
  CAPSULE }o--o{ USER : "수신자 recipientIds"
  CAPSULE ||--o{ INVITATION : "초대 링크"
  USER |o--o{ INVITATION : "사용 redeemedBy"
  USER ||--o{ PRESENCE_PROOF : "발급"
  CAPSULE ||--o{ PRESENCE_PROOF : "대상"
  USER ||--o{ PURCHASE : "결제"
  CAPSULE ||--o{ PURCHASE : "refId"
  PURCHASE ||--o| ENTITLEMENT : "부여"
  USER ||--o{ ENTITLEMENT : "보유"
  CAPSULE ||--o{ ENTITLEMENT : "대상"
  USER ||--o{ VIEW_RECORD : "열람"
  CAPSULE ||--o{ VIEW_RECORD : "열람됨"
  PRESENCE_PROOF ||--o| VIEW_RECORD : "증명"
  USER ||--|| WALLET : "보유"
  WALLET ||--o{ LEDGER_ENTRY : "원장"
  USER ||--o{ SETTLEMENT : "신청"
  CAPSULE ||--o| MODERATION_CASE : "검토"
  MODERATION_CASE ||--o{ REPORT : "신고"
  USER ||--o{ REPORT : "신고자"

  USER {
    uuid userId PK
    date birthDate "INV-01"
    text status "ACTIVE BANNED WITHDRAWN"
  }
  DEVICE {
    text deviceIdHash PK "PRV-02, PRV-04"
    uuid userId FK
  }
  CAPSULE {
    uuid capsuleId PK
    uuid ownerId FK
    text grade "INV-02, 5.1"
    text visibility "PUBLIC PRIVATE"
    int viewPrice "null 또는 5.2"
    text status
    timestamptz expiresAt "마스터는 null"
  }
  INVITATION {
    uuid invitationId PK
    uuid capsuleId FK
    text token "1회용, PRM-15"
    uuid redeemedBy FK
  }
  PRESENCE_PROOF {
    uuid proofId PK
    uuid userId FK
    uuid capsuleId FK
    text action "DROP PURCHASE OPEN"
    text verdict "VERIFIED SUSPICIOUS"
  }
  PURCHASE {
    uuid purchaseId PK
    uuid userId FK
    uuid refId FK "capsuleId"
    text type "DROP_FEE VIEW_ACCESS"
    text storeTransactionId UK "INV-04, NFR-03"
    text status "PENDING VERIFIED FAILED REFUNDED"
  }
  ENTITLEMENT {
    uuid userId FK
    uuid capsuleId FK
    uuid purchaseId FK
    timestamptz revokedAt
  }
  VIEW_RECORD {
    uuid capsuleId FK
    uuid viewerId FK
    uuid presenceProofId FK
    bool rewarded "INV-06"
  }
  WALLET {
    uuid userId PK
    int freeBalance
    int earnedBalance
    int heldBalance
    int lockedBalance
    int receivable
  }
  LEDGER_ENTRY {
    uuid userId FK
    text type
    int amount
    uuid refId
  }
  SETTLEMENT {
    uuid settlementId PK
    uuid userId FK
    text period "YYYY-MM, 사용자당 월 1건"
    text status "REQUESTED APPROVED REJECTED PAID"
  }
  MODERATION_CASE {
    uuid capsuleId FK
    text state "OPEN UNDER_REVIEW DISMISSED BLINDED REMOVED"
  }
  REPORT {
    uuid capsuleId FK
    uuid reporterId FK "캡슐당 1인 1회, INV-09"
    text reason "BR-41"
  }
```

MVP 테이블에서의 확장 방향:

- `capsules`에 `visibility`·`view_price`가 붙고, `grade`·`status` CHECK가 5.1 등급과 6장 상태(UNDER_REVIEW, BLINDED, REMOVED 등)로 넓어진다. Expired를 지금처럼 `expires_at`으로 판정할지 상태로 둘지는 열람권 종료·검토 사건 처리(INV-05, 6.2)와 함께 그때 정한다.
- `view_records`에 PresenceProof를 가리키는 FK와 deviceId·rewarded가 붙는다. `users`에는 생년월일·상태·기기·동의가 붙고, 결제·지갑·정산·신고·초대는 새 엔티티로 추가된다.

---

## 3. 결정 내역

v0.1의 확인 필요 8건을 아래와 같이 결정했다.

| # | 항목 | 결정 | 반영 위치 |
|---|---|---|---|
| E1 | 로그인 실패 잠금(M-05) 저장 위치 | `users` 컬럼(`failed_login_count`, `locked_until`) 삭제. Express 프로세스 메모리 `Map`(키: 소문자 이메일, 가입 여부와 무관하게 똑같이 셈)으로 처리해 미가입 이메일도 같은 조건에서 429(계정 존재 여부 비노출, FR-01). 단일 EC2 인스턴스 전제, 재시작 시 초기화 수용 | 1장 다이어그램, 1.1, PRD FR-01, 원칙 5.2 |
| E2 | `view_records` 증명 ID 컬럼 | MVP에 두지 않음(P-02). 현장 증명 도입 시 추가 | 1장 다이어그램, 1.4, 2장, PRD FR-10, 시나리오 SC-05, 원칙 3.2 |
| E3 | 소유자·뷰어 FK 이름 | `user_id`로 통일(원칙 3.2), 컬럼 주석으로 소유자/뷰어 의미 표기 — 확정 | 1.3, 1.4 |
| E4 | 마이그레이션 이력 테이블 | `schema_migrations(filename text PK, applied_at timestamptz NOT NULL DEFAULT now())`. 1장 다이어그램에는 넣지 않음 | 1.5, 원칙 3.2·5.3 |
| E5 | 필수 동의 증빙 | `users.terms_version text NOT NULL`(동의한 약관 버전) 추가, 동의 시각은 `created_at`. 위치정보 동의 증빙에 필요한 최소 정보 | 1장 다이어그램, 1.1, PRD FR-01 |
| E6 | 이메일 대소문자 | 앱에서 소문자로 정규화해 저장, UNIQUE는 그 값에 — 확정 | 1.1 |
| E7 | 만료 세션 정리 | 배치 없이 로그인 성공 시 `DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()`. 세션 조회는 항상 `expires_at > now()` 조건 | 1.2, 원칙 5.2 |
| E8 | 시나리오 SC-06 만료 표현 | "Expired가 된다" → "만료 시각(`expires_at`)이 지나면 조회·열람에서 제외된다(상태값 갱신 없음)" | 시나리오 SC-06 |
| E9 | Geospatial 포즈 저장 형태 (v0.5) | 컬럼 일곱 개 대신 `jsonb` 한 컬럼. 서버가 계산·조회에 쓰지 않고 앱에 그대로 돌려주는 값이다 | 1.6 |
| E10 | `cloud_anchor_id` NULL 허용 (v0.5) | 허용한다. 웹 캡슐과의 호환(네이티브 PRD NQ-09) 때문이며, 앵커 없이는 게시하지 않는 규칙(NQ-04)은 앱이 지킨다 | 1.6, 네이티브 PRD FR-N06 |
| E11 | `schema.sql` (v0.5) | 바꾸지 않는다. `001_init.sql`과 바이트 단위로 같아야 하는 테스트가 있다. `002`의 원본은 1.6이다 | 1.6, `8-plan.md` DB-03 |
| E12 | N1.5(3D 캡슐 연출)의 스키마 (v0.6) | 변경 없음. 원본 기획의 `capsules.model_kind`는 값이 하나뿐이라 넣지 않고(P-02), 사용자가 모델을 고르는 상점 단계에서 CHECK와 함께 추가한다. `opened`는 저장하지 않고 조회 때 계산한다 | 1.4, `13-capsule-dev-plan.md` 8장·CQ-05 |
| E13 | 캡슐 크기 저장 (v0.7) | `size_m` 한 컬럼. 회전은 `heading` 재사용, 비율은 썸네일에서 얻는다. 결제·등급 관련 컬럼은 값이 쓰이는 N3에 추가한다(P-02) | 1.7, `13-capsule-dev-plan.md` 17.4 |
