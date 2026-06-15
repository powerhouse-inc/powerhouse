# Vetra Studio Agent

Vetra Studio is the browser UI for the Vetra agent. It lets you chat with the Vetra agent, track work across the four-phase product development cycle 
(Ideate → Specify → Build → Deploy), and watch a live preview of the product the Vetra agent is building.


## What can i build? 

With the Vetra Studio Agent, you can build **local-first, AI-ready, specification-driven products, platforms and software solutions**.
These solutions can be used as:
- Open-source and decentralized back-ends.
- Any SaaS, ERP, CMS or CRM needs.
- Are based on a structured data model & document-centric architecture.


## Getting started

Vetra Studio is currently in beta. You'll have gotten your hands on an early access code from Powerhouse.
Log in at **vetra.io** to access Vetra Studio.

---

## The layout

```
┌──────────────────┬─┬─────────────────────────────────────┐
│  Chat pane       │ │  Main pane                          │
│                  │▒│                                     │
│  Session list    │▒│  Home: phase cycle cards            │
│  — or —          │▒│  — or —                             │
│  Active session  │▒│  Ideate section                     │
│                  │▒│  — or —                             │
│                  │▒│  Build preview                      │
└──────────────────┴─┴─────────────────────────────────────┘
```

- **Chat pane** (left): lists all chat sessions in the drive, and renders the
  active session's message history when one is selected.
- **Resize handle** (narrow vertical strip): drag to adjust pane width.
  Double-click to reset to default.
- **Main pane** (right): shows the home phase-cycle overview by default.
  Opens to Ideate or Build when you click those phase cards.

---

## Creating a session

1. Open **vetra.io** and log in.
2. In the chat pane, click **New** (top-right) or **New session** (empty
   state).
3. A new chat session document is created in the drive and opened
   immediately.
4. Type your first message to the agent and press Enter (or click the send
   button).

Sessions persist across restarts — they are CRDT documents stored in the
embedded reactor's PGlite database.

---

## The phase cycle

The right pane shows four phase cards when no sub-section is open:

| Phase | Status | What happens there |
|-------|--------|--------------------|
| **Ideate** | active | Problem-definition documents and feature lists |
| **Specify** | inactive (coming) | Solution design |
| **Build** | active | Live preview of the agent's in-progress work |
| **Deploy** | inactive (coming) | Delivery / publish |

Click **IDEATE** to browse product-identity cards, audiences and your product ideas 'Job to be done' framework. Click **BUILD** to open the live preview pane.

---

## Talking to the agent

The chat session is the primary way to direct the agent. Type a message; the
agent responds and runs tools. Tool calls (like `spec-update`,
`spec-generate`, `reactor-project-start`) appear inline in the chat history as
expandable cards showing their status (Running / Completed / Error).

The agent can:

- Create and iterate on **spec documents** (problem/audience/brand sheets,
  feature lists, solution designs).
- Scaffold a **reactor project** — a separate dev-mode process that hosts a
  live editor preview.
- Generate code (document models, editors, processors) directly into that
  project.
- Create a **preview document** inside the project and surface it in the
  BUILD pane.

---

## The BUILD preview

The BUILD pane hosts an iframe that deep-links into the reactor project the
agent spawned for the session. Here is the sequence:

1. The agent calls `reactor-project-start` — visible as a tool card in the
   chat.
2. The BUILD pane detects that the project is stopped and boots it
   automatically (or waits for the agent's tool call to do it).
3. A "Starting…" status is shown while the dev server warms up (typically
   10–30 seconds).
4. Once ready the agent calls `spec-preview-show` with a project + document
   reference. The iframe navigates to that document's editor inside the
   project's Connect.
5. From this point, any code the agent generates is picked up by Vite HMR —
   the iframe updates live without a full reload.

You can navigate back to the phase-cycle home with the breadcrumb at the top
of the BUILD pane.

---

## Session URLs

The currently selected session id is kept in the `?session=<id>` query
parameter. This means:

- Sharing the URL opens the same session in another tab or browser.
- Browser back/forward navigates between sessions.
- Reloading the page restores the selection without losing your place.

---

## Glossary

**Chat session** — a CRDT document that stores message history, agent tool
calls, and tool results for one conversation thread.

**Phase cycle** — the four-card home view (Ideate / Specify / Build / Deploy).
Each card represents a stage of the product-development workflow.

**Reactor project** — a `ph vetra` dev-mode child process the agent spawns to
host a live editor preview. One per active build in a chat session.

**Preview drive** — a hardcoded-slug drive inside a reactor project, used for
ephemeral preview document instances.

---

<details>
<summary>Running Vetra Studio locally (advanced)</summary>

From the `vetra-cli` directory:

```bash
pnpm dev -i          # dev mode (watch + Vite HMR in reactor-projects)
# or
pnpm start -i        # production-mode binaries
```

Both commands pass `--workdir ../../vetra-test` by default. Once running,
open **http://localhost:27370** in a browser. The terminal prints the URL when
the embedded Connect server is ready.

> If you see the generic Powerhouse drive explorer instead of Vetra Studio,
> the SPA bundle is stale. Run both build commands listed under
> "Rebuilding after editor changes" below and restart.

### Rebuilding after editor changes

Vetra Studio is a static SPA bundled at build time. After editing
`vetra-app/editors/*` or `vetra-app/powerhouse.manifest.json` you must run
**two** commands and restart:

```bash
# 1. Rebuild the package exports (document models, editor registrations)
pnpm --filter vetra-app build

# 2. Rebuild the SPA bundle that connect-server.js serves
pnpm --filter vetra-app exec ph-cli connect build \
  --outDir dist/connect \
  --default-drives-url http://__ph_drive_url__
```

Then restart `pnpm dev -i`. The `connect-drive-url` hook stamps the live
Switchboard drive URL into the bundle on startup; the placeholder above is
what it replaces.

Skipping step 2 leaves the bundle carrying the pre-edit manifest, and Connect
will fall back to the generic folder view instead of Vetra Studio.

### Service ports (default)

| Service | Port | Purpose |
|---------|------|---------|
| Vetra Studio (Connect) | 27370 | Browser entry point |
| Embedded Switchboard | 59220 | GraphQL + MCP |
| Preview server (local API) | 5180 | Preview state + SSE |
| Embedded reverse proxy | 8090 | Single public port (deployed mode) |
| Reactor-project Connect | varies | Per-session BUILD preview |

### Diagnostics

```bash
# Is the preview server up?
curl -sS http://127.0.0.1:5180/healthz

# What is the current preview target for a session?
curl -sS "http://127.0.0.1:5180/resolve?project=<project-dir>&doc=<slug-or-id>"

# Start a reactor project manually (idempotent)
curl -sS -X POST "http://127.0.0.1:5180/start?project=<project-dir>"

# Stream reactor-project lifecycle events
curl -sS -N http://127.0.0.1:5180/events

# Switchboard schema sanity check
curl -sS -X POST http://localhost:59220/graphql \
  -H "content-type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}' | grep -i drive
```

</details>
