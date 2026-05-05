# ph-lora — Initial Strategy

> Session output from initial planning. Captures decisions made, what was built, and key design principles. Cross-reference: [adr-ph-lora.md](adr-ph-lora.md), [ph-lora-mapping.md](ph-lora-mapping.md).

---

## Mission

ph-lora is the agent responsible for keeping the Powerhouse monorepo code in sync with the academy documentation. It flags gaps and inconsistencies between what the code does and what the docs say, then triggers follow-up agents or opens GitHub issues for out-of-sync items.

**Token efficiency is a core constraint** — ph-lora must function on smaller/local models where possible. This shapes every architectural decision.

---

## Scope of This Strategy

The ADR defines three responsibilities for ph-lora: System Mapper, Doc Auditor, and Test Runner / Generator. **This strategy currently covers only the Doc Auditor path.** The other two are explicitly deferred:

- **System Mapper** (reads monorepo, builds knowledge graph) — deferred. Feeds into the knowledge vault relationship, which is an unresolved blocking question (see below).
- **Test Runner / Generator** (Playwright for Connect UI, direct API/GraphQL for Reactor + Switchboard) — deferred to a later phase. Test runner scope belongs to ph-lora's `--depth smoke` and `--depth full` modes. Full E2E execution is ph-uat's responsibility.

### `--depth` flag design

The ADR proposes a `--depth` flag that maps directly to the tiered checking strategy:

| Flag            | What it does                                  | Maps to                |
| --------------- | --------------------------------------------- | ---------------------- |
| `--depth light` | API surface scan + doc completeness check     | Tier 1 + Tier 2        |
| `--depth smoke` | Playwright smoke layer                        | Test Runner (deferred) |
| `--depth full`  | Delegates to ph-uat, errors if not configured | ph-uat boundary        |

Default should be `light`. CI runs `light`. Manual developer invocation can go deeper.

### ph-lora vs ph-uat boundary

ph-lora defines what is testable and documented. ph-uat executes full user journeys. They share the same ph-clint harness.

| ph-lora                                                 | ph-uat                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Do the APIs/endpoints respond?                          | Can a real user complete a tutorial end-to-end?                 |
| Does the CLI command exist and produce the right shape? | Does running `ph generate` + all follow-up steps actually work? |
| Is this operation documented?                           | Does the documented outcome match the actual UX?                |
| Playwright smoke layer                                  | Playwright full user journey                                    |
| Requires: running reactor                               | Requires: clean-state environment per test                      |

---

## Checking Strategy (Tiered)

### Tier 1 — Static Analysis (Zero LLM Cost)

- Extract TypeScript code blocks from docs and run `tsc` against them
- A snippet that no longer compiles signals API drift
- Analogous to what Google does internally for doc freshness
- **Built:** `npm run check:doc-snippets`

**Key finding from running Tier 1:**

- 507 snippets found across mapped doc sections
- 295 apparent "failures" — all noise, not real drift
- Root cause: two fundamentally different doc types require different strategies:

| Doc type               | Description                       | Checkable?                    |
| ---------------------- | --------------------------------- | ----------------------------- |
| **Tutorial docs**      | Partial, step-in-context snippets | No — can't compile standalone |
| **API reference docs** | Complete, importable snippets     | Yes — type-checkable          |

- **Correct fix:** opt-in tagging (` ```typescript check `) so authors explicitly mark checkable snippets

**Implementation findings (session 2):**

`check-doc-snippets.ts` was implemented and verified end-to-end. Three technical decisions made during implementation:

1. Snippets are wrapped in `declare module "__snippet__" { }` rather than written as `.d.ts` files. `.d.ts` silently ignores undefined type names; the module wrapper in a `.ts` file does not — so a removed type causes TS2304 as intended.
2. `fs.realpathSync` is required on macOS to resolve the `/var/...` → `/private/var/...` symlink, otherwise tsc emits relative paths that can't be matched back to snippet files.
3. The script uses the monorepo-local tsc binary (`node_modules/.bin/tsc`) directly. The pnpm global tsc wrapper was broken in this environment.

**Honest assessment of Tier 1 value — narrower than expected:**

After implementation, the real utility of the TSC checker is narrower than the original framing suggested. Specifically:

- Snippets that use only primitive types (`string`, `boolean`, `undefined`) **can never fail** — they're valid TypeScript regardless of what the actual API does. The three seed snippets tagged in `01-ReactHooks.md` fall into this category.
- A snippet like `function useSelectedDocumentId(): string | undefined;` does not check against the real implementation. It is a declaration, not a consumer. Changing the real return type to `number` produces zero errors.
- The checker **only** catches: a type name referenced in the snippet that no longer exists in the package (TS2304). This requires snippets to include `import type` statements.

**What would make Tier 1 genuinely useful:**

API reference snippets need to include imports for the checker to have teeth:

```typescript check
import type { PHDocument, Action } from "@powerhousedao/reactor-browser";

declare function useSelectedDocument(): readonly [
  PHDocument,
  (action: Action) => void,
];
```

If `PHDocument` is removed or renamed in the package, this snippet fails. Without the import, it never fails. The current academy API reference docs do not include imports in their signature snippets, so Tier 1 provides minimal coverage today.

**Revised verdict on Tier 1:**

Tier 1 is a cheap tripwire, not a comprehensive drift detector. It catches the most egregious form of drift (a type is deleted and a snippet references it) but misses the common cases (signature changed, parameter renamed, return type widened). The high-value work is Tier 3 — semantic review by an agent that sees both the doc section and the actual package source. Tier 1 is worth keeping as a zero-cost safety net, but should not be treated as meaningful coverage.

### Tier 2 — Small Model, PR-Level Classification

- On every PR, a cheap model reads the diff and answers: "does this introduce a feature that needs a doc update?"
- Binary yes/no output → opens a GitHub issue if yes
- Keeps expensive models out of the hot path
- Prior art: Nextra does something similar

### Tier 3 — Large Context, Release-Level Review

- At staging deploy, spin up one agent per academy section in parallel (~8–9 agents)
- Each agent receives: its doc section + the relevant code subsystem (from `ph-lora-mapping.json`)
- Prompt: "What's out of sync, missing, or wrong?"
- Preferred approach: simple prompt engineering, no complex infrastructure

**How the mapping file feeds Tier 3:**

`ph-lora-mapping.json` is the key mechanism that makes Tier 3 work without RAG. Each section entry carries:

- `docPath` — the academy section to load as the doc context
- `packages` — the monorepo packages to load as the code context
- `checkFocus` — a scoping hint that goes directly into the agent prompt

A Tier 3 agent for React Hooks gets: the content of `04-APIReferences/01-ReactHooks.md` + the source of `packages/reactor-browser` + the `checkFocus` string. No embedding, no retrieval — just structured context assembly. The mapping file is what replaces RAG.

### Rejected: Embeddings / RAG

- Initial hypothesis: cosine similarity between code and doc embeddings
- **Rejected** — chunking problems, questionable cross-domain similarity, infrastructure overhead
- Verdict: more complexity, worse outcome than the tiered approach

---

## What Was Built

| Artifact                                     | Description                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/academy/static/llms.txt`               | Spec-compliant navigation index ([llmstxt.org](https://llmstxt.org) standard)                 |
| `apps/academy/static/llms-full.txt`          | Full academy content concatenated; replaces `academy_LLM_docs.md`                             |
| `apps/academy/scripts/generate-llm-docs.ts`  | Generator producing both files; filters draft/archive content                                 |
| `test/ph-lora/ph-lora-mapping.json`          | Explicit mapping of 15 doc sections → monorepo packages + 9 unmapped packages flagged as gaps |
| `apps/academy/scripts/check-doc-snippets.ts` | Tier 1 static checker — extracts TypeScript blocks and runs `tsc`                             |

**Immediate value from the mapping file:** 9 packages had zero doc coverage identified before running a single check.

---

## Key Design Principles

1. **Break work by doc section, not by embedding similarity.** Sections are the natural unit of ownership and match how the monorepo is structured.
2. **Static analysis first.** Catch what you can for free before spending tokens.
3. **Small model for classification, large model only at release cadence.** Matches cost to signal quality.
4. **`llms.txt` as agent input.** The index built here is a ready-made input for Tier 3 agent loops — no extra infrastructure needed.
5. **Start as a Claude Code skill.** Validate the prompt manually, then automate with `/schedule`.

---

## Unmapped Packages (Documentation Gaps)

These packages exist in the monorepo but have no academy section currently responsible for them. ph-lora should flag these as gaps:

- `packages/reactor-attachments`
- `packages/reactor-hypercore`
- `packages/reactor-mcp`
- `packages/registry`
- `packages/config`
- `packages/opentelemetry-instrumentation-reactor`
- `packages/powerhouse-vetra-packages`
- `packages/switchboard-gui`
- `apps/connect`

---

## Open Questions

### Blocking — must resolve before implementation can proceed

**Knowledge vault relationship** — the most consequential open question. Determines whether ph-lora is stateful or stateless. If ph-lora writes findings to the vault (gap reports, test results, doc coverage, endpoint inventory), it needs a defined note schema and write interface. If it doesn't, it's a pure reporter and each run is independent. Everything downstream — the MCP server question, the daemon model, the System Mapper scope — depends on this answer. See [adr-ph-lora.md](adr-ph-lora.md) §"Up for discussion".

### Non-blocking — decided when we get there

**Trigger model** — four options from the ADR, all viable, not mutually exclusive:

1. Always-on daemon reacting to commits/doc changes via file watch or webhooks
2. Manual invocation in REPL by a developer
3. CI job on PR (likely the first one to implement)
4. Scheduled nightly run

Starting as a Claude Code `/schedule` skill covers option 4 and validates the prompt before CI wiring (option 3). Options 1 and 2 are daemon-mode concerns for after the knowledge vault question is settled.

**MCP server** — should ph-lora expose its own MCP server, or is the knowledge vault's MCP server sufficient? Blocked on the knowledge vault decision above.
