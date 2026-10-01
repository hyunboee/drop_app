# Drop 기술 아키텍처 다이어그램

> 출처: `1-domain-definition.md`(도메인 정의서 v0.7), `2-PRD.md`(PRD v0.7), `3-user-scenario.md`(시나리오 v0.3), `4-wireframes.md`(와이어프레임 v0.3), `5-project-principle.md`(프로젝트 원칙 v0.3). MVP(PRD 3.1) 기준이며, 수치는 PRM-xx(도메인 정의서 5.3)·M-xx(PRD 4.1) ID로만 참조한다.

## 변경 이력

| 버전 | 일자 | 변경자 | 변경내용 |
|---|---|---|---|
| 0.1 | 2026-10-01 | Claude Code | 초안 작성 |
| 0.2 | 2026-10-01 | Claude Code | 확인 필요 결정 반영: PostgreSQL을 RDS 단일 인스턴스로 표기, 열람 확인 순서 확정, 열람 기록의 증명 ID 컬럼 제거, 4장을 결정 내역으로 변경 |

---

## 1. 시스템 아키텍처 (메인)

EC2 한 대의 Express가 API와 프론트 빌드 결과(`dist`)를 같은 출처로 서빙하고, 앞단 Cloudflare 프록시가 HTTPS를 맡는다. 업로드만 브라우저가 S3로 직접 보내고, 미디어 읽기는 Express가 프록시한다. 열람·검열·만료 판정은 모두 서버에서 한다.
근거: PRD 6장, NFR-05~08, FR-01, FR-04, FR-06, FR-10, 원칙 2.1·5.2

```mermaid
flowchart LR
  subgraph phone["사용자 스마트폰 (iOS Safari, Android Chrome)"]
    app["브라우저 앱<br/>React 19 + A-Frame/AR.js<br/>카메라·GPS·방향 센서"]
    cache[("브라우저 HTTP 캐시")]
  end

  cf["Cloudflare 프록시<br/>HTTPS, Origin Certificate (Full strict)<br/>CDN 캐시 미사용 (Q-08)"]

  subgraph aws["AWS (같은 리전)"]
    subgraph ec2["EC2 단일 인스턴스 (인스턴스 역할)"]
      express["Express 5<br/>/api + 프론트 dist 정적 서빙<br/>routes → services → repositories"]
    end
    pg[("RDS for PostgreSQL 17 단일 인스턴스<br/>자동 백업, 같은 VPC 비공개 서브넷, 외부 접근 없음<br/>users, sessions, capsules, view_records<br/>위도·경도 B-tree 인덱스")]
    s3[("S3 비공개 버킷<br/>media/{mediaId}.jpg, .thumb.jpg<br/>수명 주기: pending 태그 M-08 뒤 삭제")]
    rek["Rekognition<br/>DetectModerationLabels"]
  end

  app -->|"같은 출처 HTTPS, HttpOnly 세션 쿠키 (FR-01)"| cf
  cf -->|"HTTPS"| express
  app -->|"Presigned PUT 직접 업로드 (M-03)<br/>If-None-Match: *, status=pending 태그"| s3
  app <-->|"미디어 재열람 시 캐시 사용 (NFR-05)"| cache
  express -->|"pg Pool, $1 바인딩<br/>범위 박스 + SQL 거리 계산 (NFR-04)"| pg
  express -->|"HeadObject, 태그 제거, DeleteObject<br/>GetObject 스트림 → /api/media/:mediaId"| s3
  express -->|"원본·썸네일 동기 검열 (M-09, M-14)"| rek
  rek -->|"S3 객체 직접 참조"| s3
```

- Express 응답 중 미디어(`/api/media/:mediaId`, `/thumb`)는 `Cache-Control: private, max-age=31536000, immutable`이라 Cloudflare는 저장하지 않고 브라우저만 저장한다 (NFR-05, NFR-06).
- 브라우저에는 S3 읽기 URL을 주지 않는다. AWS 자격 증명은 EC2 인스턴스 역할로만 받는다 (원칙 5.1, 5.2).
- PostgreSQL은 AWS RDS for PostgreSQL 17 단일 인스턴스로, EC2와 같은 VPC의 비공개 서브넷에 두고 외부 접근을 막는다. 백업은 관리형 자동 백업을 쓴다 (4장 A4).

---

## 2. 복잡한 로직 다이어그램

### 2.1 캡슐 드롭: 업로드·검열·게시

캡슐 행은 원본·썸네일이 모두 검열을 통과한 뒤에만 만든다. 게시 전 실패는 행을 남기지 않고, 버려진 업로드 객체는 S3 수명 주기 규칙이 정리한다. 처리 순서는 "태그 제거 → 행 생성"이다(행은 있는데 객체가 지워지는 일 방지). 브라우저→Express 구간은 Cloudflare를 거치지만 그림에서는 생략한다.
근거: FR-03, FR-04, FR-06, FR-07, BR-10, BR-33, M-03, M-06~09, M-11, M-13, M-14, PRM-03, PRM-06, 원칙 5.2

```mermaid
sequenceDiagram
  autonumber
  participant B as 브라우저 앱
  participant E as Express
  participant S as S3
  participant R as Rekognition
  participant D as PostgreSQL

  Note over B: 드롭 선택 시 GPS·accuracy·heading 캡처 (FR-03)<br/>Canvas JPEG 재인코딩 M-13, 썸네일 M-07, 사전 검사 M-06
  B->>E: POST /api/uploads
  E-->>B: mediaId(UUID), 원본·썸네일 Presigned PUT URL (M-03)
  B->>S: PUT 원본, 썸네일 (If-None-Match: *, status=pending)
  alt 네트워크 실패
    B->>E: POST /api/uploads 재요청 후 같은 사진으로 재시도
  else 같은 키 두 번째 PUT
    S-->>B: 412 (덮어쓰기 차단)
  end
  B->>E: POST /api/capsules (앵커, 제목, mediaId, 등급)
  Note over E: 입력 검증: 제목 M-11, 브론즈 외 400,<br/>accuracy가 PRM-03 재측정 기준보다 나쁘면 422
  E->>S: HeadObject 원본·썸네일 (크기·형식 재확인, 위반 시 400)
  E->>R: DetectModerationLabels 원본·썸네일 (제한 시간 M-09, 기준 M-14)
  alt 하나라도 거부
    E->>S: DeleteObject 원본·썸네일
    E-->>B: 422 MODERATION_REJECTED (캡슐 행 없음)
  else Rekognition 실패 또는 M-09 초과
    E-->>B: 503 MODERATION_UNAVAILABLE (객체 유지, 같은 mediaId로 재요청)
  else 둘 다 통과
    E->>S: pending 태그 제거 (원본·썸네일)
    E->>D: INSERT capsules (ACTIVE, expires_at = now() + PRM-06)
    E-->>B: 201 expires_at (W-10 완료 안내)
  end
  Note over S: 게시되지 않은 pending 객체는 수명 주기 규칙이 M-08 뒤 삭제
```

### 2.2 캡슐 열람: 서버 판정

열람 요청마다 서버가 캡슐 상태·만료와 GPS 거리 판정을 다시 하고, 통과한 경우에만 열람 기록을 남기고 원본 경로를 돌려준다. MVP는 별도 현장 증명을 발급하지 않고 GPS 판정만 한다(Q-11). 확인 순서는 401 → 404 → 422 → 403으로 확정했다(존재하지 않는 캡슐에 정확도 안내를 먼저 하지 않음, 4장 A5).
근거: FR-10, BR-27, 도메인 5.4, NFR-08, PRM-01, PRM-03, Q-03, Q-11, PRV-04, 원칙 3.3

```mermaid
flowchart TD
  req["POST /api/capsules/:id/open<br/>lat, lng, accuracy"] --> auth{"세션 쿠키 유효?"}
  auth -->|"아니오"| e401["401 AUTH_REQUIRED"]
  auth -->|"예"| found{"status = ACTIVE<br/>그리고 expires_at > now()?"}
  found -->|"아니오"| e404["404 CAPSULE_NOT_FOUND<br/>클라이언트: 안내 후 주변 재조회"]
  found -->|"예"| acc{"accuracy ≤ 재측정 기준 PRM-03?"}
  acc -->|"아니오"| e422["422 LOW_ACCURACY<br/>판정하지 않고 재측정 안내"]
  acc -->|"예"| dist["d = 뷰어 좌표와 캡슐 좌표의 거리"]
  dist --> judge{"d − min(accuracy, 보정 상한 PRM-03)<br/>≤ 열람 반경 PRM-01?"}
  judge -->|"아니오"| e403["403 OUT_OF_RANGE<br/>remaining_m 포함"]
  judge -->|"예"| rec["INSERT view_records<br/>뷰어 좌표, accuracy, ip_hash (HMAC-SHA256)"]
  rec --> ok["200 원본 경로 /api/media/:mediaId"]
```

### 2.3 미디어 프록시: 권한 확인

원본은 2.2 판정을 통과해 열람 기록이 있는 뷰어나 소유자만 받는다. Express가 인스턴스 역할로 S3 GetObject 스트림을 그대로 흘려보내고, URL이 영구히 같아 재열람은 브라우저 캐시에서 끝난다.
근거: FR-08, FR-10, NFR-05, NFR-06, NFR-08, 원칙 2.1·5.2

```mermaid
flowchart TD
  req["GET /api/media/:mediaId<br/>또는 /api/media/:mediaId/thumb"] --> auth{"세션 쿠키 유효?"}
  auth -->|"아니오"| e401["401 AUTH_REQUIRED"]
  auth -->|"예"| cap{"mediaId의 캡슐이<br/>ACTIVE이고 미만료?"}
  cap -->|"아니오"| e404["404 CAPSULE_NOT_FOUND"]
  cap -->|"예"| kind{"요청 종류"}
  kind -->|"썸네일"| stream
  kind -->|"원본"| perm{"이 뷰어의 view_records 존재<br/>또는 소유자?"}
  perm -->|"아니오"| e403["403"]
  perm -->|"예"| stream["S3 GetObject 스트림 응답<br/>Cache-Control: private, max-age=31536000, immutable"]
```

---

## 3. 후속 단계에서 추가될 구성 요소

메인 다이어그램에는 넣지 않는다 (PRD 3.2, FR-12).

- Unity/ARCore 네이티브 앱: 평면 스캔, 기기 무결성, 전체 현장 증명 판정 (Q-01, Q-02, Q-11, 도메인 5.4)
- App Store / Google Play 인앱결제와 스토어 서버 알림(환불) (BR-07~09, IAP-01~07)
- 보상형 광고 SDK, 송금(정산 출금), 본인인증 (PRM-10, ST-07, ST-09)
- 푸시(FCM/APNs)와 지오펜싱 (BR-25)
- 지도 (BR-26, Q-06)
- Cloudflare CDN 캐시 (Q-08), Rekognition 비동기 영상 검열 (FR-05, Q-09)
- 관리자 화면(신고 검토·블라인드·정산 승인·차단) (BR-34~37)

---

## 4. 결정 내역

v0.1의 확인 필요 3건과 추가 쟁점 2건을 아래와 같이 결정했다.

| # | 항목 | 결정 | 반영 위치 |
|---|---|---|---|
| A1 | 3D 프레임 에셋 위치 | S3가 아니라 `frontend/public/`의 정적 파일로 Express가 같은 출처로 서빙(원칙 6.3 따름). S3에는 사진 원본·썸네일만 둠 | PRD 6장 미디어 행 |
| A2 | 열람 기록 IP 표기 | 시나리오 SC-05의 "IP"를 "IP 해시(HMAC)"로 수정 | 시나리오 SC-05 |
| A3 | 비용 지표 | "같은 뷰어가 같은 미디어를 다시 열람할 때 미디어 프록시(`/api/media`) 재다운로드 비율" | PRD 1.3 |
| A4 | PostgreSQL 위치 | AWS RDS for PostgreSQL 17 단일 인스턴스(관리형 자동 백업, EC2와 같은 VPC의 비공개 서브넷, 외부 접근 없음). 1인 운영에서 백업·패치를 직접 하지 않기 위함 | 1장 다이어그램, PRD 6장 배포 행, 원칙 5.2 |
| A5 | 열람 판정 확인 순서 | 401 → 404 → 422 → 403 확정(존재하지 않는 캡슐에 정확도 안내를 먼저 하지 않음) | 2.2, 원칙 5.2 |
