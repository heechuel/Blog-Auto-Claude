---
name: blog-pipeline
description: 블로그 글 한 편을 리서치 → 기획 → 초안 → 리뷰 → 발행까지 5단계 서브에이전트로 전 과정 실행하는 워크플로우. "블로그 글 써줘", "포스트 발행해줘", "이 주제로 글 하나 만들어줘" 같은 요청에 사용한다.
argument-hint: "<주제> [--target=local|notion]"
disable-model-invocation: false
---

이 스킬은 실행 코드가 아니라 지금 이 대화(메인 세션)를 위한 절차 지침이다. 아래 단계를
그대로 따라, 이 세션이 직접 `Agent` 도구로 5개의 서브에이전트를 순서대로 호출한다.
`context: fork`를 쓰지 않는다 — 오케스트레이터(메인 세션)가 각 단계 사이에서 품질을
판단하고 모델 티어를 조정할 수 있어야 하기 때문이다.

## 0. 주제와 품질 기준 확정 (오케스트레이터 책임)

파이프라인을 시작하기 전에 다음이 명확한지 확인한다. 애매하면 스킬을 진행하지 말고
사용자에게 먼저 물어본다.

- 주제, 타깃 독자, 원하는 분량/톤의 무게중심(정보성 vs 에세이)
- 발행 타깃: `local`(기본값) 또는 `notion` — `$ARGUMENTS`에 `--target=`이 없으면
  `config/publish.config.json`의 `target` 값을 기본으로 쓴다

## 1. 실행 준비

1. 주제를 바탕으로 영문 kebab-case slug를 만든다. (예: "RAG 파이프라인 구축법" → `rag-pipeline-guide`)
2. 실행 디렉터리를 만든다: `runs/<YYYY-MM-DD>-<slug>/`
3. 상태 파일을 기록한다 (`Write` 도구로 아래 JSON을 `.claude/state/current-run.json`에 저장):

```json
{
  "status": "in_progress",
  "slug": "<slug>",
  "run_dir": "runs/<YYYY-MM-DD>-<slug>",
  "target": "<local|notion>",
  "started_at": "<현재 시각, ISO 8601>"
}
```

이 상태 파일을 `SubagentStop`/`Stop` 훅이 읽어서 각 단계 산출물이 실제로 저장됐는지,
파이프라인이 끝났는지를 검증한다. 파일을 빠뜨리면 훅이 제대로 동작하지 않는다.

## 2. 리서치 — `blog-researcher`

`Agent` 도구로 `subagent_type: blog-researcher`를 호출한다. 프롬프트에 주제와
`<run_dir>/research.md`에 저장하라는 지시를 포함한다.

- 기본 모델은 에이전트 정의(`haiku`)를 따른다.
- `research.md` 맨 위에 `> ⚠️ sonnet 재조사 권장` 문구가 있으면, 같은 에이전트를
  `model: sonnet`으로 재호출한다.

호출 후 `research.md`가 실제로 존재하는지 `Read`나 `Glob`으로 직접 한 번 더 확인한다.
(`SubagentStop` 훅이 1차로 걸러주지만, 오케스트레이터도 다음 단계로 넘기기 전에 확인한다.)

## 3. 기획 — `blog-planner`

`Agent` 도구로 `subagent_type: blog-planner`를 호출한다. `<run_dir>/research.md`를
읽고 `<run_dir>/plan.md`를 쓰라고 지시한다.

- 기본 모델은 `sonnet`이다.
- 글의 구조가 복잡하거나(예: 다단계 튜토리얼, 비교 글), 브랜드 목소리가 특히 중요한
  주제라면 `model: opus` 또는 `model: fable`로 호출한다.

`plan.md` 존재를 확인한 뒤 다음 단계로 넘어간다.

## 4. 초안 — `blog-writer`

`Agent` 도구로 `subagent_type: blog-writer`를 호출한다 (`model: sonnet`, 고정).
`<run_dir>/plan.md`와 `<run_dir>/research.md`를 읽고 `<run_dir>/draft.md`를 쓰라고
지시한다.

`PreToolUse` 훅이 금지 표현이 섞인 저장을 차단하므로, 라이터가 저장에 반복 실패하면
(같은 훅 차단이 2회 이상 반복되면) 작업을 멈추고 사용자에게 상황을 보고한다 — 무한
재시도로 넘어가지 않는다.

## 5. 리뷰 — `blog-reviewer`

`Agent` 도구로 `subagent_type: blog-reviewer`를 호출한다. `<run_dir>/draft.md`를
다듬어 `<run_dir>/final.md`로 저장하라고 지시한다.

- 기본 모델은 `sonnet`이다.
- 말투/디테일을 더 세밀하게 다듬어야 하면 `model: opus` 또는 `model: fable`로 호출한다.

`final.md`에 `## 리뷰 체크리스트`의 모든 항목이 체크되어 있는지 확인한다. 체크되지
않은 항목이 있으면 같은 리뷰어를 다시 호출해 마무리시킨다.

## 6. 발행 — `blog-publisher`

`Agent` 도구로 `subagent_type: blog-publisher`를 호출한다 (`model: haiku`, 고정).
다음을 프롬프트로 전달한다: `<run_dir>` 경로, `slug`, 0단계에서 정한 발행 타깃.

발행이 성공하면 `<run_dir>/blog-url.txt`가 생긴다. 실패하면(예: Notion 인증 정보
없음) 에이전트가 로컬로 폴백하거나 실패를 보고한다 — 보고 내용을 그대로 사용자에게
전달한다.

## 7. 마무리

1. `<run_dir>/blog-url.txt`가 존재하면 상태 파일을 갱신한다:
   `.claude/state/current-run.json`의 `status`를 `"completed"`로 바꾼다.
   (이걸 빠뜨리면 `Stop` 훅이 세션 종료를 계속 막는다.)
2. 사용자에게 결과를 정리해서 보고한다: 생성된 4개 파일 경로
   (`research.md`, `plan.md`, `draft.md`, `final.md`)와 블로그 URL.

## 실패/중단 시

어느 단계에서든 복구 불가능한 실패가 나면, 상태 파일의 `status`를 `"failed"`로
바꾸고 (역시 `Stop` 훅 차단을 풀기 위해) 사용자에게 어디까지 진행됐고 무엇이
막혔는지 보고한다. 임의로 다음 단계를 건너뛰거나 산출물을 지어내지 않는다.
