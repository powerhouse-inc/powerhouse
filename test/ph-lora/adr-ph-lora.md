*This document is intended to stir the pot and get feedback from the team through assumptions.*

## What is ph-lora?
___

An agent loop built on ph-clint with several core responsibilities:

1. **System Mapper** — reads the monorepo, extracts document models, API surfaces, endpoints, capabilities. Writes findings into the knowledge vault (tbd). This is its "brain build" phase.

2. **Doc Auditor** — compares the live system surface against what the source docs aim. Flags missing, stale, or wrong documentation. Also ensures the LLM-documentation file stays complete.

3. **Test Runner / Generator** — executes E2E tests (Playwright for Connect UI, direct API/GraphQL for Reactor + Switchboard), reports what's covered, what's broken, what's undocumented behavior.

#### **Primary success outcomes**: 
1. A developer can run ph-lora verify against a local Powerhouse stack and get a gap report (docs vs. live system)
2. A CI job on the monorepo automatically fails when documentation is stale
3. A running daemon that continuously monitors a deployed environment and files GitHub issues on incompletenss of documentation. 

#### Up for discussion: Relationship with the knowledge vault.

4. **Is it a Knowledge Writer?** — continuously feeds its findings back into the knowledge vault so both humans and other agents can act on them.

5. **MCP server?** - ph-lora accumulates a rich model of system state (surface map, gap report, doc model). Exposing this as an MCP server would let any AI tool (Claude, another Mastra agent, an IDE plugin) query it directly. ph-lora IS the knowledge interface? Or the knowledge vault's own MCP server is sufficient and ph-lora doesn't need its own? 


## What is ph-lora NOT?
___

**Not a UAT agent**. That belongs to a future ph-uat agent. 
ph-lora defines the test surface, gaps and keeps documentation in sync; ph-uat executes the journeys.

**Not a code writer**. ph-lora never commits files, writes code, or opens fix PRs. It is an observer and reporter. Humans or a **separate doc-writing agent** act on its findings.

**Not a hosted web UI.** ph-lora is not a browser-based interface for browsing documentation. (But it could potentially be build on top of it?)

**Not a replacement for the monorepo test suite.** ph-lora runs and reports the existing test suite. It does not replace it, rewrite it, or own it. It could add new tests to it with the help of a delegation agent. 

**Not a semantic documentation reviewer.** ph-lora does not evaluate whether documentation prose is well-written, accurate in nuance, or complete in explanation. It checks structural coverage — does the documented surface match the live surface. For this purpose we have a doc-writing agent?

**Not a monorepo package**. ph-lora lives in its own repository. The monorepo is an input it reads, not its home.

**Not opinionated about fixing gap.** ph-lora identifies and reports gaps. It has no opinions on priority, assignment, or resolution strategy — that is a human or downstream agent concern.

## Additional delegation/ sub-agents required

- `Documentation writer`: Trained on tone of voice, knowledge vault, ph-lore input
- `ph-coredev`: 
- `Knowledge agent`: accepts/reviews/orchestrate input from ph-lora to the knowledge vault. (See Liberuums work)
- `E2E test creator`: creates new E2E tests based on ph-lora input
- `User Acceptance tester`: A agent that can complete and test tutorials and user stories.

| ph-lora | ph-uat |
| -------- | -------- |
| Do the APIs/endpoints respond? | Can a real user complete a tutorial end-to-end?   |
| Does the CLI command exist and produce the right shape?    | Does running ph generate + all follow-up steps actually work?   |
| Is this operation documented?    | Does the documented outcome match the actual UX?   |
| Playwright smoke layer    | Playwright full user journey  |
| Requires: running reactor    | Requires: clean-state environment per test  |

ph-lora defines the test surface (what's claimable, what's testable) and writes it to the knowledge vault. ph-uat consumes that surface and executes the full journeys. They share the same ph-clint harness and infrastructure.

ph-lora could have a `--depth` flag. 
- `light` = API surface + doc completeness. 
- `smoke` = Playwright smoke layer. 
- `full` = delegates to ph-uat if available, or errors with "uat agent not configured."


## Ph-lora's Architecture Assumptions
___ 
### The Core Loop w. Knowledge Vault

discover → diff against docs → run tests → (write knowledge notes?) → open issues for gaps → wait for trigger → repeat.

Q: what note types does ph-lora write? 
A: Gaps, test results, doc coverage, endpoint inventory

The knowledge vault is both ph-lora's working memory and its output artifact. The routine loop is triggered by code changes, doc changes, or schedule.

### Potential Commands

ph-lora/
├── commands/
│   ├── discover.ts       # scan reactor: document models, endpoints, MCP tools
│   ├── verify-docs.ts    # diff live surface vs ACADEMY_LLM_COMPLETE.md
│   ├── test.ts           # run E2E suite (configurable depth)
│   ├── report.ts         # write findings → knowledge vault + GitHub issues
│   └── sync-academy.ts   # flag/PR stale academy docs
├── triggers/
│   ├── git-commit.ts     # file watch on --repo-path
│   ├── schedule.ts       # cron
│   └── ci.ts             # one-shot, exit code = pass/fail

### Trigger model: what kicks ph-lora off?

1. Always-on daemon reacting to commits/doc changes via file watch or webhooks
2. Invoked manually in REPL by a developer
3. CI job on PR
4. Scheduled nightly run 

### Where does ph-lora live?
Its own repo (using ph-clint as a dependency, like the examples). Given "future clients run it against their own deployment".

**Read access** — ph-lora is configured with --repo-path /path/to/powerhouse (a local checkout) or a GitHub API token for remote reads. In CI, the monorepo checks out ph-lora and passes --repo-path . so it has direct filesystem access. In daemon/local mode, it points at a sibling directory. ph-lora accesses the monorepo via `--repo-path` (local filesystem pointer) or GitHub API (remote). In CI, the monorepo checks out ph-lora and passes `--repo-path .`

**Write influence** — ph-lora never writes code directly. It writes findings to the knowledge vault (as bai/knowledge-note documents) and opens GitHub issues or PRs via gh CLI or GitHub API. A human or another agent in the monorepo acts on those. This is a clean separation: ph-lora is an observer/reporter, not an actor on the codebase.

In the future ph-lora can be repo-agnostic — it can be pointed at any Powerhouse deployment, to serve future client cases. 
