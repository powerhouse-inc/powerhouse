# Open Questions

Decisions I could not make from the repositories alone. Each carries my **recommendation** so work
can proceed on the assumption stated; a different answer changes the phase noted.

Ordered by how much they cost to change later.

---

## Blocking-ish (answer before Phase 2)

### Q1 — Where do the workflow document models live?

`powerhouse/workflow`, `powerhouse/connection` and `powerhouse/workflow-run` need a home.

| Option | Consequence |
|---|---|
| **A.** New package `packages/workflow-models`, loaded as a static prereq like `reactor-drive`/`reactor-group` in `package-manager.ts` | Clean separation; one more always-loaded package; matches how drive/group models are treated |
| **B.** Inside `packages/vetra` alongside the spec models | Fewer packages, but conflates *runtime* user documents with *design-time* developer specs, and forces Vetra onto every host that wants workflows |
| **C.** Inside `packages/reactor-workflow` | Couples the models to the Node runtime; Connect would have to import a Node package for its editors |

**Recommendation: A.** The `powerhouse/connector` *spec* model still goes in `packages/vetra`
(design-time), which keeps the split clean.
**Affects:** Phase 2.

### Q2 — One run document per run, or a projection?

The spec proposes: relational rows are authoritative; a `powerhouse/workflow-run` document is written
when `journalAsDocument` is on, plus always for `FAILED`/`PARKED`.

The alternative is "always a document", which is simpler and gives sync/ACL/editor for free, but a
webhook firing tens of times a second would produce a document storm through the whole
sync/read-model chain.

**Recommendation: as specified (hybrid), default `journalAsDocument: true`** for workflows created by
a human and `false` for workflows created programmatically at high frequency. Needs a sanity check
from whoever owns sync performance.
**Affects:** Phase 3.5, and the retention story.

### Q3 — Expression language

The spec picks a JSONata-style path+function language over a fixed context.

Alternatives: JSONPath + a small function set (weaker but trivially safe); Liquid/Handlebars
(familiar, string-oriented, awkward for booleans); a JS isolate (powerful, a much bigger security
surface, and it makes the "no code blocks in v1" deferral meaningless).

**Recommendation: JSONata.** It is a single dependency, side-effect free, handles both boolean guards
and object mapping, and has an AST we can walk to (a) list referenced variables for the editor and
(b) reject any reference to `secrets`.
**Affects:** Phase 3.5, and the editor's autocomplete.

### Q4 — What identity does a workflow run write as?

Reactor writes carry `action.context.signer`, and the auth scope enforces on it. Options:

- **A.** A per-workflow Renown key, minted when the workflow is first enabled, owned by the workflow
  document. Grants are given to *that* identity.
- **B.** The enabling user's identity (impersonation). Simple, but a workflow keeps running with the
  privileges of someone who may have left.
- **C.** A single per-reactor service identity. Simple, but every workflow gets the union of all
  permissions.

**Recommendation: A**, with the enabling user's grants as the *ceiling* checked at enable time
(`evaluateActions`, cf. `recipes/auth-preflight`), so enabling cannot escalate.
This needs the Renown owner's input — it may require new key-minting affordances.
**Affects:** Phase 3.7, Phase 5, and the security model as a whole.

---

## Architectural (answer before Phase 4)

### Q5 — Refactor the reactor worker kit, or copy it?

`packages/reactor/src/executor/worker/` contains ~2700 lines of well-tested worker mechanics
(transport, sanitizer, error marshalling, handle lifecycle, forwarding logger). The workflow worker
needs all of it except the job-specific protocol.

- **A.** Extract the generic half into a new `packages/worker-kit` and have both depend on it.
  Correct, but touches a load-bearing subsystem of the reactor.
- **B.** Copy it into `reactor-workflow`. Zero risk to the reactor now, guaranteed divergence later.
- **C.** Export the generic pieces from `@powerhousedao/reactor` without moving them.

**Recommendation: C now, A later.** C gets Phase 4 moving without a risky refactor; schedule A once
both consumers exist and the seam is obvious. Needs the reactor owner's agreement, because it
promotes internal modules to public API.
**Affects:** Phase 4.1.

### Q6 — Worker isolation: threads or processes?

`WorkerPoolConfig.workerType` already offers both.

Threads are cheaper and share memory pressure; a native crash in a thread takes down the host.
Processes are heavier (~30–50 MB each) but a connector segfault is survivable — and the PFNÜR OCR
experience says third-party native code *will* hang or crash.

**Recommendation: `process` by default on the server, and on desktop with `workers.count = 2`;
`thread` available for trusted first-party connectors.** Confirm the desktop memory budget.
**Affects:** Phase 4, Phase 10.

### Q7 — Is `connectors` one manifest key or two?

The spec puts triggers and actions inside a single `ConnectorDefinition`. An alternative is a
separate `workflowBlocks` key for blocks that integrate nothing external (pure logic/transform
contributed by a package).

**Recommendation: one key, `connectors`.** A package contributing pure blocks declares a connector
with no `configSchema` and no secrets. Fewer manifest keys means fewer places to forget
(`ManifestSchema` / `MODULE_KEYS` / `schema-fragments`).
**Affects:** Phase 1.2.

### Q8 — Does Connect get a real workflow runtime, or only a start button?

Running the engine in the browser worker is genuinely useful for local-first, offline automations —
but it doubles the runtime's surface, and the browser reactor already carries an RPC layer that
everything must cross.

- **A.** Full reduced runtime in Connect (spec's position).
- **B.** Connect only *starts* runs against a server; no browser execution.
- **C.** Phase it: B for v1, A for v1.1.

**Recommendation: C.** Ship B in Phase 6 and keep the `runtimes` field in the contract from day one
so nothing has to change later. It removes real risk from an already large first release, at the cost
of no offline automation in v1.
**Affects:** Phase 6.5, and the desktop story (the desktop *sidecar* is a server, so desktop
automations still work under B).

---

## Operational

### Q9 — Secret storage backends

`ISecretProvider` needs concrete implementations. Which must exist in v1?

Candidates: env vars (dev), an encrypted file under `.ph/` (single-node), the OS keychain (desktop),
HashiCorp Vault / cloud KMS (production fleets), and the existing Renown key store (if it can hold
arbitrary secrets — I could not confirm that it can).

**Recommendation for v1:** env + encrypted-file + OS keychain, with a documented provider interface.
Vault/KMS as a v1.1 plug-in. **Needs a decision from whoever owns production deployment.**
**Affects:** Phase 4.2, Phase 10.

### Q10 — OAuth2 connectors

Many interesting connectors (Gmail, Google Drive, Discord bots, Slack) need an OAuth2 authorisation-
code flow: a redirect URI, a callback endpoint, token storage and refresh. That is a substantial
sub-feature, and it is invisible in the spec today.

Options: (a) v1 supports only API keys / basic / bearer, with OAuth deferred; (b) build a generic
OAuth broker in the runtime (callback route, PKCE, refresh scheduler, per-connection token records);
(c) rely on an external broker.

**Recommendation: (a) for v1, (b) designed in v1.1.** But note this directly limits the briefing's
headline example — "when I receive an e-mail" over Gmail needs OAuth; over IMAP with an app password
it does not. **Please confirm which demo we are aiming at.**
**Affects:** the connector suite scope, Phase 9/10 demos.

### Q11 — Which connectors ship in v1?

The briefing names email, files, Discord, paperless. Building each properly (auth, pagination, rate
limits, error taxonomy) is 3–5 days.

**Recommendation:** `core` (built in) + `idp` (Phase 9) + **three** externals chosen for demo value
and low auth friction: **IMAP/SMTP** (app password), **Discord webhook + bot** (bot token), and
**HTTP/webhook generic** (covers paperless and everything else with a URL). Google Drive/Gmail wait
for OAuth.
**Affects:** Phase 9/10 scope.

### Q12 — Queue driver for production Switchboard

The spec offers `embedded` and `bullmq`. PFNÜR already runs BullMQ + Redis, so the migration path is
natural — but it adds Redis as a hard dependency for multi-node deployments that do not have it.

**Recommendation:** `embedded` on Postgres is the default everywhere (it works multi-node with
`FOR UPDATE SKIP LOCKED`); `bullmq` exists for PFNÜR-style deployments that already have Redis and
want Bull Board. **Confirm the ops preference.**
**Affects:** Phase 3.1, Phase 9.

### Q13 — Retention and PII

Run journals will contain email bodies, invoice contents, personal data. Retention is currently one
number (`retainRunsDays`).

Open: is a per-workflow retention setting enough, or does this need a data-classification model
(field-level tags driving redaction and retention)? Is there a GDPR erasure requirement that must
reach into run journals and attachments?

**Recommendation:** ship `retainRunsDays` + declared redaction in v1, and open a separate design
thread on data classification before any customer-facing deployment. **Needs a compliance answer.**
**Affects:** Phase 3.8, Phase 10.

---

## Smaller, but worth an answer

### Q14 — Naming
`connector` is the briefing's term and I have kept it. Note it collides conceptually with "connector"
in the diagramming sense used in some Powerhouse UI code. Alternatives: `integration`, `adapter`.
**Recommendation: keep `connector`;** it is the industry term users will expect.

### Q15 — `powerhouse/workflow-template`
Deferred to v1.1 in the spec. If packages should be able to ship ready-made automations at install
time (which would materially improve the desktop first-run experience), it needs to move into v1.
**Recommendation: keep it deferred, but reserve the document type id now** so it can be added
without a migration.

### Q16 — Does the workflow runtime belong in `reactor-api`'s dependency tree at all?
Composing it in `startServer` makes wiring trivial but means every Switchboard carries the runtime's
dependencies even when disabled. The alternative is a host-side opt-in import in
`apps/switchboard/src/server.mts`.
**Recommendation: opt-in import in the host**, with `reactor-api` exposing only the composition hook.
Keeps the "adds < 5 ms when disabled" acceptance criterion honest.
**Affects:** Phase 3, Phase 8.1.

### Q17 — Is `win-test` still needed?
It contains only a stale document-model boilerplate README; `ph-win-desktop` is the live prototype.
Worth confirming it can be dropped from the working set so future agents are not misled by the
briefing's description of it.
