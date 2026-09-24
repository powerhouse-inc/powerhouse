# Building a piece

A piece is a connector a workflow can call: a named bundle of **actions** (things a step does) and **triggers** (things that start a run). If you haven't met workflows yet, read [What are workflows?](/academy/Learn/workflows/what-are-workflows) first — this tutorial assumes you know what a step and a block type are.

Your reactor package already ships document models, editors and processors. It can ship pieces the same way, and that's the route for anything the public connector catalogue can't cover: your internal API, your domain calculation, your service.

In this tutorial you'll build a piece for a fictional CRM — an action that reads a record, a trigger that fires when a new one appears — and wire it up so a workflow on your reactor can use it.

## Before you start

You need an existing reactor package (`ph init` gives you one) and the piece authoring framework:

```bash
pnpm add -D @powerhousedao/pieces-framework
```

A dev dependency, not a runtime one: the build inlines the framework into your
piece rather than resolving it when the piece runs. More on why below.

The API is [Activepieces](https://www.activepieces.com)' authoring API, unchanged: a piece written for Powerhouse is a valid Activepieces piece, and vice versa. This tutorial covers what you need to ship one in a reactor package. For the full property catalogue, persistent storage, files and piece versioning, use their [piece reference](https://www.activepieces.com/docs/build-pieces/piece-reference/authentication). The framework tracks Activepieces `0.91.0`, so their current docs can get ahead of what you have installed.

## Generate the piece

```bash
ph generate piece crm --id @acme/piece-crm --auth custom
```

- **`crm`** names the directory, `pieces/crm/`.
- **`--id`** is what a block type names. Defaults to something derived from your package name; pick it deliberately, because changing it later breaks every workflow already referring to it.
- **`--auth`** is the kind of connection the piece asks for: `custom` (a form you define), `secret` (a single token), or `none`.

You get a working piece with one example action and one example trigger:

```
pieces/
├── index.ts                    # the list of pieces this package ships
└── crm/
    ├── index.ts                # createPiece — the piece definition
    └── lib/
        ├── auth.ts             # what a connection to this service holds
        ├── logo.ts
        ├── actions/get-record.ts
        ├── triggers/new-record.ts
        └── common/             # client, context, errors, auth value
```

The generator also registers the piece in `pieces/index.ts` and adds it to `powerhouse.manifest.json` — you don't have to do either by hand.

## The piece definition

`pieces/crm/index.ts` is the whole piece: what it's called, what it authenticates with, and everything it offers.

```typescript
import { createPiece, PieceCategory } from "@powerhousedao/pieces-framework";
import { crmAuth } from "./lib/auth.js";
import { crmGetRecordAction } from "./lib/actions/get-record.js";
import { crmNewRecordTrigger } from "./lib/triggers/new-record.js";
import { CRM_LOGO } from "./lib/logo.js";

export const crm = createPiece({
  displayName: "Acme CRM",
  description: "Read and watch records in the Acme CRM",
  logoUrl: CRM_LOGO,
  authors: ["acme"],
  categories: [PieceCategory.PRODUCTIVITY],
  minimumSupportedRelease: "0.30.0",
  auth: crmAuth,
  actions: [crmGetRecordAction],
  triggers: [crmNewRecordTrigger],
});

export default crm;
```

### The generator commands

`ph generate` scaffolds every kind of module a reactor package can hold —
`document-model`, `editor`, `processor`, `subgraph`, `migration-file` — and
three of them are the piece family:

| Command                            | What it does                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ph generate piece <name>`         | A new piece: directory, auth, logo, one example action and one example trigger, plus both registrations |
| `ph generate piece-action <name>`  | An action inside an existing piece, imported into its `index.ts` for you                                |
| `ph generate piece-trigger <name>` | A trigger, `--strategy polling` (default) or `--strategy webhook`                                       |

```bash
ph generate piece-action list-records
ph generate piece-trigger record-updated --strategy webhook
```

Both take `--piece <dir>` to say which piece to add to, which you can omit when
the package ships exactly one.

Two flags on `ph generate piece` are for maintenance rather than creation:
`--dir <dir>` re-registers an existing piece, and `--all` refreshes the
`pieces/index.ts` list and the manifest for every piece under `pieces/`,
pruning entries whose directory is gone. Reach for those if you rename a piece
directory by hand, or after a merge leaves the two registrations disagreeing.

## Writing an action

An action declares the properties it takes, the shape of what it returns, and a `run` function.

```typescript
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { crmAuth } from "../auth.js";
import { clientForContext } from "../common/context.js";

export const crmGetRecordAction = createAction({
  auth: crmAuth,
  name: "get-record",
  displayName: "Get record",
  description: "Reads one record by id",
  props: {
    recordId: Property.ShortText({
      displayName: "Record id",
      description: "The id of the record to read",
      required: true,
    }),
  },
  outputSchema: {
    fields: [
      { key: "id", label: "Id" },
      { key: "name", label: "Name" },
    ],
  },
  async run(context) {
    const { recordId } = context.propsValue;
    return await clientForContext(context).request({
      path: `records/${encodeURIComponent(String(recordId))}`,
    });
  },
});
```

Three of those deserve attention, because they're what makes a step usable by someone who didn't write the piece:

- **`name`** is the half after `#` in the block type. This step is `@acme/piece-crm#get-record`. Note there's no version in it: a piece your package ships is named unversioned, because the copy the reactor installed is the copy that runs. Renaming the action, though, breaks every workflow that referred to it.
- **`props`** is the form Workflow Studio renders for the step. A property a user may reasonably leave empty must be `required: false`, or the step can't be saved half-built while someone is still assembling the workflow.
- **`outputSchema`** is what a _later_ step can pick fields from. Without it, whoever builds the workflow has to run your action once and read the raw output to discover what it returns. It costs a few lines and saves every author that round trip.

## Writing a trigger

A trigger starts a run. Its `run` hook returns an array, and **each item starts one workflow run** with that item as the trigger's output. Returning an empty array means nothing happened.

Every trigger declares a strategy with `type`, which decides how the reactor calls it. The reactor runs two of the four Activepieces strategies for a piece's triggers:

| `type`                        | The reactor calls `run`                                                                             | Use it when                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `TriggerStrategy.POLLING`     | On an interval: every minute by default, never more often than once a second                        | The service has no webhooks, or you can't reach them |
| `TriggerStrategy.WEBHOOK`     | For each delivery to the workflow's endpoint, and on a slow reconciliation sweep (every 15 minutes) | The service can call a URL when something changes    |
| `TriggerStrategy.APP_WEBHOOK` | Not supported: the reactor never reads the listeners it registers                                   | —                                                    |
| `TriggerStrategy.MANUAL`      | Not supported for piece triggers                                                                    | Use `core#manual` instead                            |

`type` is required and must be the enum member, not a string. The generator writes it for you (`--strategy polling` or `--strategy webhook`).

Every trigger has the same hooks:

- **`onEnable`** runs when a workflow using the trigger is switched on or republished, and **`onDisable`** when it's switched off or deleted.
- **`run`** reports what's new.
- **`test`** is optional. Studio calls it to fetch a real sample while someone is building the workflow. It gets a scratch `context.store` that's thrown away afterwards, so it can't move a live cursor.
- **`sampleData`** is what Studio shows as the trigger's payload before it has ever fired. It lets someone build the rest of the workflow against real-looking fields rather than waiting for the trigger to fire.

### Polling

A polling trigger asks the service what's new and remembers what it has already reported:

```typescript
import {
  createTrigger,
  TriggerStrategy,
} from "@powerhousedao/pieces-framework";

export const crmNewRecordTrigger = createTrigger({
  auth: crmAuth,
  name: "new-record",
  displayName: "New record",
  description: "Fires once for each record created in the CRM",
  type: TriggerStrategy.POLLING,
  props: {},
  sampleData: { id: "rec_1", name: "Example record" },
  async onEnable(context) {
    // Seed the cursor, so enabling doesn't replay the service's history.
    const records = await listRecords(context.auth);
    await context.store.put(CURSOR_KEY, { seen: records.map((r) => r.id) });
  },
  async onDisable(context) {
    await context.store.delete(CURSOR_KEY);
  },
  async run(context) {
    const records = await listRecords(context.auth);
    const cursor = await context.store.get<{ seen: string[] }>(CURSOR_KEY);
    const seen = new Set(cursor?.seen ?? []);
    await context.store.put(CURSOR_KEY, { seen: records.map((r) => r.id) });
    return records.filter((record) => !seen.has(record.id));
  },
});
```

`context.store` is served by the host, scoped per workflow, so two workflows watching the same service keep their own cursors. The cursor's shape is yours to choose: a set of ids, a timestamp, the service's own page token. It's the only thing that stops a trigger reporting the same item twice.

A polling trigger can set its own cadence in `onEnable` with `context.setSchedule({ intervalMs })`. A `cronExpression` also works, but the reactor turns it into a fixed interval rather than firing at wall-clock times. A workflow author can override both with `pollEverySeconds` in the trigger's config, which the reactor reads itself and never passes to the piece.

### Webhook

A webhook trigger has the service call the reactor. In `onEnable`, `context.webhookUrl` is the address the reactor minted for this workflow: register it with the service there, and remove the registration in `onDisable`. That way, enabling a workflow sets the integration up and disabling it tears it down, with nothing to remember in someone's admin console.

`run` is then called in two ways, and has to handle both:

- **For a delivery**, `context.payload` holds the request. Turn its body into items.
- **For the reconciliation sweep**, there's no payload. Ask the service for what changed since your cursor, as a polling trigger would. That's how the trigger recovers deliveries the service dropped.

A reactor with no public webhook endpoint refuses to enable a webhook trigger, with "This trigger delivers by webhook, but no public webhook endpoint is configured for the reactor". If the service verifies an endpoint before it will deliver to it, declare `handshakeConfiguration` and answer the probe in `onHandshake`, as Activepieces documents.

### Duplicate items

An item carrying a `_dedupe_key` string doesn't start a second run if another item with the same key arrived in the last 30 seconds. That covers a delivery and the sweep reporting the same change moments apart. It doesn't replace the cursor, which is what keeps an item from coming back on the next poll.

## Authenticating

`lib/auth.ts` defines what a connection to your service holds — the form a user fills in once, in a connection document, that every step using this piece then refers to.

```typescript
export const crmAuth = PieceAuth.CustomAuth({
  displayName: "Acme CRM",
  description: "An API token from Settings → Developer in the Acme CRM.",
  required: true,
  props: {
    baseUrl: Property.ShortText({ displayName: "Base URL", required: true }),
    apiKey: PieceAuth.SecretText({ displayName: "API key", required: true }),
  },
});
```

Write the `description` for the person who has to fill this in — where the token comes from, what the URL should look like, what permissions it needs. It's the only documentation they'll see at the moment they need it.

Auth properties come from `PieceAuth`, action inputs from `Property`. A secret field is `PieceAuth.SecretText`; there is no `Property.SecretText`.

### What your code receives

The auth value arrives in two shapes, depending on where your code runs. This is Activepieces behaviour, and any Activepieces host does the same:

| Where                                   | `auth` for `CustomAuth`                               | `auth` for `SecretText`                       |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| An action's or trigger's `context.auth` | `{ type: "CUSTOM_AUTH", props: { baseUrl, apiKey } }` | `{ type: "SECRET_TEXT", secret_text: "..." }` |
| `validate({ auth })`                    | `{ baseUrl, apiKey }`                                 | the token string                              |
| `getConnectionIdentifier({ auth })`     | `{ baseUrl, apiKey }`                                 | the token string                              |

The framework's types say which shape you have: `context.auth` is typed as the envelope in an action or trigger, and as the flat props in `validate` and `getConnectionIdentifier`, so reading the wrong one is a compile error. The generated `lib/common/auth-value.ts` also reads the auth through one helper that accepts both shapes, which lets a client take either:

```typescript
export function readAuth(auth: unknown): { baseUrl: string; apiKey: string } {
  const source = isRecord(auth) && isRecord(auth.props) ? auth.props : auth;
  // ...check source.baseUrl and source.apiKey, then return them
}
```

### Checking a connection

A connection check is what makes Connect show a connection as healthy or broken, instead of leaving a misconfiguration to surface as a failed run later, and which account it's authenticated as. Both come from two optional hooks on the auth, as Activepieces documents them:

```typescript
export const crmAuth = PieceAuth.CustomAuth({
  // ...displayName, description, props as above
  validate: async ({ auth }) => {
    try {
      await clientFor(auth).ping();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  },
  getConnectionIdentifier: async ({ auth }) => {
    const me = await clientFor(auth).request<{ email: string }>({ path: "me" });
    return me.email;
  },
});
```

**`validate`** decides whether the connection works. It returns `{ valid: true }` or `{ valid: false, error }`, and the error is what the user sees on the connection. Throwing fails the check too, with the error's message. A piece whose auth has no `validate` passes the check once its credentials resolve.

**`getConnectionIdentifier`** names the account. The reactor calls it only after the check passes, and stores the string it returns as the connection's account label. It's best-effort: returning `undefined` or throwing keeps the label the connection already had, and the check still passes.

## Reading and writing documents

Your piece doesn't need to. Reading and writing Powerhouse documents is what the
reactor's own piece is for — `#document-find`, `#document-get`,
`#document-create` and `#document-dispatch` are steps a workflow author drops in
beside yours, with no code from you at all.

So a workflow that pulls a record from your service and records it on a document
is two steps: your action, then `@powerhousedao/piece-reactor#document-create`
reading the first step's output through an expression. Your piece stays a
connector to your service, which is the thing only you can write.

## Registering it

Two declarations, both of which the generator already made.

`pieces/index.ts` lists what your package ships, pointing at the **built** module:

```typescript
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "@acme/piece-crm",
    version: "1.0.0",
    entry: "dist/node/pieces/crm/index.mjs",
  },
];
```

And `powerhouse.manifest.json` names it again, so a host can see what the package offers without executing any of its code:

```json
"pieces": [{ "id": "@acme/piece-crm", "name": "Acme CRM" }]
```

## Build it

```bash
ph build
```

This bundles each `pieces/<name>/index.ts` into `dist/node/pieces/<name>/index.mjs` with its dependencies inlined, because a host runs piece code in an isolated worker process with no `node_modules` beside it. That's also why the framework belongs in `devDependencies`: it ends up inside the bundle rather than being resolved at run time.

The build then loads each piece once and writes a descriptor next to it — the display name, logo, auth and every action and trigger with its properties. That descriptor is how Workflow Studio can draw your step's form before anyone has installed anything.

**A piece has to be built, not merely present.** A declared piece with no build output is the most common way to end up with a workflow whose block type resolves to nothing.

## Run it locally

Three things have to be true before a workflow can name your block, and missing
any one of them fails quietly in its own way.

**1. Workflows are on, and the workflow package is installed.** The flag starts
the runtime; it does not by itself give the reactor the workflow and connection
document models. Those come from `@powerhousedao/workflow`, which has to be
installed and listed like any other package — a reactor with the flag on but the
package missing logs `Workflow runtime started` and then refuses to create a
workflow with "Document model module not found".

```bash
pnpm add @powerhousedao/workflow
```

**2. Your own package is in the `packages` list**, which is how the reactor
finds both its document models and its pieces. There is no separate piece
install.

```json
{
  "workflows": { "enabled": true },
  "packages": ["@powerhousedao/workflow", "@acme/my-package"]
}
```

**3. The piece is built.** `ph build` after every edit — see above.

Then start the reactor. `ph vetra` runs Switchboard and Connect together and is
the quickest way to see your piece in Workflow Studio; `ph switchboard` runs the
server alone, which is what you want if you're driving it from a script or an
agent. Either way the boot log tells you whether it worked:

```
Loaded document models from package @powerhousedao/workflow: [...]
[workflow][piece-registry] Loaded 1 package piece(s): @acme/piece-crm
Workflow runtime started
```

An empty piece list with no error almost always means the piece is declared but
not built.

**If your piece talks to something on localhost** — a stub service, a database,
anything on your own machine — it will not connect until the deployment widens
the outbound address policy, which refuses private and loopback space by
default. That's the guard described in
[Pieces and connections](/academy/Learn/workflows/pieces-and-connections); the
setting that widens it is in
[Configure environment](/academy/Build/Launch/ConfigureEnvironment#configuring-workflows).

## Use it

With the reactor running, your actions and triggers are in the block catalogue
alongside the reactor's own piece and anything from the registry. Create a
connection for the CRM, then build a workflow whose trigger is
`@acme/piece-crm#trigger:new-record`.

Authoring that workflow in Connect is Workflow Studio's job. To do it from a
script or an agent instead — which is also how you'd seed an environment or test
an integration end to end — see
[Authoring workflows outside Connect](/academy/Build/WorkWithData/AuthoringWorkflows).

## Testing

A piece is ordinary TypeScript, and an action's `run` is an ordinary async function — most of what you'll want to assert needs no workflow at all. Test the client and the transformations directly, the way you'd test any other module in the package.

Typecheck it too. Vitest strips types without checking them, and the framework's types catch the mistakes that are easiest to make: a trigger with no `type`, `validate` returning the wrong shape, reading `context.auth` as flat props, a `Property.*` call that doesn't exist. `ph build` runs `tsc` before it bundles anything, and when `tsc` reports errors it asks whether to build anyway. Without a terminal to ask in, as in CI, it stops instead. `--ignore-type-errors` builds without asking, but it's unsafe: a piece with type errors can load and still fail at runtime, so fix the errors before you publish or deploy.

The auth's hooks are plain functions as well. Call `crmAuth.validate` and `crmAuth.getConnectionIdentifier` with the flat value, `{ auth: { baseUrl, apiKey }, server }`, to test the check and the label against a stub of your service.

Add one test that loads the piece definition itself and asserts its full list of action and trigger names. Tests that call actions one by one never import `index.ts`, so they stay green when an action is left out of it, or when the file doesn't load at all.

For the rest, `@powerhousedao/reactor-workflow/testing` runs a piece the way a reactor will, without standing up a reactor to do it.

## Publishing

A package shipping a piece publishes like any other reactor package — see [Publish your project](/academy/Build/Launch/PublishYourProject). Once it's on a registry, other reactors get the piece by adding your package to their `packages` list. A package that ships _only_ pieces is still an ordinary reactor package, with the same boilerplate; there's no piece-only mode to learn.
