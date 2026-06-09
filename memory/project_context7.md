---
name: project-context7-optimization
description: Context7 trust score was 6.8; identified root causes and applied fixes to docs URL, package metadata, and llms.txt
metadata:
  type: project
---

Context7 trust score was 6.8/10 for powerhouse-inc/powerhouse. Applied fixes in June 2026.

**Root causes identified:**
1. `generate-llm-docs.ts` SITE_URL was `https://powerhouse.academy` but canonical site is `https://academy.vetra.io` — all 89 links in llms.txt were pointing to wrong domain
2. All published `@powerhousedao/*` packages had empty `description`, no `homepage`, empty `keywords` — Context7 can't link packages to docs or understand what they do
3. `apps/academy/package.json` homepage also said `powerhouse.academy`

**Fixes applied:**
- Fixed SITE_URL in `apps/academy/scripts/generate-llm-docs.ts`
- Regenerated `static/llms.txt` and `static/llms-full.txt` (all 89 links now use academy.vetra.io)
- Added `description`, `homepage`, `keywords` to: reactor, reactor-browser, reactor-api, codegen, builder-tools, shared, reactor-drive, reactor-attachments, registry, vetra, config
- Updated `apps/academy/package.json` homepage to academy.vetra.io
- Improved llms.txt header to list npm package names and GitHub repo URL
- Added Context7 usage section to `docs/academy/09-LLMDocs.md`

**Why:** Context7 crawls llms.txt links and npm package metadata to evaluate documentation quality and link packages to docs. Broken URLs and missing metadata directly lower the trust score.

**How to apply:** When touching package.json files, ensure description/homepage/keywords stay populated. When changing the docs deployment URL, update SITE_URL in the generate script and regenerate.
