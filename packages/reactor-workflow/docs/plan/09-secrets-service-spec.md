# Secrets Service — Specification

Status: **Proposed** · 2026-09-03
Depends on: doc 08 §security model; informed by the reactor-attachments design and the current
`SecretProvider` seam in `@powerhousedao/reactor-connectors`.

## 1. Problem

Connection documents (`powerhouse/connection`) reference secrets by env-var **name**
(`secretRefs: [{name, ref}]`), resolved at execution time from switchboard's `process.env` by
`EnvSecretProvider`. This works for local dev and nothing else:

- Creating a secret is out-of-band (`export DISCORD_BOT_TOKEN=…` before `ph vetra`); Connect can
  only ask the user to type a *name*, which invites pasting the *value* — and document history is
  append-only, so a pasted value is a permanent leak requiring rotation.
- No rotation, no audit, no multi-tenant story, one flat namespace per process.
- Every consumer that needs a secret (workflow connectors today; notification channels, renown
  integrations tomorrow) would reinvent the same plumbing.

## 2. Goals / non-goals

**Goals**

1. Secrets are created and rotated **through Connect**, with only an opaque reference ever entering
   a document.
2. One reactor-level service (`ISecretsService`) with pluggable backends, positioned like the
   attachments service: built in reactor-api, served by switchboard, injected into package code.
3. Values are readable **only inside execution contexts** (connection resolution in the workflow
   engine); no API ever returns a secret value.
4. Backward compatible: bare refs (`DISCORD_BOT_TOKEN`) keep resolving from env.

**Non-goals (v1)**

- Dynamic/leased credentials (OpenBao can mint DB creds etc. — later).
- Per-user secrets; v1 secrets are reactor-scoped operator/tenant data.
- Client-side encryption. The value transits one authenticated TLS request, like every
  password-change form on the internet.

## 3. The reference format

```
secret://v1:<id>
```

`<id>` is a **server-minted 128-bit random identifier** (32 lowercase hex chars). Examples:

- `secret://v1:9f2c4a1e8b7d40329fd1c05a6e83b217` — service-managed secret (any backend).
- `DISCORD_BOT_TOKEN` — legacy bare ref, resolved from env, grandfathered.

Document state (`powerhouse/connection`) is unchanged structurally: `secretRefs[].ref` simply starts
carrying `secret://v1:` refs.

### Why NOT content-addressed (deliberate divergence from attachments)

Attachments use `attachment://v1:<sha256>` because content addressing gives dedup and integrity for
*public* bytes. For secrets it is actively harmful:

1. **Hash oracle.** Refs live in documents, which sync and are readable broadly. A content hash of a
   secret lets anyone verify a guessed value offline (`sha256(guess) == ref`), and low-entropy
   secrets (PINs, weak passwords) fall to brute force.
2. **Equality leak.** Two connections using the same token would carry the same ref — visible proof
   that they share a credential.
3. **Rotation breaks the ref.** A rotated value would change the hash, forcing a document edit on
   every rotation. Secrets want the opposite: a **stable handle over a mutable value**.

Hence: random id, stable across rotations, meaningless in isolation.

## 4. Data model

Value lives in the backend; the service keeps metadata (mirroring the attachments split of
metadata-in-DB / bytes-in-store):

```
secret (metadata, relational "secrets" schema)
  id            text PK        -- the 32-hex id
  label         text           -- human name shown in Connect ("Discord bot token")
  backend       text           -- env | local | openbao | ...
  backend_path  text           -- backend-specific locator (e.g. bao mount/path)
  version       integer        -- bumped on rotate
  created_at    text (ISO)
  updated_at    text (ISO)
  created_by    text           -- DID / user id when auth is on; nullable
  status        text           -- ACTIVE | DELETED
```

The **value** is never in this table. Deletion is a tombstone (status DELETED) so a dangling ref in
an old document version resolves to a clear "secret deleted" error rather than "not found".

## 5. Backends

One interface, selected per secret at creation (default from `PH_SECRETS_BACKEND`):

| Backend | Read | Write/rotate | Storage | Notes |
|---|---|---|---|---|
| `env` | ✓ | ✗ | process env | Legacy bare refs only; never minted as `secret://` |
| `local` | ✓ | ✓ | encrypted at rest in the reactor DB | AES-256-GCM, master key from `PH_SECRETS_MASTER_KEY` (or a generated key file next to the DB for dev). The zero-infra default, like attachments' filesystem backend |
| `openbao` | ✓ | ✓ | OpenBao / Vault KV v2 | `BAO_ADDR` + `BAO_TOKEN` or AppRole. `backend_path` = `<mount>/<path>`; service reads `data.data.value`. Vault-API compatible ⇒ works against HashiCorp Vault too |

Backend interface (server-side only):

```ts
interface ISecretBackend {
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;   // create + rotate
  delete(path: string): Promise<void>;                  // best-effort
}
```

OpenBao gets rotation, audit logging and (later) dynamic secrets for free; `local` makes laptops and
CI work with zero infrastructure.

## 6. Service API

### Server-side (`ISecretsService`, reactor-api)

```ts
interface ISecretsService {
  create(input: { value: string; label?: string; backend?: string }): Promise<SecretStat>; // mints ref
  rotate(ref: string, value: string): Promise<SecretStat>;   // same ref, version+1
  stat(ref: string): Promise<SecretStat>;                    // metadata only, never the value
  list(): Promise<SecretStat[]>;                             // metadata only
  delete(ref: string): Promise<void>;                        // tombstone
  /** Execution-context only; never exposed over any transport. */
  resolve(ref: string): Promise<string>;
}
```

`resolve` handles both forms: `secret://v1:*` via metadata → backend; bare names via env (legacy).

### GraphQL (switchboard, for Connect)

```graphql
type Mutation {
  createSecret(value: String!, label: String): SecretStat!
  rotateSecret(ref: String!, value: String!): SecretStat!
  deleteSecret(ref: String!): Boolean!
}
type Query {
  secret(ref: String!): SecretStat        # exists / label / version / updatedAt — no value
  secrets: [SecretStat!]!
}
```

**There is no query that returns a value.** Mutations are auth-gated (admin/user role once runtime
auth lands; behind `PH_SECRETS_ALLOW_WRITE=true` in dev until then). Values must be excluded from
request logging on this route.

**Connect talks to the service, never to the backend.** This GraphQL surface *is* the secrets
service's front door — Connect uses it directly. What Connect must never do is reach the backend
(OpenBao) itself: that would require a vault token in the browser (a worse secret than the ones
being stored), expose the vault to browser origins, and bypass the one place that can enforce
authorization, auditing with user identity, and backend selection. Same shape as attachments, where
Connect calls switchboard's `/attachments` routes rather than the filesystem or S3 — with one
difference: attachments legitimately hand out presigned S3 URLs so large blobs skip the middleman;
secrets are a few hundred bytes and gain nothing from that, so every byte goes through switchboard.

### Wiring (the attachments lesson, applied)

- Built in reactor-api next to the attachment builder; hangs off the API object
  (`api.secrets: ISecretsService`).
- Exposed to **processors** via `IProcessorHostModule.secrets` (as attachments already are) **and to
  subgraphs via a `SubgraphArgs.secrets` addition** — attachments skipped subgraphs and every
  consumer has regretted it; this spec makes the `SubgraphArgs` change part of the deliverable.
  (Ship it alongside `SubgraphArgs.httpAdapter`, which the webhook-trigger work needs anyway.)
- Until the upstream service exists, `@powerhousedao/reactor-connectors` keeps its `SecretProvider`
  seam: a scheme-dispatching `ChainSecretProvider` (bare → env, `secret://` → service,
  `bao://` → direct OpenBao) lets reactor-workflow adopt the ref format and the OpenBao backend
  immediately, then swap the backing when the core service lands.

## 7. Connect flow — filling in a connector secret

The connection editor's secret field becomes a **value** field, not a name field:

1. User creates a connection for a piece; `planFromAuth` renders one field per required secret
   (e.g. *Bot token*), masked (`type=password`).
2. User pastes the value and saves. The editor calls
   `createSecret(value, label: "<connection name> · <field name>")` → receives
   `secret://v1:9f2c…`.
3. The editor dispatches the normal document action:
   `SET_SECRET_REF { name: "token", ref: "secret://v1:9f2c…" }`. **Only the ref enters the
   document.** The input field is cleared; from now on the field renders the label, masked
   placeholder (`••••••••`), version and last-rotated date from `secret(ref)`.
4. Re-entering a value on an existing field calls `rotateSecret(ref, value)` — same ref, so the
   document is untouched and history stays clean. "Replace with a different secret" (rare) is an
   explicit secondary action that mints a new ref and dispatches a new `SET_SECRET_REF`.
5. The existing "this looks like a raw secret value" heuristic stays, repurposed: the *advanced*
   path of typing a ref by hand (env name or `secret://`) remains available behind a toggle for
   operators, with the warning guarding it.

Execution is unchanged: `DocumentConnectionResolver` → `shapeAuthValue` → `resolve(ref)` per run;
rotation therefore takes effect on the next execution with no restart.

## 8. Uniqueness — how Connect avoids collisions

**Connect never names a secret; the server mints every ref.** That single rule gives all the
uniqueness properties:

- **No collisions**: ids are 128-bit server-side randomness; the client cannot supply or influence
  them, so two users (or two tabs) saving simultaneously always produce distinct secrets.
- **No accidental overwrite**: writing to an existing secret requires holding its ref *and* calling
  `rotateSecret` explicitly. There is no upsert-by-name anywhere.
- **No cross-connection aliasing**: two connections that happen to use the same token value still
  get distinct refs (see §3 — equality must not be observable).
- **Idempotence at the UX layer, not the API**: if a double-submit mints an orphan secret, it is
  harmless (unreferenced, GC-able); the document only ever records the ref from the response the
  editor actually used.
- Human naming lives in `label`, which is display-only metadata and is allowed to collide freely.

Orphan cleanup (a secret whose ref no document references) is a later concern; the reference index
pattern from attachments (`AttachmentReferenceReadModel`) is the template if/when we want
`secrets --prune`.

## 9. Security invariants

1. A secret **value** never appears in: document state or operations, the run journal (step
   inputs/outputs are recorded — auth values are injected outside the recorded config and must stay
   that way), server logs, GraphQL responses, or error messages (backend errors are wrapped;
   `SecretNotFoundError` carries the ref, never a value).
2. `resolve` is callable only from server-side execution paths; it is not on any transport.
3. Write mutations are auth-gated; dev-mode opt-in until runtime auth exists.
4. Journal redaction (separate work item) additionally scrubs anything *equal to* a resolved secret
   value from recorded step output, as defense in depth against pieces echoing credentials.
5. Rotation guidance in docs: a value that ever landed in a document (the known failure mode) is
   burned — rotate at the provider, not just re-point the ref.

## 10. Staged delivery

| Stage | Where | What |
|---|---|---|
| 1 | reactor-workflow | `ChainSecretProvider` + `OpenBaoSecretProvider` + `LocalEncryptedSecretProvider` behind the existing `SecretProvider` seam; `secret://v1:` parsing; tests against `bao server -dev` |
| 2 | reactor-workflow | `createSecret`/`rotateSecret`/`secret` on the workflow-runtime subgraph (dev-flagged), connection-editor flow from §7 |
| 3 | monorepo | `ISecretsService` in reactor-api (metadata table + backends), switchboard routes/subgraph, `IProcessorHostModule.secrets` **and `SubgraphArgs.secrets`**; reactor-workflow's provider chain becomes an adapter over it |
| 4 | later | audit log surfacing, orphan GC via reference index, dynamic/leased credentials |

Stages 1–2 need nothing from the monorepo and make the Connect flow real; stage 3 is where it
becomes "at the level of the attachments service".

## 11. Open questions

- **Q1** Scope of a secret: reactor-global (v1) vs drive- or document-scoped. Drive-scoped would let
  remote-drive sync carry *refs* whose values differ per reactor — probably the long-term answer for
  shared workflows; global is enough now.
- **Q2** Should `rotateSecret` require re-authentication / a fresh token when auth lands?
- **Q3** `local` backend key management in Docker deployments (mounted key file vs KMS envelope).
- **Q4** Whether `secretRefs[].name` → prop mapping should move into the service metadata so the
  same secret can be reused across connections intentionally (currently: one ref per field, reuse by
  pasting the ref in the advanced path).
