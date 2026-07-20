# Research: Claude Code 서브에이전트로 블로그 글쓰기 자동화하기

## 핵심 질문

1. Claude Code 서브에이전트의 개념과 다단계 파이프라인 설계의 필요성은?
2. 여러 서브에이전트를 순서대로 호출하는 오케스트레이션의 메커니즘은?
3. 각 단계마다 다른 모델(haiku/sonnet/opus)을 선택하는 기준과 이점은?
4. Hooks(SessionStart, PreToolUse, SubagentStop, Stop)로 파이프라인 규칙을 강제하는 방법은?
5. 스킬(Skills)은 파이프라인 구축에 어떤 역할을 하는가?

---

## 자료

### 1. Claude Agent SDK 공식 문서 - Overview
- **출처**: [Claude Code Docs - Agent SDK Overview](https://code.claude.com/docs/en/agent-sdk/overview)
- **요약**: Agent SDK는 Claude Code의 core 기능(파일 읽기, 명령 실행, 코드 편집)을 프로그래밍 방식으로 활용하는 Python/TypeScript 라이브러리.
- **인용 가능 문장**:
  - "Build AI agents that autonomously read files, run commands, search the web, edit code, and more."
  - "The Agent SDK gives you the same tools, agent loop, and context management that power Claude Code, programmable in Python and TypeScript."
  - Hooks 지원: "Available hooks: PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd, UserPromptSubmit, and more"

### 2. Claude Agent SDK - Subagents 공식 문서
- **출처**: [Claude Code Docs - Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents)
- **요약**: 서브에이전트는 독립적인 에이전트 인스턴스로, 메인 에이전트가 특정 작업을 위임할 때 호출됨. 각 서브에이전트는 독립적인 대화 컨텍스트에서 실행되고, 최종 메시지만 부모 에이전트에게 반환.
- **인용 가능 문장/데이터**:
  - "Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent."
  - **Context Isolation**: "A subagent's context window starts fresh, with no parent conversation... The only content you pass from parent to subagent is the Agent tool's prompt string, so include any file paths, error messages, or decisions the subagent needs directly in that prompt."
  - **Parallelization**: "Multiple subagents can run concurrently, so independent subtasks finish in the time of the slowest one rather than the sum of all of them."
  - **AgentDefinition 필드**: `description`, `prompt`, `tools`, `model`, `skills`, `effort`, `maxTurns` 등 지원
  - "When you define subagents, Claude determines whether to invoke them based on each subagent's description field. Write clear descriptions that explain when the subagent should be used, and Claude will automatically delegate appropriate tasks."

### 3. Claude Code Hooks 공식 문서
- **출처**: [Claude Code Docs - Hooks Reference](https://code.claude.com/docs/en/hooks)
- **요약**: Hooks는 세션, 턴, 도구 호출 시점의 특정 라이프사이클 이벤트에 자동으로 실행되는 사용자 정의 명령/엔드포인트. 검증, 로깅, 차단, 변환이 가능.
- **인용 가능 데이터**:
  - **Hook Lifecycle**: 
    - Once per session: `SessionStart`, `SessionEnd`
    - Once per turn: `UserPromptSubmit`, `Stop`, `StopFailure`
    - Per tool call: `PreToolUse`, `PostToolUse`
  - **SessionStart**: "Fires when session begins or resumes. Matcher values: startup, resume, clear, compact. Output fields: additionalContext, sessionTitle, watchPaths, reloadSkills"
  - **PreToolUse**: "Fires before a tool call executes. Can block tool calls. Decision control: permissionDecision (allow/deny/ask/defer), updatedInput (수정된 도구 인자)"
  - **SubagentStop**: "Fires when a subagent finishes. Can prevent the subagent from stopping. Same decision control as Stop"
  - **Exit Codes**: "Exit 0 means success. Exit 2 means blocking error—Claude Code ignores stdout, and stderr text is fed back to Claude as an error message"

### 4. Agent Skills 공식 문서 - Overview
- **출처**: [Claude Platform Docs - Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- **요약**: Skills는 재사용 가능한 파일시스템 기반 리소스로, 도메인 전문성, 워크플로우, 베스트 프랙티스를 패키징. Progressive disclosure 아키텍처로 필요할 때만 메모리 로드.
- **인용 가능 문장**:
  - "Skills are reusable, filesystem-based resources that give Claude domain-specific expertise: workflows, context, and best practices that turn a general-purpose agent into a specialist."
  - **3-Level Loading**:
    - Level 1 (Metadata): Always loaded at startup (~100 tokens per Skill) - `name` and `description` from YAML frontmatter
    - Level 2 (Instructions): Loaded when Skill is triggered (under 5k tokens) - SKILL.md body
    - Level 3+ (Resources): Loaded as needed (0 tokens until accessed) - bundled files, scripts
  - "Progressive disclosure ensures only relevant content occupies the context window at any given time."
  - Skill 구조: 필수 필드는 `name`(64자 이하, 소문자/숫자/하이픈만), `description`(non-empty, 1024자 이하)

### 5. Claude Code Skills 공식 문서
- **출처**: [Claude Code Docs - Extend Claude with Skills](https://code.claude.com/docs/en/skills)
- **요약**: Claude Code에서 Skills는 `.claude/skills/*/SKILL.md` 파일로 정의되며, 프로젝트별 또는 전역(`~/.claude/`) 레벨에서 사용 가능. Skills는 CLI나 프로그래밍 방식으로 호출 가능.
- **인용 가능 내용**: [문서가 매우 길어서, 핵심은 위의 Agent Skills 공식 문서와 동일]

### 6. 모델 선택 가이드
- **출처**: [Claude Code Models: Choose the Right AI for Every Task](https://claudefa.st/blog/models/model-selection)
- **요약**: Haiku, Sonnet, Opus는 각각 다른 비용-성능 트레이드오프를 가짐. 기본값으로 Sonnet을 사용하고, 필요시 Opus로 업그레이드 또는 Haiku로 다운그레이드.
- **인용 가능 데이터**:
  - **가격**: Haiku 4.5: $1/$5 per M tokens, Sonnet 4.6: $3/$15, Opus 4.8: $5/$25
  - **성능 (SWE-bench Verified)**: Opus 4.8 (80.8%), Sonnet 4.6 (79.6%) - 격차 1.2%
  - **권장 사항**: "Default to Sonnet 4.6 for everything. Switch to Opus 4.6 when you need deep architectural reasoning or hit a problem Sonnet can't solve. Use Haiku 4.5 for simple cleanup tasks where speed matters more than intelligence."
  - **Hybrid Approach**: Haiku(router/triage) → Sonnet(bulk tasks) → Opus(10-15% deep reasoning) = 60-70% cost reduction

### 7. 모델 선택 가이드 (Platform Docs)
- **출처**: [Claude Platform Docs - Choosing the Right Model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- **요약**: 공식 문서에서 제시하는 모델 선택 프레임워크와 각 모델의 능력 범위.

### 8. Claude Code vs Agent SDK 비교
- **출처**: [Agent SDK vs Claude Code CLI (Augment Code)](https://www.augmentcode.com/tools/claude-code-vs-claude-agent-sdk)
- **요약**: 
  - Claude Code CLI: 대화형 개발, 일회성 작업용
  - Agent SDK: CI/CD 파이프라인, 커스텀 애플리케이션, 프로덕션 자동화용
- **인용 가능**: "Same capabilities, different interface"

### 9. Subagents 오케스트레이션 가이드
- **출처**: [Claude Code Subagents and Multi-Agent Orchestration Guide (Hidekazu Konishi)](https://hidekazu-konishi.com/entry/claude_code_subagents_and_orchestration_guide.html)
- **요약**: Subagent 호출 메커니즘, Context Isolation, Parallel Fan-Out, Nested Subagents 등의 패턴 설명.
- **인용 가능**:
  - "Subagents are invoked through the Agent tool, where the main agent calls it with a subagent_type and a prompt; Claude Code spins up the named subagent, runs it, and returns its final message as the tool result."
  - "Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent."
  - Parallel Execution: "The main session can spawn multiple subagents that run concurrently and report back independently"

### 10. Multi-Agent Pipeline 실제 사례 - 블로그/콘텐츠 자동화
- **출처**: [Building a Multi-Agent Content OS with Claude Code (The Nuanced Perspective)](https://thenuancedperspective.substack.com/p/building-a-multi-agent-content-os)
- **요약**: 팟캐스트 트랜스크립트를 입력받아 블로그, 스레드, 뉴스레터 섹션을 생성하는 파이프라인. 문제: 단일 에이전트 사용 시 세 가지 콘텐츠 모두 동일한 구조/예시/리듬을 공유. 솔루션: 각 포맷별 전문 서브에이전트 사용.
- **인용 가능**:
  - "A subagent is a separate Claude agent instance running independently within a Claude Code session"
  - "The orchestrator/worker pattern: the agent that spawns it is the orchestrator, and the orchestrator assigns tasks while subagents execute them"
  - "By delegating research, coding, and review to specialized subagents, you can cut task completion time by 40-60% while improving output quality"

### 11. Claude Code Multi-Agent Workflow Patterns
- **출처**: [Workflows in Agentic AI (Medium - DhanushKumar)](https://medium.com/@danushidk507/workflows-in-agentic-ai-claude-code-workflows-8cac80792dd8)
- **요약**: Sequential, Parallel Fan-Out, Supervisor/Manager, Debate, Swarm 등 5가지 주요 오케스트레이션 패턴 설명.
- **인용 가능**: "Five patterns dominate production multi-agent systems in 2026: fan-out, pipeline, debate, supervisor, and swarm. Each has a sharp best-fit use case and an equally sharp anti-pattern."

### 12. Multi-Agent Orchestration Best Practices
- **출처**: [Best Multi-agent Orchestration Frameworks in 2026 (TrueFoundry)](https://www.truefoundry.com/blog/multi-agent-orchestration-frameworks)
- **요약**: 다중 에이전트 파이프라인의 설계 원칙과 주의사항.
- **인용 가능**:
  - "Validate agent output before passing it to the next agent, as low-confidence, malformed, or off-topic responses can cascade through a pipeline."
  - "Consider circuit breaker patterns for agent dependencies and design agents to be as isolated as practical from each other"
  - "Use checkpoint features available in your SDK to help recover from an interrupted orchestration"

### 13. Claude Code Hooks Complete Guide
- **출처**: [Claude Code Hooks: Complete Guide (claudefa.st)](https://claudefa.st/blog/tools/hooks/hooks-guide)
- **요약**: Hook 타입(command, HTTP, MCP tool, prompt, agent), 설정 구조, 매처 패턴, Exit codes 상세 설명.
- **인용 가능**:
  - "Hook handler types: Command hooks (shell commands), HTTP hooks (POST to URL), MCP tool hooks (call MCP server tools), Prompt hooks (yes/no decisions), Agent hooks (spawn subagents)"
  - "Three nesting levels: Hook event (e.g., PreToolUse), Matcher group (filters by tool name), Hook handlers (actual commands/endpoints)"

### 14. MCP (Model Context Protocol) 공식 문서
- **출처**: [Claude Code Docs - Connect to External Tools with MCP](https://code.claude.com/docs/en/agent-sdk/mcp)
- **요약**: MCP는 에이전트를 데이터베이스, API, 외부 서비스에 연결하는 오픈 스탠다드. Tool search로 필요한 도구만 context에 로드.
- **인용 가능**:
  - "With MCP, your agent can query databases, integrate with APIs like Slack and GitHub, and connect to other services without writing custom tool implementations"
  - "The Model Context Protocol specifies how tools describe themselves to a model and how the model calls them"
  - "Tool search solves this by withholding tool definitions from context and loading only the ones Claude needs for each turn"

### 15. Claude Code Subagents 2026 가이드
- **출처**: [Claude Code Subagents 2026: Setup Parallel Agents (Ivern AI)](https://ivern.ai/blog/claude-code-subagents-multi-agent-guide-2026)
- **요약**: 서브에이전트의 Context Preservation, Cost Management, Parallel Execution, Behavior Specialization.
- **인용 가능**:
  - "Subagents help preserve context by keeping exploration and implementation out of your main conversation"
  - "Subagents enforce constraints by limiting which tools a subagent can use"
  - "Specialize behavior with focused system prompts for specific domains"

---

## 상충되는 정보 / 주의할 점

### 1. Subagent 배경 실행 동작의 변화 (v2.1.198)
- **정보**: Claude Code v2.1.198부터 서브에이전트는 기본적으로 배경에서 실행. Agent 도구 호출이 `run_in_background`를 생략하면 배경 실행되며, Claude가 결과가 필요하면 명시적으로 `run_in_background: false` 설정.
- **이전 동작**: v2.1.198 이전에는 생략 시 동기 실행(동기식).
- **권장**: 코드에서 Claude Code 버전을 확인하고 그에 맞게 조정 필요.

### 2. Context Inheritance의 제한
- **정보**: Subagent는 부모 대화 히스토리를 상속하지 않음. Agent 도구의 prompt 문자열을 통해서만 정보 전달 가능.
- **주의**: 파이프라인에서 이전 단계의 결과를 다음 단계에 전달할 때, 명시적으로 prompt에 포함해야 함.

### 3. Skills의 Cross-Surface 비동기화
- **정보**: Custom Skills는 surface 간에 자동 동기화되지 않음 (claude.ai ≠ API ≠ Claude Code).
- **해결**: 각 surface별로 별도 업로드/배치 필요.

### 4. Hooks 종료 코드 해석
- **명확한 정보**: Exit 0 = 성공, Exit 2 = 차단 에러(stderr를 Claude에 피드백), Exit 1/기타 = 무시됨(non-blocking).
- **주의**: PreToolUse hook에서 exit 2를 반환하면 도구 호출이 차단됨.

### 5. SessionStart Hook의 Model Field
- **정보**: SessionStart hooks만 `model` 필드를 받을 수 있으며, 반드시 present하지는 않음.
- **주의**: 다른 hook에서는 사용 불가.

---

## 글의 앵글 후보 (후킹 포인트)

1. **"단일 Claude로는 부족해" - 서브에이전트의 必然性**
   - 복잡한 작업을 단일 에이전트가 처리할 때의 한계 (context 폭발, 주의 산만, 느린 실행)
   - 서브에이전트로 각 단계를 전문화하면 얻는 이점 (context isolation, 병렬화, 비용 최적화)

2. **"블로그 글도 공장처럼 - 5단계 파이프라인의 설계"**
   - 리서치 → 기획 → 초안 → 리뷰 → 발행의 각 단계를 서브에이전트로 구현
   - 각 단계별 모델 선택 기준 (Haiku for triage, Sonnet for bulk, Opus for complex reasoning)
   - 실제 코드 예시 (Agent SDK with Python/TypeScript)

3. **"Hooks로 규칙을 강제한다" - 자동화의 신뢰성 확보**
   - SessionStart로 문맥 주입, PreToolUse로 위험 명령 차단, SubagentStop으로 품질 게이트
   - JSON 설정으로 선언적 제어

4. **"Skills vs Prompts - 재사용성의 비결"**
   - 반복되는 지시문을 Skill로 패키징
   - Progressive disclosure로 context 절약
   - 프로젝트 간 공유 가능한 자산화

5. **"서브에이전트 파이프라인의 함정과 해법"**
   - 컨텍스트 단절의 명시적 관리
   - Cascading failures 방지 (validation, circuit breaker)
   - 트랜잭션 무결성 문제와 workaround

6. **"비용 최적화: 같은 품질을 1/3 가격에"**
   - Haiku(라우팅) → Sonnet(본작업) → Opus(어려운 부분) 하이브리드 전략
   - 블로그 자동화 파이프라인에 적용할 때의 구체적 비용 예상

---

## 추가 검증이 필요한 부분 (미확인)

- Claude Code v2.1.210 이상에서 subagent 최대 깊이 제한(5레벨) 상세 동작
- 각 모델별 blog writing 품질 벤치마크 (일반 코딩 벤치마크만 공개)
- 대규모 병렬 subagent 실행 시(수십 개) 실제 성능/비용 특성
- Notion/로컬 발행 간 hook 동작의 차이

---

## 글 작성에 필요한 추가 조사 권장

### Sonnet이 재조사할 것을 권장하는 부분:
- **기술 깊이**: Hooks의 매처 정규식 동작, MCP 서버 인증 흐름 등 복잡한 부분
- **최신 릴리즈 정보**: Claude Code v2.1.210+ 세부 변경사항 (공식 CHANGELOG 필요)
- **실제 성능 데이터**: 블로그 파이프라인 구축 시 평균 실행 시간, 토큰 사용량 (실험 데이터 필요)

