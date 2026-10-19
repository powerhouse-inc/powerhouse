# Authoring workflows outside Connect

Workflow Studio is how a person builds a workflow. This page builds one from
code: a seed script that sets up an environment, an integration test that
drives a workflow end to end, or an agent building one for you.

Everything here is the reactor's own GraphQL API. The workflow runtime adds a
subgraph under the reactor's main endpoint (`/graphql` by default) with two
roots, `workflowRuntime` on `Query` and on `Mutation`. It's introspectable, so
the fastest way to see the current surface is to point a GraphQL client at it;
the fields below are the ones you'll reach for.

## 1. Find out what blocks exist

A step names its block with three fields: `pieceName`, `pieceVersion` and
`actionName`. A trigger has `pieceName`, `pieceVersion` and `triggerName`. The
version is an exact semver. Don't write these from memory: ask the reactor, and
use what it gives back, whether the piece came from your package or a registry.

```graphql
query {
  workflowRuntime {
    # Every piece this reactor can offer
    pieceCatalog
    # One piece's actions and triggers, at the version to pin
    pieceActions(packageName: "@acme/piece-crm")
    pieceTriggers(packageName: "@acme/piece-crm")
  }
}
```

`pieceActions` and `pieceTriggers` are the two you want when you already know
the piece. Each answers with the piece's `name` and `version` and a list of
entries; an entry's `name` is the `actionName` or `triggerName` to write.

To search across everything instead:

```graphql
query {
  workflowRuntime {
    searchPieces(query: "invoice", kind: "action", limit: 20) {
      status
      pieces {
        pieceName
        source
        blocks { pieceName pieceVersion name kind displayName }
      }
    }
  }
}
```

Results come grouped by piece, best match first. `kind` is `action` or
`trigger`. `sources` (`local`, `registry`, `activepieces`) and `categories`
narrow the search, and `limit` caps the number of pieces. The search index
builds lazily, so the first call may report a status of `indexing` — poll
until it settles.

Two more queries:

- **`blockDescriptor(block:)`** — an action's or trigger's props, auth
  requirements and output ports, so you know what config to write. `block` is
  a `BlockInput`: `{ pieceName, pieceVersion, name, kind }`, with `kind` either
  `action` or `trigger`. Works for core blocks too.
- **`blockOutputTree(block:, config:)`** — the shape a block's output will
  have, which is how Studio offers later steps their fields before anything has
  run. Useful for checking an expression path is real before you commit it.

## 2. The expression language

Step config refers to the trigger and to earlier steps with `{{ }}`. Every
string in a step's config is evaluated, nested ones included. A field's
`propertySettings[].mode` (`MANUAL` or `EXPRESSION`) only records which control
Studio draws for it; the runtime ignores it. Write `\{{` for a literal `{{`.
The scope has three roots:

| Path | What it reads |
| --- | --- |
| `{{trigger.payload.<field>}}` | the trigger's payload — note `payload`, it isn't `{{trigger.<field>}}` |
| `{{steps.<stepKey>.output.<field>}}` | an earlier step's output, by its `key` |
| `{{steps.<stepKey>.error}}` | why an earlier step failed — what an error branch reads |
| `{{variables.<key>}}` | a workflow variable |

A whole-string expression yields the raw value, so `{{steps.a.output.count}}`
passes a number. An expression embedded in text interpolates into a string.

`||` gives a fallback chain, and string literals are allowed in it:

```
{{steps.lookup.output.name || trigger.payload.name || 'unknown'}}
```

The first term whose value is not `null` or `""` wins. A missing path falls
through to the next term. If the last term is a missing path, the step fails,
unless that term is a literal or ends in `?`.

**That is the whole language.** It is path lookup, not a small programming
language, and this is the single most common thing to get wrong:

```
{{a.b == 'x'}}          ✗  comparisons do not evaluate
{{ a.b ? x : y }}       ✗  no ternaries
{{ eq(a, b) }}          ✗  no function calls
```

Brackets read keys that are not plain names, and array indexes:
`{{steps.fetch.output.headers["content.type"]}}`, `{{steps.list.output.items[0]}}`.

**A reference that names nothing fails the step** with
`Unresolved reference {{steps.x.output.y}}`. Add `?` for a value that may be
absent: `{{steps.x.output.y?}}` resolves to `null`. A path whose value is `null`
is not missing.

## 3. Core blocks

The engine's own blocks are the built-in piece `@powerhousedao/piece-core`.
Every reactor ships it, at the version of its workflow runtime, and it is listed
like any other piece:

```graphql
query {
  workflowRuntime {
    pieceActions(packageName: "@powerhousedao/piece-core")
    pieceTriggers(packageName: "@powerhousedao/piece-core")
  }
}
```

`blockDescriptor` describes their config the same way it describes any other
piece's. What they are:

| Name | Kind | What it is |
| --- | --- | --- |
| `branch` | action | a decision — the `true`/`false` ports |
| `assert` | action | fails the step when a value is blank or rejected |
| `schedule` | trigger | fires on a cron schedule or at a fixed interval |
| `webhook` | trigger | fires on an HTTP delivery |
| `manual` | trigger | fires on demand, by the `fire` mutation |

**`branch` does not evaluate an expression.** It applies one `operator` to a
resolved `left` and, for a comparison, `right`, and takes the `true` port when
it holds, else `false`. Text comparisons ignore case unless `caseSensitive` is
`true`:

```json
{
  "pieceName": "@powerhousedao/piece-core",
  "pieceVersion": "<the core piece's version>",
  "actionName": "branch",
  "config": {
    "left": "{{trigger.payload.severity}}",
    "operator": "TEXT_EXACTLY_MATCHES",
    "right": "critical"
  }
}
```

`operator` is required. The operators are:

- Text: `TEXT_EXACTLY_MATCHES`, `TEXT_DOES_NOT_EXACTLY_MATCH`, `TEXT_CONTAINS`,
  `TEXT_DOES_NOT_CONTAIN`, `TEXT_STARTS_WITH`, `TEXT_DOES_NOT_START_WITH`,
  `TEXT_ENDS_WITH`, `TEXT_DOES_NOT_END_WITH`.
- Number: `NUMBER_IS_EQUAL_TO`, `NUMBER_IS_GREATER_THAN`, `NUMBER_IS_LESS_THAN`.
- Date: `DATE_IS_EQUAL`, `DATE_IS_BEFORE`, `DATE_IS_AFTER`.
- List: `LIST_CONTAINS`, `LIST_DOES_NOT_CONTAIN`, `LIST_IS_EMPTY`,
  `LIST_IS_NOT_EMPTY`.
- Other: `BOOLEAN_IS_TRUE`, `BOOLEAN_IS_FALSE`, `EXISTS`, `DOES_NOT_EXIST`.

`BOOLEAN_*`, `LIST_IS_*`, `EXISTS` and `DOES_NOT_EXIST` read no `right`, and
`caseSensitive` applies only to the text operators, `LIST_CONTAINS` and
`LIST_DOES_NOT_CONTAIN`. An operand of the wrong type fails the step, which
then leaves on its `error` port: a number operator on `"abc"`, a list operator
on something that is not a list. Writing a comparison into `left`, as in
`"{{a}} == 'critical'"`, gives a text value and compares nothing.

`assert` takes `value` plus any of `rejectValues`, `allowValues`,
`allowEmpty` and a custom `message`. It's the guard for a value you don't
control (a model's output, a third party's field), placed before the step that
would act on it.

`schedule` takes `{ mode: "cron", cron, timezone? }` or
`{ mode: "interval", every, unit, timezone? }`. `cron` has exactly five fields.
`every` is a whole number of at least 1, and `unit` is `minutes`, `hours` or
`days`. `timezone` is an IANA name and defaults to UTC. `mode` is required: a
config without it fails with `"mode" is required ("cron" or "interval")`.

## 4. Build the workflow document

A workflow is a `powerhouse/workflow` document, so you create and edit it the
way you would any other document — through the reactor's document API or its MCP
endpoint, covered in [Using the API](/academy/Build/WorkWithData/UsingTheAPI).
Every operation below is dispatched in the `global` scope; a dispatch that omits
the scope is rejected.

What's specific to workflows is which operations to dispatch, in this order:

1. **`SET_WORKFLOW_NAME`** / `SET_WORKFLOW_DESCRIPTION`.
2. **`SET_TRIGGER`**: `id` (an OID, the source of the entry edge),
   `pieceName`, `pieceVersion`, `triggerName`, `config`, optionally
   `propertySettings`, `connectionId` when the trigger's piece needs
   credentials, and `reactorConnectionId` when the trigger declares reactor
   access. One per workflow; `CLEAR_TRIGGER` removes it.
3. **`ADD_STEP`**: `id`, `key`, `name`, `pieceName`, `pieceVersion`,
   `actionName`, `config`, optionally `connectionId`, `reactorConnectionId`,
   `timeoutSeconds`, `skip`, `propertySettings` and a `position` for the
   canvas. The `key` is what
   expressions refer to, so choose it deliberately. `UPDATE_STEP`,
   `SET_STEP_CONFIG` and `REMOVE_STEP` follow. A step that runs past its
   `timeoutSeconds` fails.
4. **`ADD_EDGE`**: `id`, `from` (a step id, or the trigger's id for the entry
   edge), `to`, `port`, and optionally `condition`. `port` must be one the
   source declares: `next` and `error` for a piece action, `next` for the
   trigger, `true`, `false` and `error` for `branch`. An edge on any other port
   is never taken, and every run reports it in `warningNotes`. A `condition` is
   a template: the edge is taken only when it resolves truthy, where the strings
   `"false"` and `"0"` are false, and an unresolved reference in it fails the
   run.
5. **`SET_VARIABLE`** as needed: `id`, `key`, `value`, optionally `description`
   and `type`.
6. **`PUBLISH_WORKFLOW`** with `{ publishedAt }`. It copies the draft into
   `published`. Triggers arm from that copy and runs execute it, so later draft
   edits change nothing until you publish again. `REVERT_TO_PUBLISHED` resets
   the draft to the published copy.
7. **`SET_WORKFLOW_STATUS`** to `ENABLED`. This fails with "Publish the workflow
   before enabling it" until step 6 has run once. Only an enabled workflow gets
   trigger instances or can `fire`. Enabling runs a piece trigger's
   `onEnable`, which is when a webhook trigger registers itself with its
   provider. A later publish re-arms the trigger only if the published trigger
   changed.

Every draft edit bumps the document's `version`, and
`version !== published.version` means there are unpublished changes.

**Defaults.** When Studio adds a step, it adds the block first and then, once
the block's form loads, writes every unset prop's `defaultValue` into `config`
in a follow-up edit. A step then keeps its defaults even if a later piece
version changes them. A program adding steps should do the same: read each
prop's `defaultValue` from `blockDescriptor` and write it into `config`. A prop
left unset takes the default of whichever piece version resolves at run time.

**Skipping.** `skip: true` on a step (`ADD_STEP` or `UPDATE_STEP`) passes over
it at run time. The step records `SKIPPED` with a `null` output and continues on
`next`, so `{{steps.<key>.output}}` is `null` downstream. A skipped `branch`
leaves on `next`, which `branch` doesn't declare, so nothing after it runs.

**Variable types.** `type` is `TEXT`, `NUMBER`, `BOOLEAN`, `JSON` or `SECRET`.
Omitted, it keeps the variable's existing type, and `null` clears it. A run
coerces typed values when it starts, and fails when a value doesn't coerce, as
in `Variable "<key>" is a NUMBER, but its value "abc" is not a number`. A
`SECRET` variable's value is a ref from `createSecret` (see below), never the
plaintext; any other value makes `SET_VARIABLE` throw. The run resolves the ref
and redacts the plaintext from what it journals.

**Completeness is not stored.** A step with a required prop left empty, a
dynamic prop missing a child, or an edge on an undeclared port is still a valid
document. Studio computes those problems where it shows them and disables
**Publish** while any remain. A program writing documents directly has to check
them itself. At run time, a step missing a required prop fails with a
`PropsValidationError` naming each field.

## 5. Connections and secrets

A step that authenticates points at a `powerhouse/connection` document, so you
build one of those the same way — with operations, in order.

### What a connection holds

| Field | What goes in it |
| --- | --- |
| `connectorId` | The piece id, e.g. `@acme/piece-crm`: the piece, not one of its actions. |
| `authType` | The `PieceAuth` kind this connection signs in with: `CUSTOM_AUTH`, `SECRET_TEXT`, `BASIC_AUTH`, `OAUTH2`, `OIDC` or `NONE`. A piece that offers several methods (its `auth` is an array) runs through the one of this type. `OAUTH2` and `OIDC` can be declared but don't run yet. `REACTOR` is a reactor connection, for a step whose block declares `requireReactor`: see [Reactor access from pieces](/academy/Learn/workflows/reactor-access). |
| `config` | The **non-secret** auth properties, keyed by property name. |
| `secretRefs` | One entry per secret property: `{ id, name, ref }`. |

**The rule that catches everyone: `secretRefs[].name` must equal the auth
property's name in the piece.** That's how a resolved credential is reassembled
before it reaches your piece — `config` and `secretRefs` are merged by property
name into the single `auth` object your `run` receives. A `name` that matches
nothing in the piece's auth is silently absent at run time, which surfaces as an
authentication failure rather than a configuration error.

So a piece declaring this:

```typescript
export const crmAuth = PieceAuth.CustomAuth({
  props: {
    baseUrl: Property.ShortText({ displayName: "Base URL", required: true }),
    apiKey: PieceAuth.SecretText({ displayName: "API key", required: true }),
  },
});
```

wants a connection built like this — `baseUrl` in `config` because it is not a
secret, `apiKey` as a secret ref carrying that exact name:

1. **`SET_CONNECTION_NAME`** — `{ name: "CRM production" }`.
2. **`SET_CONNECTOR`** — `{ connectorId: "@acme/piece-crm", authType: "CUSTOM_AUTH" }`.
   This resets the status, so send it before the rest.
3. **`SET_CONFIG`** — `{ config: { baseUrl: "https://crm.example.com" } }`.
4. **`SET_SECRET_REF`** — `{ id: "<oid>", name: "apiKey", ref: "<the ref>" }`, once
   per secret property. `REMOVE_SECRET_REF` takes the `id` you chose here.

A `SECRET_TEXT` piece has one secret property and usually no config at all; a
`NONE` piece needs neither, and its connection is just a name and a connector.

### Minting the secret

Get the `ref` from the runtime rather than writing a credential into the
document. `createSecret`, `rotateSecret` and `deleteSecret` need a supreme admin
caller; anyone else gets "Admin access required".

```graphql
mutation {
  workflowRuntime {
    createSecret(value: "sk-...", label: "CRM production") {
      ref
    }
  }
}
```

You get back a `ref` — that is what step 4 above puts in `secretRefs`. The value
is stored encrypted and cannot be read back over any API. `rotateSecret`
replaces the value behind a ref without touching any document that refers to it,
and `deleteSecret` makes it unrecoverable.

Secrets are encrypted with the runtime's master key, so changing that key (or
losing it, and letting the runtime generate a new one) makes every existing ref
undecryptable. That surfaces as a check failing with a message about
unsupported state or authentication data, which reads like a broken credential
rather than a configuration problem. Mint the secrets again and `SET_SECRET_REF`
the new refs.

Then verify it, which also records the outcome on the connection document so
Connect can show it:

```graphql
mutation {
  workflowRuntime {
    checkConnection(connectionId: "...") { ok accountLabel detail }
  }
}
```

## 6. Webhook workflows

A webhook trigger needs a URL to hand its provider. Ask for it — don't construct
it:

```graphql
query {
  workflowRuntime {
    webhookEndpoint(workflowId: "...") { url absoluteUrl armed }
  }
}
```

The endpoint is minted on first ask, whether or not the workflow is enabled,
because an author needs the URL before switching it on. `armed` carries that
difference: a URL that exists but isn't accepting yet.

Unless `PUBLIC_URL` is set (or `RENDER_EXTERNAL_URL`, or
`HEROKU_APP_DEFAULT_DOMAIN_NAME`), the URL points at `http://localhost:<port>`,
which no provider can call. Set it, per
[Configure environment](/academy/Build/Launch/ConfigureEnvironment#configuring-workflows),
before giving the URL to anything outside your machine. `absoluteUrl: false`
means the host gave the webhook service no origin at all, and the URL is a bare
path.

The core `webhook` trigger requires `scheme`:

- `none`: the endpoint is guarded only by the token in its URL.
- `token`: a shared token in a header.
- `hmac`, `hmac-prefixed` or `hmac-timestamped`: a signed body.

Without `scheme` the trigger fails with `"scheme" is required; choose "none"
for an endpoint guarded only by its URL token`. Every scheme except `none`
needs `secretRef`, a ref from `createSecret`. `hmac-prefixed` reads a label
before the digest, `sha256=` by default; set `prefix` to `""` (**No label** in
Studio) when the sender sends the digest alone. The other options are `methods`
(default `POST`), `dedupeField`, `challengeField` and `responseMode` (`async`
answers `202` at once, `sync` waits for the run).

**A workflow created on another reactor may not have synced to this one yet.**
Pass `driveId`, the drive you opened the workflow from, to `webhookEndpoint`,
`testTrigger` or `testStep`, and the call waits up to 10 seconds for the
document to arrive. If it doesn't, the call fails with "Workflow is still
syncing; try again in a moment" and the extensions
`{ code: "WORKFLOW_SYNCING", retryable: true }`. Call it again.

## 7. Fire it, and see what happened

```graphql
mutation { workflowRuntime { fire(workflowId: "...", payload: {...}) { runId status } } }
mutation { workflowRuntime { testTrigger(workflowId: "...") } }
mutation { workflowRuntime { rerun(runId: "...") { runId status } } }
```

`fire` starts a run of an enabled workflow with the payload you pass, the way
the core `manual` trigger does, runs it to completion and hands back the
result. It's the quickest way to exercise a
graph without waiting on a poll. `rerun` resumes a failed run: succeeded steps
replay from the journal and execution restarts at the failure.

`testTrigger(workflowId, payload?, timeoutSeconds?, driveId?)` samples the
draft trigger and saves the sample as its last test. A piece trigger runs its
test hook, which moves no cursor. The core `manual` trigger returns the
`payload` you pass, and `schedule` samples one fire. `webhook` waits for the
next delivery to the workflow's endpoint, up to `timeoutSeconds` (default and
maximum 300), and that delivery starts no run. `cancelTriggerTest` stops a
webhook test that is still waiting.

```graphql
mutation { workflowRuntime { testStep(workflowId: "...", stepId: "...") { runId status output error } } }
```

`testStep` runs one draft step against the latest test outputs of the blocks it
reads. It is journaled as a `test` run and noted as the step's `lastTest`. When
a block it reads has never been tested, nothing runs and `runId` is null. The
trigger and every step carry `lastTest` (`{ runId, testedAt }`) and
`updatedAt`; a test older than the block's last edit is stale, and Studio shows
"Changed since its last test". `stepOutputTree(workflowId, stepId)` returns a
block's latest test output as its output shape.

`blockResolutions(workflowId)` shows, for every draft block, which piece
version this reactor would run and how it matches the pin: `exact`,
`compatible` (a higher version of the same major, the same minor for `0.x`),
`fallback` (any other version), `installed` (the core and reactor pieces,
which always run the installed copy) or `missing`. A mismatch never blocks a
run; only `missing` fails.

Debug from the run journal:

```graphql
query {
  workflowRuntime {
    runs(workflowId: "...", limit: 10) {
      id status error startedAt endedAt workflowVersion warnings warningNotes
      steps { stepKey pieceName pieceVersion versionMatch blockName status port input output error startedAt endedAt }
    }
  }
}
```

Per step, the journal holds the config as resolved (`input`), the `output`, the
port the step left by, and its start and end times. A slow run shows which step
took the time. The resolved `input` also catches an expression that resolved to
nothing, the usual cause of a run that succeeds and does nothing. A run's
`warningNotes` lists the steps that ran a `fallback` piece version and the edges
on ports their source never takes.

`triggerStates` reports the health of every registered trigger, including poll
schedules and the last error, which is where a trigger that isn't firing
explains itself. A webhook trigger that renews its subscription also reports
`nextRenewAt`, the next time `onRenew` runs, and `renewError` and
`renewFailures`, the last failed renewal and how many have failed in a row.
They are kept apart from `lastError` and `consecutiveFailures`, which belong to
deliveries and polls. A trigger whose renewals keep failing stays `ENABLED`,
so check `renewError` when a webhook trigger has gone quiet.

```graphql
query {
  workflowRuntime {
    triggerStates {
      workflowId status nextPollAt lastError consecutiveFailures
      nextRenewAt renewError renewFailures
    }
  }
}
```
