# Building a piece

A piece is a connector a workflow can call: a named bundle of **actions** (things a step does) and **triggers** (things that start a run). If you haven't met workflows yet, read [What are workflows?](/academy/Learn/workflows/what-are-workflows) first — this tutorial assumes you know what a step and a block are.

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
- **`--id`** is the piece name a step's `pieceName` holds. Defaults to something derived from your package name; pick it deliberately, because changing it later breaks every workflow already referring to it.
- **`--auth`** is the kind of connection the piece asks for: `custom` (a form you define), `secret` (a single token), or `none`.

You get an empty piece, as the Activepieces CLI gives you, ready for its actions and triggers:

```
pieces/
├── index.ts                    # the list of pieces this package ships
└── crm/
    ├── index.ts                # createPiece — the piece definition
    └── lib/
        ├── auth.ts             # what a connection to this service holds (not with --auth none)
        └── logo.ts
```

The generator also registers the piece in `pieces/index.ts` and adds it to `powerhouse.manifest.json` — you don't have to do either by hand.

## The piece definition

`pieces/crm/index.ts` is the whole piece: what it's called, what it authenticates with, and everything it offers.

```typescript
import { createPiece } from "@powerhousedao/pieces-framework";
import { crmAuth } from "./lib/auth.js";
import { CRM_LOGO } from "./lib/logo.js";

export const crm = createPiece({
  displayName: "Crm",
  description: "Connect to Crm.",
  auth: crmAuth,
  minimumSupportedRelease: "0.30.0",
  logoUrl: CRM_LOGO,
  authors: [],
  actions: [],
  triggers: [],
});

export default crm;
```

With `--auth none`, `auth` is `PieceAuth.None()` and there is no `lib/auth.ts`. The
`actions` and `triggers` arrays fill up as you generate them, next.

### The generator commands

`ph generate` scaffolds every kind of module a reactor package can hold —
`document-model`, `editor`, `processor`, `subgraph`, `migration-file` — and
three of them are the piece family:

| Command                            | What it does                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `ph generate piece <name>`         | A new, empty piece: directory, auth, logo and `createPiece`, plus both registrations |
| `ph generate piece-action <name>`  | An action stub inside an existing piece, added to its `actions` for you          |
| `ph generate piece-trigger <name>` | A trigger stub, `--strategy polling` (default) or `--strategy webhook`, added to its `triggers` |

For the CRM, generate the action and the trigger this tutorial fills in:

```bash
ph generate piece-action get-record
ph generate piece-trigger new-record
```

Both take `--piece <dir>` to say which piece to add to, which you can omit when
the package ships exactly one. Each writes a stub, as the Activepieces CLI does:
the shape is there, and the body is yours.

Two flags on `ph generate piece` are for maintenance rather than creation:
`--dir <dir>` re-registers an existing piece, and `--all` refreshes the
`pieces/index.ts` list and the manifest for every piece under `pieces/`,
pruning entries whose directory is gone. Reach for those if you rename a piece
directory by hand, or after a merge leaves the two registrations disagreeing.

## Writing an action

An action declares the properties it takes, the shape of what it returns, and a `run` function. The generator leaves `props` empty and `run` blank; filled in, `lib/actions/get-record.ts` reads:

```typescript
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { httpClient, HttpMethod } from "@powerhousedao/pieces-framework/common";
import { crmAuth } from "../auth.js";

export const crmGetRecordAction = createAction({
  auth: crmAuth,
  name: "get-record",
  displayName: "Get Record",
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
    const { baseUrl, apiKey } = context.auth.props;
    const response = await httpClient.sendRequest<{ id: string; name: string }>({
      method: HttpMethod.GET,
      url: `${baseUrl}/records/${encodeURIComponent(context.propsValue.recordId)}`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.body;
  },
});
```

`httpClient` is Activepieces' HTTP client, from the framework's `/common` entry along
with the rest of their `pieces-common` helpers. Once a second action makes the same
call, move the request into a helper of your own under `lib/`.

Three of those deserve attention, because they're what makes a step usable by someone who didn't write the piece:

- **`name`** is what a step's `actionName` holds. A step pins the piece version it was built against, so this step is `pieceName: "@acme/piece-crm"`, `pieceVersion: "1.4.0"`, `actionName: "get-record"` for version `1.4.0` of your package. Workflows keep working across upgrades, because the version is not part of a block's identity: the same action at another version is the same block. Renaming the action, though, breaks every workflow that referred to it.
- **`props`** is the form Workflow Studio renders for the step. A property a user may reasonably leave empty should be `required: false`. A required property left empty marks the step incomplete, and Studio won't publish the workflow until it is filled in. When Studio adds the step, it writes each prop's `defaultValue` into the step's config, so the step keeps that default even if a later version of your piece changes it.
- **`outputSchema`** is what a _later_ step can pick fields from. Without it, whoever builds the workflow has to run your action once and read the raw output to discover what it returns. It costs a few lines and saves every author that round trip.

## Writing a trigger

A trigger starts a run. Its `run` hook returns an array, and **each item starts one workflow run** with that item as the trigger's output. Returning an empty array means nothing happened.

Every trigger declares a strategy with `type`, which decides how the reactor calls it. The reactor runs two of the four Activepieces strategies for a piece's triggers:

| `type`                        | The reactor calls `run`                                                                             | Use it when                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `TriggerStrategy.POLLING`     | On an interval: every minute by default, never more often than once a second                        | The service has no webhooks, or you can't reach them |
| `TriggerStrategy.WEBHOOK`     | For each delivery to the workflow's endpoint, and on a slow reconciliation sweep (every 15 minutes) | The service can call a URL when something changes    |
| `TriggerStrategy.APP_WEBHOOK` | Never: Studio lists the trigger as disabled, and enabling it puts the trigger in `ERROR`             | —                                                    |
| `TriggerStrategy.MANUAL`      | Not supported for a package piece's triggers                                                      | Use the core piece's `manual` trigger instead        |

`type` is required and must be the enum member, not a string. The generator writes it for you (`--strategy polling` or `--strategy webhook`).

Every trigger has the same hooks:

- **`onEnable`** runs when a workflow using the trigger is enabled, or republished with a changed trigger, and **`onDisable`** when it's switched off or deleted.
- **`run`** reports what's new.
- **`test`** is optional. Studio calls it to fetch a real sample while someone is building the workflow. It gets a scratch `context.store` that's thrown away afterwards, so it can't move a live cursor. Studio saves the sample as the trigger's last test, and marks it stale once the trigger is edited.
- **`sampleData`** is what Studio shows as the trigger's payload before it has ever fired. It lets someone build the rest of the workflow against real-looking fields rather than waiting for the trigger to fire.

### Polling

A polling trigger asks the service what's new and remembers what it has already reported. The generated one does the remembering with Activepieces' `pollingHelper`: you write `items`, which fetches, and the helper keeps the cursor. Filled in, `lib/triggers/new-record.ts` reads:

```typescript
import {
  createTrigger,
  TriggerStrategy,
  type AppConnectionValueForAuthProperty,
} from "@powerhousedao/pieces-framework";
import {
  DedupeStrategy,
  httpClient,
  HttpMethod,
  pollingHelper,
  type Polling,
} from "@powerhousedao/pieces-framework/common";
import { crmAuth } from "../auth.js";

interface CrmRecord {
  id: string;
  name: string;
  createdAt: string;
}

const polling: Polling<
  AppConnectionValueForAuthProperty<typeof crmAuth>,
  Record<string, never>
> = {
  strategy: DedupeStrategy.TIMEBASED,
  items: async ({ auth, lastFetchEpochMS }) => {
    const response = await httpClient.sendRequest<CrmRecord[]>({
      method: HttpMethod.GET,
      url: `${auth.props.baseUrl}/records`,
      headers: { Authorization: `Bearer ${auth.props.apiKey}` },
      queryParams: { createdAfter: new Date(lastFetchEpochMS).toISOString() },
    });
    return response.body.map((record) => ({
      epochMilliSeconds: Date.parse(record.createdAt),
      data: record,
    }));
  },
};

export const crmNewRecordTrigger = createTrigger({
  auth: crmAuth,
  name: "new-record",
  displayName: "New Record",
  description: "Fires once for each record created in the CRM",
  props: {},
  sampleData: {
    id: "rec_1",
    name: "Example record",
    createdAt: "2026-01-01T00:00:00Z",
  },
  type: TriggerStrategy.POLLING,
  async test(context) {
    return await pollingHelper.test(polling, context);
  },
  async onEnable(context) {
    const { store, auth, propsValue, isRepublish } = context;
    await pollingHelper.onEnable(polling, {
      store,
      auth,
      propsValue,
      isRepublish,
    });
  },
  async onDisable(context) {
    const { store, auth, propsValue } = context;
    await pollingHelper.onDisable(polling, { store, auth, propsValue });
  },
  async run(context) {
    return await pollingHelper.poll(polling, context);
  },
});
```

With `DedupeStrategy.TIMEBASED`, `onEnable` sets the cursor to the moment the workflow was switched on, so enabling doesn't replay the service's history. When the reactor re-enables an unchanged workflow, for example after a restart, it sets `isRepublish` and the helper keeps the stored cursor, so items created while the reactor was down are still reported. Each poll reports only the items whose `epochMilliSeconds` is newer than the cursor, then moves it to the newest. Passing `lastFetchEpochMS` on to the service, as here, only saves fetching what the helper would drop anyway. For a service whose items carry no timestamp, `DedupeStrategy.LAST_ITEM` does the same with ids: `items` returns `{ id, data }`, newest first.

The cursor lives in `context.store`, which the host serves scoped per workflow, so two workflows watching the same service keep their own. It's the only thing that stops a trigger reporting the same item twice. The helper is a convenience, not a requirement: a trigger can read and write `context.store` itself, when the service's own page token makes a better cursor.

A polling trigger can set its own cadence in `onEnable` with `context.setSchedule({ intervalMs })`. A `cronExpression` also works, but the reactor turns it into a fixed interval rather than firing at wall-clock times. A workflow author can override both with `pollEverySeconds` in the trigger's config, which the reactor reads itself and never passes to the piece.

### Webhook

A webhook trigger has the service call the reactor. In `onEnable`, `context.webhookUrl` is the address the reactor minted for this workflow: register it with the service there, and remove the registration in `onDisable`. That way, enabling a workflow sets the integration up and disabling it tears it down, with nothing to remember in someone's admin console.

`run` is then called in two ways, and has to handle both:

- **For a delivery**, `context.payload` holds the request. Turn its body into items.
- **For the reconciliation sweep**, there's no payload. Ask the service for what changed since your cursor, as a polling trigger would. That's how the trigger recovers deliveries the service dropped.

A reactor with no public webhook endpoint refuses to enable a webhook trigger, with "This trigger delivers by webhook, but no public webhook endpoint is configured for the reactor". If the service verifies an endpoint before it will deliver to it, declare `handshakeConfiguration` and answer the probe in `onHandshake`, as Activepieces documents.

#### Renewing a subscription

Some services expire a webhook registration: a Microsoft Graph subscription lasts days, a Gmail watch a week. Declare `renewConfiguration` with a cron, and extend the registration in `onRenew`:

```typescript
import {
  createTrigger,
  TriggerStrategy,
  WebhookRenewStrategy,
} from "@powerhousedao/pieces-framework";

export const crmRecordUpdatedTrigger = createTrigger({
  // ...name, props, onEnable, onDisable and run
  type: TriggerStrategy.WEBHOOK,
  renewConfiguration: {
    strategy: WebhookRenewStrategy.CRON,
    cronExpression: "0 */12 * * *",
  },
  async onRenew(context) {
    const hook = await context.store.get<{ id: string }>(WEBHOOK_KEY);
    if (hook) await extendWebhook(context.auth, hook.id);
  },
});
```

The reactor runs `onRenew` on that cron, in UTC:

- The first renewal is the cron's next time after `onEnable` succeeds, not at enable itself.
- `onRenew` gets the same `context` as the other hooks, including `context.webhookUrl` and the workflow's `context.store`, so it can read the registration id `onEnable` stored.
- A failed renewal is recorded on the trigger (`renewError` and `renewFailures` in `triggerStates`) and retried after 2, 4, 8, 16 and then 30 minutes, but never later than the cron's next time. The trigger stays enabled, and a successful renewal clears the failure.
- The next renewal time and the failure count are stored, so a restart keeps them. A renewal that fell due while the reactor was down runs on its first tick.
- Disabling the workflow, or changing it to a trigger that doesn't renew, drops the pending renewal. A changed trigger config schedules it again from the cron.

Only `WebhookRenewStrategy.CRON` and `WebhookRenewStrategy.NONE` run. Any other strategy, or a cron that doesn't parse, makes Studio list the trigger as disabled and puts it in `ERROR` when a workflow enables it. `renewConfiguration` on a polling trigger is ignored.

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

The framework's types say which shape you have: `context.auth` is typed as the envelope in an action or trigger, and as the flat props in `validate` and `getConnectionIdentifier`, so reading the wrong one is a compile error. A helper of your own that both call can take the two fields it needs, rather than either shape.

### Checking a connection

A connection check is what makes Connect show a connection as healthy or broken, instead of leaving a misconfiguration to surface as a failed run later, and which account it's authenticated as. Both come from two optional hooks on the auth, as Activepieces documents them:

```typescript
export const crmAuth = PieceAuth.CustomAuth({
  // ...displayName, description, props as above
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${auth.baseUrl}/me`,
        headers: { Authorization: `Bearer ${auth.apiKey}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  },
  getConnectionIdentifier: async ({ auth }) => {
    const me = await httpClient.sendRequest<{ email: string }>({
      method: HttpMethod.GET,
      url: `${auth.baseUrl}/me`,
      headers: { Authorization: `Bearer ${auth.apiKey}` },
    });
    return me.body.email;
  },
});
```

**`validate`** decides whether the connection works. It returns `{ valid: true }` or `{ valid: false, error }`, and the error is what the user sees on the connection. Throwing fails the check too, with the error's message. A piece whose auth has no `validate` passes the check once its credentials resolve.

**`getConnectionIdentifier`** names the account. The reactor calls it only after the check passes, and stores the string it returns as the connection's account label. It's best-effort: returning `undefined` or throwing keeps the label the connection already had, and the check still passes.

## Reading and writing documents

Your piece doesn't need to. Reading and writing Powerhouse documents is what the
reactor's own piece, `@powerhousedao/piece-reactor`, is for. Its actions
`document-find`, `document-get`, `document-create` and `document-dispatch` are
steps a workflow author drops in beside yours, with no code from you at all.

So a workflow that pulls a record from your service and records it on a document
is two steps: your action, then the reactor piece's `document-create` action
reading the first step's output through an expression. Your piece stays a
connector to your service, which is the thing only you can write.

When the input comes from an AI step, set the document action's advanced
**Parse** option to **Extract from AI output**. It reads ids and JSON out of the
model's prose instead of taking them as given, and reports what it read them
from in `extractedFrom`. **Exact**, the default, takes them as given.

## Registering it

Two declarations, both of which the generator already made.

`pieces/index.ts` lists what your package ships, pointing at the **built** module:

```typescript
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "@acme/piece-crm",
    entry: "dist/node/pieces/crm/index.mjs",
  },
];
```

There's no `version` field. **A piece's version is the version of the package that ships it**: `ph build` reads it from your `package.json` and writes it into the piece's descriptor, its `package.json` and the manifest. That way `@acme/piece-crm@1.4.0` names exactly one set of bytes wherever it's fetched from. A list entry that still declares `version` fails the build. Delete the field. To release a piece on its own schedule, give it its own package.

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

**A piece has to be built, not merely present.** A declared piece with no build output is the most common way to end up with a workflow whose block resolves to nothing.

## Run it locally

Three things have to be true before a workflow can name your block, and missing
any one of them fails quietly in its own way.

**1. Workflows are on.** Set it in `powerhouse.config.json`:

```json
{
  "workflows": { "enabled": true }
}
```

Nothing else to install or list. Switchboard ships `@powerhousedao/workflow` and
loads it itself when the flag is on: the workflow and connection document
models, and the reactor piece. Connect does the same for Workflow Studio when
`connect.app.workflowsEnabled` is on. If the package can't be loaded,
Switchboard refuses to boot with "Workflows are enabled but
@powerhousedao/workflow could not be loaded".

**2. The reactor is running from your package.** `ph vetra` and `ph switchboard`
load the project they're started in, pieces included, unless you pass
`--ignore-local`. There is no separate piece install. The `packages` list is for
pieces shipped by _other_ packages, installed from a registry.

**3. The piece is built.** `ph build` after every edit — see above.

Then start the reactor. `ph vetra` runs Switchboard and Connect together and is
the quickest way to see your piece in Workflow Studio; `ph switchboard` runs the
server alone, which is what you want if you're driving it from a script or an
agent. Either way the boot log tells you whether it worked:

```
[...] Loaded document models from package @powerhousedao/workflow: [...]
[workflow][piece-registry] Holding 1 package piece(s) on disk: @acme/piece-crm
Workflow runtime started
```

A package loaded from a registry reports its pieces as `fetched when first run`
instead of `on disk`. No `Holding` line at the default log level means the
reactor found no pieces, which usually means the piece is declared but not
built.

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
connection for the CRM, then build a workflow whose trigger is the
`new-record` trigger of `@acme/piece-crm` at your package's version.

Authoring that workflow in Connect is Workflow Studio's job. To do it from a
script or an agent instead — which is also how you'd seed an environment or test
an integration end to end — see
[Authoring workflows outside Connect](/academy/Build/WorkWithData/AuthoringWorkflows).

## Testing

A piece is ordinary TypeScript, and an action's `run` is an ordinary async function — most of what you'll want to assert needs no workflow at all. Test your requests and transformations directly, the way you'd test any other module in the package.

Typecheck it too. Vitest strips types without checking them, and the framework's types catch the mistakes that are easiest to make: a trigger with no `type`, `validate` returning the wrong shape, reading `context.auth` as flat props, a `Property.*` call that doesn't exist. `ph build` runs `tsc` before it bundles anything, and when `tsc` reports errors it asks whether to build anyway. Without a terminal to ask in, as in CI, it stops instead. `--ignore-type-errors` builds without asking, but it's unsafe: a piece with type errors can load and still fail at runtime, so fix the errors before you publish or deploy.

The auth's hooks are plain functions as well. Call `crmAuth.validate` and `crmAuth.getConnectionIdentifier` with the flat value, `{ auth: { baseUrl, apiKey }, server }`, to test the check and the label against a stub of your service.

Add one test that loads the piece definition itself and asserts its full list of action and trigger names. Tests that call actions one by one never import `index.ts`, so they stay green when an action is left out of it, or when the file doesn't load at all.

For the rest, `@powerhousedao/reactor-workflow/testing` runs a piece the way a reactor will, without standing up a reactor to do it.

## Publishing

A package shipping a piece publishes like any other reactor package — see [Publish your project](/academy/Build/Launch/PublishYourProject). Once it's on a registry, other reactors get the piece by adding your package to their `packages` list. A package that ships _only_ pieces is still an ordinary reactor package, with the same boilerplate; there's no piece-only mode to learn.
