@echo off
setlocal enableextensions
rem ebook_html 원클릭 실행 (Windows) — 프론트 빌드 + 백엔드(FastAPI) 기동, 브라우저 자동 오픈
rem  + EVER-FOLIO(uniever_ebook 이북 라이브러리 · 8811) 있으면 같이 기동
rem  동작은 macOS run.command 와 동일. 자동열기 끄기: set AUTO_OPEN=0

cd /d "%~dp0"
echo == ebook_html 준비 중... ==

rem 1) 프론트엔드 의존성 + 빌드
echo . npm install (의존성 확인/설치)
call npm install || goto :err
echo . 프론트엔드 빌드
call npm run build || goto :err

rem 2) 백엔드 가상환경 + 의존성
if not exist "server\.venv" (
  echo . python 가상환경 생성 (최초 1회)
  where py >nul 2>&1 && ( py -3 -m venv server\.venv ) || ( python -m venv server\.venv )
)
call "server\.venv\Scripts\activate.bat" || goto :err
python -m pip install -q --upgrade pip
python -m pip install -q fastapi "uvicorn[standard]" pillow python-docx beautifulsoup4 pymupdf python-multipart || goto :err

rem 2.5) EVER-FOLIO (8811) — 형제 앱, 있으면 별도 창으로 기동
set "FOLIO_PORT=8811"
set "FOLIO_DIR=..\uniever_ebook\ebook-generator"
if exist "%FOLIO_DIR%\serve.py" (
  netstat -ano | findstr LISTENING | findstr ":%FOLIO_PORT% " >nul 2>&1 && (
    echo . EVER-FOLIO 이미 실행 중 ^(%FOLIO_PORT%^)
  ) || (
    echo . EVER-FOLIO 기동 ^(uniever_ebook 라이브러리 · %FOLIO_PORT%^)
    start "EVER-FOLIO" cmd /c "cd /d %FOLIO_DIR% && (if not exist .venv python -m venv .venv) && call .venv\Scripts\activate.bat && python -m pip install -q --upgrade pip pillow && set EBOOK_PORT=%FOLIO_PORT% && python serve.py"
  )
) else (
  echo . ^(EVER-FOLIO 폴더를 못 찾아 건너뜀 — ..\uniever_ebook\ebook-generator^)
)

rem 3) 서버 실행 (프론트 dist + /api 동시 서빙) — 기본 포트 8820
if not defined PORT set "PORT=8820"
rem 바인딩 주소 - 기본 0.0.0.0(같은 망의 다른 PC에서 접속 가능). 내 PC 전용: set HOST=127.0.0.1
if not defined HOST set "HOST=0.0.0.0"
set "URL=http://127.0.0.1:%PORT%"
netstat -ano | findstr LISTENING | findstr ":%PORT% " >nul 2>&1 && (
  echo [!] 포트 %PORT% 이^(가^) 이미 사용 중입니다. 기존 프로세스를 종료하거나 다른 포트로 실행하세요.  예: set PORT=8830 ^&^& run.cmd
  goto :end
)
echo == 서버 시작: %URL%   ^(EVER-FOLIO: http://127.0.0.1:%FOLIO_PORT%^) ==
echo    로그는 이 창에 출력됩니다.  종료: 이 창에서 Ctrl+C
if not "%AUTO_OPEN%"=="0" start "" cmd /c "timeout /t 2 >nul & start "" %URL%"
python -m uvicorn server.app:app --host %HOST% --port %PORT%
goto :end

:err
echo.
echo [X] 준비 단계에서 오류가 발생했습니다. 위 로그를 확인하세요.
endlocal & exit /b 1

:end
endlocal
