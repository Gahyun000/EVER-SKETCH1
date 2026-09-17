#!/bin/bash
# **표준 이름의 실행기**(2026-09-17).
#
# 유니에버 에이전트대장 §2 는 모든 폴더에 `start.command`·`stop.command`·
# `start.bat`·`stop.bat` 네 이름을 요구한다. 이 저장소에는 `run.command` 하나뿐이라
# 대장의 자동 점검이 이 프로젝트를 「런처 없음」으로 본다.
#
# **하던 일을 옮겨 오지 않았다.** 기동 절차는 그대로 `run.command` 에 있고 여기서는
# 부르기만 한다 — 같은 절차를 두 벌 적으면 한쪽만 고쳐지는 날이 반드시 온다.
# 포트도 여기 안 적는다. 정본은 `ports.json` 이다.
cd "$(dirname "$0")"
exec ./run.command "$@"
