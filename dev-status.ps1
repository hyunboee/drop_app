# Drop 개발 환경 상태 확인: 서버, 터널(밖 앱), 폰 연결(집 앱)
$root = $PSScriptRoot

function Check($name, [scriptblock]$test, $hint) {
    try { $ok = & $test } catch { $ok = $false }
    if ($ok) { Write-Host "[정상] $name" -ForegroundColor Green }
    else { Write-Host "[꺼짐] $name" -ForegroundColor Red; Write-Host "       -> $hint" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "=== Drop 상태 확인 ===" -ForegroundColor Cyan

# 서버: 집 앱과 밖 앱이 모두 이 서버를 쓴다
Check "서버 (이 PC, 3000번 포트)" { (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/api/health' -TimeoutSec 4).StatusCode -eq 200 } "dev-server.bat을 더블클릭하세요"

# 터널: 밖 앱이 인터넷으로 서버에 닿는 길
$log = Join-Path (Join-Path $root '.tools') 'tunnel.log'
$url = $null
if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
    if ($m) { $url = $m.Matches[0].Value }
}
if ($url) {
    Check "터널 (밖 앱) $url" { (Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 10).StatusCode -eq 200 } "cloudflared 창이 닫혔거나 인터넷이 끊겼어요. 터널을 다시 켜면 주소가 바뀌어 밖 앱을 새로 만들어야 하니 Claude에게 말해 주세요"
} else {
    Write-Host "[알 수 없음] 터널 주소 기록(.tools 폴더의 tunnel.log)이 없어요" -ForegroundColor Yellow
}

# 폰: 집 앱은 무선 디버깅 + 포트 연결로 서버에 붙는다
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (Test-Path $adb) {
    Check "폰 연결 (무선 디버깅, 집 앱)" { $null -ne (& $adb devices | Select-String '\sdevice$') } "dev-connect.bat을 더블클릭하세요"
    Check "폰 -> 서버 포트 연결 (집 앱)" { $null -ne (& $adb reverse --list | Select-String 'tcp:3000') } "dev-connect.bat을 더블클릭하세요"
}

# 밖 앱 업데이트로 올려 둔 버전
try {
    $v = Invoke-RestMethod 'http://127.0.0.1:3000/api/app/latest' -TimeoutSec 4
    Write-Host "[정보] 밖 앱 업데이트로 올려 둔 버전: v$($v.version_name) (code $($v.version_code))" -ForegroundColor Cyan
} catch {}

Write-Host ""
