# Powerhouse Academy

Comprehensive documentation and learning resources for the Powerhouse ecosystem.

This documentation website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.
To contribute to the documentation please work on a feature branch in case of big refactors, and build & serve before pushing to the development branch.
Pushing from the dev branch to the main branch will trigger an auto deployment in Heroku for the staging deployment.

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

```
$ npm install
```

### Local Development

```
$ npm run dev
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server. The server will break upon broken links or big navigation/relinking.

### Build

```
$ npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

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
