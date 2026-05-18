# /doc-clarity

Review one academy documentation section for prose quality, clarity, and appropriate scope. Does not check code correctness — use `/doc-review` for that. Does not edit files — outputs suggestions for a human or doc-writer agent to act on.

**Usage:** `/doc-clarity <section-id>`

**Best run after `/doc-fix`** — reviewing prose on a section with known mechanical gaps is waste.

**Section IDs** (from `test/ph-lora/ph-lora-mapping.json`):
`get-started` · `mastery-builder-environment` · `mastery-document-model-creation` · `mastery-building-user-experiences` · `mastery-work-with-data` · `mastery-launch` · `example-usecases` · `api-references-cli` · `api-references-react-hooks` · `api-references-reactor-client` · `api-references-relational-database` · `api-references-renown-sdk` · `api-references-migration-guides` · `component-library` · `architecture`

---

## Steps

### 1. Load the mapping entry

Read `test/ph-lora/ph-lora-mapping.json`. Find the entry where `id === "$ARGUMENTS"`. Extract `docPath` and `label`.

Infer the **doc type** from the section ID and path:

| Pattern                                                 | Doc type      |
| ------------------------------------------------------- | ------------- |
| `get-started`, `mastery-*`                              | Tutorial      |
| `api-references-*`                                      | API reference |
| `architecture`, `component-library`, `example-usecases` | Conceptual    |

The doc type changes which rubric items apply — note this throughout the review.

### 2. Load the doc files

Read all `.md` files under `apps/academy/$DOCPATH`. Skip files prefixed with `_`.

Do not load any source code. This review is about the writing, not the accuracy of the claims.

### 3. Check for an existing gap report

Look for a file in `test/ph-lora/gap-reports/` matching this section (same lookup as `/doc-fix`). If one exists, scan it for open findings. If there are unresolved `high` or `medium` findings, add this notice at the top of your output:

```
⚠ Gap report for this section has unresolved findings. Run /doc-fix first so prose review reflects the corrected content.
```

Then continue anyway — some clarity issues are independent of mechanical gaps.

### 4. Run the clarity review

Read the doc with the following rubric. For each issue you find, record: the location (heading or line range), the specific problem, and a concrete suggestion for what to do instead.

Only flag things where the fix would meaningfully help a developer. Skip pedantic style preferences.

---

#### Rubric A — Audience calibration

**Over-explaining concepts the audience already knows:**

- Tutorial audience: developers with existing JS/TS knowledge. Do not explain `async/await`, module imports, or basic React patterns (hooks rules, useState, etc.)
- API reference audience: developers actively building Powerhouse editors. Do not explain what a hook is, what TypeScript generics are, or what a package manager does
- Conceptual audience: broadly technical. Explain Powerhouse-specific concepts; don't explain general programming

Flag any block — paragraph, callout, or `<details>` — whose content would be obvious to the intended audience. Suggest removing it or moving it to a dedicated "Foundations" or "Prerequisites" page.

**Under-explaining Powerhouse-specific concepts:**

- If a doc uses a Powerhouse-specific term (Reactor, Drive, Document Model, Switchboard, Renown) without a brief definition or link on first use, flag it
- This applies most to tutorial docs where a developer is encountering these terms for the first time

---

#### Rubric B — Structure

**Heading depth:**

- H4 (`####`) in a tutorial or reference doc is usually over-nesting. Flag any `####` heading that could be replaced by a bold lead-in sentence or a flat list
- A section with exactly one child section should be collapsed — either make the child inline prose or promote it

**Callout abuse (`:::note`, `:::tip`, `:::warning`, `:::info`):**

- Callouts should be for genuinely exceptional information that a developer might otherwise miss
- Flag callouts that describe the default/expected behavior ("Note: the command will install your dependencies")
- Flag callouts that appear more than 3 times in a single page — callout fatigue makes all of them invisible
- `:::tip` referencing a tutorial repository at the top of every tutorial page is fine — this is a structural convention, not abuse

**Prerequisite bloat:**

- More than 4 prerequisites for a single tutorial section is a smell
- Prerequisites that are implied by context (e.g., "have Node installed" on page 5 of a tutorial that already used Node on page 1) should be removed
- Flag each over-listed prerequisite with a suggestion to either remove it or consolidate into a single link to a central "Prerequisites" page

**`<details>` blocks:**

- Legitimate use: genuinely optional deep-dive that would interrupt flow for most readers
- Flag `<details>` blocks whose content is load-bearing (the reader needs it to complete the step) — that content should be inline
- Flag `<details>` blocks that contain content the target audience doesn't need at all — suggest removing rather than hiding

---

#### Rubric C — Example quality

**Minimal example principle:**

- A code example should demonstrate exactly one thing
- Flag examples with 5 or more imports when the concept being shown uses 1-2 of them
- Flag examples that define helper functions, mock data, or scaffolding that isn't directly relevant to the concept being demonstrated
- Suggest what to trim, not just that it's long

**Comment overload:**

- Inline comments that restate what the code already says are noise (`// create the document` above `createDocument()`)
- Flag examples where more than 30% of the lines are comments
- Exception: comments that explain non-obvious behavior or Powerhouse-specific side effects are fine

**Copy-paste viability:**

- An example that a developer cannot copy-paste into a real project without significant modification should say so explicitly, or be rewritten as a minimal working example
- Flag examples that use placeholder strings like `"your-document-id"` without acknowledging them, or that reference variables not defined in the example

---

#### Rubric D — Prose directness

**Passive and indirect phrasing:**
Flag these constructions and suggest the direct form:

| Indirect                         | Direct                          |
| -------------------------------- | ------------------------------- |
| "the document should now appear" | "you will see X in the sidebar" |
| "it is recommended that you use" | "use X"                         |
| "can be used to achieve"         | "does X"                        |
| "it is important to note that"   | just say the thing              |
| "in order to"                    | "to"                            |
| "you may want to consider"       | "use X if Y"                    |

Only flag these when they appear in instructional steps or summaries. Prose-heavy conceptual sections can carry more natural phrasing.

**Run-on introductions:**

- An overview or intro paragraph longer than 4 sentences that doesn't tell the developer what they will be able to do by the end of the section — suggest trimming to: what this section covers, what the reader will have when done

**Redundant phrasing between prose and example:**

- If a paragraph explains exactly what the following code example shows, and the example is self-evident, the paragraph is redundant
- Flag these pairs and suggest which side to keep (usually the example)

---

#### Rubric E — Section completeness signals

These are not clarity issues but are worth surfacing for a doc writer:

- A section that ends abruptly without a "next step" link or outcome statement (tutorial sections only)
- A reference section that documents behavior but links to nothing related in the rest of the academy
- An example that references a concept (e.g., a Reactor method) with no link to where that concept is explained

Do not flag missing technical content — that's `/doc-review`'s job. Only flag structural completeness signals.

---

**What NOT to flag:**

- Prose that is correct and clear, even if it's verbose — verbosity is not the same as complexity
- Technical precision that might look like over-explanation but is needed for correctness
- Style preferences (comma usage, sentence rhythm, British vs American spelling)
- Examples that are complex because the underlying API is complex
- Content already in the gap report's "Could not verify" section

---

### 5. Output the review

```
## Clarity Review: <section label>

Reviewed: <docPath>
Doc type: <tutorial | api reference | conceptual>
Files reviewed: <filenames>

⚠ (Only if gap report has unresolved high/medium findings — otherwise omit this line)

### High priority

Suggestions that would materially reduce friction for a developer reading this section:

- **[Location: heading or line range]** Issue description. Suggestion: what to do instead.

### Medium priority

Suggestions that would improve clarity but don't block understanding:

- **[Location]** Issue. Suggestion.

### Low priority

Minor improvements worth a pass if the section is being edited anyway:

- **[Location]** Issue. Suggestion.

### Reads well — don't change

Call out 3-5 things that are working and should be preserved. This prevents a doc writer from "fixing" things that are already good.

- Quick Reference table: scannable structure with good category grouping — keep this pattern
- Step numbering in the tutorial: consistent and easy to follow

### Suggested structural changes

Only include this section if there are changes that span multiple subsections or would affect the page structure (e.g., "move the Foundations callout to a dedicated page", "merge sections 3 and 4 — they describe the same step"):

- [Suggestion]
```

Aim for no more than 8 total suggestions across all priority levels. If you find more, keep the highest-impact ones and note "X additional minor items omitted for brevity." Quality over quantity — a doc writer who gets 20 suggestions addresses zero of them.

If the section is clean, say so explicitly: "No significant clarity issues found. The section is appropriately scoped for its audience." A clean result is a valid result.
