# Plan: Claude Code 서브에이전트로 블로그 글쓰기 자동화하기

## 타깃 독자
- 이 글을 읽어야 하는 사람: Claude Code(또는 Claude Agent SDK)로 반복적인 콘텐츠/문서 작업을 자동화하고 싶은 개발자. 단일 프롬프트로 "리서치부터 발행까지 한 번에" 시켜봤다가 결과물 품질이 들쭉날쭉해서 답답했던 경험이 있는 사람.
- 이 글을 읽고 나면 무엇을 할 수 있는가: 왜 단일 에이전트 방식이 블로그 자동화에서 한계에 부딪히는지 이해하고, 서브에이전트 파이프라인(Researcher → Planner → Writer → Reviewer → Publisher)과 모델 티어링, Hooks 기반 품질 게이트를 자신의 워크플로우에 적용할 수 있다.

## 후킹 (첫 문단에서 던질 문제/질문)
- "블로그 글 하나 써줘"라고 Claude Code에 한 번에 시켜본 적 있는가? 처음 한두 번은 그럴듯하지만, 반복할수록 구조가 뒤죽박죽되고, 근거 없는 문장이 섞이고, 어느 순간부터는 결과물을 매번 처음부터 다시 검수해야 하는 상황이 온다. 왜 "한 번에 다 시키는" 방식은 스케일이 안 될까? 그리고 이 문제를 5개의 작은 서브에이전트로 쪼개는 것만으로 어떻게 해결할 수 있을까?

## 목차
1. 단일 에이전트 자동화가 무너지는 지점 — 독자가 겪는 문제
2. 왜 무너지는가: context 과부하와 "만능 모델" 착각 — 문제의 원인/진단
3. 해결 A: 역할별 서브에이전트로 파이프라인을 쪼개기 — 해결 방법
4. 해결 B: 모델 티어링과 Hooks로 비용·품질을 동시에 잡기 — 해결 방법
5. 정리: 지금 내 워크플로우에 적용하는 법 — 정리 + 다음 행동

## 섹션별 상세

### 1. 단일 에이전트 자동화가 무너지는 지점
- 핵심 메시지 (한 줄): 하나의 대화창에서 리서치·기획·집필·검수·발행을 전부 시키면, 대화가 길어질수록 이전 결정과 근거가 섞이고 품질이 불안정해진다.
- 사용할 근거 (research.md 참조): #12 "low-confidence, malformed, or off-topic responses can cascade through a pipeline" (검증 없이 다음 단계로 넘어갈 때의 위험), #2 서브에이전트 문서의 Context Isolation 개념을 역으로 활용 — 단일 에이전트는 이 격리가 없어 이전 단계의 잡음이 다음 단계에 그대로 누적된다는 점을 대비로 설명.

### 2. 왜 무너지는가: context 과부하와 "만능 모델" 착각
- 핵심 메시지 (한 줄): 문제는 두 가지다 — (1) 하나의 컨텍스트에 모든 단계의 대화가 쌓이는 구조적 한계, (2) 모든 작업에 같은 모델을 쓰는 비효율.
- 사용할 근거 (research.md 참조): #2 "Each subagent runs in its own fresh conversation... The only content you pass from parent to subagent is the Agent tool's prompt string" (역으로, 단일 에이전트는 이 분리가 없다는 진단), #6 모델 가격/성능 비교표(Haiku $1/$5, Sonnet $3/$15, Opus $5/$25, SWE-bench 격차 1.2%)로 "무조건 비싼 모델"이 답이 아님을 진단, #6 "Default to Sonnet... Switch to Opus when you need deep architectural reasoning... Use Haiku for simple cleanup tasks" 인용.

### 3. 해결 A: 역할별 서브에이전트로 파이프라인을 쪼개기
- 핵심 메시지 (한 줄): 리서치 → 기획 → 초안 → 리뷰 → 발행을 각각 독립된 서브에이전트로 분리하면, 각 단계가 필요한 정보만 받아 집중하고 결과만 다음 단계로 넘기는 오케스트레이터/워커 구조가 된다.
- 사용할 근거 (research.md 참조): #9 "Subagents are invoked through the Agent tool, where the main agent calls it with a subagent_type and a prompt" (호출 메커니즘), #10 "The orchestrator/worker pattern: the agent that spawns it is the orchestrator, and the orchestrator assigns tasks while subagents execute them", #2 "Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent" (컨텍스트 격리로 얻는 이점), #10 "By delegating research, coding, and review to specialized subagents, you can cut task completion time by 40-60% while improving output quality". 실제 5단계 구조(runs/ 디렉터리에 research.md → plan.md → draft.md → final.md가 순차 산출)를 예시로 사용.

### 4. 해결 B: 모델 티어링과 Hooks로 비용·품질을 동시에 잡기
- 핵심 메시지 (한 줄): 각 단계에 맞는 모델을 선택하고(Haiku for triage, Sonnet for bulk, Opus for deep reasoning), Hooks로 "정해진 산출물이 없으면 다음 단계로 못 넘어간다"는 규칙을 강제하면 품질 게이트가 자동화된다.
- 사용할 근거 (research.md 참조): #6 "Hybrid Approach: Haiku(router/triage) → Sonnet(bulk tasks) → Opus(10-15% deep reasoning) = 60-70% cost reduction", #3 Hook Lifecycle 및 SubagentStop("Fires when a subagent finishes. Can prevent the subagent from stopping"), #3 PreToolUse("Can block tool calls... permissionDecision (allow/deny/ask/defer)"), #3 Exit Codes("Exit 2 means blocking error—stderr text is fed back to Claude as an error message"), #12 "Validate agent output before passing it to the next agent" — Hooks가 이 검증을 코드가 아니라 선언적 설정으로 강제하는 방법이라는 점 연결.

### 5. 정리: 지금 내 워크플로우에 적용하는 법
- 핵심 메시지 (한 줄): 거창한 재작성 없이도, 반복 작업 하나를 골라 "역할 분리 + 모델 티어링 + 산출물 검증 Hook" 3가지만 적용해보면 자동화 파이프라인의 신뢰도가 눈에 띄게 달라진다.
- 사용할 근거 (research.md 참조): #2 AgentDefinition 필드(`description`, `prompt`, `tools`, `model`, `skills`)를 활용해 최소 구성으로 시작하는 방법 제시, #15 "Subagents help preserve context by keeping exploration and implementation out of your main conversation" 로 마무리 메시지 보강.

## 결론에서 남길 행동 지침
- 독자가 이 글을 다 읽고 바로 할 수 있는 행동: 자신이 반복하는 작업(문서 작성, 리뷰, 리서치 등) 중 하나를 골라 "입력 → 산출물"이 명확한 2~3단계로 쪼개보고, 각 단계에 맞는 모델(Haiku/Sonnet/Opus)을 지정한 최소 서브에이전트 정의 파일을 하나 만들어볼 것. 그리고 각 단계가 끝났을 때 "정해진 파일/형식이 없으면 실패로 간주"하는 간단한 SubagentStop 훅을 하나만이라도 붙여볼 것.

## 제목 후보
1. Claude Code 서브에이전트로 블로그 자동화 파이프라인 만들기: 리서치부터 발행까지
2. 단일 프롬프트의 한계: Claude Code 서브에이전트로 콘텐츠 자동화 다시 설계하기
3. Haiku, Sonnet, Opus를 한 파이프라인에: Claude Code 서브에이전트 실전 가이드

## 태그 후보
- Claude Code
- 서브에이전트
- AI 자동화
- 멀티에이전트 파이프라인
- 콘텐츠 자동화
- LLM 오케스트레이션
