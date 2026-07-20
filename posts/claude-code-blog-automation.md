---
title: "Claude Code 서브에이전트 5개로 블로그 자동화 파이프라인 만들기: 리서치부터 발행까지"
slug: "claude-code-blog-automation"
date: "2026-07-20"
tags: ["Claude Code", "서브에이전트", "AI 자동화", "멀티에이전트 파이프라인", "콘텐츠 자동화", "LLM 오케스트레이션"]
---

"블로그 글 하나 써줘." Claude Code에 이렇게 한 번에 시켜본 적 있나요? 처음 한두 번은 그럴듯하죠. 하지만 반복할수록 구조가 뒤죽박죽되고, 근거 없는 문장이 섞이고, 결과물을 매번 처음부터 다시 검수해야 하는 순간이 와요.

왜 "한 번에 다 시키는" 방식은 스케일이 안 될까요. 이 문제, 5개의 작은 서브에이전트로 쪼개는 것만으로 해결할 수 있을까요.

## 단일 에이전트 자동화가 무너지는 지점

대화가 길어질수록 품질이 불안정해집니다. 하나의 대화창에서 리서치·기획·집필·검수·발행을 전부 시키면, 앞선 단계의 결정과 근거가 뒤 단계의 맥락에 그대로 섞여 들어가요. 리서치 단계에서 애매하게 남겨둔 가정이 초안 단계까지 그대로 흘러가고, 검수 없이 다음 단계로 넘어간 문장이 발행 직전까지 살아남는 식이죠.

멀티 에이전트 오케스트레이션을 다루는 자료는 이 위험을 명확히 짚어요. "낮은 신뢰도, 형식이 어긋난, 또는 주제에서 벗어난 응답은 파이프라인을 타고 계속 전파될 수 있다(low-confidence, malformed, or off-topic responses can cascade through a pipeline)"는 지적이에요. 단일 에이전트 방식에는 이 전파를 끊어줄 경계가 없습니다.

반대로 서브에이전트 구조는 이 경계 자체를 기본값으로 갖고 있어요. 서브에이전트 문서는 "각 서브에이전트는 자신만의 새 대화에서 실행된다. 중간 도구 호출과 결과는 서브에이전트 안에만 머물고, 최종 메시지만 부모에게 반환된다(Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent)"고 설명해요. **단일 에이전트에는 이 격리가 없다는 것, 그것이 품질이 무너지는 근본 지점입니다.**

## 왜 무너지는가: context 과부하와 "만능 모델" 착각

원인은 두 가지예요. 하나는 구조적 문제고, 다른 하나는 선택의 문제죠.

### 원인 1: 컨텍스트 과부하

첫 번째는 하나의 컨텍스트에 모든 단계의 대화가 쌓이는 구조적 한계예요. 서브에이전트라면 "부모에서 자식으로 전달되는 유일한 내용은 Agent 도구의 프롬프트 문자열뿐(The only content you pass from parent to subagent is the Agent tool's prompt string)"이라, 필요한 파일 경로나 결정 사항만 골라 넘길 수 있어요. 반대로 단일 에이전트는 이런 선별이 불가능하고, 모든 단계의 잡음이 누적된 채로 다음 판단에 영향을 주죠.

### 원인 2: "만능 모델" 착각

두 번째는 모든 작업에 같은 모델을 쓰는 비효율이에요. 리서치용 자료 정리나 발행 전 형식 검증처럼 단순한 작업까지 가장 비싼 모델로 처리하는 경우가 많죠. 하지만 모델 간 성능 격차는 생각보다 크지 않습니다.

| 모델 | 입력 가격 | 출력 가격 | SWE-bench Verified |
|---|---|---|---|
| Haiku 4.5 | $1/M 토큰 | $5/M 토큰 | - |
| Sonnet 4.6 | $3/M 토큰 | $15/M 토큰 | 79.6% |
| Opus 4.8 | $5/M 토큰 | $25/M 토큰 | 80.8% |

Opus와 Sonnet의 성능 격차는 1.2%포인트에 불과해요. 그래서 모델 선택 가이드는 이렇게 권장합니다.

"기본은 Sonnet 4.6으로 하고, 깊은 아키텍처 추론이 필요하거나 Sonnet이 풀지 못하는 문제를 만났을 때만 Opus로 전환한다. 속도가 지능보다 중요한 단순 정리 작업에는 Haiku를 쓴다(Default to Sonnet 4.6 for everything. Switch to Opus 4.6 when you need deep architectural reasoning or hit a problem Sonnet can't solve. Use Haiku 4.5 for simple cleanup tasks where speed matters more than intelligence)." **무조건 비싼 모델을 쓰는 것, 그건 답이 아니에요.**

## 해결 A: 역할별 서브에이전트로 파이프라인을 쪼개기

리서치 → 기획 → 초안 → 리뷰 → 발행. 이 다섯 단계를 각각 독립된 서브에이전트로 분리하면 오케스트레이터/워커 구조가 만들어져요. 메인 세션(오케스트레이터)이 각 단계에 작업을 할당하고, 서브에이전트(워커)는 자신에게 주어진 정보만 받아 집중한 뒤 결과만 다음 단계로 넘기는 방식이죠.

### 오케스트레이터와 워커 구조

호출 방식 자체는 단순해요. "서브에이전트는 Agent 도구를 통해 호출되며, 메인 에이전트가 subagent_type과 프롬프트를 넘겨 호출한다(Subagents are invoked through the Agent tool, where the main agent calls it with a subagent_type and a prompt)"는 것이 전부죠. 이 구조를 두고 한 오케스트레이션 가이드는 "서브에이전트를 생성한 에이전트가 오케스트레이터이고, 오케스트레이터는 작업을 배정하며 서브에이전트가 이를 실행한다(the agent that spawns it is the orchestrator, and the orchestrator assigns tasks while subagents execute them)"고 정리해요.

### 실전 적용: research.md → final.md

이 프로젝트의 실제 실행 구조가 좋은 예시예요. `runs/<날짜>-<slug>/` 디렉터리 안에서 `research.md` → `plan.md` → `draft.md` → `final.md`가 순서대로 쌓여요. Researcher는 근거 자료만 모으고, Planner는 그 자료를 바탕으로 목차만 짜고, Writer는 그 목차를 그대로 채우죠. 각 단계가 이전 단계의 대화 전체가 아니라 "결과 파일"만 넘겨받기 때문에, 컨텍스트가 섞이지 않아요.

이렇게 역할을 나눈 효과는 수치로도 드러나요. "리서치, 코딩, 리뷰를 전문화된 서브에이전트에 위임하면 작업 완료 시간을 40~60% 줄이면서도 결과물 품질을 높일 수 있다(By delegating research, coding, and review to specialized subagents, you can cut task completion time by 40-60% while improving output quality)"는 사례가 있죠. **구조를 바꾼 것만으로 속도와 품질을 동시에 잡은 셈입니다.**

## 해결 B: 모델 티어링과 Hooks로 비용·품질을 동시에 잡기

역할을 나눴다면, 다음은 각 역할에 맞는 모델을 고르는 차례예요.

### 모델 티어링: 역할에 맞는 모델 고르기

라우팅이나 형식 정리처럼 단순한 작업은 Haiku가 맡아요. 본작업 대부분은 Sonnet, 어려운 추론이 필요한 10~15%만 Opus에 맡기는 방식입니다. 이 하이브리드 전략을 적용하면 "60~70%의 비용 절감(60-70% cost reduction)" 효과가 있다는 보고도 있어요.

이 프로젝트도 같은 원칙을 따라요. 자료를 긁어모으는 Researcher와 발행만 담당하는 Publisher는 haiku, 구조를 짜는 Planner와 문장을 쓰는 Writer, 검수하는 Reviewer는 sonnet을 기본값으로 씁니다. 글의 구조가 복잡하거나 브랜드 목소리가 중요할 때만 Planner나 Reviewer를 opus로 올리죠.

### Hooks: 산출물을 검증하는 안전장치

모델만 나눈다고 품질이 저절로 보장되지는 않아요. 그래서 필요한 것이 Hooks예요. "다음 에이전트에게 넘기기 전에 에이전트 출력을 검증해야 한다. 신뢰도가 낮거나, 형식이 어긋나거나, 주제에서 벗어난 응답은 파이프라인을 타고 계속 전파될 수 있기 때문이다(Validate agent output before passing it to the next agent, as low-confidence, malformed, or off-topic responses can cascade through a pipeline)"는 원칙을, Hooks는 코드가 아니라 선언적 설정으로 강제합니다.

- **SubagentStop**: "서브에이전트가 끝날 때 발동하며, 서브에이전트가 종료되는 것을 막을 수 있다(Fires when a subagent finishes. Can prevent the subagent from stopping)." — 정해진 산출물 파일이 없으면 다음 단계로 못 넘어가게 막아요.
- **PreToolUse**: "도구 호출이 실행되기 전에 발동하며, 도구 호출을 막을 수 있다(Fires before a tool call executes. Can block tool calls)." — 이 프로젝트에서는 `draft.md`/`final.md` 저장 시점에 금지 표현을 걸러내는 데 쓰죠.
- **Exit Codes**: "종료 코드 2는 차단 에러를 의미하며, stderr의 텍스트가 Claude에게 에러 메시지로 다시 전달된다(Exit 2 means blocking error—stderr text is fed back to Claude as an error message)." — 훅이 실패 이유를 그대로 에이전트에게 알려주는 방식이에요.

역할 분리로 각 단계를 격리하고, 모델 티어링으로 비용을 낮추고, Hooks로 산출물을 검증해요. **세 가지가 맞물려야 파이프라인이 실제로 신뢰할 만해집니다.**

## 지금 내 워크플로우에 적용하는 법

거창한 재작성은 필요 없어요. 지금 반복하고 있는 작업 하나를 골라 세 가지만 적용해보면 됩니다.

서브에이전트 정의는 생각보다 간단해요. `description`, `prompt`, `tools`, `model`, `skills` 같은 몇 개 필드만 채운 최소 구성으로 시작할 수 있어요. 처음부터 다섯 단계, 열 단계를 설계할 필요 없이, "입력 → 산출물"이 명확한 2~3단계로 쪼개는 것부터 시작하면 충분합니다.

여기에 각 단계마다 맞는 모델(Haiku/Sonnet/Opus)을 지정하고, 끝났을 때 "정해진 파일/형식이 없으면 실패로 간주"하는 SubagentStop 훅을 하나만 붙여보세요. 서브에이전트가 "탐색과 구현 과정을 메인 대화 밖에 두어 컨텍스트를 보존하는 데 도움을 준다(Subagents help preserve context by keeping exploration and implementation out of your main conversation)"는 효과, **작은 파이프라인 하나로도 바로 체감할 수 있습니다.**

## 태그
- Claude Code
- 서브에이전트
- AI 자동화
- 멀티에이전트 파이프라인
- 콘텐츠 자동화
- LLM 오케스트레이션

## 리뷰 체크리스트
- [x] 후킹 확인
- [x] 제목 클릭 유도 확인
- [x] 실행 가능한 인사이트 확인
- [x] 군더더기 문장 제거
- [x] 어미 밸런스(tone.md) 확인
- [x] 가독성 규칙(readability.md) 확인
- [x] 금지 표현 없음 확인
- [x] 저장/공유하고 싶은 글인지 확인
