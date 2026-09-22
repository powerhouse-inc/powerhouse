# Authoring workflows outside Connect

Workflow Studio is how a person builds a workflow. This page is how a *program*
does it — a seed script that sets an environment up, an integration test that
drives a workflow end to end, or an agent building one on your behalf.

Everything here is the reactor's own GraphQL API. The workflow runtime adds a
subgraph under the reactor's main endpoint (`/graphql` by default) with two
roots, `workflowRuntime` on `Query` and on `Mutation`. It's introspectable, so
the fastest way to see the current surface is to point a GraphQL client at it;
the fields below are the ones you'll reach for.

## 1. Find out what blocks exist

Never assemble a block type by hand. Ask the reactor, and use the strings it
gives back — that way you get the right form whether the piece came from your
package or from a registry.

```graphql
query {
  workflowRuntime {
    # Every piece this reactor can offer
    pieceCatalog
    # One piece's actions and triggers, each with a ready-to-use blockType
    pieceActions(packageName: "@acme/piece-crm")
    pieceTriggers(packageName: "@acme/piece-crm")
  }
}
```

`pieceActions` and `pieceTriggers` are the two you want when you already know
the piece. Each entry carries the exact `blockType` string to put in a step.

To search across everything instead:

```graphql
query {
  workflowRuntime {
    searchBlocks(query: "invoice", limit: 20) {
      # hits carry blockType, pieceName and the action's display name
      ...
    }
  }
}
```

The search index builds lazily, so the first call may report a status of
`indexing` — poll until it settles.

Two more worth knowing:

- **`blockDescriptor(blockType:)`** — an action's props and auth requirements,
  so you know what config to write. Works for core blocks too.
- **`blockOutputTree(blockType:, config:)`** — the shape a block's output will
  have, which is how Studio offers later steps their fields before anything has
  run. Useful for checking an expression path is real before you commit it.

## 2. The expression language

Step config refers to the trigger and to earlier steps with `{{ }}`. The scope
has three roots:

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

The first term that isn't undefined, null or empty wins.

**That is the whole language.** It is path lookup, not a small programming
language, and this is the single most common thing to get wrong:

```
{{a.b == 'x'}}          ✗  comparisons do not evaluate
{{ a.b ? x : y }}       ✗  no ternaries
{{ eq(a, b) }}          ✗  no function calls
{{ a['b'] }}            ✗  no bracket access — use a.b
```

**An expression that resolves to nothing drops the property silently.** No
warning, no failed run — the step simply runs without that input, and you find
out from the result. When a step behaves as if you passed nothing, read the run
journal's recorded `input` for that step (below) and check the path.

## 3. Core blocks

Some blocks belong to no piece — they're the engine's own. They're listed like
any other piece, under the name `core`:

```graphql
query {
  workflowRuntime {
    pieceActions(packageName: "core")
    pieceTriggers(packageName: "core")
  }
}
```

`blockDescriptor("core#branch")` describes their config the same way it
describes a piece action's props. What they are:

| Block type | What it is |
| --- | --- |
| `core#branch` | a decision — the `true`/`false` ports |
| `core#assert` | fails the step when a value is blank or rejected |
| `core#schedule` | a trigger firing on a cron or interval |
| `core#webhook` | a trigger fired by an HTTP delivery |
| `core#manual` | a trigger fired on demand, by the `fire` mutation |

**`core#branch` does not evaluate an expression.** It compares two resolved
values. Give it a `condition` and an `equals`, and it takes the `true` port when
they match, trimmed and case-insensitively:

```json
{
  "blockType": "core#branch",
  "config": {
    "condition": "{{trigger.payload.severity}}",
    "equals": "critical"
  }
}
```

With `equals` omitted it falls back to truthiness — anything non-empty is true,
except the strings `"false"` and `"0"`. This is the trap: a config of
`{"condition": "{{a}} == 'critical'"}` is a *non-empty string*, so it takes the
true port every time, whatever `a` is. If a branch always goes one way, this is
why.

`core#assert` takes `value` plus any of `rejectValues`, `allowValues`,
`allowEmpty` and a custom `message`. It's the guard for a value you don't
control — a model's output, a third party's field — placed before the step that
would act on it.

## 4. Build the workflow document

A workflow is a `powerhouse/workflow` document, so you create and edit it the
way you would any other document — through the reactor's document API or its MCP
endpoint, covered in [Using the API](/academy/Build/WorkWithData/UsingTheAPI).
Every operation below is dispatched in the `global` scope; a dispatch that omits
the scope is rejected.

What's specific to workflows is which operations to dispatch, in this order:

1. **`SET_WORKFLOW_NAME`** / `SET_WORKFLOW_DESCRIPTION`.
2. **`SET_TRIGGER`** — `blockType`, `config`, and `connectionId` when the
   trigger's piece needs credentials. One per workflow; `CLEAR_TRIGGER` removes it.
3. **`ADD_STEP`** — `id`, `key`, `name`, `blockType`, `config`, optionally
   `connectionId`, `retry`, `timeoutSeconds`, `idempotencyKeyExpression` and a
   `position` for the canvas. The `key` is what expressions refer to, so choose
   it deliberately. `UPDATE_STEP`, `SET_STEP_CONFIG` and `REMOVE_STEP` follow.
4. **`ADD_EDGE`** — `from` (a step id, or the trigger's id for the entry edge),
   `to`, and `port`: `next`, `true`, `false`, `error`, or a case label.
5. **`SET_VARIABLE`** and **`SET_POLICY`** as needed.
6. **`SET_WORKFLOW_STATUS`** to `ENABLED`. Nothing fires until you do — only an
   enabled workflow gets trigger instances. This is also what runs a piece
   trigger's `onEnable`, which is when a webhook trigger registers itself with
   its provider.

## 5. Connections and secrets

A step that authenticates points at a `powerhouse/connection` document, so you
build one of those the same way — with operations, in order.

### What a connection holds

| Field | What goes in it |
| --- | --- |
| `connectorId` | The piece id, e.g. `@acme/piece-crm`. Not a block type: no action, no `#` fragment. |
| `authType` | Which `PieceAuth` kind the piece declares: `CUSTOM_AUTH`, `SECRET_TEXT`, `BASIC_AUTH`, `OAUTH2`, `OIDC` or `NONE`. |
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
document:

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

Secrets are encrypted with the runtime's master key, so changing that key — or
losing it, and letting the runtime generate a new one — makes every existing ref
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
difference: a URL that exists but isn't accepting yet. `absoluteUrl: false`
means the reactor doesn't know its own public origin and has handed you a bare
path — fix that with `PUBLIC_URL`, per
[Configure environment](/academy/Build/Launch/ConfigureEnvironment), before
giving the URL to anything outside your machine.

## 7. Fire it, and see what happened

```graphql
mutation { workflowRuntime { fire(workflowId: "...", payload: {...}) { runId status } } }
mutation { workflowRuntime { testTrigger(workflowId: "...") } }
mutation { workflowRuntime { rerun(runId: "...") { runId status } } }
```

`fire` runs a `core#manual` workflow to completion and hands back the result —
the quickest way to exercise a graph without waiting on a poll. `testTrigger`
runs a piece trigger's test hook, returning sample items without moving its
cursor. `rerun` resumes a failed run: succeeded steps replay from the journal
and execution restarts at the failure.

The run journal is the debugging surface, and it is a good one:

```graphql
query {
  workflowRuntime {
    runs(workflowId: "...", limit: 10) {
      id status error startedAt endedAt workflowVersion
      steps { stepKey blockType status port input output error }
    }
  }
}
```

Per step: the config **as resolved** (`input`), what came back (`output`), and
which port it left by. That resolved input is how you catch an expression that
silently resolved to nothing — the commonest cause of a workflow that runs green
and does nothing.

`triggerStates` reports the health of every registered trigger, including poll
schedules and the last error, which is where a trigger that isn't firing
explains itself.
