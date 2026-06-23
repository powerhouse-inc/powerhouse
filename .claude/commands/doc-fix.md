# /doc-fix

Apply targeted fixes to one academy documentation section based on its gap report.

**Usage:** `/doc-fix <section-id>`

**Section IDs** (from `test/ph-lora/ph-lora-mapping.json`):
`get-started` · `learn` · `build-manual-todo-tutorial` · `build-document-model-creation` · `build-user-experiences` · `build-work-with-data` · `build-launch` · `build-example-usecases` · `reference-architecture` · `reference-reactor` · `reference-document-models` · `reference-graphql-data` · `reference-processors` · `reference-editors-ui` · `reference-authorization` · `reference-cli` · `lookup`

**What this command does:** reads the gap report for the section, re-verifies every finding against current source, then makes the minimum edit needed to bring the doc in sync. It does not rewrite prose, invent behavior, or commit files.

---

## Steps

### 1. Load the mapping entry

Read `test/ph-lora/ph-lora-mapping.json`. Find the entry where `id === "$ARGUMENTS"`. Extract `docPath`, `sourceFiles`, and `checkFocus`.

If `skipMechanicalCheck` is true, output: "Section marked skipMechanicalCheck — skipping." and stop.

### 2. Find the gap report

Look in `test/ph-lora/gap-reports/` for a file matching the section. Try in order:

1. Filename contains the last hyphen-segment of `$ARGUMENTS` (e.g. `reference-editors-ui` → `ui`, `build-work-with-data` → `data`)
2. Filename contains `$ARGUMENTS` verbatim
3. Open every file in the directory and match on the `Reviewed:` metadata line against `docPath`

If no gap report is found, output:

```
No gap report found for '$ARGUMENTS'. Run /doc-review $ARGUMENTS first, then save the output to test/ph-lora/gap-reports/gap-report-<shortname>.md.
```

and stop.

### 3. Parse the gap report

Extract the full Findings table. For each row record: `#`, `urgency`, `type`, `doc location`, `source location`, `finding` text.

Also note anything in "Could not verify" — these are not fixable without runtime information and must be skipped.

Separate findings into fix groups:

| Group | Contents                                           | Action                                      |
| ----- | -------------------------------------------------- | ------------------------------------------- |
| A     | All `stale` and `wrong` findings, any urgency      | Fix — these are pure mechanical corrections |
| B     | `missing` findings with urgency `high` or `medium` | Add a minimal stub                          |
| C     | `missing` findings with urgency `low`              | List as suggested additions, do not write   |

### 4. Load the source

For each path in `sourceFiles`:

- Path ending in `.ts` → read that file
- Path without extension → list and read all `.ts` files inside that directory

This is the source of truth. You will verify every finding against this before touching the doc.

Token budget: stay under 60k tokens for source. If a directory is large, prioritise the files that back the specific findings you are about to fix.

### 5. Load the doc files

Read all `.md` files under `apps/academy/$DOCPATH`.

### 6. Verify then fix — one finding at a time

Process Group A first (stale + wrong), then Group B (missing high/medium), in urgency order within each group.

**For every finding, before editing:**

Re-verify the finding against current source:

- Confirm the reported source location still exists
- Confirm the source still says what the gap report claimed

If the source has changed and the finding no longer applies → mark `[SKIPPED — source changed since report]` and move on. Do not guess what the current correct value is; re-run `/doc-review` instead.

---

**Fixing `stale` findings** (documented name/signature no longer matches source):

Locate the stale string in the doc. Replace with the exact name or signature from source. Scope: the minimal edit — do not rewrite surrounding explanation prose.

If the rename also appears in code examples within the same section, fix those too, but only the renamed token — not the surrounding example structure.

Examples of minimal stale fixes:

- Function renamed: replace every occurrence of the old name with the new one in the section
- Return type changed: update the return type annotation in the signature line and in any summary table row
- Parameter renamed: update the parameter name in the signature line and in any example that passes it by name

---

**Fixing `wrong` findings** (example calls wrong function, import uses wrong package name, copy-paste error):

Locate the wrong code block. Fix only the specific wrong token. Do not rewrite the surrounding example or add new explanation.

Examples:

- Wrong import string: `"reactor"` → `"@powerhousedao/reactor"` — change that string literal only
- Copy-paste wrong hook: replace the wrong hook name in the example body with the correct one
- Wrong interface member: remove the members that don't belong; add or correct those that do

For `wrong` findings that involve a conflated interface (e.g., doc merges two separate source interfaces into one): replace the doc's interface block with the exact members of the single interface that is documented, sourced directly from the declaration. Do not guess or invent the correct interface shape — read it from source.

---

**Fixing `missing` findings (Group B — high and medium urgency only):**

Add a minimal documentation entry. Position it logically — immediately before the next peer-level `##` heading in the same file, or at the end of the section if no peer exists.

The stub must contain:

1. The export name as a heading (match the heading style of peer entries)
2. The exact TypeScript signature as it appears in source — copy it verbatim, do not paraphrase
3. JSDoc description from source if one exists — copy it verbatim
4. If no JSDoc exists in source: write `_Description pending — see source._` as the description body

The stub must NOT contain:

- Invented behavioral descriptions
- Example code (unless a working example can be written purely from the signature — simple getters/setters are fine; anything involving async, state, or side-effects is not)
- Any claim that cannot be directly read from the source signature or its JSDoc

For `missing` findings that are missing from a **summary table** only (not from the doc body): add the missing row to the table, sourcing the signature from the gap report's source location.

---

**Do not touch:**

- Prose that is already correct
- Items marked "Could not verify" in the gap report — these require runtime verification
- `missing` findings with urgency `low` (Group C) — list these in the summary instead
- Any finding outside the section's `checkFocus` scope
- Content in files prefixed with `_` (draft/spec files not published by Docusaurus)

---

### 7. Output a change summary

```
## Doc Fix Summary: <section label>

Gap report: test/ph-lora/gap-reports/<filename>
Files edited: <list of .md files touched>

### Applied fixes

| # | Urgency | Type | File | Change | Source verified at |
|---|---------|------|------|--------|--------------------|
| 3 | high | wrong | 03-Signing.md | `"reactor"` → `"@powerhousedao/reactor"` (line 42) | packages/reactor/package.json |
| 5 | high | stale | 01-ReactHooks.md | `setVetraPackages` → `setVetraPackageManager`, parameter type updated | hooks/vetra-packages.ts:31 |

### Skipped

| # | Reason |
|---|--------|
| 2 | Could not verify — requires runtime information |
| 9 | Source changed since report — finding no longer applies |

### Stubs added (missing, high/medium)

| # | Export | Location added |
|---|--------|----------------|
| 8 | `useDocumentOperations` | 01-ReactHooks.md — end of section |

### Suggested additions (low urgency — not written)

These exports are undocumented but were not auto-written. A human or doc-writing agent should evaluate whether to add them:

- `useUserPermissions()` → `hooks/user-permissions.ts:3` — returns `{ isAllowedToCreateDocuments: boolean, isAllowedToEditDocuments: boolean }`
- `useDriveSystemInfo(drive)` → `hooks/use-drive-system-info.ts:29`

### Needs human review

List any finding where the required fix involves judgment that cannot be made mechanically:
- Finding #2: ISigner interface block contains members from multiple source interfaces. The corrected block was written from `types.d.ts:487` only — a human should verify the example around it still makes sense in context.
```

If no fixes were applied, say so and explain why (e.g., source changed, all findings in "could not verify").
