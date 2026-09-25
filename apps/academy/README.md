# Powerhouse Academy

Comprehensive documentation and learning resources for the Powerhouse ecosystem.

This documentation website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

To contribute, edit the MDX under `docs/academy/` on a branch and open a PR against `main`. Build and serve locally before pushing — the build fails on broken links. Merging to `main` auto-deploys the **dev** site; see [Updating and deploying the docs](#updating-and-deploying-the-docs) for how changes reach staging and production.

## 🤖 LLM-Optimized Documentation

The academy includes automated generation of LLM-friendly documentation:

```bash
# Generate comprehensive markdown for AI systems
pnpm run generate:llm-docs
```

This creates `ACADEMY_LLM_COMPLETE.md` - a single, structured file containing all documentation optimized for:

- RAG systems and vector databases
- LLM training and fine-tuning
- AI-powered documentation analysis
- Automated support systems

**Features:**

- 📊 95+ documents combined into one file (1.1MB)
- 🔗 Internal linking with semantic anchors
- 📚 Category-based organization following site structure
- 🎯 LLM-optimized formatting (enhanced headers, code blocks, cross-references)
- ⚡ Up to 35% better RAG retrieval accuracy vs unstructured docs

**Auto-regeneration:** The LLM documentation is automatically regenerated via git pre-commit hooks when any `.md` file in `apps/academy/docs/` is modified and committed.

### Installation

The academy is its own pnpm project with its own lockfile, outside the monorepo workspace, so the root `pnpm install` doesn't install it. It is still versioned and released with the monorepo.

```
$ pnpm install        # from apps/academy
$ pnpm academy:install  # or from the repo root
```

### Local Development

```
$ pnpm dev            # from apps/academy
$ pnpm academy:dev    # or from the repo root
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server. The server will break upon broken links or big navigation/relinking.

### Build

```
$ pnpm build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Updating and deploying the docs

The site is built as a Docker image (`cr.vetra.io/academy/academy`) and served on Kubernetes — it is **not** published to npm, GitHub Pages, or Heroku. Its build and deploy are fully decoupled from the monorepo's npm package releases.

| Site | URL |
| ---- | --- |
| Production | https://academy.vetra.io |
| Staging | https://academy.staging.vetra.io |
| Dev | https://academy.dev.vetra.io |

There are two ways docs get deployed:

1. **Automatic → dev.** Any change under `apps/academy` merged to `main` triggers the `Academy` workflow (`.github/workflows/academy.yml`): it builds a short-SHA-tagged image and deploys it to **academy.dev.vetra.io**.

2. **Manual publish → any site.** The `Deploy Academy` workflow (`.github/workflows/deploy-academy.yml`) builds a chosen branch and publishes it to a chosen site. GitHub → **Actions** → **Deploy Academy** → **Run workflow**:
   - **branch** (default `main`) — the branch to build.
   - **environment** (default `academy`) — the target site (`academy` = production).

   Ship the latest docs to **production** by running it with the defaults. Preview a feature branch by picking it and targeting `dev`. Roll back by running it against an earlier branch or commit.

Images are tagged `cr.vetra.io/academy/academy:<short-sha>` (immutable, pinned by Kubernetes) plus a moving channel pointer (`dev`, `staging`, or `latest` for production).

### Slides

Slides are created using [Marp](https://marp.app/), a Markdown-based presentation tool. Slide files are stored in the `slides/` directory.

#### Preview slides locally

```
$ pnpm slides:preview
```

This starts a local server to preview your slides in the browser.

#### Build slides

```
$ pnpm slides:build
```

This generates HTML files from the markdown slides.

#### Creating slides

1. Create a new markdown file in the `slides/` directory
2. Add the Marp frontmatter at the top:
   ```markdown
   ---
   marp: true
   paginate: true
   theme: default
   ---
   ```
3. Separate slides using `---`
4. Use standard markdown syntax for content
5. For images, use markdown syntax or Marp directives like `![bg right:40% contain](image.png)`
