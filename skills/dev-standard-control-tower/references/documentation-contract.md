# Documentation contract

## Required tree

Create at project intake:

```text
start_docs/{회의록,요구사항,프로세스,화면설계,DB설계,사용자매뉴얼_약식,개발자매뉴얼_약식,운영배포매뉴얼_약식,승인}
qc_docs/{품질계획,테스트케이스,산출물별기준서,기준시안,테스트증적,결함}
docs/{공통,기획,개발일지,계획,분석,검토,협업,기술문서,아이디어}
SKILL/
```

Create `harness/{contracts,policies,tools,workflows,validators,checkpoints,telemetry,fixtures}` and `tests/harness` for T1+. Keep `end_docs/{사용자매뉴얼,개발자매뉴얼,운영배포매뉴얼,인수}` empty until explicit human instruction or G6 preparation.

## Naming and location

- The user's agent naming rule applies to generated documents. Codex files use `코덱스_<주제>_<YYYYMMDD>.md`.
- Activity records live under `docs/<구분>/YYYY-MM-DD/` and use `코덱스_<구분>_<작업명>_<YYYY-MM-DD>.md`.
- Collaboration files use `<세션ID>_코덱스_<요청|회신>_<작업명>_<YYYY-MM-DD>.md`; request and reply retain the same session ID.
- Canonical technical documents stay at stable paths and carry explicit version metadata. Point `docs/index.md` to the current Codex-named version instead of duplicating it into date folders.
- Every document states document number, title, version, status, owner, author, reviewer, approver, creation/effective dates, security class, linked IDs, and change history where applicable.
- Apply every category, ledger, request/reply, dating, and canonical-path rule in [sketch-control-tower-contract.md](sketch-control-tower-contract.md). The approved standard deliberately limits date folders and agent/date filenames to activity records; do not duplicate or relocate stable canonical documents merely to satisfy naming form.

## Mandatory content

Before G1/G2, complete project overview, meeting records, requirements with measurable acceptance, glossary, requirement trace, process definition, screen design and approved HTML, DB/data dictionary, API/integration, security/permissions/logging, development-method selection, and T1+ harness design.

Before G3/G4, maintain the development ledger, change requests, technical documents, quality plan, one criterion document per major artifact, test cases, defects, evidence, resource constraints, and runner verification.

The shared development ledger is a table and records at least KST date/time, session ID, agent, category (`일반`, `요청`, `회신`, `검토`, `계획`, `분석`, `결과`), work name, and completion state. Requests and replies use the same request session ID and live under the dated collaboration folder.

Before G5/G6, complete deployment/rollback/observation, operational transfer, acceptance, and final manuals only at the allowed gate.

The bundled templates under `assets/project-templates/` preserve every standard field. `scripts/bootstrap_project.py` copies them into the target project. A copied blank template is not completed evidence.
