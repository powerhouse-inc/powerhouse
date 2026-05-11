# /release-notes

Generate human-readable release notes from CHANGELOG.md entries.

**Usage:**

- `/release-notes` — generate notes for the latest version
- `/release-notes <version>` — generate notes for one specific version (e.g. `6.0.0-dev.239`)
- `/release-notes <from> <to>` — generate notes spanning a version range (from exclusive, to inclusive, e.g. `6.0.0-dev.230 6.0.0-dev.239`)
- `/release-notes --write` — same as above but append the result to `RELEASE-NOTES.md`

---

## Steps

### 1. Parse arguments

From `$ARGUMENTS`:

- If empty or `--latest`: use latest version only (first entry in CHANGELOG.md)
- If one word (not a flag): treat as `<to>` version — generate notes for that single version
- If two words: treat as `<from> <to>` — generate notes for all versions **after** `<from>` up to and including `<to>`
- If `--write` is present anywhere in the args: set `writeToFile = true` and remove the flag before parsing the rest

### 2. Read CHANGELOG.md

Read `CHANGELOG.md` from the repo root. Parse it into version entries using this structure:

Each entry starts with a line matching `## <version> (<date>)`. The entry runs until the next such line (or end of file). Within each entry extract:

- `version` — the semver string (e.g. `6.0.0-dev.239`)
- `date` — the date string in parentheses
- `features` — all `- ` lines under `### 🚀 Features`
- `fixes` — all `- ` lines under `### 🩹 Fixes`
- `contributors` — all `- ` lines under `### ❤️ Thank You`
- `breaking` — all `- ` lines under `### ⚠️ Breaking Changes` (may be absent)
- `rawContent` — the full text of the entry

### 3. Select entries

Using the parsed arguments from Step 1:

- **Latest only:** take the first entry (index 0)
- **Single version `<to>`:** find the entry where `version === to`; if not found, error and stop
- **Range `<from> <to>`:** find the index of `<to>` (call it `startIdx`) and the index of `<from>` (call it `endIdx`). Take entries from `startIdx` up to (but not including) `endIdx`. If either version is not found, error and stop.

If no entries are selected, report an error and stop.

### 4. Consolidate changes

Across all selected entries, collect:

- All features (deduplicated — same text may appear across multiple dev versions)
- All fixes (deduplicated)
- All breaking changes (deduplicated)
- All contributors (deduplicated, sorted)
- Version range label: if one entry → `v<version>`; if multiple → `v<earliest> → v<latest>`
- Date range: earliest to latest date across selected entries

### 5. Generate release notes

Write release notes following the style of the existing `RELEASE-NOTES.md`. That file uses:

```
## 🚀 **v<version or range>**

### ✨ Highlights

1. <theme 1> — one-liner summary
2. <theme 2>
...

### NEW FEATURES

#### <emoji> <Feature Group Name>

<Explanation of what changed and why it matters — 2-4 sentences>

<Code example if the feature has a user-facing API or CLI command>

### IMPROVEMENTS

- <item>

### BUG FIXES

- <item>

### ⚠️ BREAKING CHANGES

<Explanation + migration steps if any>

---
```

Guidelines:

- Group related features under a named section with a descriptive emoji heading
- For each feature group, explain the **why** not just the **what**
- Add a bash or TypeScript code example when there's a user-facing API, CLI command, or config change
- The Highlights section should surface the 3–5 most impactful changes — pick the ones that affect the most developers
- Fixes can be brief bullet points unless a fix changes user-visible behaviour
- Breaking changes must include migration steps
- Skip the IMPROVEMENTS / BUG FIXES / BREAKING CHANGES sections if there is nothing to put in them
- Do not invent details — work only from what is in the CHANGELOG entries
- Keep a developer-friendly, friendly-but-professional tone

### 6. Output

Print the generated release notes to the conversation.

If `writeToFile = true`:

- Read the current contents of `RELEASE-NOTES.md`
- Prepend the new section above the first existing `## ` heading (preserving any file header above it)
- Write the file back
- Confirm: "✅ Appended to RELEASE-NOTES.md"

If `writeToFile = false`:

- End with: "Run `/release-notes <args> --write` to append this to RELEASE-NOTES.md."
