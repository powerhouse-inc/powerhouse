# LLM docs

The Powerhouse Academy follows the [llms.txt standard](https://llmstxt.org) to provide machine-readable documentation for LLMs and AI coding tools.

## Context7

[Context7](https://context7.com) is the easiest way to load up-to-date Powerhouse documentation directly into your AI coding assistant (Cursor, Windsurf, Zed, etc.).
Search for **powerhouse-inc/powerhouse** in the Context7 library, or use the library ID `/powerhouse-inc/powerhouse`.

```
use context7
```

## Paste into Claude or ChatGPT

Load the full documentation into a context window at once by pasting the URL directly into your chat:

```
https://academy.vetra.io/llms-full.txt
```

## Programmatic access

```bash
# Index (llms.txt) — links to every page with a short description (~22KB)
curl https://academy.vetra.io/llms.txt

# Full content (llms-full.txt) — all docs concatenated (~1MB)
curl https://academy.vetra.io/llms-full.txt
```

## Files

| File                            | Purpose                                                                 | Size  |
| ------------------------------- | ----------------------------------------------------------------------- | ----- |
| [llms.txt](/llms.txt)           | Navigation index — links to every doc page with a short description     | ~22KB |
| [llms-full.txt](/llms-full.txt) | All documentation concatenated into one file for full-context ingestion | ~1MB  |

## Regenerating the files

The files are generated from the academy source docs by the script at `scripts/generate-llm-docs.ts`.
Run it with:

```bash
npm run generate:llm-docs
```

This writes both `static/llms.txt` and `static/llms-full.txt`, which Docusaurus serves at the site root.
