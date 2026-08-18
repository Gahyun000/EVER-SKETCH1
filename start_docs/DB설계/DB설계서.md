# DB 설계서

문서번호: `EBOOKHTML-DB-001` · 버전/상태: `0.1.0 / 초안`
관련 요구사항: REQ-F-010, REQ-NF-002

## 1. 설계 원칙
- DBMS/버전: SQLite 3 (로컬 파일 `server/ebook_html.db`, 경로 env `EBOOK_HTML_DB` 재정의 가능)
- 문자 인코딩: UTF-8
- 시간대: 저장 `CURRENT_TIMESTAMP`(UTC), 표시 KST 24시간제
- 명명 규칙: 테이블 PascalCase(App_Settings), 설정 키 `namespace.field`(예 `llm.provider`)
- 마이그레이션: 앱 기동 시 `init_db()`가 `CREATE TABLE IF NOT EXISTS` 수행(축약형)
- **형상관리**: DB 파일은 운영/비밀 데이터 → 저장소 제외(`.gitignore`, UDS-105 §1 / UDS-107 §5)

## 2. 엔터티
| 엔터티 | 업무 의미 | 소유자 | 관련 요구사항 |
|---|---|---|---|
| App_Settings | 앱 환경설정 키-값(LLM 등) | 서버 | REQ-F-010 |

## 3. 테이블 정의
테이블명: `App_Settings` · 설명: 네임스페이스 키-값 설정 저장(현재 `llm.*` 사용)

| 컬럼 | 타입 | NULL | 기본값 | 키/제약 | 업무 의미 | 개인정보 |
|---|---|---|---|---|---|---|
| setting_key | TEXT | NO | — | PK | `namespace.field`(예 `llm.api_key`) | 아니오 |
| setting_value | TEXT | YES | NULL | — | 값(문자열; bool/float은 문자열 저장 후 코어스) | 키/토큰 포함 가능 → 비밀 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | — | 갱신 시각(UTC) | 아니오 |
| updated_by | TEXT | YES | NULL | — | 갱신 주체(예 local) | 아니오 |

사용 키(`llm.*`): provider, base_url, user_id, api_key, model, enabled, timeout. 우선순위: App_Settings 행 > 환경변수(LLM_*) > 기본값.

## 4. 인덱스와 성능
| 인덱스 | 컬럼 | 목적 | 선택도 | 쓰기 영향 |
|---|---|---|---|---|
| PK | setting_key | 단건 조회/upsert | 유일 | 미미(행 수 소량) |

## 5. 데이터 수명주기
| 데이터 | 생성 | 변경 | 보존 | 파기 | 마스킹 |
|---|---|---|---|---|---|
| llm.api_key | 설정 저장 | PUT /api/settings/llm | 로컬 유지 | 재설정/삭제 | 조회 시 `mask_key`로 마스킹 |
| 기타 llm.* | 설정 저장 | 동상 | 로컬 유지 | 재설정 | 해당없음 |

## 6. 변경과 롤백
- 전진 마이그레이션: `init_db()`(IF NOT EXISTS). 스키마 확장 시 컬럼 추가는 별도 마이그레이션 스크립트로.
- 이전 버전 호환: 키-값 구조라 신규 키 추가는 하위호환.
- 백필: 불필요(기본값·env 폴백).
- 검증 쿼리: `SELECT setting_key,setting_value FROM App_Settings WHERE setting_key LIKE 'llm.%'`(값 노출 주의 — api_key 마스킹 후 확인).
- 롤백: 파일 백업 교체(로컬). **주의**: 백업본에도 키가 포함되므로 저장소·공유 금지.
