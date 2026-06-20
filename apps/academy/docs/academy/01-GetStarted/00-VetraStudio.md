# Vetra Studio

Vetra Studio is the browser UI for the Vetra agent. You chat with the agent, watch it work across the four-phase product cycle (Ideate → Specify → Build → Deploy), and see a live preview of the product it builds.

Each Studio runs as a **dedicated cloud agent** tied to your identity. You provide an Anthropic API key, and Vetra provisions an isolated environment that hosts the agent, its workspace, and the preview services.

## What you can build

With the Vetra agent you build **local-first, AI-ready, specification-driven** products and platforms:

- Open-source, decentralized back-ends.
- SaaS, ERP, CMS, or CRM applications.
- Structured-data, document-centric systems with a built-in GraphQL API.

---

## Getting started

Vetra Studio is in beta. You need an early-access code from Powerhouse.

1. Open **[vetra.io](https://vetra.io)** and log in with your wallet (via Renown).
2. Click **Vetra Studio** in the top-right header. This opens your **Products** dashboard at `/user`.

Each product is one Vetra Studio instance, running on its own subdomain (`vetra-agent.<slug>.vetra.io`). A studio shows **Ready** once it is provisioned.

The Products dashboard lists your Vetra Studio instances. Each is a dedicated cloud agent on its own subdomain.

### Create a studio

To create a new instance, click **Create new product…** and provide an **Anthropic API key**. The studio runs the agent on Claude using this key.

A studio runs as a dedicated cloud agent. Provide an Anthropic API key to start it.

The instance moves through **Provisioning…** (not yet openable) to **Ready**. Click **Open →** to launch the studio in a new tab.

---

## The layout

A studio opens in Powerhouse Connect with two panes:

- **Chat pane** (left): lists chat sessions, and renders the active session's message history when one is open.
- **Resize handle** (vertical strip): drag to adjust pane width.
- **Main pane** (right): shows the four phase-cycle cards by default, and opens a phase section, a document, or the build preview when you navigate.
- **Toolbar** (far left): **Home**, **Open Account** (Renown), and **Settings**.
- **Auto-follow agent** (top of the main pane, on by default): when checked, the main pane follows the agent and opens documents as the agent creates them.

A fresh studio: empty session list on the left, the four phase cards on the right.

---

## Creating a session

1. In the chat pane, click **New** (top-right) or **New session** (empty state).
2. A new chat session document is created in the drive and opened immediately.
3. Type your first message and press Enter (or click the send button).

Sessions persist across restarts. They are CRDT documents stored in the studio's reactor.

Sessions are scoped to your identity: signing in with a different identity shows a different session list.

---

## Talking to the agent

The chat session is how you direct the agent. Type a message; the agent responds and runs tools. Each tool call appears inline as an expandable card showing its name, status (**Running** / **Completed** / **Error**), and a result preview. While the agent works, the send button becomes **Stop**.

Tools you will see include:

- `skill` / `skill_read` — the agent loads a named skill (such as `document-modeling`, `drive-app-creation`) and reads its reference docs.
- `spec-create`, `spec-generate`, `spec-update`, `spec-list` — create and edit specification documents.
- `reactor-project-init`, `reactor-project-start`, `reactor-project-check`, `reactor-project-ls` — scaffold and run the project that hosts the preview.
- `spec-preview-list`, `spec-preview-show` — surface a document in the BUILD pane.
- `mastra_workspace_`* — read, write, grep, and run commands in the agent's workspace.

A status bar at the bottom of the chat shows the session state: **Active**, start time, message count, token count, and tool-call count.

The agent can:

- Create and iterate on **spec documents** (problem and audience sheets, feature lists, document models).
- Scaffold a **reactor project** that hosts a live editor preview.
- Generate code (document models, editors, processors) into that project.
- Surface a **preview document** in the BUILD pane.

---

## The phase cycle

The main pane shows four phase cards when no section is open. Click a card to open its section, or navigate with the breadcrumb (`Home › <Phase>`).


| Phase                                | What happens there                                            |
| ------------------------------------ | ------------------------------------------------------------- |
| **Ideate** — Problem Definition      | Problem and audience documents, feature lists                 |
| **Specify** — Solution Design        | Document models and solution-design specs, grouped by project |
| **Build** — Implementation & Testing | Live preview of the agent's in-progress work                  |
| **Deploy** — Delivery                | Publish the studio's services to Vetra Cloud                  |


A card's availability depends on progress: BUILD shows a preview only after the agent scaffolds a project, and DEPLOY needs you to sign in with Renown.

---

## Ideate and Specify

The Ideate and Specify sections hold the documents the agent writes. Specify groups them into **projects**: each project is a folder of specs and document models.

Specify groups documents into projects. Each project is a folder of specs and document models.

With **Auto-follow agent** on, a document opens in the main pane as the agent creates it. Opening a document **pauses the agent** — the control bar reads "paused — close the document to resume." Close the document to let the agent continue.

A document editor has Undo / Redo / Download, a revision-history view, an **Open link in Switchboard** action, and a **Close document** button. For a document model you edit its type, description, and state schema directly.

A document-model editor. Opening a document pauses the agent until you close it.

---

## The BUILD preview

The BUILD pane hosts an iframe that deep-links into the reactor project the agent spawned for the session. The sequence:

1. The agent calls `reactor-project-init` and `reactor-project-start` — visible as tool cards in the chat.
2. The dev server warms up (typically 10–30 seconds) and the project reports `[ready]`.
3. The agent calls `spec-preview-show` with a project, drive, and app reference. The iframe loads that app inside the project's Connect, and a `<project> · running` chip appears in the breadcrumb.
4. Any code the agent generates after that is picked up by Vite HMR — the iframe updates without a full reload.

Until the agent calls `spec-preview-show`, the pane reads **"No preview yet."** A running reactor project is not enough on its own; the agent has to surface a preview document.

The BUILD pane renders the generated app live. Here the agent built a hotel breakfast-order form.

:::warning The preview is a dev render, not a full runtime
The BUILD preview runs the editors and apps in a local dev reactor. **Processors do not run here** — they execute server-side in Switchboard once the studio is deployed. Preview drives are also ephemeral and reset between sessions. So an action wired through a processor (for example, syncing a guest order to a staff board) only takes effect after you deploy.
:::

Use the breadcrumb at the top of the pane to navigate back to the phase-cycle home.

---

## Deploy

The Deploy section publishes the studio's services to **Vetra Cloud**. Sign in with **Renown** to see and manage your environments. Each environment runs **Powerhouse Connect** at `connect.<slug>.vetra.io` and **Switchboard** (the GraphQL API) at `switchboard.<slug>.vetra.io/graphql`, and gets a public subdomain.

The environment view shows a deployment name, a **Changes pending / Ready** status, and a per-service list with enable toggles and copyable URLs. **Open in Vetra Cloud** opens the full environment dashboard.

For environment management, services, sizing, and versions, see [Vetra Cloud](./01-VetraCloud.md).

---

## Authorizing the agent

To let the agent sign actions with your identity, click **Authorize agent** (or **Connect with Renown** in Deploy). Renown shows a **Confirm Authorization** screen: it authorizes the studio's subdomain to sign actions on your behalf. Once confirmed, the control bar shows **Authorized via Renown** with your address and a **Disconnect** button.

Authorization is independent of chat sessions, and it switches the studio's active identity from a generated `did:key` to your wallet identity (`did:pkh`).

---

## Session URLs

The selected session id is kept in the `?session=<id>` query parameter:

- Sharing the URL opens the same session in another tab or browser.
- Browser back/forward navigates between sessions.
- Reloading restores the selection without losing your place.

When the agent opens a document, the URL also carries a `doc=<id>` parameter.

---

## Glossary

**Chat session** — a CRDT document that stores message history, agent tool calls, and tool results for one conversation thread.

**Phase cycle** — the four-card home view (Ideate / Specify / Build / Deploy). Each card is a stage of the product-development workflow.

**Project** — a folder of related specs and document models, shown in the Specify section.

**Reactor project** — a dev-mode process the agent spawns to host a live editor preview. One per active build in a chat session.

**Preview drive** — a drive inside a reactor project, used for ephemeral preview document instances.

**Renown** — the identity layer that lets the studio sign actions on behalf of your wallet without exposing your private key.

---

Running Vetra Studio locally (advanced)

From the `vetra-cli` directory:

```bash
pnpm dev -i          # dev mode (watch + Vite HMR in reactor-projects)
# or
pnpm start -i        # production-mode binaries
```

Both commands pass `--workdir ../../vetra-test` by default. Once running,
open **[http://localhost:27370](http://localhost:27370)** in a browser. The terminal prints the URL when
the embedded Connect server is ready.

> If you see the generic Powerhouse drive explorer instead of Vetra Studio,
> the SPA bundle is stale. Run both build commands listed under
> "Rebuilding after editor changes" below and restart.

### Rebuilding after editor changes

Vetra Studio is a static SPA bundled at build time. After editing
`vetra-app/editors/`* or `vetra-app/powerhouse.manifest.json` you must run
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


| Service                    | Port   | Purpose                            |
| -------------------------- | ------ | ---------------------------------- |
| Vetra Studio (Connect)     | 27370  | Browser entry point                |
| Embedded Switchboard       | 59220  | GraphQL + MCP                      |
| Preview server (local API) | 5180   | Preview state + SSE                |
| Embedded reverse proxy     | 8090   | Single public port (deployed mode) |
| Reactor-project Connect    | varies | Per-session BUILD preview          |


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

