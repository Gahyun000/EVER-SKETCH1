# EVER-SKETCH — 월간 임원회의 자료 협업 플랫폼

월 1회 임원회의 자료를 **파일로 주고받는 일**에서 **링크 하나 위에서 같이 고치는 일**로 바꾼다.
임원 각자에게 표준 템플릿 1장이 부여되고, 그 자리에서 고치고, 관리자가 메모로 피드백하고, 작성자가 즉시 반영한다.

- 기획 문서: `docs/EVER-SKETCH_기획의도_설계사상_v0.3_20260819.html`
- 출발점: `ebook_html` 통째 복사(2026-08-18, W0). 편집기·표 편집·버전관리·내보내기는 이미 동작한다.
- 이번에 새로 만드는 것: **사람 · 권한 · 회차** 계층

## 실행

```bash
npm install
npm run dev              # 프런트(Vite)

python3 -m venv server/.venv
server/.venv/bin/pip install fastapi uvicorn python-multipart
server/.venv/bin/python -m uvicorn server.app:app --reload --port 8000
```

원클릭 실행기: `./run.command` (macOS) / `run.cmd` (Windows)

## 스택

| 계층 | 구성 |
|---|---|
| 프런트 | React 18 + TypeScript + Vite, zustand 단일 스토어(`src/state/store.ts`) |
| 백엔드 | FastAPI + SQLite (`server/`) |
| 이북 산출 | `uniever_ebook/ebook-generator/generator.py` CLI 호출 (**무수정**) |

## 연결 계약 (불변)

PNG 폴더 규칙 → `python3 generator.py build <폴더> --style image --full-bleed --title "..."`
파일명: `표지.png` / `00. 목차.png` / `NN. 제목.png` / `뒷표지.png`

`server/app.py`는 저장소 부모 디렉터리에서 `uniever_ebook`을 찾는다(`GIT_ROOT / "uniever_ebook"`).
따라서 EVER-SKETCH는 `ebook_html`과 **같은 부모 폴더**에 있어야 한다.

## 권한 모델

| 권한 | 대상 | 할 수 있는 일 |
|---|---|---|
| Lv1 관리자 | 회의 주관·기획 | 작성·수정·삭제 + 가입승인·권한변경 + 회차 개설/마감 + 발행 |
| Lv2 작성자 | 임원·부서 담당자 | 본인 이북 작성·수정 + 본인 이북 메모 확인·답글 |
| Lv3 열람자 | 일반 참석자 | 발행본 읽기 전용. **메모 작성·열람 모두 불가** |

가입은 자유, **실권한은 관리자 승인 시점에 부여**한다. 승인 전 계정은 "승인 대기" 화면만 본다.

## 폴더

```
src/          프런트 (승인된 이탈: 표준 frontend/ 대신)
server/       백엔드 (승인된 이탈: 표준 backend/ 대신)
skills/       default_skill 표준팩 이식본 14종 (UNIEVER_SKILL_MANIFEST.json)
docs/         기획·설계 문서
start_docs/   착수 문서 (요구사항·화면설계·DB설계·승인)
qc_docs/      품질 문서 (테스트케이스·테스트증적·결함)
e2e/          노드 스모크 테스트
tests/harness/ 하네스 계약 테스트
```

자세한 규약은 `AGENTS.md` 참조.

## 로드맵

| 주차 | 목표 |
|---|---|
| W0 (8/19~8/22) | 저장소 셋업 · 설계 확정 ✅ 복사·빌드 검증 완료 |
| W1 (8/25~8/29) | 계정 · 가입승인 · 권한 |
| W2 (9/1~9/5) | 회차 · 템플릿 배부 |
| W3 (9/8~9/12) | 앵커 메모 피드백 |
| W4 (9/15~9/19) | 편집 제한 · 취합 발행 |
| W5·W6 (9/22~10/2) | 내부 리허설 2회 · 교육 |
| 10월 | 임원회의 실전 투입 (기존 PPT와 1회 병행) |
