# Blog-Auto-Claude

Claude Code 서브에이전트 파이프라인으로 블로그 글을 리서치 → 기획 → 초안 → 리뷰 → 발행까지
자동화하는 프로젝트입니다.

## 오케스트레이션 원칙

메인 세션(권장: Opus)이 오케스트레이터입니다.

1. **주제와 품질 기준 확정** — 요청을 받으면 먼저 글의 주제, 타깃 독자, 분량, 톤의
   무게중심(정보성 vs 에세이)을 명확히 합니다. 애매하면 사용자에게 되묻습니다.
2. **에이전트 호출 시점 결정** — 실제 실행은 `/blog-pipeline` 스킬에 위임합니다.
   스킬이 5단계 서브에이전트(Researcher → Planner → Writer → Reviewer → Publisher)를
   순서대로 호출합니다.
3. **모델 티어 조정** — 주제가 기술적으로 어렵거나 자료 조사가 까다로우면 Researcher를
   `sonnet`으로, 글의 구조가 복잡하거나 브랜드 목소리가 중요하면 Planner/Reviewer를
   `opus` 또는 `fable`로 올려서 호출합니다. 기본값은 각 에이전트 정의 파일의 `model`을
   따릅니다.

## 파이프라인 구조

| 단계 | 에이전트 | 기본 모델 | 산출물 |
|---|---|---|---|
| 1 | `blog-researcher` | haiku | `research.md` |
| 2 | `blog-planner` | sonnet | `plan.md` |
| 3 | `blog-writer` | sonnet | `draft.md` |
| 4 | `blog-reviewer` | sonnet | `final.md` |
| 5 | `blog-publisher` | haiku | 블로그 URL |

전체 흐름과 실행 로직은 `.claude/skills/blog-pipeline/SKILL.md`를 참고하세요.

## 톤 & 스타일

글쓰기 관련 에이전트(Writer, Reviewer)는 `.claude/style/` 아래 문서를 따릅니다.

- `tone.md` — 말투 밸런스 (~요/~죠/~니다)
- `readability.md` — 가독성 규칙
- `forbidden-expressions.md` / `forbidden-phrases.txt` — 금지 표현
- `checklist.md` — 발행 전 체크리스트

이 규칙은 훅(hooks)으로도 강제됩니다 (`.claude/settings.json`, `.claude/hooks/`):

- `SessionStart` → 세션 시작 시 스타일 문서를 컨텍스트에 자동 주입
- `PreToolUse` → `draft.md`/`final.md` 저장 전 금지 표현 검사, 발견 시 저장 차단
- `SubagentStop` → 각 서브에이전트가 정해진 산출물을 남겼는지 확인, 없으면 재작업 요구
- `Stop` → 파이프라인이 진행 중인데 `final.md`와 블로그 URL이 없으면 세션 종료 차단
  (2시간 넘게 방치된 실행은 자동으로 `abandoned` 처리되어 이후 세션을 막지 않습니다)

## 디렉터리

- `runs/<날짜>-<slug>/` — 한 번의 파이프라인 실행에서 나온 `research.md`, `plan.md`,
  `draft.md`, `final.md`, `blog-url.txt`
- `posts/` — 실제 발행된 글 (로컬 타깃일 때 `index.json`이 간이 DB 역할)
- `scripts/publish.mjs` — 로컬/Notion 발행 로직 (`blog-publisher` 에이전트가 호출)
- `config/publish.config.json` — 기본 발행 타깃 및 필드 매핑 설정
- `.claude/state/current-run.json` — 파이프라인 실행 상태 (커밋하지 않음, 훅이 읽음)

## Notion 발행을 쓰려면

`config/publish.config.json`의 `target`을 `"notion"`으로 바꾸거나 `/blog-pipeline`
호출 시 `--target=notion`을 붙입니다. 환경변수 `NOTION_TOKEN`, `NOTION_DATABASE_ID`가
필요합니다. 둘 중 하나라도 없으면 `blog-publisher`가 자동으로 로컬 발행으로 폴백합니다.
