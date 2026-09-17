@echo off
rem **표준 이름의 실행기 (Windows)** — 대장 §2 가 요구하는 네 이름 중 하나.
rem 기동 절차는 run.cmd 에 그대로 있고 여기서는 부르기만 한다.
rem 같은 절차를 두 벌 적으면 한쪽만 고쳐지는 날이 반드시 온다.
rem 포트도 여기 안 적는다 — 정본은 ports.json 이다.
cd /d "%~dp0"
call run.cmd %*
