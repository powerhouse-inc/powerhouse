# Tools & Scripts

Utility scripts for the Powerhouse monorepo.

## Release Notes Generator

Generate AI-assisted release notes from the changelog.

### Quick Start

```bash
# Generate prompt and copy to clipboard
pnpm generate:release-notes --latest --clipboard

# Paste into Claude (Cursor, Claude.ai, etc.) to get polished release notes
```

### How It Works

1. **Script extracts data** from `CHANGELOG.md`:
   - Parses version entries
   - Consolidates features, fixes, contributors
   - Includes style reference from existing `RELEASE-NOTES.md`

2. **You paste the prompt into Claude** (any interface):
   - Cursor chat (`Cmd+L`)
   - Claude.ai
   - Claude Code

3. **Claude generates** polished release notes with:
   - Highlights section
   - Feature explanations with code examples
   - Grouped improvements and bug fixes
   - Breaking changes with migration steps

4. **Review and save** to `RELEASE-NOTES.md`

### Usage

```bash
# Latest version only
pnpm generate:release-notes --latest --clipboard

# Specific version range
pnpm generate:release-notes --from 5.1.0-dev.28 --to 5.1.0-dev.34 --clipboard

# Include PR descriptions for richer context
GITHUB_TOKEN=ghp_xxx pnpm generate:release-notes --latest --include-prs --clipboard

# Just print the prompt (no headers)
pnpm generate:release-notes --latest --prompt-only
```

### Options

| Flag | Description |
|------|-------------|
| `--latest` | Generate for the most recent version only |
| `--from <version>` | Start version (exclusive) |
| `--to <version>` | End version (inclusive) |
| `--clipboard` | Copy prompt to clipboard |
| `--include-prs` | Fetch PR descriptions (needs `GITHUB_TOKEN`) |
| `--prompt-only` | Output raw prompt without headers |
| `--dry-run` | Don't save the `.release-notes-prompt.md` file |
| `--verbose` | Show debug information |

### Example: Preparing a Stable Release

When consolidating dev releases into a stable release:

```bash
# Get all changes since the last stable release
pnpm generate:release-notes --from 5.1.0 --to 5.2.0-dev.34 --include-prs --clipboard
```

### Advanced: API Mode

If you have an Anthropic API key, you can generate directly:

```bash
# Install the SDK first
pnpm add -D @anthropic-ai/sdk

# Generate via API
ANTHROPIC_API_KEY=sk-ant-xxx pnpm generate:release-notes --latest --api --dry-run
```

### Output Files

- `.release-notes-prompt.md` - Saved prompt (gitignored)
- `RELEASE-NOTES.md` - Where to add the final release notes

---

## Other Scripts

### `release.ts`

Nx release automation script. Used by CI workflows.

```bash
# Dry run
npx tsx tools/scripts/release.ts --dry-run

# See all options
npx tsx tools/scripts/release.ts --help
```

