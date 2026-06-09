# LLM docs

The Powerhouse Academy follows the [llms.txt standard](https://llmstxt.org) to provide machine-readable documentation for LLMs and AI coding tools.

## Files

| File                            | Purpose                                                                 | Size  |
| ------------------------------- | ----------------------------------------------------------------------- | ----- |
| [llms.txt](/llms.txt)           | Navigation index — links to every doc page with a short description     | ~22KB |
| [llms-full.txt](/llms-full.txt) | All documentation concatenated into one file for full-context ingestion | ~1MB  |

### llms.txt

A concise index that follows the [llms.txt spec](https://llmstxt.org): an H1 title, a summary blockquote, and H2 sections with links to every page. Ideal for tools that fetch context on demand.

### llms-full.txt

The complete academy content in a single markdown file. Use this when you want to load the full documentation into a context window at once (e.g. pasting a URL into Claude or ChatGPT).

## Using with Context7

[Context7](https://context7.com) users can load up-to-date Powerhouse documentation directly into their AI coding assistant. Search for **powerhouse-inc/powerhouse** in the Context7 library search, or use the library ID `/powerhouse-inc/powerhouse`.

```
use context7
```

## Programmatic access

```bash
# Index (llms.txt)
curl https://academy.vetra.io/llms.txt

# Full content (llms-full.txt)
curl https://academy.vetra.io/llms-full.txt
```

## Regenerating the files

The files are generated from the academy source docs by the script at `scripts/generate-llm-docs.ts`. Run it with:

```bash
npm run generate:llm-docs
```

This writes both `static/llms.txt` and `static/llms-full.txt`, which Docusaurus serves at the site root. The legacy `academy_LLM_docs.md` path is also kept for backward compatibility.
