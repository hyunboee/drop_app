@echo off
chcp 65001 >nul
setlocal
rem Drop 개발용: 폰(무선 디버깅)과 PC 서버 연결을 한 번에 복구한다. 연결이 끊겼을 때 더블클릭.
rem 1) 폰 연결 확인(없으면 adb를 다시 시작)  2) 서버 포트 연결(adb reverse)  3) 서버가 꺼져 있으면 켠다

set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB%" (
  echo [오류] adb를 찾을 수 없어요: %ADB%
  pause
  exit /b 1
)

echo.
echo [1/3] 폰 연결 확인...
"%ADB%" devices | findstr /R /C:"	device$" >nul
if errorlevel 1 (
  echo       폰이 안 보여요. adb를 다시 시작해요...
  "%ADB%" kill-server >nul 2>&1
  "%ADB%" start-server >nul 2>&1
  timeout /t 6 /nobreak >nul
  "%ADB%" devices | findstr /R /C:"	device$" >nul
  if errorlevel 1 (
    echo.
    echo [실패] 폰이 연결되지 않았어요. 아래를 확인해 주세요.
    echo        - 폰: 설정 ^> 개발자 옵션 ^> 무선 디버깅이 켜져 있는지
    echo        - 폰과 PC가 같은 Wi-Fi인지
    echo        - 그래도 안 되면 무선 디버깅 화면에서 "페어링 코드로 기기 페어링"을 다시 해 주세요.
    pause
    exit /b 1
  )
)
echo       폰 연결됨.

echo [2/3] 서버 포트 연결...
"%ADB%" reverse tcp:3000 tcp:3000 >nul
if errorlevel 1 (
  echo [실패] 포트 연결에 실패했어요.
  pause
  exit /b 1
)
echo       연결됨.

echo [3/3] 서버 확인...
curl -s -m 3 -o nul http://127.0.0.1:3000/api/health
if errorlevel 1 (
  echo       서버가 꺼져 있어요. 새 창에서 켜요...
  start "Drop 서버 (이 창을 닫으면 서버가 꺼져요)" cmd /k "cd /d %~dp0backend && set DEV_LOCAL_MEDIA=1&& npm start"
  timeout /t 8 /nobreak >nul
  curl -s -m 3 -o nul http://127.0.0.1:3000/api/health
  if errorlevel 1 (
    echo [실패] 서버가 켜지지 않았어요. "Drop 서버" 창의 오류를 확인해 주세요.
    pause
    exit /b 1
  )
)
echo       서버 정상.

echo.
echo [완료] 폰에서 앱을 다시 열어 보세요.
timeout /t 5 >nul
