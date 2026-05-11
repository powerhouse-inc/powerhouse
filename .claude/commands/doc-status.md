# /doc-status

Show coverage status across all mapped academy sections — which have been reviewed, what findings are open, and what's still unreviewed.

**Usage:** `/doc-status`

**Note:** Status reflects whether a gap report _exists_, not whether its findings have been fixed. Run `/doc-fix <section-id>` to close findings, then re-run `/doc-review` to get a fresh report.

---

## Steps

### 1. Load the mapping

Read `test/ph-lora/ph-lora-mapping.json`. Extract all sections — record `id`, `label`, `docPath`, and `skipMechanicalCheck` for each.

### 2. Read all gap reports

List all `.md` files in `test/ph-lora/gap-reports/`. For each file, extract:

- **Date** — the `**Date:**` line
- **Reviewed path** — the `**Reviewed:**` line (strip backticks)
- **Summary line** — the bold sentence in the `## Summary` section, which has the form `**N findings (X stale, Y missing, Z wrong).**`
- **Highest urgency present** — scan the Findings table for `high`; if any row has `high`, record `high`. Otherwise check for `medium`. Otherwise `low` or `clean`.

### 3. Match reports to sections

For each mapping section, find its gap report by checking: does the gap report's reviewed path **contain** the section's `docPath`?

Example: section `api-references-react-hooks` has `docPath: docs/academy/04-APIReferences/01-ReactHooks.md`. A gap report with `Reviewed: apps/academy/docs/academy/04-APIReferences/01-ReactHooks.md` matches because it contains the docPath string.

A section may match more than one gap report (e.g. if a sub-section was reviewed separately before the full section). If so, show the most recent one and note "(partial — sub-section only)" in the status.

A section with `skipMechanicalCheck: true` → status is `skip` regardless of gap reports.

### 4. Compute status per section

| Condition                                                      | Status                            |
| -------------------------------------------------------------- | --------------------------------- |
| `skipMechanicalCheck: true`                                    | `skip`                            |
| Gap report found, 0 findings                                   | `clean`                           |
| Gap report found, findings present, highest urgency = `high`   | `reviewed — high findings open`   |
| Gap report found, findings present, highest urgency = `medium` | `reviewed — medium findings open` |
| Gap report found, findings present, highest urgency = `low`    | `reviewed — low findings open`    |
| No gap report found                                            | `not reviewed`                    |

### 5. Output the status table

```
## Doc Coverage Status
As of: <today's date>
Sections reviewed: X / 15    Clean: Y    High findings open: Z

| Section                              | Status                        | Date       | Findings            |
|--------------------------------------|-------------------------------|------------|---------------------|
| Get Started                          | not reviewed                  | —          | —                   |
| Mastery — Builder Environment        | not reviewed                  | —          | —                   |
| Mastery — Document Model Creation    | reviewed — medium open        | 2026-05-05 | 7 (2 stale, 5 miss) |
| Mastery — Building User Experiences  | partial — sub-section only    | 2026-05-06 | 5 (2 stale, 3 wrong)|
| Mastery — Work With Data             | not reviewed                  | —          | —                   |
| Mastery — Launch                     | not reviewed                  | —          | —                   |
| Example Use Cases                    | not reviewed                  | —          | —                   |
| API Ref — Powerhouse CLI             | reviewed — medium open        | 2026-05-05 | 7 (1 wrong, 6 miss) |
| API Ref — React Hooks                | reviewed — high open          | 2026-05-05 | 12 (4s, 6m, 2w)     |
| API Ref — Reactor Client             | reviewed — open               | 2026-05-05 | (summary)           |
| API Ref — Relational Database        | not reviewed                  | —          | —                   |
| API Ref — Renown SDK                 | not reviewed                  | —          | —                   |
| API Ref — Migration Guides           | not reviewed                  | —          | —                   |
| Component Library                    | not reviewed                  | —          | —                   |
| Architecture                         | skip (conceptual)             | —          | —                   |

## Unmapped packages (no doc coverage exists)

These packages are in the monorepo but have no academy section:

- `packages/reactor-attachments`
- `packages/reactor-hypercore`
- `packages/reactor-mcp`
- `packages/registry`
- `packages/config`
- `packages/opentelemetry-instrumentation-reactor`
- `packages/powerhouse-vetra-packages`
- `packages/switchboard-gui`
- `apps/connect`

Each needs one of: a new doc section added + mapping entry, or an explicit `skipMechanicalCheck: true` entry added to the mapping.

## Suggested next actions

- Run /doc-review for each "not reviewed" section and save output to test/ph-lora/gap-reports/gap-report-<shortname>.md
- Run /doc-fix on sections with high findings open
- Run /doc-clarity after /doc-fix on sections with clean or low findings
```

Abbreviate finding counts in the table if space is tight: `4s 6m 2w` = 4 stale, 6 missing, 2 wrong.
