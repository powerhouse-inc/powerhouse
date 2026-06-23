# /doc-voice

Bring one academy documentation section into line with the canonical voice in `apps/academy/STYLE.md` — direct, specific, no marketing adjectives, no LLM-isms. Checks **voice and phrasing only**; does not check code correctness (`/doc-review`) or structure and scope (`/doc-clarity`).

**Usage:** `/doc-voice <section-id> [--apply]`

- Without `--apply` (default): outputs before/after suggestions for a human to act on. Edits nothing.
- With `--apply`: rewrites the prose in place, then outputs a change summary. Never touches code blocks, signatures, headings, links, or technical claims.

**Best run after `/doc-fix`** — polishing prose on a section with known mechanical gaps is waste. Run order for a section: `/doc-review` → `/doc-fix` → `/doc-voice` → `/doc-clarity`.

**Section IDs** (from `test/ph-lora/ph-lora-mapping.json`):
`get-started` · `learn` · `build-manual-todo-tutorial` · `build-document-model-creation` · `build-user-experiences` · `build-work-with-data` · `build-launch` · `build-example-usecases` · `reference-architecture` · `reference-reactor` · `reference-document-models` · `reference-graphql-data` · `reference-processors` · `reference-editors-ui` · `reference-authorization` · `reference-cli` · `lookup`

---

## Steps

### 1. Parse arguments

Split `$ARGUMENTS` into the section id and an optional `--apply` flag. Everything that isn't `--apply` is the section id.

### 2. Load the voice spec

Read `apps/academy/STYLE.md` in full. This is the rubric for the entire run. Every suggestion you make must trace to a rule in it — the banned lexicon table, the structural LLM-isms list, the em-dash rule, the core rules, or audience calibration. Do not invent style preferences that aren't in the spec.

### 3. Load the mapping entry

Read `test/ph-lora/ph-lora-mapping.json`. Find the entry where `id === <section-id>`. Extract `docPath` and `label`.

Infer the **doc type** for audience calibration:

| Pattern | Doc type |
| --- | --- |
| `get-started`, `build-*` | Tutorial |
| `reference-*` (except `reference-architecture`) | API reference |
| `learn`, `lookup`, `reference-architecture` | Conceptual |

### 4. Load the doc files

Read all `.md` and `.mdx` files under `apps/academy/$DOCPATH`. Skip files prefixed with `_` (drafts not published by Docusaurus). Do not load source code — this pass is about how the writing sounds, not whether claims are true.

### 5. Scan against the voice spec

Walk the prose and record each issue with: location (heading or line range), the rule it violates, the exact current text, and a concrete rewrite.

Check, in priority order:

1. **Marketing adjectives and banned lexicon** — every term in the STYLE.md banned table. These are the highest-signal, lowest-risk fixes.
2. **Structural LLM-isms** — throat-clearing intros, closing summaries, "it's not just X — it's Y", chummy filler, decorative emphasis, forced rule-of-three.
3. **Indirect / hedged / passive phrasing in steps and summaries** — rewrite to the direct imperative or present-tense form.
4. **Em-dash density** — flag any paragraph with more than one em-dash; propose a period, colon, or parentheses for the surplus.
5. **Vague where specific is available** — flag generic phrasing ("quickly", "the relevant directory") only when the doc itself already contains the specific value elsewhere, or when it's clearly knowable. Do not invent specifics.

**Only flag what STYLE.md actually bans.** Skip phrasing that is already direct, correct, and specific even if you could phrase it differently. The goal is voice consistency, not personal preference. Aim for the changes a careful editor would make, not a full rewrite.

### 6a. Default mode (no `--apply`) — output suggestions

```
## Voice Review: <section label>

Reviewed: <docPath>
Doc type: <tutorial | api reference | conceptual>
Files reviewed: <filenames>
Against: apps/academy/STYLE.md

### Banned lexicon & marketing language
- **[Location]** "<current>" → "<rewrite>"  (rule: <which>)

### Structural LLM-isms
- **[Location]** <what> → <fix>

### Phrasing — indirect / hedged / passive
- **[Location]** "<current>" → "<rewrite>"

### Em-dash density
- **[Location]** N em-dashes in one paragraph → split with period/colon

### Reads well — don't change
Call out 3–5 passages that already match the voice, so a later editor doesn't "fix" them.
- ...

### Summary
N suggestions across the section. <One sentence on overall voice state.>
```

Aim for the highest-impact changes. If you find more than ~15, keep the strongest and note "X additional minor items omitted." A clean section is a valid result — say so explicitly.

### 6b. Apply mode (`--apply`) — rewrite in place

Make the edits directly in the doc files, **one targeted edit per issue**.

**Only ever change prose.** Never touch:

- Code blocks, inline code, signatures, import paths, command lines
- Headings, anchors, links, frontmatter
- Tables of technical data, callout directives (`:::note` etc.) themselves — you may edit the prose inside a callout, not the directive
- Any factual or technical claim — if removing a banned word would change meaning, rephrase to preserve the exact meaning, or skip it and list under "Needs human review"
- Content in `_`-prefixed files

Preserve every technical fact. "seamless sync" → "sync" is fine; deleting a clause that states *what* syncs is not. When in doubt, make the smaller edit.

Then output:

```
## Voice Fix Summary: <section label>

Against: apps/academy/STYLE.md
Files edited: <list>

### Applied
| # | File | Rule | Change |
|---|------|------|--------|
| 1 | 00-VetraStudio.mdx | banned-lexicon | "powerful, seamless environment that empowers you to" → "environment that lets you" (line 8) |
| 2 | 00-VetraStudio.mdx | em-dash | split 3-dash paragraph into two sentences (lines 36–41) |

### Needs human review
Edits where removing the LLM-ism risked changing meaning:
- **[Location]** "<text>" — <why a human should decide>

### Summary
N edits applied across M files. <One sentence.>
```

If nothing needed changing, say so and list a few passages that already match the voice.

---

**Relationship to the other doc skills:**

- `/doc-review` — code correctness (does the API still exist / match?)
- `/doc-fix` — applies `/doc-review` findings
- `/doc-clarity` — structure, scope, audience calibration, example quality (suggest-only)
- `/doc-voice` — **this skill**: voice, phrasing, LLM-isms (suggest or apply)

`/doc-clarity` and `/doc-voice` both read `apps/academy/STYLE.md` for the prose lexicon. `/doc-clarity` covers what to say and how to structure it; `/doc-voice` covers how it sounds.
