# CLAUDE.md — 프로젝트 컨텍스트 및 개발 워크플로우

> 이 파일은 Claude(AI)가 새 대화 시작 시 자동으로 읽는 프로젝트 가이드입니다.

---

## 프로젝트 개요

- **저장소**: https://github.com/teams-jh/give-me-the-money
- **서비스**: 주식 자동매매 관련 웹 서비스

---

## 역할 분담

| 역할 | 담당자 | 권한 |
|------|--------|------|
| 프론트엔드 | bloodstrawberry | 프론트엔드 코드 전반 |
| 백엔드 | junghyun99 | 백엔드 코드 전반 |

### junghyun99 쓰기 가능 경로
```
.github/
src/db/
src/library/
server_node/
scripts/
CLAUDE.md
AGENTS.md
```
> 읽기는 모든 파일 가능. 위 경로 외 수정은 PR 요청으로 bloodstrawberry에게 전달.

---

## 개발 워크플로우

### 1단계 — 브랜치 생성
- `main` 기준으로 신규 브랜치 생성
- **브랜치 네이밍 컨벤션**:
  - `feat/기능명` — 신규 기능
  - `fix/버그명` — 버그 수정
  - `refactor/내용` — 리팩토링
  - `test/내용` — 테스트

### 2단계 — 개발 & 커밋
- 백엔드 담당 경로 내에서만 코드 작성
- **커밋 메시지 컨벤션**:
  - `feat: 설명`
  - `fix: 설명`
  - `refactor: 설명`
  - `test: 설명`
  - `docs: 설명`

### 3단계 — PR 생성
- base: `main` ← head: 작업 브랜치
- PR 본문에 변경 내용 및 작업자 명시
- 프론트엔드 수정이 필요한 경우 PR 본문에 bloodstrawberry에게 요청 내용 기재

### 4단계 — 리뷰 폴링
- PR 생성 후 주기적으로 리뷰 확인
- 확인 대상:
  - `GET /repos/{owner}/{repo}/issues/{pr}/comments` — 일반 댓글
  - `GET /repos/{owner}/{repo}/pulls/{pr}/reviews` — 코드 리뷰 (Gemini 봇, 팀원 등)

### 5단계 — 리뷰 검토 및 반영
- 리뷰 타당성 판단:
  - **타당** → 코드 수정 후 추가 커밋 & 푸시
  - **불필요** → 이유를 코멘트로 남기고 넘어감
- 프론트엔드 관련 수정 요청 → bloodstrawberry에게 PR로 요청

### 6단계 — 머지
- 리뷰 반영 완료 후 `main` 브랜치에 머지
