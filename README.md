# mrt-fe-review-washer

코더래빗(CodeRabbit)처럼 **"리뷰 결과를 저장/조회"** 하고, **Task 관리로 체계적인 수정**까지 할 수 있는 **한국어 중심 MCP 서버**입니다.

> 🦐 **mcp-shrimp-task-manager** 스타일의 Task 관리 기능 내장!

> 핵심 철학: 이 서버가 LLM을 내장해서 리뷰를 '자동 생성'하기보다,  
> MCP 호스트(Claude Code/Cline/Claude Desktop 등)의 모델이 리뷰를 만들고,  
> 서버는 **diff/규칙 제공 + 결과 저장/조회 + Task 관리**를 담당합니다.

## 요구사항

- Node.js 18+
- git (diff 수집용)

## 설치/빌드

```bash
npm i
npm run build
```

## 📋 규칙 파일 관리 (중앙 집중식)

**FE 리드**가 이 MCP 서버의 `templates/rules.ko.md` 파일을 직접 관리합니다.

```
mrt-fe-review-washer/
└── templates/
    └── rules.ko.md   ← FE 리드가 관리하는 "원본"
```

- 모든 프로젝트가 이 **하나의 규칙 파일**을 공유
- 규칙 변경 시 MCP 서버만 업데이트하면 모든 프로젝트에 즉시 반영
- 프로젝트별 복사본 관리 불필요

## .mcp.json 연결(예시)

프로젝트(또는 사용자 설정)에 아래 형태로 등록합니다.

> ⚠️ 많은 MCP 호스트가 **절대경로**를 요구합니다.

```jsonc
{
  "mcpServers": {
    "mrt-fe-review-washer": {
      "command": "node",
      "args": ["/ABS/PATH/TO/mrt-fe-review-washer/dist/index.js"],
      "env": {
        "REPO_PATH": "/ABS/PATH/TO/YOUR/REPO"
      }
    }
  }
}
```

### 환경 변수

| 변수                | 설명                       | 기본값                                |
| ------------------- | -------------------------- | ------------------------------------- |
| `REPO_PATH`         | 리뷰 대상 프로젝트 경로    | 현재 작업 디렉토리                    |
| `DATA_DIR`          | 리뷰/Task 데이터 저장 경로 | `${REPO_PATH}/.review-data`           |
| `REVIEW_RULES_PATH` | 규칙 파일 경로 (커스텀)    | `templates/rules.ko.md` (MCP 서버 내) |

## 추천 워크플로우

### 1️⃣ 리뷰 생성

```
1) diff 수집 → review.collect_diff
2) 프롬프트 생성 → review.make_prompt
3) (LLM이 리뷰 JSON 생성)
4) 리뷰 저장 → review.save
```

### 2️⃣ Task 관리 (리뷰 → 수정)

```
5) 리뷰를 Task로 변환 → task.from_review
6) Task 목록 확인 → task.list
7) Task 실행 시작 → task.execute
8) (코드 수정)
9) Task 검증 → task.verify
10) Task 완료 → task.complete
```

자세한 흐름: `docs/WORKFLOW_KO.md`

## 제공 Tools

### Review Tools

| Tool                     | 설명                      |
| ------------------------ | ------------------------- |
| `review.collect_diff`    | git diff 수집             |
| `review.make_prompt`     | 리뷰 프롬프트 패키지 생성 |
| `review.save`            | 리뷰 저장                 |
| `review.list`            | 리뷰 목록                 |
| `review.get`             | 리뷰 상세 조회            |
| `review.export_markdown` | 마크다운 변환             |
| `review.debug.env`       | 환경 변수 확인            |

### Task Tools

| Tool                 | 설명                      |
| -------------------- | ------------------------- |
| `task.from_review`   | 리뷰 findings → Task 변환 |
| `task.create`        | Task 수동 생성            |
| `task.list`          | Task 목록 (상태별 필터)   |
| `task.get`           | Task 상세 조회            |
| `task.execute`       | Task 실행 시작            |
| `task.verify`        | Task 검증                 |
| `task.complete`      | Task 완료                 |
| `task.delete`        | Task 삭제                 |
| `task.update_status` | Task 상태 변경            |
| `task.stats`         | Task 통계                 |

## 제공 Resources

| Resource              | 설명           |
| --------------------- | -------------- |
| `rules://active`      | 활성 규칙 파일 |
| `reviews://index`     | 리뷰 인덱스    |
| `reviews://latest`    | 최신 리뷰      |
| `tasks://index`       | Task 인덱스    |
| `tasks://pending`     | 대기 중인 Task |
| `tasks://in_progress` | 진행 중인 Task |

## 제공 Prompts

| Prompt         | 설명                    |
| -------------- | ----------------------- |
| `review-ko`    | 한국어 코드 리뷰 템플릿 |
| `task-execute` | Task 실행 가이드        |
| `task-plan`    | Task 계획 수립          |

## 저장 위치

```
${DATA_DIR}/
├── reviews/
│   └── rev_*.json       # 리뷰 결과
└── tasks/
    └── task_*.json      # Task 데이터
```

기본: `${REPO_PATH}/.review-data/`
