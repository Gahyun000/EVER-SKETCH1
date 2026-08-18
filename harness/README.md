# harness — 하네스 계약/정책/검증 (UDS-111 / UDS-110)

이 프로젝트는 T1+ 자동화(문서→BookPlan 생성, 자기검증, 대화형 부분수정)를 포함하므로
하네스 계약을 이 트리에 정본으로 둔다. 실제 실행 로직은 `server/`(chat/intent/deck, /api/plan 등)에 있으며,
여기에는 입력·출력 계약, 정책(허용도구·예산·반복한도), 검증기 규칙, 체크포인트/텔레메트리 설계를 기록한다.

- contracts/ policies/ tools/ workflows/ validators/ checkpoints/ telemetry/ fixtures/

설계 문서: `docs/기술문서/개발기법선정서.md`, `docs/기술문서/하네스설계서.md`
하네스 테스트: `tests/harness/`
