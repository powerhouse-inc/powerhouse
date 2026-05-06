# /doc-review

Review one academy documentation section for drift against the monorepo source.

**Usage:** `/doc-review <section-id>`

**Section IDs** (from `test/ph-lora/ph-lora-mapping.json`):
`get-started` · `mastery-builder-environment` · `mastery-document-model-creation` · `mastery-building-user-experiences` · `mastery-work-with-data` · `mastery-launch` · `example-usecases` · `api-references-cli` · `api-references-react-hooks` · `api-references-reactor-client` · `api-references-relational-database` · `api-references-renown-sdk` · `api-references-migration-guides` · `component-library` · `architecture`

---

## Steps

**1. Load the mapping entry**

Read `test/ph-lora/ph-lora-mapping.json`. Find the entry where `id === "$ARGUMENTS"`. Extract `docPath`, `packages`, `checkFocus`, and `skipMechanicalCheck`.

If `skipMechanicalCheck` is true, output: "Section marked skipMechanicalCheck — conceptual section, skipping mechanical review." and stop.

**2. Load the doc section**

Read all `.md` files under `apps/academy/$DOCPATH`. If it's a single file, just read that file.

**3. Load the package source**

For each package in `packages`:
1. Read `$PACKAGE/index.ts` (the root re-export barrel) to get the full export list
2. Identify which sub-files are relevant to the `checkFocus` scope by scanning the re-export paths
3. Read those sub-files directly to verify actual signatures — do not rely on the barrel alone
4. Only skip deeper files if they are clearly unrelated to `checkFocus`

Token budget: aim to stay under 80k tokens total for doc + source combined. If a package is large, prioritise the files that back the exported names documented in the doc section.

**4. Run the review**

With the loaded context, act as a doc-code consistency checker. Your job is to find **mechanical drift** — not to evaluate prose quality, completeness of explanation, or writing style.

Use the section's `checkFocus` as your primary scoping constraint. Only report findings that fall within that scope.

**Checklist — run each of these explicitly:**

- **Export existence check:** For every named export documented in the section (every hook, function, type name), verify it actually appears by that exact name in the source. A documented name that does not exist in the source is a `stale` finding.
- **Signature check:** For documented exports that do exist, compare parameter names, parameter types, and return types against the source.
- **Example check:** For each code example, verify (a) the imported name exists in the package, (b) the function called in the example body matches the section heading it's in (catches copy-paste errors), and (c) the argument shape matches the actual signature.
- **Quick Reference / summary table check:** If the doc has a summary table of exports, cross-check it against the body and the source — entries missing from the table or present in the table but absent from source are findings.
- **Missing exports check:** Scan the source exports relevant to `checkFocus`. Flag anything exported that is not covered anywhere in the doc.

**Finding types:**

| Type | Meaning |
|------|---------|
| `stale` | A documented name, signature, or type that no longer matches the source — includes exports that have been renamed or removed entirely |
| `missing` | A source export within the `checkFocus` scope that the doc doesn't cover at all |
| `wrong` | A code example that would not work as written — wrong function name, wrong import, wrong argument shape, or copy-paste of the wrong hook into an example |

**Urgency — assign one per finding:**

| Urgency | Criteria |
|---------|----------|
| `high` | A developer following the doc will fail or call the wrong code: non-existent function documented, tutorial steps with wrong file paths, deprecated API with no warning, copy-paste example that calls the wrong function |
| `medium` | A developer gets wrong or incomplete information but may still make progress: wrong value in a reference table, missing fields in a documented type, undocumented important export, stale rename that would cause a build error if copy-pasted |
| `low` | Inconvenient but unlikely to block: missing command aliases, incomplete file inventory, import path uses a valid alias but is inconsistent with generated code, undocumented internal/minor exports |

**What does NOT count as a finding:**

- Incomplete explanations or shallow prose coverage
- Items clearly outside the `checkFocus` scope
- Things that require runtime verification (network calls, UI rendering, timing behaviour) — put these in "Could not verify" instead
- TypeScript snippets that use only primitives and no imports — they cannot drift (note: no snippets are currently tagged `check`, so Tier 1 static checking is dormant; flag broken examples under `wrong` instead)

**Confidence rule:** Only report a finding if you can point to a specific location in both the doc and the source. "The doc says X at line N" + "the source says Y at file:line". If you can only anchor to one side, do not report it — put it in "Could not verify".

---

## Output Format

```
## Gap Report: <section label>

Reviewed: <docPath>
Against: <package list>
Focus: <checkFocus>

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | high | stale | `setVetraPackages` (line N) | `hooks/vetra-packages.ts:31` | Documented as `setVetraPackages(vetraPackages: VetraPackage[])` but source exports `setVetraPackageManager(packageManager: IPackageManager)` — renamed and signature changed |
| 2 | medium | missing | — | `hooks/document-operations.ts:23` | `useDocumentOperations` is exported but not documented |
| 3 | high | wrong | `useSelectedDocumentSafe` example (line N) | `hooks/selected-document.ts:17` | Example imports and calls `useSelectedDocument` — should be `useSelectedDocumentSafe` |

### Verified clean

List what you checked and found correct — gives confidence the review ran:
- `useSelectedDocumentId` — name and return type (`string | undefined`) match source
- Import path `@powerhousedao/reactor-browser` — package name confirmed

### Could not verify

Things within the checkFocus scope that require runtime or non-static information:
- `PHDocument.header.documentType` field shape — type defined in external package not read during this review

### Summary

N findings (X stale, Y missing, Z wrong). <One sentence characterising the overall state.>
```

If there are zero findings, say so explicitly and list what was verified clean. A clean result is a valid result.
