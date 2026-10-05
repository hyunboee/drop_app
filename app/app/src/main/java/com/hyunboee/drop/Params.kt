package com.hyunboee.drop

// 앱이 쓰는 PRM·M·NP 수치는 이 파일에만 둔다 (원칙 P-05). 이름 앞에 문서의 ID를 붙인다.

// M-10 비밀번호 최소 길이
const val M_10_PASSWORD_MIN_LENGTH = 8

// 구글 로그인: 서버가 ID 토큰을 확인할 웹 클라이언트 ID (구글 클라우드 "Drop server (Google sign-in)")
const val GOOGLE_WEB_CLIENT_ID = "1017224651327-ove88h8gmfp6svjqid64nr99b0nahdof.apps.googleusercontent.com"

// M-07 썸네일 긴 변(px)
const val M_07_THUMB_LONG_SIDE_PX = 320

// M-11 캡슐 제목 최대 길이
const val M_11_TITLE_MAX_LENGTH = 40

// NP-08 홈 화면 "곧 만료" 기준: 남은 날이 이 값 이하
const val NP_08_EXPIRING_SOON_DAYS = 7

// NP-09 홈 화면 미리 보기 개수: 내가 남긴 캡슐, 보관함
const val NP_09_HOME_MINE_PREVIEW = 2
const val NP_09_HOME_ARCHIVE_PREVIEW = 3

// NP-10 내 캡슐 지도를 열었을 때 현재 위치 둘레로 보이는 반경(m)
const val NP_10_MAP_START_RADIUS_M = 100.0

// NP-11 AR 길찾기에서 "도착"으로 보는 거리(m). 열람 반경 PRM-01과 같은 값
const val NP_11_NAV_ARRIVE_M = 10.0

// NP-13 AR로 캡슐 자리를 찾은 뒤의 "도착" 거리(m). GPS가 아니라 AR 위치라 훨씬 정확하다
const val NP_13_NAV_ANCHOR_ARRIVE_M = 2.0f

// NP-14 이 거리(m) 안에서는 "캡슐이 있던 곳을 비춰 보세요"를 안내한다 (NP-02와 같은 값)
const val NP_14_NAV_SCAN_HINT_M = 30.0

// NP-15 로그인 인트로 영상: 이 시간(ms)이 지나면 영상이 점점 투명해지며 홈이 드러나고, 투명해지는 데 걸리는 시간(ms)
const val NP_15_INTRO_FADE_START_MS = 2000L
const val NP_15_INTRO_FADE_MS = 1500L

// NP-07 동시에 자리를 찾는 클라우드 앵커 수 (가까운 순서)
const val NP_07_MAX_RESOLVING = 30

// NP-02 앵커 자리를 찾기 시작하는 반경(m): 캡슐의 GPS 좌표에서 이 거리 안일 때만 구글에 찾기를 요청한다 (할당량 절약)
const val NP_02_RESOLVE_RANGE_M = 30.0

// NP-04 자리를 저장하기 전에 스캔 품질이 "충분"해지기를 기다리는 최대 시간(ms). 넘으면 그대로 시도한다
const val NP_04_SCAN_WAIT_MS = 20_000L

// NP-05 자리 저장(host) 한 번의 제한 시간(ms)
const val NP_05_HOST_TIMEOUT_MS = 60_000L

// NP-12 AR 화면이 주변 서버 캡슐을 다시 받는 주기(ms)
const val NP_12_NEARBY_REFRESH_MS = 15_000L
