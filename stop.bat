@echo off
setlocal enableextensions
rem **세운다 (Windows)** — 대장 §2 가 요구하는 네 이름 중 하나.
rem
rem 포트만 보고 죽이지 않는다. 명령줄에 server.app:app 이 들어간 우리 uvicorn 만 고른다 —
rem 8808 을 누가 먼저 물고 있을 때 그걸 죽이는 건 우리가 할 일이 아니다.
rem EVER-FOLIO(8811)는 건드리지 않는다. 다른 데서 먼저 띄워 두었을 수 있다.
cd /d "%~dp0"

for /f "delims=" %%p in ('node -p "require('./ports.json').backend"') do set "PORT=%%p"
if not defined PORT set "PORT=8808"

rem wmic 은 최신 윈도우에서 빠졌고 CSV 파싱도 환경마다 다르다. powershell 로 간다.
powershell -NoProfile -Command ^
  "$p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn*server.app:app*' };" ^
  "if ($p) { $p | ForEach-Object { Write-Host ('. 세웁니다: PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force } }" ^
  "else { Write-Host '. 이미 서 있습니다 (uvicorn server.app:app 없음)' }"

rem 정말 내려갔는지 확인하고 말한다. 「세웠습니다」만 찍고 살아 있는 세우기가 제일 나쁘다.
timeout /t 1 >nul
netstat -ano | findstr LISTENING | findstr ":%PORT% " >nul 2>&1 && (
  echo [!] %PORT% 이^(가^) 아직 열려 있습니다. 이 폴더가 안 띄운 다른 서버일 수 있습니다.
  endlocal & exit /b 1
)
echo . %PORT% 내려갔습니다. ^(EVER-FOLIO 8811 은 건드리지 않았습니다^)
endlocal
