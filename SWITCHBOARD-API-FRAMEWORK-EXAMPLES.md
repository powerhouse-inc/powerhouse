# Switchboard API Framework — Examples Cookbook

> Companion to **`SWITCHBOARD-API-FRAMEWORK-SPEC.md`**. Worked examples, from the smallest possible API
> to complex real‑world compositions — including single‑transport setups (GraphQL‑only, REST‑only,
> WebSocket‑only, RPC‑only, webhook‑only), the full security‑policy matrix, raw‑primitive usage, and the
> high‑level `defineResource` abstractions.
>
> Every example is grounded in **Appendix A** of the spec (the frozen core contract) and follows its
> secure‑by‑default rules: mandatory typed authorization, drive‑scoped collection reads, per‑item bulk
> authz, creation via the reactor write path (never `execute` against a minted id), closed output
> projection, and authorized + SSRF‑guarded webhook egress. Snippets use **zod**, but any Standard‑Schema
> validator (Valibot, ArkType) works identically. This is design‑stage illustrative code — the framework
> is specified, not yet implemented.


## Contents

1. [Getting Started — the smallest possible API](#1-getting-started--the-smallest-possible-api) — 4 examples
2. [GraphQL only](#2-graphql-only) — 5 examples
3. [REST only](#3-rest-only) — 5 examples
4. [WebSocket / subscriptions only](#4-websocket--subscriptions-only) — 4 examples
5. [JSON-RPC 2.0 only + the inferred typed client](#5-json-rpc-20-only--the-inferred-typed-client) — 5 examples
6. [Webhooks only (outbound + inbound)](#6-webhooks-only-outbound--inbound) — 5 examples
7. [Security cookbook — every policy, secure by default](#7-security-cookbook--every-policy-secure-by-default) — 11 examples
8. [Using the primitives directly](#8-using-the-primitives-directly) — 6 examples
9. [Using the abstractions (defineResource)](#9-using-the-abstractions-defineresource) — 6 examples
10. [Complex, real-world compositions](#10-complex-real-world-compositions) — 6 examples
11. [Testing & validation](#11-testing--validation) — 7 examples


---

## 1. Getting Started — the smallest possible API

This is the on-ramp. Everything here fits on one screen and compiles against Appendix A of the spec, and every example is *secure by default* — the framework will not let you ship an operation whose authorization you forgot to decide.

There are exactly two altitudes. **`operation(id)`** is the low-level builder: one chain, one handler, for anything that does not have a CRUD shape (a health check, an identity echo, a computed report). **`defineResource(cfg)`** is the batteries-included altitude: declare DTOs, a read binding and a write binding once, and get `list`/`retrieve`/`create`/… as fully-typed operations. Both altitudes produce the same thing — `OperationDef`s — and both run the *same* fixed pipeline (input `safeParse` → authorize → handler → output projection), so business logic, validation and authz can never diverge by transport.

Transports are **projections**, not servers. You never hand-write GraphQL SDL or a REST route: you register your operations, call `.build()`, and pass the projectors you want to `api.project([...], deps)`. The same definition becomes a federated GraphQL subgraph field *and* a REST route, each calling the identical `rt.invoke(opId, input, ctx)`. The only way an operation leaves the authenticated surface is the single, greppable `.public()` opt-out — so an auditor can enumerate your entire anonymous attack surface with one `grep`.


### todo.ping — a public query in one builder chain

**Level:** Simple · **Transports:** `graphql`, `rest`

The absolute minimum: one `operation()` chain that returns a string, exposed to GraphQL **and** REST with no SDL and no route code. `.public()` is the single explicit opt-out from deny-by-default authz.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";

// The whole surface of a public "ping": one builder chain, one handler.
// Order matters. .input()/.output() narrow the schemas; .public() DECIDES auth;
// and only THEN is .query(...) callable at all.
export const todoPing = operation("todo.ping")
  .input(z.object({}).strict())        // no args — an empty, closed object
  .output(z.string())                  // a scalar string result
  .public()                            // the ONLY opt-out of authz — explicit + greppable
  .query(async () => "pong");          // runs inside the one shared pipeline
```

**Notes**

- **Security — the one greppable opt-out.** `.public()` is the *only* way to leave the deny-by-default authenticated surface. Grepping for `.public(` (or `{ kind: "public" }`) enumerates your entire unauthenticated attack surface in one command — that greppability is the audit story (§6.4, §10.1).
- **Why it works — the terminal is uncallable until auth is decided.** Before `.public()`/`.security()`, the builder's `.query`/`.mutation`/`.subscription` properties have type `AuthNotDecided`, which has no call signature. So `.query(...)` is a genuine compile error ("This expression is not callable"), not a lint you can ignore — "forgot to authorize" *cannot* compile (§6.6).
- **Why it works — one definition, two transports.** You wrote zero GraphQL SDL and zero REST routing. At `api.project(...)` the GraphQL projector compiles the input/output schemas into a `Query.todoPing` field; the REST projector derives `GET <base>/rest/todo/ping` from the op id + `query` kind. Both call the same `rt.invoke("todo.ping", …)` pipeline (§5, §8). Override the derived GraphQL field name / REST method+path with `.meta({ graphql: {…}, rest: {…} })` when the defaults don't suit.
- **Gotcha — queries are GET.** A `query` projects to REST **GET**; never give one a mutating body (the AuthService skips bearer verification on GET/OPTIONS, §8.2). Object outputs must be `.strict()` so `build()`'s closed-output check passes; a scalar like `z.string()` is inherently closed, so it needs no `.strict()`.
- **Gotcha — no capabilities.** There is no `.requires(...)`, so `ctx.caps` is empty *by type* — this handler structurally cannot touch the reactor or the db. That is exactly what a ping should be.


### todo.whoami — the same shape, now { kind: "authenticated" }

**Level:** Simple · **Transports:** `graphql`, `rest`

Identical to the ping, with one line changed: swap `.public()` for `.security({ kind: "authenticated" })`. Now the caller must be signed in, and the handler can safely read `ctx.user`.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";

// Same builder, same terminal. The ONLY change from todo.ping is the auth decision:
// .public()  ->  .security({ kind: "authenticated" })
export const todoWhoami = operation("todo.whoami")
  .input(z.object({}).strict())
  .output(z.string())
  .security({ kind: "authenticated" })            // ctx.user must be present, else ApiError("UNAUTHENTICATED")
  .query(async (_input, ctx) => ctx.user!.address); // the fixed authz stage already proved user is non-null
```

**Notes**

- **Security — what `authenticated` guarantees.** The fixed authz stage requires `ctx.user` to be present and rejects anonymous callers with `ApiError("UNAUTHENTICATED")`, mapped per transport to HTTP 401 / GraphQL `UNAUTHENTICATED` / JSON-RPC `-32001` (§6.3). No capability is needed to read identity — `ctx.user` is always on the context.
- **Why it works — authz runs before the handler.** Because authorization is a *fixed stage sandwiched inside the plugin chain, ahead of the handler* (§5), the `ctx.user!` non-null assertion is honest: the policy has already proven identity before your code runs. No plugin, however misordered, can reach the handler unauthenticated.
- **Contrast with the public ping.** This op no longer shows up when you grep for `.public(` — it has left the unauthenticated surface. Flipping one policy value moves an op between audit buckets with no other change.
- **Gotcha — `authenticated` is not authorization over data.** It proves *a* signed-in caller, not that they may see any particular document. The instant you read or write a *specific* Todo, step up to a `document`/`drive` policy (next example) — otherwise any logged-in user reads any tenant's data (that is precisely the IDOR the resource's drive-scoped `list` closes).


### A one-screen Todo resource — read via document binding, create via reactor.create

**Level:** Intermediate · **Transports:** `graphql`, `rest`

The batteries altitude. `defineResource` with a small-N `document` read binding (backed by `IReactorClient.find`) and a `write.create` that mints a real document through `reactor.create`. Declaring only `create` under `write` yields exactly `list` + `retrieve` + `create`.

```ts
import { z } from "zod";
import { defineResource, type Serializer } from "@powerhousedao/switchboard-api";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import { makeTodoDocument, TODO_DOC_TYPE } from "@acme/todo-model";

// 1) DTOs (Standard Schema — zod here; valibot/arktype work identically).
//    `output` is CLOSED: the fixed output stage projects to EXACTLY these keys.
const TodoOutput = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAtUtc: z.string(),
}).strict();
const TodoCreate = z.object({
  title: z.string().min(1),
}).strict();

const serializer: Serializer<typeof TodoOutput, typeof TodoCreate> = {
  output: TodoOutput,
  create: TodoCreate,
};

// 2) The resource. No processor: read the handful of Todo documents through the
//    `document` binding (reactor.find), and CREATE real documents via reactor.create.
export const todoRegistry = defineResource({
  name: "todo",
  version: "1.0.0",
  documentType: TODO_DOC_TYPE,
  serializer,
  // small-N read binding -> list/retrieve run IReactorClient.find (requires "reactor", set for you)
  document: { search: (): SearchFilter => ({ type: TODO_DOC_TYPE }) },
  write: {
    // CREATE returns a document to CREATE — reactor.create. NEVER execute() on a minted id.
    create: (input) => ({ document: makeTodoDocument(input) }),
  },
  security: {
    // list is DRIVE-SCOPED (not merely "authenticated") — closes the Drive-Id IDOR (§10.7).
    list:   { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },
    get:    { kind: "document", access: "read", subject: (i) => i.id },
    create: { kind: "create" },
  },
});
// todoRegistry === { "todo.list", "todo.retrieve", "todo.create" } — three precisely-typed OperationDefs
```

**Notes**

- **Security — collection reads must be drive-scoped.** `list` uses `{ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }`, not `{ kind: "authenticated" }`. A merely-authenticated list would let a caller point the `Drive-Id` header at another tenant's drive and read it — that's the IDOR §10.7 closes. `get` is per-document read (`subject: (i) => i.id`); `create` is `{ kind: "create" }` (canCreate). `list` and `get` are always required by `ResourceConfig.security`; the `create` policy is required precisely because we configured `write.create`. All are deny-by-default.
- **Why it works — two altitudes visible at once.** `document: { search }` is the small-N read binding: `list`/`retrieve` run `IReactorClient.find`, so `requires` becomes `["reactor"]` (set for you) and you stand up **no** `RelationalDbProcessor`. Reach for `read: { source, table, filterable, sortable, pagination }` when it must scale, sort or filter (§7.1). `document` and `read` are alternatives — pick one.
- **Why it works — CREATE is creation, not mutation.** `write.create` returns `{ document }`, which the generated handler feeds to `reactor.create`. It never calls `execute()` against the freshly-minted id — `execute()` only mutates *existing* documents, so doing that on a new id is the classic write-path footgun (§7.5/§7.6). (Add `update`/`remove` later and *those* act on the authorized document via `execute(handle.fetchIdentifier, …)`; here we only create.)
- **Output is closed.** `TodoOutput.strict()` plus the fixed output stage pick exactly those four keys, so no internal document field can leak regardless of what `find` returns (§7.4/§10.6).
- **Exactly the surface you declared.** `defineResource` returns a record keyed by op.id. Because only `create` is configured under `write`, no `todo.update`/`todo.delete` is emitted — you get `{ "todo.list", "todo.retrieve", "todo.create" }` and nothing more.
- **Packaging honesty.** This file is transport-agnostic; only its GraphQL slice is package-contributable (`<pkg>/subgraphs` via `PackageManager`). REST for this resource is lit up in the host boot (next example), not from the package.


### Wire it up — register + build + project to GraphQL and REST

**Level:** Intermediate · **Transports:** `graphql`, `rest`

The one-time host boot. Register the two ping ops and the Todo resource, `.build()` the typed registry (which also runs the runtime backstop), then `api.project([...])` with exactly the projectors you want — here GraphQL + REST.

```ts
// switchboard/src/server.mts (schematic) — the ONE-TIME host boot that lights up transports.
import {
  SwitchboardApi, rateLimit, observability, logging,
  GraphqlProjector, RestProjector,
} from "@powerhousedao/switchboard-api";
import { todoPing } from "./todo-ping.js";
import { todoWhoami } from "./todo-whoami.js";
import { todoRegistry } from "./todo.saf.js";
import { buildProjectionDeps } from "./projection-deps.js"; // reads the new GraphQLManager accessors (§13)
import { graphqlManager, authService } from "./boot.js";

// register(...) accepts bare OperationDefs AND resource records (it folds each record's ops by id).
const api = new SwitchboardApi({ corsAllowlist: ["https://app.acme.example"] })
  .register(todoPing, todoWhoami, todoRegistry)
  .use(rateLimit({ rpm: 600 }), observability(), logging()); // ON by default; explicit here to set rpm

// build() returns the TypedRegistry: the runtime backstop + the single inference source for an RPC client.
const registry = api.build();
// (typeof registry.typed is what createRpcClient<...>(url) would infer from, if you add an RpcProjector.)

// project() mounts the ops. Pass EXACTLY the projectors you want — here GraphQL + REST only.
await api.project(
  [new GraphqlProjector(), new RestProjector()],
  buildProjectionDeps(graphqlManager, authService),
);
```

**Notes**

- **Why it works — transports are projections.** You expose precisely the set you pass: `[new GraphqlProjector(), new RestProjector()]` gives GraphQL + REST and nothing else. Add `new RpcProjector()` / `new WebhookProjector()` to light up more with **zero** edits to the op definitions or serializers (OCP, §8.6) — all of them call the same `rt.invoke` pipeline, so validation/authz/logic stay identical across transports.
- **register + build.** `register(...)` folds both bare `OperationDef`s and resource records (keyed by op.id) into one accumulating typed registry `R`. `build()` returns `TypedRegistry<R>` and runs the runtime backstop behind the `TAuth` type guard: it throws if any registered op has an undecided `security`, a non-closed output schema, or an incompatible keyset sort set (§6.8) — defence in depth against an `as any` bypass.
- **Default plugins.** `rateLimit()` + `observability()` + `logging()` are on by default; naming them in `.use(...)` is how you pass concrete config — here `rateLimit({ rpm: 600 })` sets the actual per-identity budget rather than accepting the default. They wrap *around* the fixed validation+authz stages and can never unseat them (§5, §9).
- **Packaging honesty.** Only the GraphQL projection is package-contributable; REST/RPC/WS/webhook cannot be driven from inside a package (GraphQLManager keeps the HTTP/gateway/WS seams private), so they are wired **once, here** in the host boot. `buildProjectionDeps` reads the new GraphQLManager accessors that §13 adds — without those core edits, no host or package can mount the non-GraphQL transports (§12.1, §13).
- **Gotcha — keep the `api` handle.** `build()` returns the *registry*, not the app; `project()` is a method on the `api` *instance*, and `TypedRegistry` has no `project`. Bind `const registry = api.build()` to a new name rather than overwriting `api`, so both `registry` (for the typed RPC client) and `api.project(...)` remain reachable.


---

## 2. GraphQL only

Switchboard speaks GraphQL today: every document model is an auto-generated federated subgraph composed into one supergraph by `GraphQLManager` (`reactor-api/src/graphql/graphql-manager.ts`). The SAF GraphQL projector reproduces exactly that shape — it compiles each operation's Standard Schema to SDL (output → object type, create/update → input, filter → input, list → a `Connection` type) and emits a native `GeneratedSubgraph` (a `BaseSubgraph`) that it hands to `graphqlManager.registerSubgraphInstance(instance, "graphql")` followed by `graphqlManager.updateRouter()` (debounced ~1s, recomposes the Apollo supergraph).

Because a transport is nothing but a projection of the shared operation registry, "GraphQL only" is achieved by passing a **single** projector to `api.project([new GraphqlProjector()], deps)` — no REST route, no `/rpc` mount, no WebSocket owner, no webhook outbox is created. Every op still runs the one pipeline (fixed input `safeParse` → fixed authorize → handler → fixed output projection); GraphQL is just the only wire adapting to it. This is also the **only** projection a consumer package can contribute: `PackageManager` discovers `<pkg>/subgraphs`, constructs the subgraph with just `SubgraphArgs`, and `GraphQLManager` keeps the HTTP adapter, gateway adapter, shared WS server and fetch middlewares private — so REST/RPC/WS/webhook can only be wired once in the host boot (`server.mts`).

Every example below reuses one domain — **Invoice** — so the emitted SDL grows monotonically as you add ops. The load-bearing rules stay constant: security is decided **before** the terminal `.query`/`.mutation` (the terminal is uncallable — type `AuthNotDecided` — until `.security()`/`.public()` runs); reads declare `.requires("db")`, writes declare `.requires("reactor")`; a `list`/`changes` policy **must** be `{ kind: "drive" }` to close the `Drive-Id` IDOR; the output schema is closed (`.strict()`) and the fixed output stage picks exactly its keys. And one resource occupies **one** subgraph name — no version-in-name canary, because two subgraphs owning `Query.invoices` is a fatal `LocalCompose` federation conflict that `_updateRouter`'s try/catch swallows, with no unregister API to undo it.


### A single read query, exposed only as GraphQL

**Level:** Simple · **Transports:** `graphql`

The smallest GraphQL-only surface: one `invoice.retrieve` query over the read model, registered and projected with a single `GraphqlProjector`. The emitted subgraph has a `Query.invoice` field and **no** `Mutation` type, because the op set has no mutation — the SDL is exactly the operations you defined.

```ts
// invoice.retrieve.ts — a single GraphQL-only read on Invoice
import { z } from "zod";
import { operation, SwitchboardApi, ApiError, GraphqlProjector } from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import { buildProjectionDeps } from "./projection-deps.js";      // host helper over the §13 accessors
import { graphqlManager, authService } from "./boot.js";          // the running GraphQLManager + AuthService

// Read-model row (Kysely schema). `ownerAddress` is internal and MUST NOT leak.
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {} // body omitted; ships from <pkg>/processors

// CLOSED output — ownerAddress is excluded; the fixed output stage picks EXACTLY these keys.
export const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();

export const retrieveInvoice = operation("invoice.retrieve")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("db")                                                  // READ -> db capability only reaches the handler
  .security({ kind: "document", access: "read", subject: (i) => i.id }) // decided BEFORE .query typechecks
  .query(async ({ id }, ctx) => {
    // driveId was validated + authorized by fixed pre-handler steps (§6.9), so `!` is a post-check assertion.
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;                                                    // ownerAddress dropped by the output pick
  });

// GRAPHQL ONLY: exactly one projector is passed -> nothing but the subgraph is mounted.
const api = new SwitchboardApi().register(retrieveInvoice);
api.build();                                                       // backstop: throws if any op lacks a decided policy
await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));
```

Emitted subgraph SDL (single name `invoice`) — note there is no `Mutation` type:

```graphql
enum InvoiceStatus { draft open paid void }

type Invoice {
  id: ID!
  number: String!
  status: InvoiceStatus!
  counterparty: String!
  amount: Float!
  currency: String!
  dueDate: String!
  createdAtUtc: String!
  updatedAtUtc: String!
}

type Query {
  invoice(id: ID!): Invoice
}
```

**Notes**

- **Why it's GraphQL-only:** `api.project([...])` runs each projector you pass and nothing else. A one-element `[new GraphqlProjector()]` array means REST/RPC/WS/webhook seams are never touched — the transport list is literally the projector list.
- **Auth-guard ordering:** `.query` is typed `AuthNotDecided` until `.security()` flips the builder's `TAuth` to `true`. Put `.input/.output/.requires/.security` first; the terminal is uncallable otherwise — a compile error, not a runtime surprise.
- **`requires("db")`:** only declared capabilities appear on `ctx.caps`, so this handler can reach `ctx.caps.db` but not `ctx.caps.reactor`. Reads never get write power.
- **Closed output (§10.6):** `.strict()` plus the fixed output pick means a `SELECT *` read model cannot leak `ownerAddress`. `build()` rejects any output schema it can't prove closed.
- **Gotcha — `document` read still needs a validated drive:** the `document` policy authorizes the caller for that id, but the namespace is still selected from `ctx.driveId`. The fixed pre-handler step validates it (absence → `ApiError("VALIDATION")`, not an `INTERNAL` from `getNamespace(undefined)`), which is what makes `ctx.driveId!` safe here.


### A query plus a mutation on Invoice

**Level:** Intermediate · **Transports:** `graphql`

Add a write. `invoice.create` is a `.mutation` that performs **real creation** via `ctx.caps.reactor.create(...)` — never `execute()` against a freshly-minted id. Projected GraphQL-only, the subgraph now emits a `Mutation.createInvoice` field and a `CreateInvoiceInput` input type alongside the query from the previous example.

```ts
// invoice.create.ts — query + mutation, GraphQL only
import { z } from "zod";
import { operation, SwitchboardApi, GraphqlProjector } from "@powerhousedao/switchboard-api";
import { makeInvoiceDocument } from "@acme/invoice-model";        // document factory -> PHDocument
import { buildProjectionDeps } from "./projection-deps.js";
import { graphqlManager, authService } from "./boot.js";
import { InvoiceOutput, retrieveInvoice } from "./invoice.retrieve.js";

const CreateInvoiceInput = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();

export const createInvoice = operation("invoice.create")
  .input(CreateInvoiceInput)
  .output(InvoiceOutput)
  .requires("reactor")                                             // WRITE -> reactor capability
  .meta({ graphql: { fieldName: "createInvoice", typeName: "Invoice" } }) // customise the SDL field/type name
  .security({ kind: "create" })                                   // create authz (drive-scoped write intent)
  .mutation(async (input, ctx) => {
    // CREATE = real creation. NEVER execute() against a freshly-minted id (execute only mutates EXISTING docs).
    const doc = makeInvoiceDocument(input);
    await ctx.caps.reactor.create(doc);
    return {
      id: doc.header.id, number: input.number, status: "draft" as const,
      counterparty: input.counterparty, amount: input.amount, currency: input.currency,
      dueDate: input.dueDate, createdAtUtc: doc.header.createdAtUtc, updatedAtUtc: doc.header.createdAtUtc,
    };                                                            // projected to InvoiceOutput
  });

// GRAPHQL ONLY — both ops become resolvers on the one `invoice` subgraph.
const api = new SwitchboardApi().register(retrieveInvoice, createInvoice);
api.build();
await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));
```

Emitted SDL — a `Mutation` type now appears because the op set contains a mutation:

```graphql
enum InvoiceStatus { draft open paid void }

type Invoice {
  id: ID!  number: String!  status: InvoiceStatus!  counterparty: String!
  amount: Float!  currency: String!  dueDate: String!  createdAtUtc: String!  updatedAtUtc: String!
}

input CreateInvoiceInput {
  number: String!  counterparty: String!  amount: Float!  currency: String!  dueDate: String!
}

type Query {
  invoice(id: ID!): Invoice
}

type Mutation {
  createInvoice(input: CreateInvoiceInput!): Invoice!
}
```

**Notes**

- **Write path (critical):** create uses `ctx.caps.reactor.create(doc)` where `doc` is a real `PHDocument` from the model's factory. `execute()` is for existing documents only — calling it against an id you just minted is the classic bug this contract forbids.
- **`meta({ graphql })`:** `OperationDef.graphql?: { fieldName?; typeName? }` lets you pin the SDL names. Without it the projector derives `createInvoice`/`Invoice` from the op id and output schema; with it you keep the federated schema stable across refactors.
- **`{ kind: "create" }` vs `{ kind: "document" }`:** create has no existing id to authorize, so it uses the create policy (write intent, drive-scoped), whereas retrieve authorizes a concrete `subject: (i) => i.id`.
- **Mutations project to GraphQL exactly like queries** — same `rt.invoke` pipeline. The only reason a mutation would also become an HTTP POST or an `invoice.create` RPC method is if you additionally passed `RestProjector`/`RpcProjector`; here you did not.
- **Gotcha — read-after-write lag:** the row you'd read from `InvoiceReadModel` may not be projected yet (the processor runs on the operation stream). Returning a value derived from the created document (as above) is deterministic; a DB read-back on create can race.


### A full CRUD resource with a Connection type

**Level:** Intermediate · **Transports:** `graphql`

`defineResource` wires list + retrieve + create + update + delete + a custom `send` action into one registry keyed by `op.id`, then projects the whole set as a single GraphQL subgraph. The emitted SDL gains an `InvoiceConnection { results, nextCursor, totalCount }` type for the drive-scoped `invoices(...)` list, plus filter/sort inputs compiled from the closed allowlists.

```ts
// invoice.impl.ts — the transport-agnostic resource; GraphQL-only projection at the bottom
import { z } from "zod";
import {
  defineResource, operation, keyset, SwitchboardApi, ApiError, GraphqlProjector,
  type FilterSet, type OrderingBackend, type Serializer,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import {
  editInvoiceAction, voidInvoiceAction, sendInvoiceAction,
  makeInvoiceDocument, INVOICE_DOC_TYPE,
} from "@acme/invoice-model";
import { buildProjectionDeps } from "./projection-deps.js";
import { graphqlManager, authService } from "./boot.js";

interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {} // ships from <pkg>/processors

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();
const InvoiceUpdate = InvoiceCreate.partial();

const serializer: Serializer<typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate,
  sortable: ["amount", "dueDate", "createdAtUtc"],
  fieldGuards: { counterparty: (ctx) => Boolean(ctx.user) },     // redacted for anonymous callers (auto-enforced)
};

const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte", "range"] },
  currency:     { type: "string", ops: ["eq", "in"] },
  dueDate:      { type: "string", ops: ["gte", "lte", "range"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];

// Custom detail @action — writes the AUTHORIZED document, then reads it back for the response.
const sendInvoice = operation("invoice.send")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .meta({ graphql: { fieldName: "sendInvoice" } })
  .security({ kind: "document", access: "write", subject: (i) => i.id }) // decided BEFORE .mutation
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);          // the authorized write target
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [sendInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll().where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;
  });

export const invoiceRegistry = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  write: {
    branch: () => "main",
    create: (input) => ({ document: makeInvoiceDocument(input) }),   // reactor.create — real creation
    update: (patch) => [editInvoiceAction(patch)],                   // actions on the authorized id
    remove: () => [voidInvoiceAction({})],
  },
  security: {
    list:   { kind: "drive",    access: "read",  drive: (_i, ctx) => ctx.driveId! }, // drive-scoped, NOT authenticated
    get:    { kind: "document", access: "read",  subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write", subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
  actions: [sendInvoice],
});
// invoiceRegistry = { "invoice.list", "invoice.retrieve", "invoice.create",
//                     "invoice.update", "invoice.delete", "invoice.send" } — all typed OperationDefs

// GRAPHQL ONLY — the entire CRUD surface becomes ONE subgraph named "invoice".
const api = new SwitchboardApi().register(invoiceRegistry);
api.build();
await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));
```

Emitted SDL — the list op compiles to a `Connection`; filter/sort inputs mirror the closed allowlists:

```graphql
enum InvoiceStatus { draft open paid void }
enum SortDir { asc desc }

type Invoice {
  id: ID!  number: String!  status: InvoiceStatus!  counterparty: String
  amount: Float!  currency: String!  dueDate: String!  createdAtUtc: String!  updatedAtUtc: String!
}

input CreateInvoiceInput { number: String!  counterparty: String!  amount: Float!  currency: String!  dueDate: String! }
input UpdateInvoiceInput { number: String   counterparty: String   amount: Float   currency: String   dueDate: String }  # InvoiceCreate.partial()

input InvoiceFilter {
  status: InvoiceStatusFilter    # eq | neq | in
  counterparty: StringFilter     # eq | contains
  amount: FloatFilter            # eq | gt | gte | lt | lte | range
  currency: StringFilter         # eq | in
  dueDate: StringFilter          # gte | lte | range
}
enum InvoiceSortField { amount dueDate createdAtUtc }
input InvoiceSort { field: InvoiceSortField!  dir: SortDir! }

type InvoiceConnection {
  results: [Invoice!]!
  nextCursor: String     # opaque base64url keyset cursor
  totalCount: Int        # null under keyset (counting defeats the seek)
}

type Query {
  invoice(id: ID!): Invoice
  invoices(filter: InvoiceFilter, sort: [InvoiceSort!], cursor: String, limit: Int): InvoiceConnection!
}
type Mutation {
  createInvoice(input: CreateInvoiceInput!): Invoice!
  updateInvoice(id: ID!, input: UpdateInvoiceInput!): Invoice!
  deleteInvoice(id: ID!): Invoice!
  sendInvoice(id: ID!): Invoice!
}
```

**Notes**

- **Drive-scoped list closes the IDOR (§10.7):** `security.list` is `{ kind: "drive", access: "read", drive }`. `defineResource` refuses a bare `{ kind: "authenticated" }` here and `build()` rejects it, because `drive-middleware` only checks shard ownership (→ 421), not per-user authz — so an authenticated caller could otherwise set `Drive-Id` to another tenant's drive and read the whole collection.
- **Gotcha — `totalCount` is null under keyset:** the `Connection` type always *declares* `totalCount: Int`, but the default `keyset()` paginator returns none (a count defeats the O(1) seek). Populate it by switching the resource to `offset()`/`pageNumber()` — those are a *separate* `OffsetPaginator` interface whose `totalCount` comes from a companion `count()`, not a flag on the seek paginator.
- **Gotcha — a guarded field must be nullable:** `fieldGuards.counterparty` redacts the value for anonymous callers, so `counterparty` is emitted as `String` (nullable), not `String!`. A non-null SDL field that redacts to null would violate the GraphQL contract at runtime.
- **Single subgraph name:** all six ops share the `invoice` prefix and land in one subgraph named `invoice`. The `version: "1.0.0"` is resource metadata — it is deliberately **not** encoded into the subgraph name.
- **`send` writes the authorized document:** `assert("write", id, ctx)` returns the handle and `execute(handle.fetchIdentifier, "main", actions)` mutates exactly that id — no re-computed write target (no confused deputy).
- **No `Subscription` type here:** `read.changes` is omitted, so the subgraph carries only `Query`/`Mutation`. Adding `read.changes` + a required `changes` drive policy would add a `Subscription` and wire the one shared WebSocket owner — still a GraphQL-only artifact, still one subgraph.


### Inside the projector: registerSubgraphInstance + updateRouter

**Level:** Advanced · **Transports:** `graphql`

A faithful sketch of the built-in `GraphqlProjector` implementing `TransportProjector`: it groups ops by their resource prefix (which *is* the subgraph name), builds one `GeneratedSubgraph` per resource, registers each via `graphqlManager.registerSubgraphInstance(instance, "graphql")`, then calls `graphqlManager.updateRouter()` to recompose the supergraph. Shows why the single-subgraph-name / no-version-in-name rule is load-bearing.

```ts
// graphql-projector.ts — how "GraphQL" actually mounts (matches Switchboard today)
import type {
  TransportProjector, OperationRegistry, ProjectionRuntime, ProjectionDeps, OperationDef,
} from "@powerhousedao/switchboard-api";
import { GeneratedSubgraph } from "@powerhousedao/switchboard-api";

export class GraphqlProjector implements TransportProjector {
  readonly transport = "graphql" as const;

  async project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void> {
    // Group ops by their resource prefix — that prefix IS the subgraph name (ONE name per resource).
    const byResource = new Map<string, OperationDef[]>();
    for (const op of registry.operations.values()) {
      if (!rt.has(op.id)) continue;                     // only ops the runtime can actually invoke
      const name = op.id.split(".", 1)[0];              // "invoice.list" -> "invoice"
      const bucket = byResource.get(name) ?? [];
      bucket.push(op);
      byResource.set(name, bucket);
    }

    for (const [name, ops] of byResource) {
      // GeneratedSubgraph (a BaseSubgraph) compiles each op's input/output Standard Schema to SDL and
      // wires resolvers that dispatch through rt.invoke(op.id, args, gqlCtx) — the SAME validate+authz+logic
      // pipeline every transport shares. It reuses the core assertCan*/resolveCanonicalDocumentId helpers.
      // The constructor is the frozen 3-arg (SubgraphArgs, ops, name) shape from Appendix A; the built-in
      // closes `rt` into its compiled resolvers (a sketch can't pass it as a 4th arg without breaking the contract).
      const subgraph = new GeneratedSubgraph(deps.subgraphArgs, ops, name);
      deps.graphqlManager.registerSubgraphInstance(subgraph, "graphql"); // add/replace THIS one name
    }

    deps.graphqlManager.updateRouter(); // debounced ~1s -> LocalCompose recomposes the Apollo supergraph
  }
}

// Host usage — exactly one transport is projected:
//   await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));
```

**Notes**

- **This is the whole GraphQL mount.** `registerSubgraphInstance(instance, "graphql")` hands the compiled subgraph to `GraphQLManager`; `updateRouter()` is debounced and recomposes the federated supergraph. Registering a `hasSubscriptions` subgraph additionally wires WS + SSE inside `GraphQLManager` — so GraphQL *owns* the socket and there is no separate subscription projector.
- **Single name, no version-in-name canary (§8.1):** you cannot hot-swap a schema by registering `invoice_v2` alongside `invoice`. Two subgraphs both owning `Query.invoices` is a fatal `LocalCompose` conflict (an unshareable root field defined twice); the error is *swallowed* by `_updateRouter`'s try/catch, and there is no unregister API — `setSupergraph` bulk-replaces but neither un-mounts the old handler nor invalidates `subgraphHandlerCache`. So in-place changes must stay additive/`@shareable`-safe until the core `replaceSubgraph`/`unregisterSubgraph` capability (§13) lands.
- **Shared value types:** the projector reuses core reactor scalars/enums (`DateTime`, `DocumentChangeType`, …) rather than re-emitting per-resource definitions that could differ by member order or nullability and break cross-subgraph merge. A golden-SDL snapshot suite (including cross-subgraph composition) gates any projector change.
- **Depth/complexity limits are core work, not a projector default:** a `GeneratedSubgraph` contributes only `typeDefs`/`resolvers` and has no hook to install `validationRules` on the core-owned supergraph `ApolloServer`. Query-cost/depth limiting must be added at `createSupergraphHandler` (§13).
- **Faithful-sketch caveat:** `GeneratedSubgraph`'s constructor is the frozen 3-arg `(SubgraphArgs, ops, name)` shape from Appendix A; the concrete class binds the `ProjectionRuntime` into its compiled resolvers so each field resolves through `rt.invoke`. The `rt.has(op.id)` guard above keeps the subgraph to ops the runtime will actually serve.


### GraphQL from a package — the only package-contributable projection

**Level:** Advanced · **Transports:** `graphql`

Ship the same resource from a consumer package. `PackageManager` discovers `<pkg>/subgraphs` and constructs the subgraph with just `SubgraphArgs` — so **only the GraphQL slice** is package-contributable. REST/RPC/WS/webhook are wired once in the host boot because `GraphQLManager` keeps the HTTP/gateway/WS/fetch-middleware seams private.

```ts
// ── @acme/invoice-api/invoice.saf.ts ─────────────────────────────────────────
// Transport-agnostic resource (Example 3). This file knows nothing about transports.
export { invoiceRegistry, InvoiceReadModel } from "./invoice.impl.js";

// ── @acme/invoice-api/subgraphs/index.ts ─────────────────────────────────────
// The ONLY projection a package can contribute. PackageManager discovers this barrel and
// constructs the GraphQL subgraph with just SubgraphArgs — no host seams are reachable here.
export * as invoice from "../invoice.saf.js";

// ── @acme/invoice-api/processors/index.ts ────────────────────────────────────
// The read model, discovered alongside subgraphs (also package-contributable).
export { InvoiceReadModel } from "../invoice.saf.js";
```

```ts
// ── switchboard/src/server.mts (host boot — runs ONCE) ───────────────────────
import {
  SwitchboardApi, GraphqlProjector, RestProjector, RpcProjector, WebhookProjector,
  rateLimit, observability, logging,
} from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "@acme/invoice-api/invoice.saf";
import { buildProjectionDeps } from "./projection-deps.js"; // reads the new §13 GraphQLManager accessors
import { graphqlManager, authService, corsAllowlist } from "./boot.js";

const api = new SwitchboardApi({ corsAllowlist, batchLimit: 50, bodyLimit: "8mb" })
  .register(invoiceRegistry)
  .use(rateLimit({ rpm: 600 }), observability(), logging());
api.build();

// The GraphQL slice already ships via the package's subgraphs barrel. The OTHER transports can be
// wired ONLY here, because GraphQLManager keeps httpAdapter/gatewayAdapter/wsServer/fetch-middlewares
// private (§13) — a package literally cannot mount REST/RPC/WS/webhook.
await api.project(
  [new GraphqlProjector(), new RestProjector(), new RpcProjector(), new WebhookProjector()],
  buildProjectionDeps(graphqlManager, authService),
);

// To keep the HOST GraphQL-only as well, pass just the one projector:
//   await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));
```

**Notes**

- **Only GraphQL is package-contributable (§12.1):** `PackageManager` builds a package's subgraph from `SubgraphArgs` alone, and `GraphQLManager` keeps the HTTP adapter, gateway adapter, shared WS server and fetch middlewares private. That is the structural reason REST/RPC/WS/webhook are host-boot-only — not a policy choice.
- **Do not claim non-GraphQL transports ship from a package.** If a package needs REST/RPC/etc., that wiring belongs in `server.mts` via `new SwitchboardApi(...).register(...).build()` then `api.project([...projectors], deps)`.
- **Migration is behavior-preserving (§12.4):** a hand-written `BaseSubgraph` and a SAF `GeneratedSubgraph` are both `ISubgraph`s registered the same way. Wrap the reads as a `RelationalDbProcessor` and the mutations as `write` bindings, keep the **subgraph name stable** so the federated SDL stays byte-compatible, register the generated one instead, and verify with the golden-SDL snapshot.
- **Keep the name stable across redeploys:** because there is no unregister API (Example 4), changing the subgraph name mid-flight risks a duplicate-root-field composition failure. One resource → one durable name.
- **Plugins are cross-cutting, not per-transport:** `rateLimit()/observability()/logging()` added with `.use(...)` apply to every op regardless of transport; they are on by default. The package contributes ops; the host decides which transports and plugins wrap them.


---

## 3. REST only

Every example in this section exposes an operation set as **REST and nothing else**. The mechanics are always the same: author transport-agnostic `OperationDef`s (by hand with `operation()` or in bulk with `defineResource`), then call `api.project([new RestProjector()], deps)` — passing *only* the `RestProjector` is exactly what restricts the surface to REST. Because all five transports are projections over the one `rt.invoke` pipeline (§5), the REST routes inherit the identical input `safeParse`, deny-by-default authorization and closed-output projection every other transport gets; REST adds only wire adaptation (method+path routing, `filter[field][op]`→filter parsing, `PagedResults`→JSON).

A resource named `invoice` mounts a **prefix** route table under `<base>/rest/invoices[/:id]`: `GET` for list/retrieve, `POST` for create, `PATCH` for update, `DELETE` for delete, plus custom detail actions such as `POST …/:id/send`. Reads that return a `PagedResults` envelope serialize to `{ results, nextCursor, totalCount }` with an RFC 5988 `Link: <…&cursor=NEXT>; rel="next"` header — keyset pages leave `totalCount` null, offset pages fill it. **Mutations are always POST/PATCH/DELETE, never GET**, because the AuthService skips bearer verification on GET/OPTIONS, so a mutation reachable by GET would execute unauthenticated.

Two things are load-bearing and easy to get wrong. First, the mount is `deps.wrapFetch(authFetch(driveStep(restHandler)))` with auth **outermost** (401 before the drive step's 421) and `{ exact: true }` for a prefix mount (the flag is inverted). Second, REST must use a **REST-aware drive step that shares GraphQLManager's own `DriveOwnershipCache`** instead of re-instantiating the GraphQL drive middleware — the latter's cache-bypass path parses the body as a GraphQL request (`body.query`/`operationName`) and would 421 a legitimate REST POST against a drive not yet in the cache. Packaging honesty: only the GraphQL projection ships through the `<pkg>/subgraphs` seam. REST is wired **once** in the host boot (`server.mts`) via `new SwitchboardApi(...).build()` then `api.project([new RestProjector()], deps)` — it is never contributed from a package.


### A single REST GET route from a low-level operation

**Level:** Simple · **Transports:** `REST`

The smallest REST-only surface: one hand-written `operation()` carrying `.meta({ rest: { method, path } })`, projected with a lone `RestProjector`. Shows how a read authorizes the exact document it returns and how a closed output schema is the field-leak guard.

```ts
import { z } from "zod";
import { operation, SwitchboardApi, RestProjector, ApiError, type ProjectionDeps } from "@powerhousedao/switchboard-api";
import { serializeTodo } from "@acme/todo-model"; // maps a PHDocument -> { id, title, done, createdAtUtc }

// One read op. `.meta({ rest })` is the ONLY transport hint the OperationDef carries — everything else
// (input parse, authz, output pick) is transport-agnostic and shared by rt.invoke.
export const todoRetrieve = operation("todo.retrieve")
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({
    id: z.string(), title: z.string(), done: z.boolean(), createdAtUtc: z.string(),
  }).strict())                                     // CLOSED output => the field-leak guard (§10.6)
  .requires("reactor")                             // small-N read binding: authorize + reactor.get, no read model
  .meta({ rest: { method: "GET", path: "/todos/:id" } })   // a query -> GET; the projector mounts it at <base>/rest
  .security({ kind: "document", access: "read", subject: (i) => i.id })  // decided BEFORE .query is callable (§6.6)
  .query(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("read", id, ctx);   // reuse the EXACT fetchIdentifier authz checked
    const doc = await ctx.caps.reactor.get(handle.fetchIdentifier); // no re-computed read target (no confused deputy)
    if (!doc) throw new ApiError("NOT_FOUND", `todo '${id}' not found`);
    return serializeTodo(doc);                     // projected to exactly the 4 declared keys
  });

// REST ONLY: hand project() a single RestProjector. No GraphQL / RPC / WS / webhook is mounted.
export async function mountTodoRest(deps: ProjectionDeps) {
  const api = new SwitchboardApi().register(todoRetrieve).build();
  await api.project([new RestProjector()], deps);
  // Mounts exactly one route:  GET <base>/rest/todos/:id
}
```

```bash
# The path param :id becomes the op input { id }; the FIXED safeParse runs inside rt.invoke.
curl -sS 'https://switchboard.example/api/rest/todos/td_88fac' \
  -H 'Authorization: Bearer eyJhbGciOi…' \
  -H 'Drive-Id: 6f1b0c9e-…'

# HTTP/1.1 200 OK
# content-type: application/json
# { "id": "td_88fac", "title": "Ship the REST projector", "done": false, "createdAtUtc": "2026-07-12T09:00:00Z" }
```

**Notes**

- **Security — builder ordering is the guard.** `.query(...)` has type `AuthNotDecided` (no call signature) until `.security(...)` flips `TAuth` to `true`, so "forgot to authorize" is a compile error at the terminal, not a runtime surprise (§6.6). `build()` re-validates the stored policy as a backstop.
- **Why it works — authorize then fetch the same id.** `ctx.authorize.assert("read", id, ctx)` returns an `AuthorizedDocumentHandle`; the handler reads `handle.fetchIdentifier` so the checked document and the fetched document are provably identical. This is the single sanctioned `string → CanonicalDocumentId` path — slug aliasing can't become an existence oracle (§10.3).
- **Why it works — closed output.** `.strict()` plus the FIXED output stage's explicit `pick` mean a `SELECT *`-style document serializer can never leak an internal field; `build()` refuses a non-closed output schema (§10.6).
- **Gotcha — a read must be GET.** Keeping queries on GET lets caches/proxies behave; the projector forbids a query on a non-GET method. Conversely a mutation must never be GET (see the send-action example).
- **Gotcha — base path.** A standalone op mounts under `<base>/rest`; put the collection segment in `rest.path` (`/todos/:id`). Ops registered inside a resource instead inherit `<base>/rest/<plural>` and use resource-relative paths.


### Full CRUD Invoice resource, REST only

**Level:** Intermediate · **Transports:** `REST`

A complete `defineResource` (list / retrieve / create / update / delete) projected to REST alone. Demonstrates the GET/POST/PATCH/DELETE route table under `<base>/rest/invoices[/:id]`, the drive-scoped list policy that closes the Drive-Id IDOR, and a keyset `PagedResults` body with a Link header.

```ts
import { z } from "zod";
import {
  defineResource, SwitchboardApi, RestProjector,
  keyset, type FilterSet, type OrderingBackend, type Serializer, type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import { makeInvoiceDocument, editInvoiceAction, voidInvoiceAction, INVOICE_DOC_TYPE } from "@acme/invoice-model";

// 1) Read-model row + processor. `ownerAddress` is internal and MUST NOT leak to the wire.
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {
  /* initAndUpgrade() builds the indexed `invoice` table; onOperations() projects CREATE/EDIT/VOID
     actions into rows. Ships from <pkg>/processors. Body omitted. */
}

// 2) DTOs — output is CLOSED (.strict()) and omits ownerAddress (field-leak guard, §10.6).
const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();
const InvoiceUpdate = InvoiceCreate.partial();

const serializer: Serializer<typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate,
  // keyset orders by createdAtUtc (id tiebreak); sortable stays WITHIN the cursor columns (§7.2), so build() passes.
  sortable: ["createdAtUtc"],
};

// 3) Allowlists (closed) + the default keyset paginator.
const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte", "range"] },
  currency:     { type: "string", ops: ["eq", "in"] },
  dueDate:      { type: "string", ops: ["gte", "lte", "range"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["createdAtUtc"];

// 4) The resource. `list` is DRIVE-SCOPED (§10.7). No `changes` — subscriptions are not a REST transport.
export const invoiceRegistry = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  write: {
    branch: () => "main",
    create: (input) => ({ document: makeInvoiceDocument(input) }), // reactor.create — real creation, NOT execute()
    update: (patch) => [editInvoiceAction(patch)],                 // actions applied to the AUTHORIZED id
    remove: () => [voidInvoiceAction({})],
    async: false,
  },
  security: {
    list:   { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! }, // NOT { kind: "authenticated" }
    get:    { kind: "document", access: "read",   subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write",  subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
});

// 5) REST ONLY — a single RestProjector. The comment block is the entire mounted surface.
export async function mountInvoiceRest(deps: ProjectionDeps) {
  const api = new SwitchboardApi().register(invoiceRegistry).build();
  await api.project([new RestProjector()], deps);
  //  GET    <base>/rest/invoices        -> invoice.list      (PagedResults + Link)
  //  GET    <base>/rest/invoices/:id    -> invoice.retrieve
  //  POST   <base>/rest/invoices        -> invoice.create    (201)
  //  PATCH  <base>/rest/invoices/:id    -> invoice.update
  //  DELETE <base>/rest/invoices/:id    -> invoice.delete
}
```

```bash
# LIST — filter/sort/limit are query params; keyset returns an opaque cursor + an RFC 5988 Link header.
curl -sS 'https://switchboard.example/api/rest/invoices?filter[status][in]=open&sort=-createdAtUtc&limit=2' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…'

# HTTP/1.1 200 OK
# content-type: application/json
# Link: <https://switchboard.example/api/rest/invoices?filter[status][in]=open&sort=-createdAtUtc&limit=2&cursor=eyJjIjoiMjAyNi0wNy0xMiJ9>; rel="next"
# {
#   "results": [
#     { "id": "inv_1029", "number": "INV-1029", "status": "open", "counterparty": "0xX…",
#       "amount": 4200, "currency": "USD", "dueDate": "2026-08-01",
#       "createdAtUtc": "2026-07-12T09:00:00Z", "updatedAtUtc": "2026-07-12T09:00:00Z" }
#   ],
#   "nextCursor": "eyJjIjoiMjAyNi0wNy0xMiJ9",
#   "totalCount": null
# }
#   ^ no ownerAddress (closed output pick, §10.6); keyset omits totalCount (§7.2).

# CREATE — a mutation, so POST (never GET). Body is the InvoiceCreate DTO; unknown keys are rejected (.strict()).
curl -sS -X POST 'https://switchboard.example/api/rest/invoices' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…' -H 'content-type: application/json' \
  -d '{ "number": "INV-1030", "counterparty": "0xAbc…", "amount": 990, "currency": "USD", "dueDate": "2026-09-01" }'

# HTTP/1.1 201 Created
# { "id": "inv_1030", "number": "INV-1030", "status": "draft", … }
```

**Notes**

- **Security — `list` is drive-scoped, not `authenticated`.** `ctx.driveId` comes from the client-supplied `Drive-Id` header, and the drive middleware only checks *shard ownership* (→421), never per-user authorization. A `{ kind: "authenticated" }` list would let any logged-in user point `Drive-Id` at another tenant's drive and read it. The `{ kind: "drive", access: "read" }` policy authorizes the caller against the collection's drive before the namespace is even selected; `defineResource` rejects a bare `authenticated` here (§10.7).
- **Why it works — the write path is creation, not mutation.** `create` returns `{ document }` for `reactor.create`; SAF never `execute()`s against a freshly-minted id (execute only mutates *existing* documents). `update`/`remove` return `Action[]` applied to the id authorization already resolved — no re-computed target.
- **Why it works — filters compile to bound SQL.** `compileFilter` rejects any unlisted field or operator with `ApiError("VALIDATION")` and binds every value as a Kysely parameter: no injection, no enumeration oracle, no `LIKE` exfiltration on an `eq`-only column (§7.3).
- **Gotcha — keyset sort constraint.** A `SeekPaginator` can only order by its cursor columns, so `sortable` must stay within `[orderBy, tieBreaker]`; `build()` rejects a `sortable` set that exceeds them. Want arbitrary sort (e.g. `-amount`)? Use an offset paginator (next example).
- **Gotcha — no `changes` verb.** Subscriptions have no REST projection; a REST-only resource omits `read.changes`/`security.changes`. Expose realtime via WS/SSE or webhooks in a different section.


### PagedResults on the wire: { results, nextCursor, totalCount } + RFC 5988 Link

**Level:** Intermediate · **Transports:** `REST`

The exact serialization every REST list route uses, plus the two honest paging contracts side by side. Keyset yields an opaque cursor and `totalCount: null`; offset yields arbitrary sort and a real `totalCount`. Both render into the same uniform envelope with a `Link` header.

```ts
import { keyset, offset, type OrderingBackend } from "@powerhousedao/switchboard-api";
import type { PagedResults } from "@powerhousedao/reactor/shared/types";

// (A) The ONE function a RestProjector uses to render any list result to the wire.
//     PagedResults<Row> = { results, options, nextCursor?, totalCount?, next?() }  (Appendix A / §7.2)
export function serializePagedResults<Row>(page: PagedResults<Row>, requestUrl: URL): Response {
  const headers = new Headers({ "content-type": "application/json" });

  // RFC 5988 Link header: echo the request URL with the opaque cursor swapped in.
  if (page.nextCursor) {
    const next = new URL(requestUrl);
    next.searchParams.set("cursor", page.nextCursor);
    headers.set("Link", `<${next.toString()}>; rel="next"`);
  }

  // Uniform REST envelope. keyset -> totalCount null; offset / pageNumber -> a number.
  return new Response(JSON.stringify({
    results: page.results,
    nextCursor: page.nextCursor ?? null,
    totalCount: page.totalCount ?? null,
  }), { status: 200, headers });
}

// (B) Two DIFFERENT interfaces (SeekPaginator vs OffsetPaginator), chosen per read config — not interchangeable.
const keysetPaging = keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 });
//    seek: opaque base64url cursor, O(1) pages, NO totalCount; sort limited to the cursor columns.
const offsetPaging = offset({ default: 25, max: 200 });
//    offset: honors ARBITRARY OrderingBackend sort + totalCount via a companion count().
const reportSortable: OrderingBackend<{ amount: number; dueDate: string; createdAtUtc: string }> =
  ["amount", "dueDate", "createdAtUtc"];   // a resource using offsetPaging may advertise all of these
```

```bash
# KEYSET page (the default) — follow the Link header to page; totalCount is null.
curl -sS -D - 'https://switchboard.example/api/rest/invoices?limit=2' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…'
# HTTP/1.1 200 OK
# Link: <https://switchboard.example/api/rest/invoices?limit=2&cursor=eyJjIjoiMjAyNi0wNy0xMiJ9>; rel="next"
# { "results": [ …2 rows… ], "nextCursor": "eyJjIjoiMjAyNi0wNy0xMiJ9", "totalCount": null }
#
#   next page: just GET the Link URL verbatim.
curl -sS 'https://switchboard.example/api/rest/invoices?limit=2&cursor=eyJjIjoiMjAyNi0wNy0xMiJ9' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…'

# OFFSET page — arbitrary sort is allowed and totalCount is populated.
curl -sS -D - 'https://switchboard.example/api/rest/invoices?sort=-amount&limit=2' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…'
# HTTP/1.1 200 OK
# Link: <https://switchboard.example/api/rest/invoices?sort=-amount&limit=2&cursor=eyJvIjoyfQ>; rel="next"
# { "results": [ …2 rows, amount desc… ], "nextCursor": "eyJvIjoyfQ", "totalCount": 137 }
```

**Notes**

- **Why it works — one envelope, two contracts.** `envelope()` is pure post-processing: it slices the sentinel row and mints the opaque cursor. The REST body is uniform `{ results, nextCursor, totalCount }`; the only visible difference is whether `totalCount` is a number, so clients don't branch on paginator type.
- **Why it works — the Link header is the cursor.** Clients follow `rel="next"` verbatim (the opaque cursor is already embedded), so cursor encoding stays a server concern. Absence of a `Link` header means the last page.
- **Security — `max` is a hard DoS cap.** Every paginator caps `limit` at `max` (100 keyset / 200 offset here) regardless of the requested `limit`; an oversized `?limit=100000` is silently clamped, not honored.
- **Gotcha — don't count on a keyset.** `SeekPaginator` deliberately omits `totalCount` (counting defeats the seek and its O(1) guarantee). If a UI needs a total, choose `offset()`/`pageNumber()` and accept arbitrary-sort + count cost; they are separate interfaces precisely because they are not substitutable (honest LSP).
- **Gotcha — cursor is opaque and stateful to the sort.** A cursor minted under `sort=-amount` is only valid for that sort; changing `sort` mid-pagination should restart from page one.


### A custom detail action — mutations are POST, never GET

**Level:** Advanced · **Transports:** `REST`

A hand-written `invoice.send` detail mutation mapped to `POST <base>/rest/invoices/:id/send`, wired into the resource via `actions`. Includes the projector's structural guard that refuses to map any mutation to GET, because GET/OPTIONS skip bearer verification.

```ts
import { z } from "zod";
import { operation, ApiError, type OperationDef } from "@powerhousedao/switchboard-api";
import { sendInvoiceAction, serializeInvoice } from "@acme/invoice-model"; // serializeInvoice: PHDocument -> InvoiceOutput DTO

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();

// A detail mutation. REST method is POST — a mutation MUST NOT be GET (§8.2, §10.10).
export const sendInvoice = operation("invoice.send")
  .input(z.object({ id: z.string().min(1) }))
  .output(InvoiceOutput)
  .requires("reactor")
  .meta({ rest: { method: "POST", path: "/:id/send", status: 200 } })  // resource-relative path (inherits rest/invoices)
  .security({ kind: "document", access: "write", subject: (i) => i.id }) // decided BEFORE .mutation is callable
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);          // authz-checked id …
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [sendInvoiceAction({ id })]); // … is the id we write
    const updated = await ctx.caps.reactor.get(handle.fetchIdentifier);   // strongly-consistent re-read (a PHDocument)
    if (!updated) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return serializeInvoice(updated);                                    // map PHDocument -> closed InvoiceOutput DTO (§10.6)
  });

// Register through the resource so the action inherits the <base>/rest/invoices base:
//   defineResource({ …, actions: [sendInvoice] })  ->  POST <base>/rest/invoices/:id/send

// The structural guard the RestProjector applies at registration — defence, not documentation.
export function assertRestMethodSafe(op: OperationDef): void {
  const method = op.rest?.method ?? (op.kind === "query" ? "GET" : "POST");
  if (op.kind !== "query" && method === "GET") {
    throw new Error(
      `[rest] ${op.id}: a ${op.kind} cannot map to GET — the AuthService skips bearer verification on GET/OPTIONS, ` +
      `so it would run UNAUTHENTICATED. Use POST/PATCH/DELETE.`,
    );
  }
  if (op.kind === "query" && method !== "GET") {
    throw new Error(`[rest] ${op.id}: a query must be GET (safe/idempotent), not ${method}.`);
  }
}
```

```bash
# SEND — POST to the detail sub-route. A GET here would be rejected at registration (assertRestMethodSafe).
curl -sS -X POST 'https://switchboard.example/api/rest/invoices/inv_1030/send' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 6f1b0c9e-…'

# HTTP/1.1 200 OK
# content-type: application/json
# { "id": "inv_1030", "number": "INV-1030", "status": "open", … }   # status flipped draft -> open
```

**Notes**

- **Security — the core reason mutations aren't GET.** The AuthService skips bearer verification on GET/OPTIONS; a mutation reachable by GET would execute without a verified caller. `assertRestMethodSafe` makes that a registration-time throw, not a review checklist item (§10.10).
- **Why it works — authorize the exact write target, then serialize it.** `assert("write", id)` resolves the `CanonicalDocumentId` once; `execute(handle.fetchIdentifier, …)` writes that same id (no re-computed target — no confused deputy, §10.3). `reactor.get` returns a raw `PHDocument`, so the handler maps it through `serializeInvoice` to the closed `InvoiceOutput` DTO — the FIXED output stage picks exactly those keys, so an internal field can't leak (§10.6). (The generated CRUD `update` handler does the same `project(doc)` step; §7.6.)
- **Why it works — resource-relative path.** Registering via `actions: [sendInvoice]` means the action inherits the resource's `<base>/rest/invoices` prefix, so `path: "/:id/send"` resolves to `POST <base>/rest/invoices/:id/send`. A standalone registration would instead need the full `path: "/invoices/:id/send"`.
- **Gotcha — `execute` needs an existing doc.** `reactor.execute` mutates existing documents only. `invoice.send` is safe because the invoice already exists; a *create*-style action must use `reactor.create`/`createEmpty`/`drives.addFile` instead.
- **Gotcha — errors are `ApiError` only.** Throw `ApiError(code, msg)` (here `NOT_FOUND`); the projector maps `code` to an HTTP status via `ERROR_HTTP`. Never throw a raw `Error` or return a transport-specific error shape.


### Inside the RestProjector: mount, auth-outermost, and the shared DriveOwnershipCache

**Level:** Advanced · **Transports:** `REST`

An implementation sketch of the shipped `RestProjector`, showing the prefix mount `deps.wrapFetch(authFetch(driveStep(restHandler)))` with `{ exact: true }`, the ApiError→HTTP mapping, and — critically — a REST-aware drive step that shares GraphQLManager's own `DriveOwnershipCache` instead of the GraphQL drive middleware.

```ts
import {
  ApiError, ERROR_HTTP,
  type TransportProjector, type OperationRegistry, type ProjectionRuntime,
  type ProjectionDeps, type OperationDef,
} from "@powerhousedao/switchboard-api";
import type { FetchHandler } from "@powerhousedao/reactor-api/graphql/gateway/types";
import { createAuthFetchMiddleware } from "@powerhousedao/reactor-api/graphql/gateway/auth-middleware";
import type { DriveOwnershipCache } from "@powerhousedao/reactor-api/graphql/gateway/drive-ownership-cache";
// NOTE: we deliberately do NOT import createDriveFetchMiddleware (drive-middleware.ts). See gotchas.
import { serializePagedResults } from "./paged-results.js"; // from the PagedResults example
import { assertRestMethodSafe } from "./rest-method-guard.js"; // from the send-action example

export class RestProjector implements TransportProjector {
  readonly transport = "rest" as const;

  project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void {
    // auth OUTERMOST: 401 (no/invalid bearer) is answered before the drive step's 421 (wrong shard).
    const authFetch = createAuthFetchMiddleware(deps.authService);
    // REST-aware drive step reuses GraphQLManager's SAME DriveOwnershipCache (the §13 accessor) rather than
    // re-instantiating the GraphQL-shaped middleware, whose cache-bypass path parses the body as GraphQL.
    const driveStep = createRestDriveStep(deps.driveOwnershipCache);

    const mount = (base: string, ops: readonly OperationDef[]): void => {
      ops.forEach(assertRestMethodSafe);                    // mutation !== GET, query === GET (§10.10)
      const restHandler = buildRouter(ops, rt);
      // { exact: true } means PREFIX (the flag is inverted, §8.2), so /:id and /:id/send share one handler.
      deps.httpAdapter.mount(base, deps.wrapFetch(authFetch(driveStep(restHandler))), { exact: true });
    };

    // One prefix mount per resource -> <base>/rest/<plural>.
    const claimed = new Set<string>();
    for (const resource of registry.resources) {
      const ops = [...registry.operations.values()].filter((op) => op.id.startsWith(`${resource.name}.`));
      ops.forEach((op) => claimed.add(op.id));
      mount(`${deps.basePath}/rest/${resource.basePath ?? plural(resource.name)}`, ops);
    }
    // Standalone ops (registered directly, not via a resource) share the <base>/rest prefix; their
    // rest.path already carries the collection segment (e.g. "/todos/:id"), so the GET example mounts here too.
    const loose = [...registry.operations.values()].filter((op) => !claimed.has(op.id));
    if (loose.length) mount(`${deps.basePath}/rest`, loose);
  }
}

// Method+path router -> rt.invoke. Business logic, validation and authz all live behind invoke (§5).
function buildRouter(ops: readonly OperationDef[], rt: ProjectionRuntime): FetchHandler {
  // Default method matches assertRestMethodSafe: queries -> GET, mutations -> POST (never GET).
  const routes = ops.map((op) => ({
    op,
    method: op.rest?.method ?? (op.kind === "query" ? "GET" : "POST"),
    match: toMatcher(op.rest?.path ?? ""),
  }));
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const route = routes.find((r) => r.method === request.method && r.match(url.pathname) !== null);
    if (!route) return new Response("Not Found", { status: 404 });
    try {
      const params = route.match(url.pathname)!;                       // { id } from /:id
      const query = restQueryToInput(url.searchParams);                // filter[f][op]=v, sort=-f, limit, cursor
      const body = request.method === "GET" || request.method === "DELETE"
        ? {} : await request.json().catch(() => ({}));
      const input = { ...query, ...body, ...params };                  // path params win; FIXED safeParse runs next
      const ctx = await rt.makeContext(request, "rest");               // reads Drive-Id header -> validated ctx.driveId (§6.9)
      const result = await rt.invoke(route.op.id, input, ctx);
      return isPagedResults(result)
        ? serializePagedResults(result, url)                          // { results, nextCursor, totalCount } + Link
        : new Response(JSON.stringify(result), {
            status: route.op.rest?.status ?? (route.method === "POST" ? 201 : 200),
            headers: { "content-type": "application/json" },
          });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "INTERNAL";    // ApiError.code -> HTTP status
      return new Response(
        JSON.stringify({ error: { code, message: err instanceof Error ? err.message : "error" } }),
        { status: ERROR_HTTP[code], headers: { "content-type": "application/json" } },
      );
    }
  };
}

// Shares the SAME DriveOwnershipCache GraphQLManager uses (§13 accessor). It ONLY checks shard ownership from
// the Drive-Id header; it NEVER parses the body as GraphQL — the reason createDriveFetchMiddleware can't be reused.
function createRestDriveStep(cache: DriveOwnershipCache): (h: FetchHandler) => FetchHandler {
  return (next) => async (request) => {
    const driveId = request.headers.get("Drive-Id") ?? undefined;
    if (driveId && !(await cache.isOwnedHere(driveId))) {             // shared cache => shard decision matches GraphQL routes
      return new Response("Misdirected Request", { status: 421 });    // same 421 the GraphQL path returns
    }
    return next(request);                                            // makeContext reads Drive-Id -> ctx.driveId
  };
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
function plural(name: string): string { return name.endsWith("s") ? name : `${name}s`; }
function toMatcher(path: string): (p: string) => Record<string, string> | null {
  const keys: string[] = [];
  const rx = new RegExp("^" + path.replace(/:([A-Za-z0-9_]+)/g, (_m, k) => (keys.push(k), "([^/]+)")) + "$");
  return (p) => { const m = rx.exec(p); return m ? Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])) : null; };
}
function isPagedResults(v: unknown): v is { results: unknown[]; nextCursor?: string; totalCount?: number } {
  return typeof v === "object" && v !== null && Array.isArray((v as { results?: unknown }).results);
}
declare function restQueryToInput(q: URLSearchParams): Record<string, unknown>; // parses DRF-style query
```

```ts
// HOST BOOT (switchboard/src/server.mts) — REST is wired ONCE here, never from a package.
const api = new SwitchboardApi({ corsAllowlist, batchLimit: 50, bodyLimit: "8mb" })
  .register(invoiceRegistry)
  .use(rateLimit({ rpm: 600 }), observability(), logging()) // on by default
  .build();

await api.project([new RestProjector()], buildProjectionDeps(graphqlManager, authService));
//                 ^ REST ONLY — omit GraphqlProjector/RpcProjector/etc. to restrict the surface.
```

```bash
# auth-outermost proof: no bearer => 401 BEFORE the drive step runs.
curl -sS -o /dev/null -w '%{http_code}\n' 'https://switchboard.example/api/rest/invoices' -H 'Drive-Id: 6f1b0c9e-…'
# 401

# valid bearer but a drive owned by a different shard => 421 from the shared-cache drive step.
curl -sS -o /dev/null -w '%{http_code}\n' 'https://switchboard.example/api/rest/invoices' \
  -H 'Authorization: Bearer eyJ…' -H 'Drive-Id: 00000000-wrong-shard'
# 421
```

**Notes**

- **Security — the DriveOwnershipCache MUST be shared.** Reusing `createDriveFetchMiddleware` for REST is the trap: its cache-bypass path parses the request body as a GraphQL request (`body.query`/`operationName`), so a legitimate REST POST against a drive not yet cached would 421. Sharing GraphQLManager's *same* cache instance (the §13 accessor) keeps REST shard decisions identical to the GraphQL routes without the GraphQL body assumptions.
- **Security — auth outermost.** Composing `authFetch(driveStep(handler))` answers 401 before 421 and guarantees the bearer is verified before any drive work; `deps.wrapFetch` then folds in the default plugins' `asFetchMiddleware` (pre-buffer 429/403). `{ exact: true }` makes it a prefix mount so `/:id` and `/:id/send` fall under one handler.
- **Why it works — one pipeline for resources and standalone ops.** Ops claimed by a resource mount under `<base>/rest/<plural>`; everything else mounts under `<base>/rest` with its `rest.path` carrying the collection segment — so the lone `todoRetrieve` from the GET example is projected by this same class. Either way the router only adapts the wire (method/path/query→input), calls `rt.invoke`, and maps `ApiError.code` via `ERROR_HTTP`; validation, authz and the closed output pick are inside `invoke`, so REST can never diverge from the other transports.
- **Gotcha — packaging honesty.** This projector runs in the host boot, not a package. Only the GraphQL projection is contributable through `<pkg>/subgraphs`; REST/RPC/WS/webhook need the one-time `server.mts` wiring plus the new `GraphQLManager` accessors (§12.1, §13). Don't claim REST ships from a package.
- **Gotcha — illustrative names.** `createAuthFetchMiddleware`, `cache.isOwnedHere` and `restQueryToInput` stand in for the real auth-middleware factory, ownership-lookup and DRF-style query parser; the load-bearing facts are *which cache instance* is used and *that the body is not parsed as GraphQL*.
- **Gotcha — validation CPU.** REST always runs full input `safeParse` (unlike the GraphQL path, which can skip the redundant parse since Apollo already validated against SDL). The output pick stays unconditional everywhere — it is the field-leak guard, not just a validator (§15.5).


---

## 4. WebSocket / subscriptions only

Realtime in the Switchboard API Framework is one thing: an operation whose `kind` is `"subscription"`. Its handler is not `Promise<T>` like a query or mutation — per Appendix A it is `(input, ctx) => AsyncIterable<InferOut<TOut>>`, an async generator that **yields already-projected, already-redacted events**. You never open a socket yourself. Every subscription rides the **one shared `WebSocketServer`** (`/graphql/subscriptions`, `setMaxListeners(0)`) that `GraphQLManager` owns, and every event flows out of the same in-process `getPubSub()` fan-out that `ensureGlobalDocumentSubscription(reactor)` feeds.

Two authorization gates apply, and both are mandatory. **Subscribe-time** authz is the fixed `{ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }` policy — it runs in the pipeline's non-removable authz stage *before the iterator is ever created*, and it is what closes the `Drive-Id` IDOR (a bare `{ kind: "authenticated" }` would let any logged-in user point `Drive-Id` at another tenant's drive; `build()` rejects it for `changes`). **Per-event** authz is a per-document read check inside the generator, run fail-closed for every changed document before it is yielded — identical to today's reactor `documentChanges`. On top of that, connection and subscription counts are **capped per identity** so a client cannot open a thousand subscriptions and amplify one fan-out into an authz-DB DoS (§10.9).

Packaging honesty (§8.3): subscriptions ship through the **GraphQL registration**. A `GeneratedSubgraph` with `hasSubscriptions = true` makes `GraphQLManager#setupSubgraphs` call `attachWebSocket` and mount `/stream` (SSE) for you, so the GraphQL projector **owns** the socket. There is deliberately **no separate WS/subscription projector** — adding one would attach a second `graphql-ws` server to the same socket and double-handle every frame. And WS auth is not the header Fetch middleware (it does not wrap WS): it is `authService.authenticateWebSocketConnection(connectionParams)`, which **throws** on a missing/invalid token and closes the connection.


### The minimal `changes` subscription — ChatMessage over the shared socket

**Level:** Simple · **Transports:** `WebSocket (graphql-ws)`, `SSE (graphql-sse)`

A hand-built `chatMessage.changes` subscription op. The handler is an async generator that ref-counts `ensureGlobalDocumentSubscription`, drains `getPubSub().asyncIterableIterator(DOCUMENT_CHANGES)`, and — per event — runs a cheap `matchesSearchFilter` then a **fail-closed** per-document read check (`ctx.authorize.assert("read", …)`) before yielding the closed output DTO. Subscribe-time authz is drive-scoped. Because only created/updated events carry a document, this minimal stream covers those two (deletes are context-only — see notes).

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";
import {
  getPubSub,
  ensureGlobalDocumentSubscription,
  SUBSCRIPTION_TRIGGERS,
  type DocumentChangesPayload,
} from "@powerhousedao/reactor-api/graphql/reactor/pubsub";
import { matchesSearchFilter } from "@powerhousedao/reactor-api/graphql/reactor/adapters";
import { DocumentChangeType } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { CHAT_MESSAGE_DOC_TYPE } from "@acme/chat-model";

// Output is CLOSED (.strict()) — the fixed output stage picks exactly these keys, no field leak.
const ChatMessageDto = z
  .object({ id: z.string(), room: z.string(), author: z.string(), body: z.string(), sentAtUtc: z.string() })
  .strict();
// A full-message DTO can only carry create/update: those events ship the document. Deletes are
// context-only (documents: []), so they are out of scope here — the generated `changes` (Example 4)
// covers the full lifecycle.
const ChatChangeEvent = z
  .object({ changeType: z.enum(["created", "updated"]), message: ChatMessageDto })
  .strict();

function toDto(doc: PHDocument) {
  const s = doc.state.global as { room: string; author: string; body: string; sentAtUtc: string };
  return { id: doc.header.id, room: s.room, author: s.author, body: s.body, sentAtUtc: s.sentAtUtc };
}

// Only Created/Updated events carry documents; deleted + relationship events ship `documents: []`.
const CHANGE_TYPE: Partial<Record<DocumentChangeType, "created" | "updated">> = {
  [DocumentChangeType.Created]: "created",
  [DocumentChangeType.Updated]: "updated",
};

export const chatMessageChanges = operation("chatMessage.changes")
  .input(z.object({ room: z.string().optional() }).strict())
  .output(ChatChangeEvent)
  .requires("reactor") // ensureGlobalDocumentSubscription(reactor); ctx.authorize is always present
  // SUBSCRIBE-TIME authz — drive-scoped, NOT { kind: "authenticated" } (that is the Drive-Id IDOR).
  // Runs in the fixed authz stage BEFORE the generator below is ever invoked.
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! })
  // Auth is now decided -> `.subscription` lifts from AuthNotDecided to a callable terminal.
  .subscription(async function* (input, ctx) {
    // Ride the ONE shared in-process fan-out; ref-count so the global reactor.subscribe is created once.
    const release = ensureGlobalDocumentSubscription(ctx.caps.reactor);
    const iterator = getPubSub().asyncIterableIterator<DocumentChangesPayload>(
      SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
    );
    // Socket drop / server abort tears the stream down deterministically.
    ctx.signal?.addEventListener("abort", () => void iterator.return?.());
    try {
      for await (const payload of iterator) {
        // Coarse type match first — cheap, no DB, before any authz call. This also drops deletes and
        // relationship churn: their `documents` array is empty, so no ChatMessage row matches the type.
        if (!matchesSearchFilter(payload.documentChanges, { type: CHAT_MESSAGE_DOC_TYPE })) continue;
        const changeType = CHANGE_TYPE[payload.documentChanges.type];
        if (!changeType) continue; // defensive: only created/updated get past matchesSearchFilter above
        for (const doc of payload.documentChanges.documents) {
          if (doc.header.documentType !== CHAT_MESSAGE_DOC_TYPE) continue;
          if (input.room && (doc.state.global as { room: string }).room !== input.room) continue;
          // PER-EVENT, PER-DOCUMENT read authz — FAIL-CLOSED. A drop, never a throw at the socket.
          // assert() resolves slug->canonical id safely (no existence oracle) and is the read check on
          // the SAF DocumentAuthorizer surface (there is no `canReadDocument` on ctx.authorize).
          let allowed = false;
          try {
            await ctx.authorize.assert("read", doc.header.id, ctx);
            allowed = true;
          } catch {
            allowed = false;
          }
          if (!allowed) continue;
          yield { changeType, message: toDto(doc) }; // projected to the CLOSED output
        }
      }
    } finally {
      release(); // decrement the ref-count; the global reactor.subscribe is torn down at 0
    }
  });
```

**Notes**

- **Builder ordering is the load-bearing invariant.** `.subscription` has type `AuthNotDecided` (no call signature) until `.security(...)` flips `TAuth` to `true`. Move `.security` after `.subscription` and it is a red squiggle at the call site, not a runtime surprise.
- **Why `.requires("reactor")`:** the handler needs `ctx.caps.reactor` for `ensureGlobalDocumentSubscription`. `ctx.authorize` (the `DocumentAuthorizer`) is a top-level context field, present regardless of declared caps — that is how the per-event read check works without declaring any extra cap.
- **Two gates, in order:** the drive-scoped subscribe-time check runs in the fixed authz stage before the iterator exists; the per-document `assert("read", …)` runs per event, fail-closed (any throw = drop that document). This mirrors today's reactor `documentChanges` exactly. Note SAF's `DocumentAuthorizer` exposes `canonical`/`assert` only — there is no `canReadDocument` on `ctx.authorize`, so `assert("read", …)` in a try/catch *is* the read gate.
- **Cheap-before-expensive:** `matchesSearchFilter` (type/parent, no DB) gates before any authz round-trip, so unrelated document churn never touches the authz DB.
- **Deletes are context-only.** The reactor emits `Deleted` (and relationship) events with `documents: []` and just a `context.childId` — a bodyless id, not a full document. A DTO that carries `room/author/body` therefore can only represent create/update, which is why this minimal op restricts its output to those. For a delete-aware stream, emit an id-only variant off `context`, or use the generated `changes` (Example 4), whose event shape already models the full lifecycle.
- **Cleanup:** `finally { release() }` plus the `ctx.signal` abort listener guarantee the ref-count drops and the global `reactor.subscribe` is released when the client unsubscribes or the socket dies.
- **Gotcha (single-process):** `getPubSub()` is one in-process `graphql-subscriptions` PubSub — fan-out is per-node. It is the one sanctioned realtime global a hand-built subscription reaches for (the generated `changes` hides it); cross-node realtime is the webhook/outbox path, not this.


### Realtime-only host boot — register, build, project ONLY the GraphQL projector

**Level:** Intermediate · **Transports:** `WebSocket`, `SSE`, `GraphQL subscriptions`

The one-time `server.mts` wiring for a realtime-only API. You `.register` the subscription op, turn on the default plugins, `.build()` the typed registry, then `api.project([new GraphqlProjector()], deps)` — passing **only** the GraphQL projector, because a `hasSubscriptions` subgraph already owns WS + SSE. Adding a WS projector would double-attach. This matches the host-boot shape in §12.2.

```ts
// switchboard/src/server.mts — the ONE place non-GraphQL transports are wired (schematic).
import {
  SwitchboardApi,
  GraphqlProjector,
  rateLimit,
  observability,
  logging,
  type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";
import { chatMessageChanges } from "./chat-changes.saf.js";

// 1) Register the subscription op, enable default plugins, freeze the typed registry.
const api = new SwitchboardApi({ corsAllowlist: ["https://app.acme.example"] })
  .register(chatMessageChanges)
  .use(rateLimit({ rpm: 600 }), observability(), logging())
  .build();

// 2) Assemble ProjectionDeps from the GraphQLManager accessors added in §13.
//    (getWsServer / getPubSub / getDriveOwnershipCache / composed authFetch+driveFetch, etc.)
function buildProjectionDeps(gm: GraphQLManager, authService: AuthService): ProjectionDeps {
  return {
    basePath: gm.getBasePath(),
    httpAdapter: gm.getHttpAdapter(),
    graphqlManager: gm,
    gatewayAdapter: gm.getGatewayAdapter(),
    wsServer: gm.getWsServer(), // the ONE shared WebSocketServer at /graphql/subscriptions
    pubsub: gm.getPubSub(),
    driveOwnershipCache: gm.getDriveOwnershipCache(),
    authService,
    subgraphArgs: gm.getSubgraphArgs(),
    // Appendix A: wrapFetch folds the registered plugins' asFetchMiddleware around an HTTP handler.
    // A realtime-only boot mounts no HTTP transport, so it is inert here; the HTTP projectors (REST/RPC)
    // additionally compose auth (outermost) then drive via the getAuthFetch()/getDriveFetch() accessors.
    wrapFetch: (h) => gm.getAuthFetch()(gm.getDriveFetch()(h)),
  };
}

// 3) Project. For a realtime-only API you pass ONLY the GraphQL projector.
//    Its GeneratedSubgraph sets `hasSubscriptions = true`, so GraphQLManager#setupSubgraphs
//    ALREADY calls attachWebSocket + mounts /stream (SSE). Registering it OWNS the socket.
//    There is deliberately NO WsProjector: a second graphql-ws server on the same socket
//    would double-handle every connection.
//    `graphqlManager` / `authService` are the host's already-running instances.
await api.project([new GraphqlProjector()], buildProjectionDeps(graphqlManager, authService));

// WS auth reminder: the socket is guarded by
//   authService.authenticateWebSocketConnection(connectionParams)  // THROWS on failure
// NOT by the header AuthFetchMiddleware (which never wraps WS).
```

**Notes**

- **One owner, no double-wiring (§8.3).** `hasSubscriptions = true` is what wires WS + SSE inside `#setupSubgraphs`. Passing a separate subscription/WS projector would register a second `graphql-ws` server on the shared socket — the exact anti-pattern the framework forbids. Realtime-only = `[new GraphqlProjector()]`.
- **Only GraphQL is package-contributable.** REST/RPC/WS/webhook projection needs the private `GraphQLManager` internals, so this wiring lives once in the host boot (`server.mts`), never inside a `<pkg>/subgraphs` barrel.
- **`ProjectionDeps` shape is fixed (Appendix A).** Even a realtime-only boot populates `wsServer`/`pubsub` — they are consumed by the GraphQL registration path and available to any HTTP transports you add later.
- **The §13 accessors are real core work.** `getWsServer()`, `getPubSub()`, `getGatewayAdapter()`, `getDriveOwnershipCache()`, and the composed `authFetch`/`driveFetch` are the read-only `GraphQLManager` accessors SAF requires; SAF does not pretend they exist today.
- **Gotcha (SSE).** `/stream` is offered for HTTP-auth-friendly clients, but `serveFetchHandler` still `await response.text()`s — verify true streaming before leaning on SSE for heavy push; steer high-volume consumers to WS or webhooks.


### A client subscribing over WebSocket (graphql-ws)

**Level:** Intermediate · **Transports:** `WebSocket (graphql-ws)`

A `graphql-ws` client connecting to `/graphql/subscriptions`. The SIWE bearer and drive id ride in `connectionParams` — because WS auth is `authenticateWebSocketConnection(connectionParams)` (which throws), not the header Fetch middleware. Unsubscribing drives the server generator's `finally`, releasing the fan-out ref-count.

```ts
import { createClient } from "graphql-ws";

const client = createClient({
  url: "wss://switchboard.acme.example/graphql/subscriptions",
  // WS auth = authService.authenticateWebSocketConnection(connectionParams). It reads
  // connectionParams.authorization, splits the bearer, verifies, and THROWS on a missing/invalid token
  // (closing the socket); the header AuthFetchMiddleware NEVER runs for WS. So send credentials here.
  connectionParams: async () => ({
    authorization: `Bearer ${await getSiweToken()}`,
    "drive-id": "acme-workspace", // becomes ctx.driveId -> the { kind: "drive" } subscribe-time check
  }),
  retryAttempts: 10, // graphql-ws auto-reconnects; each reconnect re-runs authenticateWebSocketConnection
});

const unsubscribe = client.subscribe(
  {
    query: /* GraphQL */ `
      subscription OnChat($room: String) {
        chatMessageChanges(room: $room) {
          changeType
          message { id room author body sentAtUtc }
        }
      }
    `,
    variables: { room: "general" },
  },
  {
    next: ({ data }) => renderMessage(data.chatMessageChanges),
    error: (err) => console.error("subscription closed", err), // FORBIDDEN / RATE_LIMITED surface here
    complete: () => console.log("server ended the stream"),
  },
);

// Later: unsubscribe() -> graphql-ws sends a Complete frame -> the server generator hits `finally`
// -> release() decrements the ensureGlobalDocumentSubscription ref-count (torn down at 0).
export { unsubscribe };
```

**Notes**

- **Credentials go in `connectionParams`, not headers.** `authenticateWebSocketConnection` reads `connectionParams.authorization`, splits the bearer, verifies the token, and **throws** (`Missing authorization in connection parameters` / `Token verification failed` / …) to reject the connection. There is no header-middleware fallback on WS.
- **`drive-id` in `connectionParams` becomes `ctx.driveId`,** which the subscribe-time `{ kind: "drive", access: "read" }` policy authorizes before any event flows. Omit it and the drive check fails closed (`FORBIDDEN`).
- **The typed RPC client cannot call this.** `createRpcClient<typeof registry.typed>` excludes `"subscription"` ops at the type level (the `ApiClient` mapped type's `… ? never : K`) and the RPC projector rejects them at runtime — subscriptions are WS/SSE only. Use a GraphQL WS client.
- **Reconnection re-authenticates.** Every `graphql-ws` reconnect re-invokes `authenticateWebSocketConnection`, so a revoked credential stops delivering after the next reconnect, and the per-event read check keeps enforcing on the live connection in between.
- **Gotcha:** authz denials arrive on the `error` callback (the stream closes), while unauthorized *individual* documents are silently dropped by the per-event check — you simply never receive them.


### Filtered `chat.changes` from a resource — auto redaction + per-identity caps

**Level:** Advanced · **Transports:** `WebSocket (graphql-ws)`, `SSE (graphql-sse)`

The `changes` subscription generated by `defineResource`, wired drive-scoped, with `serializer.fieldGuards` redacting `author` from anonymous subscribers **on the stream too**, per-event read authz applied automatically, and a `subscriptionCaps` plugin that bounds live subscriptions per identity and releases the slot when the stream ends.

```ts
import { z } from "zod";
import {
  defineResource,
  keyset,
  ApiError,
  type Serializer,
  type Plugin,
  type FilterSet,
  type OrderingBackend,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import { makeChatMessageDocument, CHAT_MESSAGE_DOC_TYPE } from "@acme/chat-model";

// 1) Read model (Kysely row + processor) — the source the `changes` stream and `list` share.
interface ChatRow { id: string; room: string; author: string; body: string; sentAtUtc: string }
interface ChatDb { chatMessage: ChatRow }
export class ChatReadModel extends RelationalDbProcessor<ChatDb> {
  /* initAndUpgrade() builds the indexed `chatMessage` table; onOperations() projects POST actions. */
}

// 2) DTOs. Output is CLOSED; `author` is guarded (hidden from anonymous callers) — enforced on events too.
const ChatDto = z
  .object({ id: z.string(), room: z.string(), author: z.string(), body: z.string(), sentAtUtc: z.string() })
  .strict();
const ChatCreate = z.object({ room: z.string().min(1), body: z.string().min(1) }).strict();
const ChatFilter = z.object({ room: z.string().optional() }).strict();
const serializer: Serializer<typeof ChatDto, typeof ChatCreate, typeof ChatCreate, typeof ChatFilter> = {
  output: ChatDto,
  create: ChatCreate,
  filter: ChatFilter,
  sortable: ["sentAtUtc"],
  fieldGuards: { author: (ctx) => Boolean(ctx.user) }, // auto-enforced by the inner serializer plugin
};

const filterable: FilterSet<ChatRow> = { room: { type: "string", ops: ["eq"] } };
const sortable: OrderingBackend<ChatRow> = ["sentAtUtc"];

// 3) Per-identity subscription cap (§10.9). One live-count map; the slot is released when the stream ends,
//    or if subscribe-time authz/validation rejects the op (so a denied connect never leaks a slot).
function subscriptionCaps(o: { maxPerIdentity: number }): Plugin {
  const live = new Map<string, number>();
  return {
    name: "subscription-caps",
    phase: "outer", // pre-authz: wraps around the fixed authz stage + inner plugins + handler
    appliesTo: (op) => op.kind === "subscription",
    wrap: (next) => async (input, ctx) => {
      const who = ctx.user?.address ?? `ip:${ctx.headers.get("x-forwarded-for") ?? "anon"}`;
      const n = (live.get(who) ?? 0) + 1;
      if (n > o.maxPerIdentity) {
        throw new ApiError("RATE_LIMITED", "too many live subscriptions", { who }, true);
      }
      live.set(who, n);
      let stream: AsyncIterable<unknown>;
      try {
        stream = (await next(input, ctx)) as AsyncIterable<unknown>;
      } catch (e) {
        live.set(who, Math.max(0, n - 1)); // subscribe rejected (drive authz / validation) -> free the slot
        throw e;
      }
      return (async function* () {
        try {
          yield* stream;
        } finally {
          live.set(who, Math.max(0, (live.get(who) ?? 1) - 1));
        }
      })();
    },
  };
}

// 4) The resource. `changes` is DRIVE-SCOPED (build() rejects { kind: "authenticated" } here).
export const chatRegistry = defineResource({
  name: "chat",
  version: "1.0.0",
  documentType: CHAT_MESSAGE_DOC_TYPE,
  serializer,
  read: {
    source: ChatReadModel,
    table: "chatMessage",
    filterable,
    sortable,
    pagination: keyset({ orderBy: "sentAtUtc", tieBreaker: "id", default: 50, max: 200 }),
    changes: { search: (): SearchFilter => ({ type: CHAT_MESSAGE_DOC_TYPE }) }, // the subscription source
  },
  write: {
    branch: () => "main",
    create: (input, ctx) => ({ document: makeChatMessageDocument({ ...input, author: ctx.user?.address }) }),
  },
  security: {
    list: { kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! },
    get: { kind: "document", access: "read", subject: (i) => i.id },
    create: { kind: "create" },
    // REQUIRED subscribe-time authz. A bare { kind: "authenticated" } does not typecheck and build() rejects it.
    changes: { kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! },
  },
  plugins: [subscriptionCaps({ maxPerIdentity: 20 })],
});
// chatRegistry["chat.changes"]:
//   OperationDef<ChangesArgs<typeof ChatFilter>, ChangeEventOf<typeof ChatDto>, "reactor", "subscription">
// -> GraphQL `Subscription chatChanges(filter)`. Per-event read authz + author-redaction are automatic.
//
// Client side (filtered):
//   client.subscribe(
//     { query: `subscription($f: ChatFilterInput) {
//         chatChanges(filter: $f) { changeType message { id room author body sentAtUtc } } }`,
//       variables: { f: { room: "general" } } },
//     { next: ({ data }) => renderMessage(data.chatChanges), error: console.error, complete: () => {} },
//   );
```

**Notes**

- **Redaction rides the stream for free.** `serializer.fieldGuards.author` is enforced by the auto-installed inner serializer plugin on *every* projection, including each subscription event — an anonymous subscriber gets `author` stripped, not the raw row. This is the blessed redaction path; you never hand-redact in a generator.
- **Drive-scoped subscribe authz is required and type-enforced.** `defineResource`'s `security.changes` does not accept `{ kind: "authenticated" }`; `build()` is the runtime backstop. This is the §10.7 IDOR closure applied to realtime.
- **Per-event read authz is automatic.** The generated `changes` handler runs `matchesFilter` + fail-closed per-document read authz identically to the hand-built op in Example 1 — you get it without writing the loop, and it already models deletes/relationship events (which the minimal Example 1 skips).
- **The cap plugin is leak-safe.** The slot is incremented before `next`, released in the generator's `finally` on normal end/abort, **and** released in the `catch` if subscribe-time authz/validation throws — so a rejected connect never permanently consumes a slot. `phase: "outer"` (pre-authz) + `appliesTo: op.kind === "subscription"` scope it precisely, and it counts the connect attempt even when authz later denies it.
- **Still one shared socket.** `chat.changes` is a GraphQL subscription, so it lights up through the same `hasSubscriptions` registration as everything else — no extra projector, no second `attachWebSocket`.
- **Gotcha:** the plugin's per-identity map is per-node (like `getPubSub()`); behind multiple nodes the cap is per-node, and the raw connection cap is additionally enforced at the shared WS owner. Size limits with that in mind.


---

## 5. JSON-RPC 2.0 only + the inferred typed client

JSON-RPC is a **projection** like every other transport (§8): one buffered `FetchHandler` mounted `httpAdapter.mount("<base>/rpc", authFetch(driveFetch(rpcHandler)))`. The JSON-RPC `method` is exactly `op.id` (e.g. `"invoice.list"`); `params` are `safeParse`d against `op.input`; only `query` and `mutation` ops are callable (`subscription` → *"use WS/SSE"*, and the inferred client excludes them). Because the handler runs through `rt.invoke(opId, input, ctx)`, the validation, authorization, and business logic are **identical** to the GraphQL/REST/WS projections — RPC is just a different wire idiom, mapping `ApiError.code` through the exhaustive `ERROR_RPC` record.

The payoff is end-to-end type safety with **zero codegen**. `api.build()` returns a `TypedRegistry` whose `.typed` is a record keyed by `op.id`, so `createRpcClient<typeof registry.typed>(url)` infers the whole surface from one source of truth — no hand-maintained `id → op` map. Each method is typed `(input: InferIn<op.input>) => Promise<InferOut<op.output>>`: the client sends the **pre-parse wire type** (`InferIn`, so a coercing/transforming schema doesn't force callers to pre-apply the server transform), receives the closed, field-leak-guarded output (`InferOut`), and `subscription` ops are dropped by the mapped type — asking for `client["invoice.changes"]` is a compile error.

To expose **only** JSON-RPC, pass **only** `new RpcProjector()` to `api.project([...], deps)` — GraphQL/REST/WS/webhook simply never light up. This projection is wired **once in the host boot** (`server.mts`), not shipped from a package (only the GraphQL subgraph ships via the `<pkg>/subgraphs` seam, §12.1). The `/rpc` mount is hardened against batch amplification: array batches are **capped** (`batchLimit`, over-cap → `-32600`), fanned out with **bounded concurrency** (never an unbounded `Promise.all`), fronted by an **IP/global pre-buffer 429** (the multiplexed mount has `op === null`, so a `by:"user"` limiter falls back to IP), and constrained by a **tighter `bodyLimit`** than the 50 MB default.


### Expose one resource as JSON-RPC only + the inferred typed client (the headline)

**Level:** Simple · **Transports:** `rpc`

Take a pre-built `defineResource` output, register it, `build()` the typed registry, and `project` with **only** `RpcProjector` so `/rpc` is the sole surface. Then `createRpcClient<typeof registry.typed>(url)` gives a fully-typed, codegen-free client keyed by `op.id`.

```ts
// switchboard/src/server.mts — HOST BOOT (the one-time wiring for non-GraphQL transports).
// JSON-RPC is projected HERE, never from a package's <pkg>/subgraphs seam (§12.1).
import {
  SwitchboardApi, RpcProjector, createRpcClient,
  rateLimit, observability, logging,
  type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";
import { invoiceRegistry } from "@acme/invoice-saf"; // defineResource(...) output (§7.7), keyed by op.id

// The host already runs reactor-api's GraphQLManager (the /graphql supergraph); these are host-owned.
declare const graphqlManager: GraphQLManager;
declare const authService: AuthService;
declare function buildProjectionDeps(gm: GraphQLManager, auth: AuthService): ProjectionDeps; // reads §13 accessors

// 1) Fold the resource's op ids into the registry generic R; install the default plugins.
const api = new SwitchboardApi({
  corsAllowlist: ["https://app.acme.example"],
  batchLimit: 50,   // JSON-RPC array-batch cap (§8.4)
  bodyLimit: "8mb", // tighter than the 50MB default — /rpc-specific hardening
})
  .register(invoiceRegistry)
  .use(rateLimit({ rpm: 600, by: "user", trustedProxyHops: 1 }), observability(), logging());

// 2) build() freezes the typed registry (runtime backstop: throws if any op has an undecided policy).
const registry = api.build(); // TypedRegistry<R>; registry.typed = { "invoice.list": OperationDef<…>, … }

// 3) Expose ONLY JSON-RPC: pass ONLY the RpcProjector. No GraphQL/REST/WS/webhook surface is mounted.
//    (build() returns the typed registry for the client type; project() is still called on `api`.)
await api.project([new RpcProjector()], buildProjectionDeps(graphqlManager, authService));

// 4) The inferred typed client — zero codegen, single source of truth (`typeof registry.typed`).
const client = createRpcClient<typeof registry.typed>("https://api.acme.example/rpc");

// Method key == op.id; input is InferIn<op.input>; result is InferOut<op.output> (closed + field-guarded).
const page = await client["invoice.list"]({ filter: { status: { in: ["open"] } }, limit: 25 });
//    page: { results: InvoiceOutput[]; nextCursor: string | null; totalCount?: number }

const created = await client["invoice.create"]({
  number: "INV-1001", counterparty: "0xA11ce", amount: 4200, currency: "USD", dueDate: "2026-08-01",
});

// @ts-expect-error — `invoice.changes` is a subscription; it is excluded from the client surface by design.
await client["invoice.changes"]({});
```

**Notes**

- **Single-transport by omission.** `api.project([new RpcProjector()], …)` mounts *only* `/rpc`. Adding GraphQL/REST/WS/webhook later is `+new XProjector()` in this same host-boot array — no edits to `invoiceRegistry` (OCP).
- **One source of truth.** `createRpcClient<typeof registry.typed>` infers method names and I/O from the exact ops you registered. No `{ "invoice.retrieve": … } as const` map to drift out of sync.
- **`build()` then `project()`, both on `api`.** `build()` returns the `TypedRegistry` you feed to the client generic; the transports are mounted by `api.project(...)` — the two are separate calls on the same `SwitchboardApi`.
- **Same pipeline as GraphQL.** Every call runs `rt.invoke` → fixed `safeParse` → fixed `authorize` → handler → fixed output projection. Authz can't diverge by transport.
- **Gotcha (drive-scoped ops).** `invoice.list` is `{ kind: "drive" }`, so its handler needs a validated `Drive-Id`. The no-arg `createRpcClient(url)` sends no headers — a bare `invoice.list` will `VALIDATION`/`421` unless a proxy injects `Drive-Id`. Inject auth + `Drive-Id` via a custom `fetchImpl` (Example 5).
- **Packaging honesty.** This projection is host boot, not package-shipped. Only the GraphQL subgraph ships from `<pkg>/subgraphs`.


### The wire: a JSON-RPC 2.0 request / response / error envelope

**Level:** Simple · **Transports:** `rpc`

What `client["invoice.list"](...)` actually sends and receives: `method == op.id`, `params` safeParsed, `result` is the closed `InferOut`, and `ApiError.code` maps to a numeric JSON-RPC code via the exhaustive `ERROR_RPC` record. Doing it by hand is exactly what the typed client does for you.

The buffered `/rpc` handler is mounted `authFetch(driveFetch(rpcHandler))` — the Bearer token is verified **before** drive routing.

```jsonc
// ── request ─────────────────────────────────────────────────────────────
POST https://api.acme.example/rpc
Authorization: Bearer <jwt>
Drive-Id: <driveId>
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "invoice.list",
  "params": { "filter": { "status": { "in": ["open"] } }, "limit": 25 } }

// ── success: `result` = InferOut<op.output>, already field-leak-guarded (ownerAddress stripped) ──
{ "jsonrpc": "2.0", "id": 1,
  "result": {
    "results": [ { "id": "inv_A", "number": "INV-1001", "status": "open", "counterparty": "0xA11ce",
                   "amount": 4200, "currency": "USD", "dueDate": "2026-08-01",
                   "createdAtUtc": "2026-07-19T10:00:00Z", "updatedAtUtc": "2026-07-19T10:00:00Z" } ],
    "nextCursor": "eyJjcmVhdGVkQXRVdGMiOiIyMDI2LTA3LTE5…", "totalCount": 12 } }

// ── error: ApiError.code → ERROR_RPC (VALIDATION here, from a disallowed filter op) ──
{ "jsonrpc": "2.0", "id": 1,
  "error": { "code": -32602,
             "message": "VALIDATION: filter.amount op 'like' is not allowed",
             "data": { "field": "amount", "op": "like" } } }
```

```ts
// Calling /rpc by hand is precisely what createRpcClient does under the hood.
import { ERROR_RPC } from "@powerhousedao/switchboard-api";

declare const jwt: string;
declare const driveId: string;

const res = await fetch("https://api.acme.example/rpc", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${jwt}`, "drive-id": driveId },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "invoice.list",
    params: { filter: { status: { in: ["open"] } }, limit: 25 },
  }),
});

const env = (await res.json()) as
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string; data?: unknown } };

if ("error" in env) {
  // ERROR_RPC is the exhaustive ApiErrorCode -> JSON-RPC numeric map the projector applied:
  if (env.error.code === ERROR_RPC.VALIDATION)      throw new Error(`bad params: ${env.error.message}`); // -32602
  if (env.error.code === ERROR_RPC.UNAUTHENTICATED) throw new Error("log in first");                     // -32001
  if (env.error.code === ERROR_RPC.RATE_LIMITED)    throw new Error("slow down");                         // -32029
  throw new Error(env.error.message);
}
```

**Notes**

- **`method` is literally `op.id`.** Globally unique, so there is no verb/namespace ambiguity on the wire.
- **`params` are safeParsed** against `op.input` by the fixed input stage — a malformed `params` never reaches the handler; it returns `-32602` (`VALIDATION`) with typed issue `data`.
- **`result` is closed.** The fixed output stage picks exactly the declared keys and applies `fieldGuards`, so internal columns (`ownerAddress`) cannot leak even if the read model row carries them.
- **Error mapping is exhaustive.** `ERROR_RPC` covers every `ApiErrorCode`: `-32602`/`-32001`/`-32003`/`-32004`/`-32009`/`-32029`/`-32603`. The HTTP status of the `/rpc` POST stays 200 for application-level JSON-RPC errors; transport 429 is separate (Example 4).
- **Gotcha.** Never send a GraphQL-shaped body here; the RPC handler dispatches purely on `method`, not `query`/`operationName`.


### Author fresh ops and expose them as JSON-RPC only (drive-scoped read + create write)

**Level:** Intermediate · **Transports:** `rpc`

Two raw `operation()` defs — a DRIVE-scoped collection read (`todo.list`, via the canonical `compileFilter` → keyset `paginator.apply` → `envelope` pipeline) and a create (`todo.create`) — showing the builder ordering rule (`.security()` before the terminal), the correct write path (`reactor.create`, never `execute` on a minted id), and RPC-only projection. The typed client then calls both.

```ts
// packages/todo-saf/src/todo.saf.ts (transport-agnostic ops) + host boot (JSON-RPC only).
import { z } from "zod";
import {
  SwitchboardApi, operation, RpcProjector, createRpcClient,
  compileFilter, keyset, rateLimit, observability, logging,
  type FilterSet, type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { PagingOptions } from "@powerhousedao/reactor/shared/types";
import { makeTodoDocument } from "@acme/todo-model";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";

// Read model. `ownerAddress` is internal and MUST NOT leak — the closed output DTO omits it.
interface TodoRow { id: string; title: string; done: boolean; ownerAddress: string; createdAtUtc: string; }
interface TodoDb { todo: TodoRow }
class TodoReadModel extends RelationalDbProcessor<TodoDb> {
  /* initAndUpgrade() builds the indexed `todo` table; onOperations() projects actions into rows. Omitted. */
}

const TodoOutput = z.object({
  id: z.string(), title: z.string(), done: z.boolean(), createdAtUtc: z.string(),
}).strict(); // CLOSED — the field-leak guard; ownerAddress can never be projected out

// Closed filter + keyset paginator — an unlisted field/op → ApiError("VALIDATION") inside compileFilter;
// the paginator owns the opaque seek cursor (no hand-rolled offset math).
const todoFilterable: FilterSet<TodoRow> = { done: { type: "boolean", ops: ["eq"] } };
const todoPaginator = keyset<TodoRow>({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 });

// todo.list — a COLLECTION read via the canonical pipeline: compileFilter (closed allowlist) →
// keyset paginator.apply (seek, opaque cursor) → envelope (PagedResults). requires "db"; DRIVE-scoped,
// NOT { kind: "authenticated" } (that is the Drive-Id IDOR: an authenticated caller could read any
// tenant's list by swapping the header).
const todoList = operation("todo.list")
  .input(z.object({
    filter: z.object({ done: z.object({ eq: z.boolean() }).optional() }).optional(), // { field: { op: value } }
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(100).default(25),
  }))
  .output(z.object({ results: z.array(TodoOutput), nextCursor: z.string().nullable() }).strict())
  .requires("db")                                                              // ctx.caps.db now available
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }) // ← auth DECIDED here…
  .query(async (input, ctx) => {                                               //   …so .query is callable
    const page: PagingOptions = { cursor: input.cursor ?? "", limit: input.limit };
    let qb = TodoReadModel.query(ctx.driveId!, ctx.caps.db).selectFrom("todo");
    qb = compileFilter(todoFilterable, input.filter ?? {})(qb);                 // VALIDATION on unlisted field/op
    qb = todoPaginator.apply(qb, [{ field: "createdAtUtc", dir: "desc" }], page); // seek + limit (dir may flip)
    const rows = await qb.selectAll().execute();
    return todoPaginator.envelope(rows, page);                                 // PagedResults → stripped to TOut
  });

// todo.create — a WRITE. requires "reactor"; { kind: "create" }; uses reactor.create — NEVER execute() on a
// freshly-minted id (execute only mutates EXISTING documents).
const todoCreate = operation("todo.create")
  .input(z.object({ title: z.string().min(1) }))
  .output(TodoOutput)
  .requires("reactor")
  .security({ kind: "create" })
  .mutation(async (input, ctx) => {
    const doc = await ctx.caps.reactor.create(makeTodoDocument({ title: input.title }));
    return { id: doc.header.id, title: input.title, done: false, createdAtUtc: doc.header.createdAtUtcIso };
  });

// ── host boot: JSON-RPC ONLY ──
declare const graphqlManager: GraphQLManager;
declare const authService: AuthService;
declare function buildProjectionDeps(gm: GraphQLManager, auth: AuthService): ProjectionDeps;

const api = new SwitchboardApi({ batchLimit: 50, bodyLimit: "8mb" })
  .register(todoList, todoCreate)                                    // raw ops fold in by op.id
  .use(rateLimit({ rpm: 600, by: "user" }), observability(), logging());
const registry = api.build();
await api.project([new RpcProjector()], buildProjectionDeps(graphqlManager, authService)); // ONLY rpc

const client = createRpcClient<typeof registry.typed>("https://api.acme.example/rpc");
const created = await client["todo.create"]({ title: "write the cookbook" }); // InferIn: { title: string }
const first   = await client["todo.list"]({ limit: 10 });                       // `limit` optional (has default)
```

**Notes**

- **Builder ordering is type-enforced.** Until `.security()` (or `.public()`) runs, the `.query`/`.mutation` property has type `AuthNotDecided` — literally uncallable. "Forgot to authorize" is a call-site red squiggle, not a runtime surprise. `build()` re-validates as a backstop.
- **Collection reads must be drive-scoped.** `{ kind: "drive", drive: (_i, ctx) => ctx.driveId! }` authorizes the drive *before* the query runs, closing the Drive-Id IDOR. `{ kind: "authenticated" }` here would let any logged-in caller enumerate another tenant's todos by swapping `Drive-Id`.
- **Closed read pipeline (not a hand-rolled query).** `todo.list` runs `compileFilter(todoFilterable, …)` — a `FilterSet` allowlist, so an unlisted field/op is `VALIDATION`, never silently applied — then the `keyset` paginator's `apply`, which *consumes* the opaque `cursor` so `{ cursor }` actually seeks the next page, then `envelope`. The handler returns `PagedResults`; the fixed output stage strips it to the closed `{ results, nextCursor }`.
- **Write path.** `reactor.create(makeTodoDocument(...))` performs *real creation* and returns the new `PHDocument` (`doc.header.id`, `doc.header.createdAtUtcIso`). You must not `execute()` against an id you just minted — `execute` only mutates documents that already exist.
- **Capability gating.** `ctx.caps.db` exists only because `todo.list` declared `.requires("db")`; `ctx.caps.reactor` only because `todo.create` declared `.requires("reactor")`. A read op cannot reach the write client.
- **InferIn ergonomics.** `limit` has `.default(25)`, so on the wire it's optional — `client["todo.list"]({})` is valid and the server applies the default.


### Batch hardening: cap + bounded concurrency + IP pre-buffer 429 + tight bodyLimit

**Level:** Advanced · **Transports:** `rpc`

A JSON-RPC array batch is capped by `batchLimit` (over-cap → `-32600`), fanned out with bounded concurrency, and fronted by an IP/global pre-buffer 429 even under a `by:"user"` limiter — because the multiplexed `/rpc` mount has `op === null`. The tighter `bodyLimit` stops a 50 MB array from ever being buffered.

The hardening lives in **host config** — `batchLimit` + `bodyLimit` on `SwitchboardApi`, and the rate-limit plugin whose `asFetchMiddleware` fronts the `/rpc` mount.

```ts
// switchboard/src/server.mts — the /rpc DoS + limiter-bypass defenses (§8.4).
import { SwitchboardApi, RpcProjector, rateLimit, observability, logging } from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "@acme/invoice-saf";

const api = new SwitchboardApi({
  corsAllowlist: ["https://app.acme.example"],
  batchLimit: 50,   // a JSON array of > 50 entries → JSON-RPC -32600 (Invalid Request), BEFORE any op runs
  bodyLimit: "8mb", // the /rpc mount does NOT inherit the 50MB default — a 50MB array can't even be buffered
})
  .register(invoiceRegistry)
  // by:"user" throttles authenticated ops, but the MULTIPLEXED /rpc mount has op === null, so the limiter
  // FALLS BACK to an IP/global pre-buffer 429 — a batch bomb is rejected before the body is expanded.
  .use(rateLimit({ rpm: 600, by: "user", trustedProxyHops: 1 }), observability(), logging());

// ...const registry = api.build(); await api.project([new RpcProjector()], deps);  // as in Example 1
```

```jsonc
// A JSON-RPC batch is a JSON ARRAY. It is capped (batchLimit) and fanned out with BOUNDED concurrency
// (never an unbounded Promise.all), then reassembled by id. EACH sub-call still runs the fixed
// safeParse + authorize stages — a batch cannot smuggle a call past authz.

// ── request (3-call batch) ──
[ { "jsonrpc": "2.0", "id": 1, "method": "invoice.retrieve", "params": { "id": "inv_A" } },
  { "jsonrpc": "2.0", "id": 2, "method": "invoice.retrieve", "params": { "id": "inv_B" } },
  { "jsonrpc": "2.0", "id": 3, "method": "invoice.update",   "params": { "id": "inv_C", "amount": 999 } } ]

// ── response: per-call results/errors, order-independent, keyed by id (each `result` is the full,
//    closed InferOut — abbreviated here to keep the batch shape legible).
//    item 2 failed per-item authz (-32003 FORBIDDEN); item 3 was throttled (-32029 RATE_LIMITED). ──
[ { "jsonrpc": "2.0", "id": 1, "result": { "id": "inv_A", "amount": 4200, "status": "open" } },
  { "jsonrpc": "2.0", "id": 2, "error": { "code": -32003, "message": "FORBIDDEN: not a reader of inv_B" } },
  { "jsonrpc": "2.0", "id": 3, "error": { "code": -32029, "message": "RATE_LIMITED: 600 rpm exceeded" } } ]

// ── over the cap: a 5,000-entry array is rejected WHOLE, before any op executes ──
{ "jsonrpc": "2.0", "id": null,
  "error": { "code": -32600, "message": "batch of 5000 exceeds batchLimit 50" } }
```

**Notes**

- **Bounded concurrency, not `Promise.all`.** A within-cap batch of expensive ops can't spawn 50 simultaneous DB/reactor calls; the fan-out is width-limited, so batch != amplification.
- **Pre-buffer 429 closes the limiter bypass.** On the multiplexed mount `op === null`, so a `by:"user"` policy can't key on a per-op identity for the envelope itself; `rateLimit().asFetchMiddleware` applies an IP/global 429 *before* the body is parsed. `trustedProxyHops` bounds how far back the client IP is trusted (anti-spoof).
- **Tight `bodyLimit` is the first gate.** `/rpc` overrides the 50 MB default so an oversized array is rejected at read time — it is never buffered, parsed, and expanded into hundreds of thousands of pipeline entries.
- **Per-item authz still fires.** Every sub-request goes through the fixed `authorize` stage independently (note item 2's `-32003`). A batch grants no authz shortcut.
- **Gotcha (typed client + batching).** `createRpcClient` issues **one HTTP request per method call**, so `Promise.all([client.a(), client.b()])` is N requests, not one JSON-RPC batch. Batching is a manual wire optimization; hand-build the array body when you need it.


### Cross-service typed client: custom fetchImpl, InferIn vs InferOut, subscriptions excluded

**Level:** Advanced · **Transports:** `rpc`

A separate process consumes the API with full types and no codegen by importing `typeof registry.typed`. The `fetchImpl` is the only seam for auth + drive selection; the client input is `InferIn` (wire type, pre-transform); `subscription` ops are a compile-time exclusion; and errors decode against `ERROR_RPC`.

```ts
// @acme/invoice-saf/src/api.ts (SERVER) — export the registry TYPE as the client's single source of truth.
import { SwitchboardApi, rateLimit, observability, logging } from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "./invoice.saf";

export const api = new SwitchboardApi({ batchLimit: 50, bodyLimit: "8mb" })
  .register(invoiceRegistry)
  .use(rateLimit({ rpm: 600, by: "user" }), observability(), logging());
export const registry = api.build();
export type AcmeApi = typeof registry.typed;   // { "invoice.list": OperationDef<…>, … } — the wire contract
```

```ts
// services/billing-worker/src/client.ts (a DIFFERENT process) — fully typed, ZERO codegen.
import { createRpcClient, ERROR_RPC, type InferIn } from "@powerhousedao/switchboard-api";
import type { AcmeApi } from "@acme/invoice-saf";   // import the TYPE only; no runtime dep on the server

// createRpcClient takes just (url, fetchImpl?). The fetchImpl is the ONLY place to inject the Bearer token
// and the Drive-Id, so one client instance is scoped to one drive — rebuild the closure per drive.
function forDrive(driveId: string, token: () => string): typeof fetch {
  return (url, init) =>
    fetch(url, { ...init, headers: { ...init?.headers, authorization: `Bearer ${token()}`, "drive-id": driveId } });
}

const client = createRpcClient<AcmeApi>(
  "https://api.acme.example/rpc",
  forDrive(process.env.DRIVE_ID!, () => process.env.SVC_JWT!),
);

// Input is InferIn — the PRE-parse WIRE type. If invoice.create's schema transforms a field server-side
// (e.g. dueDate: z.string() -> Date), the client still passes the wire form (a string), never the Date.
type CreateIn = InferIn<AcmeApi["invoice.create"]["input"]>; // { number: string; …; dueDate: string }
const created = await client["invoice.create"]({
  number: "INV-2002", counterparty: "0xB0b", amount: 900, currency: "EUR", dueDate: "2026-09-01",
});
//    created: InferOut<…output> — { id, number, status, …, createdAtUtc }; ownerAddress never present.

// Subscriptions are removed from the client surface by the ApiClient mapped type — a compile-time guarantee.
// @ts-expect-error — 'invoice.changes' is a subscription; use WS/SSE, not RPC.
await client["invoice.changes"]({});

// Errors surface the JSON-RPC error object; decode against the exhaustive ERROR_RPC map.
try {
  await client["invoice.update"]({ id: "inv_Z", amount: 100 });
} catch (e) {
  const code = (e as { code?: number }).code;
  if (code === ERROR_RPC.NOT_FOUND)      { /* -32004: reconcile a deleted invoice */ }
  else if (code === ERROR_RPC.FORBIDDEN) { /* -32003: this principal is not a writer */ }
  else if (code === ERROR_RPC.CONFLICT)  { /* -32009: write conflict — retry with fresh state */ }
  else throw e;
}
```

**Notes**

- **Zero codegen, one source of truth.** The worker imports only the *type* `AcmeApi = typeof registry.typed`. Add/rename/remove an op on the server and the client's method set changes at compile time — no schema dump, no generated SDK to regenerate.
- **`InferIn`, not `InferOut`.** The client sends what the wire carries. A coercing/transforming input schema (string → Date, string → number) is applied *server-side*; callers never pre-apply the transform. `InferIn<AcmeApi["invoice.create"]["input"]>` makes that contract inspectable.
- **Subscriptions can't be called.** The `ApiClient` mapped type drops `OperationDef<…,"subscription",…>` keys, and the RPC projector also rejects them at runtime — belt and suspenders.
- **Auth/drive live in `fetchImpl`.** Because the signature is `(url, fetchImpl?)`, per-drive routing is a closure concern; a client is effectively drive-scoped. For multi-drive workers, keep a small `Map<driveId, client>`.
- **Errors are typed codes.** Decode against `ERROR_RPC` (`-32004`/`-32003`/`-32009`/…) rather than string-matching messages; the map is exhaustive over `ApiErrorCode`.


---

## 6. Webhooks only (outbound + inbound)

Webhooks are the one transport SAF makes **durable** but not distributed, and the one place a naive fan-out becomes a cross-tenant exfiltration primitive — so both directions are deliberately hardened. **Outbound** delivery is *not* a raw stream of document changes: it re-runs the exact same authorization + output-redaction pipeline every other transport uses, once per subscriber, then signs and enqueues to a SAF-owned outbox for at-least-once egress. **Inbound** delivery lands on a `mountNodeRoute` POST that must verify HMAC and a timestamp replay window in-handler *before* it touches the pipeline, because HMAC authenticates the *sender* but establishes no Powerhouse identity.

The mental model: an outbound webhook op just adds `meta({ webhook: { event: "invoice.created" } })` to a normal op you already wrote (its GraphQL/REST/RPC projections are unchanged). The `WebhookProjector` — wired once in host boot alongside the other projectors — subscribes to the in-process pubsub stream, and for each changed document, for each registered subscriber, it invokes the resource's read op *under that subscriber's identity and that subscriber's own drive*. That single `rt.invoke` is what runs the per-subscriber read authorization (the read op's `{ kind: "document", access: "read" }` policy → `canRead` on the document), drops internal columns via the closed output schema, and applies per-field `fieldGuards` — deny-by-default, automatically. Because the read op is drive-scoped to the subscriber's registered `driveId`, a document outside that drive returns `NOT_FOUND` and is skipped — the webhook analogue of drive-scoping, with no Drive-Id IDOR (the subscriber's drive is fixed at authorization-gated registration, not attacker-controlled). An SSRF-guarded egress worker closes the last hole.

Inbound is the mirror image and the subtler security story: the receiver is the *only* place allowed to translate "this HMAC verified" into "act as identity X." It either targets a `{ kind: "public" }` op (the transport HMAC is the whole gate, a greppable opt-out of document authz) **or** mints a context carrying a configured **service principal** so a real, auditable identity is attributed to the write. Everything below reuses one signing convention (`X-PH-Signature` / `X-PH-Timestamp`) and the `Invoice` / `GithubEvent` domains so the cookbook reads as one system.


### Declare an outbound webhook event on a create op

**Level:** Simple · **Transports:** `webhook`

Turning a normal `invoice.create` mutation into an event source is one line: `.meta({ webhook: { event: "invoice.created" } })`. The handler, validation, authz and output schema are untouched — the same definition still projects to GraphQL/REST/RPC. Adding `WebhookProjector` to the host boot lights up per-subscriber egress. This example shows the op, the one-time wiring, and the exact bytes delivered on the wire.

```ts
import { z } from "zod";
import {
  operation, SwitchboardApi,
  GraphqlProjector, RestProjector, RpcProjector, WebhookProjector,
  rateLimit, observability, logging,
} from "@powerhousedao/switchboard-api";
import { makeInvoiceDocument } from "@acme/invoice-model";

// The DTO is CLOSED (.strict()): the fixed output stage picks exactly these keys,
// so the read-model's internal `ownerAddress` (the tenant column) can never leak
// into a delivered payload — this is the field-leak guard, enforced for webhooks too.
const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();

export const createInvoice = operation("invoice.create")
  .input(InvoiceCreate)
  .output(InvoiceOutput)
  .requires("reactor")
  .meta({ webhook: { event: "invoice.created", retries: 8 } }) // <-- the ENTIRE opt-in to egress
  .security({ kind: "create" }) // auth decided BEFORE .mutation is callable (else AuthNotDecided)
  .mutation(async (input, ctx) => {
    // CREATE = real creation. NEVER execute() against a freshly-minted id (execute only mutates
    // EXISTING documents). reactor.create(document) returns the created PHDocument.
    const doc = await ctx.caps.reactor.create(makeInvoiceDocument(input));
    return {
      id: doc.header.id, number: input.number, status: "draft" as const,
      counterparty: input.counterparty, amount: input.amount, currency: input.currency,
      dueDate: input.dueDate,
      createdAtUtc: doc.header.createdAtUtcIso,       // real PHDocumentHeader fields
      updatedAtUtc: doc.header.lastModifiedAtUtcIso,
    };
  });

// ── Host boot (switchboard/src/server.mts) — wire the projectors ONCE ──────────────
// Outbound webhook egress is a SIDE EFFECT of a write that arrives over an ingress transport,
// so the create op still needs GraphQL/REST/RPC to be callable; WebhookProjector layers egress
// ON TOP. (A pure single-transport restriction applies to the INBOUND receivers below.)
const api = new SwitchboardApi({ corsAllowlist, batchLimit: 50, bodyLimit: "8mb" })
  .register(createInvoice /* , invoiceRegistry, ... */)
  .use(rateLimit({ rpm: 600 }), observability(), logging())
  .build();

await api.project(
  // The WebhookProjector is the ONLY thing that turns webhook meta into deliveries.
  // REST/RPC/WS/webhook are host-wired here (they cannot ship from a package seam).
  [new GraphqlProjector(), new RestProjector(), new RpcProjector(), new WebhookProjector()],
  buildProjectionDeps(graphqlManager, authService),
);

// ── What an authorized subscriber actually receives ───────────────────────────────
// POST https://acme.example.com/hooks/ph  HTTP/1.1
// content-type: application/json
// X-PH-Timestamp: 1752969600000
// X-PH-Signature: sha256=9f86d081...   (= HMAC-SHA256(secret, `${ts}.${body}`))
//
// {"id":"inv_01J8...","type":"invoice.created","ts":1752969600000,
//  "data":{"id":"inv_01J8...","number":"INV-1007","status":"draft",
//          "counterparty":"Globex","amount":420,"currency":"USD",
//          "dueDate":"2026-08-01","createdAtUtc":"2026-07-19T00:00:00.000Z",
//          "updatedAtUtc":"2026-07-19T00:00:00.000Z"}}
//                     ^ note: NO `ownerAddress` field — the closed output schema dropped it.
```

**Notes**

- **Why it works:** `webhook` is just `OperationDef` metadata (Appendix A §5). The op is defined once; GraphQL/REST/RPC projections are identical whether or not the meta is present. The `WebhookProjector` reads the registry and only egresses ops that declared an event.
- **Security:** the delivered `data` is produced by the op's own closed output schema, so internal columns (`ownerAddress`) are structurally un-leakable — the same guarantee that protects the REST/GraphQL responses.
- **Builder ordering:** `.meta()` returns `this`, so it may sit anywhere before the terminal; `.security({ kind: "create" })` must come before `.mutation` — until auth is decided the terminal is typed `AuthNotDecided` and won't compile.
- **Single-transport note:** an outbound webhook is not an ingress projection you can restrict to — the write arrives via GraphQL/REST/RPC and the webhook fires downstream. The genuinely single-transport case (webhook is the ingress) is the inbound receiver, wired with `api.project([oneProjector], deps)` below.
- **Gotcha:** `webhook.event` alone delivers nothing without `WebhookProjector` in `api.project([...])`. Only the GraphQL projection ships through the `<pkg>/subgraphs` package seam; webhook egress is host-wired in `server.mts` (§12).
- **Gotcha:** `retries` is a hint to the outbox worker (backoff/dead-letter), not a synchronous retry inside the request.


### A subscriber verifying the X-PH-Signature HMAC

**Level:** Intermediate · **Transports:** `webhook`

The consumer side of an outbound webhook (not SAF code — this is what an integrator writes). Verify the signature over the RAW request body (never a re-serialized JSON), enforce a timestamp replay window, and use a constant-time compare. This is the exact counterpart to the signing the `OutboxWorker` in the next example performs, and the reference for anyone integrating against a SAF endpoint.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const WEBHOOK_SECRET = process.env.PH_WEBHOOK_SECRET!; // the per-subscriber shared secret
const REPLAY_WINDOW_MS = 5 * 60_000;                    // reject anything older/newer than 5 min

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb); // length check guards timingSafeEqual
}

/** Returns true iff the delivery is authentic AND inside the replay window. */
export function verifyPhWebhook(rawBody: string, headers: IncomingMessage["headers"]): boolean {
  const sig = String(headers["x-ph-signature"] ?? "");
  const tsHeader = String(headers["x-ph-timestamp"] ?? "");
  const ts = Number(tsHeader);

  // 1) Replay window FIRST — a stale-but-valid signature must still be rejected.
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return false;

  // 2) Recompute over `${ts}.${rawBody}` — binding the timestamp INTO the MAC is what
  //    makes the replay window tamper-proof (an attacker can't rewrite the header alone).
  const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET)
    .update(`${tsHeader}.${rawBody}`).digest("hex");

  return safeEq(expected, sig);
}

// ── Minimal receiver (framework-agnostic Node) ──────────────────────────────────
function readRaw(req: IncomingMessage, maxBytes = 512 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error("payload too large")); return; }
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function handleInvoiceCreated(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readRaw(req); // RAW bytes: JSON.parse+stringify would change bytes -> MAC fails
  if (!verifyPhWebhook(rawBody, req.headers)) { res.statusCode = 401; res.end(); return; }

  const evt = JSON.parse(rawBody) as {
    id: string; type: string; ts: number; data: { id: string; amount: number; currency: string };
  };
  // ... your logic. `evt.data` is already redacted to what YOU are authorized to see.
  res.statusCode = 200; res.end();
}
```

**Notes**

- **Why `${ts}.${rawBody}`:** signing the timestamp together with the body means the replay window can't be defeated by editing the `X-PH-Timestamp` header — any change to either invalidates the MAC. Note SAF signs with the numeric `ts` coerced to a string (`String(ts)`), so verify against the raw `X-PH-Timestamp` header value, not a re-parsed number.
- **Security:** always verify over the RAW bytes. Re-serializing (`JSON.parse` then `JSON.stringify`) reorders keys / changes whitespace and breaks an otherwise-valid signature.
- **Security:** `timingSafeEqual` throws on length mismatch, so gate it with an explicit length check; comparing with `===` leaks timing.
- **Gotcha:** the replay window needs roughly synchronized clocks. 5 minutes is a reasonable default; pair it with delivery-id idempotency (next examples) if you need exactly-once processing.
- **Gotcha:** cap the body size while reading; an unbounded `req.on('data')` accumulator is a memory-exhaustion vector.


### Inside the WebhookProjector: per-subscriber authz, redaction, outbox and SSRF-guarded egress

**Level:** Advanced · **Transports:** `webhook`

The host-side machinery that makes outbound safe. One ref-counted `ensureGlobalDocumentSubscription` feeds the in-process pubsub; per event, per subscriber, the projector invokes the resource's `retrieve` op UNDER THE SUBSCRIBER'S IDENTITY AND DRIVE — which is exactly what runs `canRead` + output-pick + `fieldGuards`, and (because `retrieve` is drive-scoped) drops documents outside the subscriber's drive. Deliveries are enqueued to a SAF-owned outbox; the worker signs each and delivers through a mandatory SSRF guard (HTTPS-only, blocked IP ranges, resolve-then-pin, no cross-host redirect, timeout, size cap).

```ts
import { createHmac, randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";
import {
  type TransportProjector, type OperationRegistry, type ProjectionRuntime,
  type ProjectionDeps, ApiError,
} from "@powerhousedao/switchboard-api";
import {
  ensureGlobalDocumentSubscription, SUBSCRIPTION_TRIGGERS, type DocumentChangesPayload,
} from "@powerhousedao/reactor-api/graphql/reactor/pubsub";
import type { CanonicalDocumentId } from "@powerhousedao/reactor-api/services/authorization.service";
import { DocumentChangeType, type DocumentChangeEvent } from "@powerhousedao/reactor";

// A registered, AUTHORIZATION-GATED subscriber. Registration is itself an authz-gated op that
// validates the URL up-front and proves the subscriber may read `driveId` — so `driveId` and
// `ownerAddress` are TRUSTED here (not attacker-controlled per delivery).
interface Subscriber {
  id: string; url: string; secret: string; event: string;
  ownerAddress: string; driveId: string;
}
interface SubscriberStore { listFor(event: string): Promise<Subscriber[]>; }

// SAF-OWNED outbox (its own write handle — a RelationalDbProcessor's ctx.caps.db is read-only
// and can only write inside onOperations, so it structurally cannot back an imperative outbox).
interface OutboxRow {
  id: string; subscriberId: string; url: string; secret: string;
  event: string; docId: string; data: unknown; attempts: number;
}
interface Outbox { enqueue(row: OutboxRow): Promise<void>; }

function changeTypeSuffix(t: DocumentChangeType): "created" | "updated" | "deleted" | null {
  if (t === DocumentChangeType.Created) return "created";
  if (t === DocumentChangeType.Updated) return "updated";
  if (t === DocumentChangeType.Deleted) return "deleted";
  return null; // parent/child link changes do not map to a CRUD lifecycle event
}

/** documentType -> [{ event, retrieveOpId }] — render each event through its resource's read op. */
function webhookBindings(reg: OperationRegistry): Map<string, { event: string; retrieveOpId: string }[]> {
  const byType = new Map<string, { event: string; retrieveOpId: string }[]>();
  for (const resource of reg.resources) {
    for (const [id, op] of reg.operations) {
      if (!op.webhook || !id.startsWith(resource.name + ".")) continue;
      const list = byType.get(resource.documentType) ?? [];
      list.push({ event: op.webhook.event, retrieveOpId: `${resource.name}.retrieve` });
      byType.set(resource.documentType, list);
    }
  }
  return byType;
}

export class WebhookProjector implements TransportProjector {
  readonly transport = "webhook" as const;
  constructor(private readonly subs: SubscriberStore, private readonly outbox: Outbox) {}

  project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void {
    const bindings = webhookBindings(registry);
    if (bindings.size === 0) return;

    // ONE global subscription (ref-counted) bridges reactor -> in-process pubsub.
    const release = ensureGlobalDocumentSubscription(rt.reactor);
    const stream = deps.pubsub.asyncIterator<DocumentChangesPayload>(
      SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
    );

    void (async () => {
      try {
        for await (const { documentChanges } of stream) {
          await this.fanOut(documentChanges, bindings, rt)
            .catch((e) => console.error("[webhook] fan-out failed", e));
        }
      } finally { release(); } // hold `release` for the projector's lifetime; call it on dispose
    })();
  }

  private async fanOut(
    change: DocumentChangeEvent,
    bindings: Map<string, { event: string; retrieveOpId: string }[]>,
    rt: ProjectionRuntime,
  ): Promise<void> {
    const suffix = changeTypeSuffix(change.type);
    if (!suffix) return;

    for (const doc of change.documents) {
      const events = bindings.get(doc.header.documentType);
      if (!events) continue;

      // Document change events carry canonical ids (never slugs), so this cast is sound.
      const docId = doc.header.id as CanonicalDocumentId;

      for (const { event, retrieveOpId } of events) {
        if (!event.endsWith(suffix)) continue; // invoice.created fires only on Created, etc.

        for (const sub of await this.subs.listFor(event)) {
          // Build a context that IS the subscriber, carrying the subscriber's OWN trusted driveId,
          // then reuse the FULL pipeline. This single invoke runs: validation -> authz (the retrieve
          // op's { kind: "document", access: "read" } policy => canRead(docId, sub.ownerAddress)) ->
          // output pick (drops ownerAddress) -> fieldGuards. Because retrieve reads the DRIVE-SCOPED
          // read model at ctx.driveId, a document outside the subscriber's drive returns NOT_FOUND
          // and is skipped below. That is the webhook analogue of drive-scoping — and there is no
          // Drive-Id IDOR, because sub.driveId was fixed at authorization-gated registration.
          const ctx = await rt.makeContext(
            { user: { address: sub.ownerAddress, chainId: 0, networkId: "webhook" }, driveId: sub.driveId },
            "webhook",
          );

          let data: unknown;
          try {
            data = await rt.invoke(retrieveOpId, { id: docId }, ctx);
          } catch (e) {
            // Fail-closed: a subscriber who cannot read this doc (or whose drive lacks it) is skipped.
            if (e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")) continue;
            throw e;
          }

          await this.outbox.enqueue({
            id: randomUUID(), subscriberId: sub.id, url: sub.url, secret: sub.secret,
            event, docId, data, attempts: 0,
          });
        }
      }
    }
  }
}

// ═══════════ The durable, SSRF-guarded delivery worker ════════════════════════════
export class OutboxWorker {
  constructor(private readonly maxAttempts = 8) {}

  /** HTTPS-only + resolve-then-PIN the IP + reject non-public ranges. Returns a pinned dispatcher. */
  private async ssrfSafeDispatcher(rawUrl: string): Promise<Agent> {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") throw new ApiError("VALIDATION", "webhook url must be https");

    const { address, family } = await dnsLookup(url.hostname); // resolve ONCE
    const parsed = ipaddr.parse(address);
    // "unicast" is the only routable-public class; everything else (loopback/linkLocal/private/
    // uniqueLocal/reserved) covers 127/8, 169.254/16 (incl. cloud metadata), 10/8, 172.16/12,
    // 192.168/16, ::1, fc00::/7 — all rejected.
    if (parsed.range() !== "unicast") throw new ApiError("FORBIDDEN", `blocked range: ${parsed.range()}`);

    // PIN the socket to the address we validated — undici connects HERE regardless of a second
    // DNS answer, defeating DNS-rebinding TOCTOU. Cross-host redirects are refused below.
    return new Agent({
      connect: { lookup: (_h, _o, cb) => cb(null, address, family as 4 | 6) },
    });
  }

  async deliver(row: OutboxRow): Promise<"delivered" | "retry" | "dead"> {
    const ts = Date.now();
    const body = JSON.stringify({ id: row.docId, type: row.event, data: row.data, ts });
    const signature = "sha256=" + createHmac("sha256", row.secret).update(`${ts}.${body}`).digest("hex");

    let dispatcher: Agent;
    try { dispatcher = await this.ssrfSafeDispatcher(row.url); }
    catch { return "dead"; } // a bad/internal URL never becomes deliverable — dead-letter it

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5_000); // hard timeout
    try {
      const res = await fetch(row.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-PH-Signature": signature,
          "X-PH-Timestamp": String(ts),
        },
        body, signal: ac.signal,
        redirect: "error", // NEVER follow a redirect to a fresh, unvalidated host
        // @ts-expect-error — undici extends RequestInit with `dispatcher`
        dispatcher,
      });
      await readCapped(res.body, 64 * 1024); // response-size cap (drain, bounded)
      if (res.ok) return "delivered";
      return row.attempts + 1 >= this.maxAttempts ? "dead" : "retry";
    } catch {
      return row.attempts + 1 >= this.maxAttempts ? "dead" : "retry";
    } finally { clearTimeout(timer); }
  }
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, max: number): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    if (seen > max) { await reader.cancel(); break; }
  }
}
```

**Notes**

- **Why it closes the exfil hole:** the naive draft subscribed to every change process-wide, filtered by type only, and shipped raw rows — Tenant A's hook got Tenant B's invoices. Here each delivery is produced by `rt.invoke(retrieve, {id}, subscriberCtx)`, so the retrieve op's `{ kind: "document", access: "read" }` policy runs `canRead(docId, sub.ownerAddress)` and the closed output + `fieldGuards` redact per identity. Deny-by-default is restored.
- **Drive scope (no doc-to-drive lookup needed):** each subscriber invoke carries the subscriber's OWN registered `driveId`, and `retrieve` reads the drive-scoped read model — so a document that is not in the subscriber's drive simply returns `NOT_FOUND` and is skipped (fail-closed). There is no Drive-Id IDOR because `sub.driveId` is not attacker-controlled; it was authorized when the subscriber registered. (Do NOT try to derive a document's drive from `authorizer.canonical()` — that returns the document's own `CanonicalDocumentId`, not a drive.)
- **Durability vs distribution:** the outbox gives at-least-once egress across restarts; fan-out is still single-process (`getPubSub()` is one in-process PubSub). Durable ≠ distributed — multi-instance needs an external broker (§15).
- **SSRF (mandatory):** HTTPS-only, resolve-then-pin the IP, reject any non-`unicast` range (loopback / link-local incl. `169.254.169.254` metadata / RFC-1918 / ULA), `redirect: "error"`, a timeout, and a response-size cap. Without the pin, a rebinding DNS answer between validate and connect re-opens the hole; production should also keep a vetted CIDR denylist alongside the socket pin.
- **Gotcha:** `ensureGlobalDocumentSubscription` is ref-counted — hold the returned `release` for the projector's lifetime and call it on dispose, or the global reactor subscription leaks.
- **Gotcha:** never re-run a *mutation* op to render egress — render through the resource's `retrieve` (a query). Re-invoking create would duplicate side effects.


### Inbound GithubEvent receiver into a public op

**Level:** Intermediate · **Transports:** `webhook`

The receiving direction. `mountNodeRoute("POST", ...)` gives raw Node req/res (the Fetch middleware chain — including auth and the body parser — does NOT wrap node routes), so we read the raw body, verify HMAC + a timestamp replay window, dedupe on delivery id, and only then `rt.invoke` into a create op. Because an HMAC establishes no Powerhouse identity, the target op is `.public()` — the greppable opt-out — and the transport HMAC is the whole gate. Wired as a single-transport projection in the host boot.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  operation, SwitchboardApi, rateLimit, observability, logging,
  type TransportProjector, type OperationRegistry,
  type ProjectionRuntime, type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import { makeGithubEventDocument } from "@acme/github-model";

// PUBLIC op: no ctx.user is established by an HMAC, so this op explicitly & greppably opts
// OUT of document authz. Safe ONLY because the receiver's HMAC check gates every call.
export const ingestGithubEvent = operation("githubEvent.ingest")
  .input(z.object({
    deliveryId: z.string(), event: z.string(), action: z.string().optional(),
    repo: z.string(), payload: z.record(z.string(), z.unknown()), // zod v4: record needs a key schema
  }).strict())
  .output(z.object({ id: z.string() }).strict())
  .requires("reactor")
  .public() // <-- the ONLY sanctioned opt-out of security; grep for `.public(` to audit
  .mutation(async (input, ctx) => {
    const doc = await ctx.caps.reactor.create(makeGithubEventDocument(input)); // CREATE = real creation
    return { id: doc.header.id };
  });

// ── The inbound projector ─────────────────────────────────────────────────────
const REPLAY_WINDOW_MS = 5 * 60_000;
const seen = new Map<string, number>(); // deliveryId -> firstSeenTs (idempotency / replay defense)

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
function end(res: ServerResponse, status: number, body = ""): void { res.statusCode = status; res.end(body); }
function readRaw(req: IncomingMessage, max = 512 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) { req.destroy(); reject(new Error("too large")); return; }
      data += c.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export class GithubInboundProjector implements TransportProjector {
  readonly transport = "webhook" as const;
  constructor(private readonly secret: string) {}

  project(_registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void {
    // Raw Node route: NOT wrapped by authFetch/driveFetch/bodyParser — we do our own authz here.
    deps.httpAdapter.mountNodeRoute("POST", `${deps.basePath}/webhooks/github`, async (req, res) => {
      let rawBody: string;
      try { rawBody = await readRaw(req); } catch { return end(res, 413); }

      const tsHeader = String(req.headers["x-ph-timestamp"] ?? "");
      const sig = String(req.headers["x-ph-signature"] ?? "");
      const ts = Number(tsHeader);

      // 1) timestamp replay window
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return end(res, 401);
      // 2) HMAC over `${ts}.${rawBody}` (constant-time), computed on RAW bytes
      const expected = "sha256=" + createHmac("sha256", this.secret).update(`${tsHeader}.${rawBody}`).digest("hex");
      if (!safeEq(expected, sig)) return end(res, 401);

      const body = JSON.parse(rawBody) as { deliveryId: string };
      // 3) idempotency / defense-in-depth replay: ack duplicates without re-processing
      if (seen.has(body.deliveryId)) return end(res, 200);
      seen.set(body.deliveryId, ts);

      // 4) Into the SAME pipeline every transport uses. ctx.user is UNDEFINED here — which is
      //    exactly why the target op must be public (it is). validation still runs on `body`.
      const ctx = await rt.makeContext({}, "webhook");
      try { await rt.invoke("githubEvent.ingest", body, ctx); return end(res, 202); }
      catch { return end(res, 500); }
    });
  }
}

// ── Host boot: project ONLY the inbound webhook receiver (single-transport, host-wired) ──────────
// A custom TransportProjector, like every non-GraphQL transport, is wired here in server.mts —
// it cannot ship from a package's <pkg>/subgraphs seam. Passing ONLY it exposes githubEvent.ingest
// over the inbound webhook and nothing else.
const api = new SwitchboardApi({ corsAllowlist })
  .register(ingestGithubEvent)
  .use(rateLimit({ rpm: 600 }), observability(), logging())
  .build();

await api.project(
  [new GithubInboundProjector(process.env.PH_WEBHOOK_SECRET!)],
  buildProjectionDeps(graphqlManager, authService),
);
```

**Notes**

- **Alternatives, pick one:** this public-op receiver and the service-principal receiver (next example) both target `githubEvent.ingest` on the same route — they are two ways to handle the same inbound event. Register exactly one.
- **Why node route, not Fetch mount:** `mountNodeRoute` bypasses `authFetch`/`driveFetch` and the JSON body parser (the MCP precedent). That's required — there is no bearer to verify — and it's why the handler owns HMAC + replay + raw-body reading itself.
- **HMAC ≠ identity:** verifying the MAC proves the *sender* holds the secret; it says nothing about a SIWE/renown address, so `ctx.user` is `undefined`. Under any non-OPEN policy a document op would then hit `canCreate(undefined)` and die — so the target op is `.public()`, stated explicitly rather than landing on a silently-dead check.
- **Security:** validation is NOT skipped — `rt.invoke` still `safeParse`s `body` against the op input, so a valid HMAC over garbage still yields `VALIDATION`. Note the input is a closed `.strict()` object and `z.record(z.string(), z.unknown())` is the zod-v4 spelling (a bare `z.record(z.unknown())` no longer type-checks).
- **Gotcha:** compute the MAC over the raw bytes; `req.body` is unpopulated for node routes and re-serializing breaks the signature. Cap the read size.
- **Gotcha:** the in-memory `seen` map is per-process; use a shared/TTL store for real idempotency across restarts and instances. Real GitHub signs `X-Hub-Signature-256` over the body with no timestamp — there, lean on `X-GitHub-Delivery` dedupe for replay defense and keep the same constant-time compare.


### Inbound mapped to a configured service principal (HMAC → identity bridge)

**Level:** Advanced · **Transports:** `webhook`

The alternative to a public op: after the HMAC verifies, the receiver mints a context carrying a CONFIGURED service principal, and the op is guarded by a policy that pins exactly that principal. This attributes every inbound write to a real, auditable identity so ownership, grants and audit logs work — the honest way to say 'a verified sender may act as X' without inventing an identity out of an HMAC. Wired as a single-transport projection in the host boot.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  operation, SwitchboardApi, rateLimit, observability, logging,
  type TransportProjector, type OperationRegistry,
  type ProjectionRuntime, type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import { makeGithubEventDocument } from "@acme/github-model";

// The configured principal this integration is allowed to act as (from secrets/config, lower-cased).
const GITHUB_SERVICE_PRINCIPAL = process.env.GITHUB_SP_ADDRESS!.toLowerCase();

export const ingestGithubEventAsPrincipal = operation("githubEvent.ingest")
  .input(z.object({
    deliveryId: z.string(), event: z.string(), action: z.string().optional(),
    repo: z.string(), payload: z.record(z.string(), z.unknown()), // zod v4: record needs a key schema
  }).strict())
  .output(z.object({ id: z.string() }).strict())
  .requires("reactor")
  // A DEDICATED policy the receiver satisfies: pin the exact principal. This is a fixed-identity
  // assertion, NOT a "is anyone logged in?" check — so it is a legitimate `custom` use, unlike the
  // multi-id confused-deputy anti-pattern (bulk writes must use `documentEach`).
  .security({
    kind: "custom",
    check: async (_input, ctx) => ctx.user?.address?.toLowerCase() === GITHUB_SERVICE_PRINCIPAL,
  })
  .mutation(async (input, ctx) => {
    // The write is now ATTRIBUTED: ownership, grants and audit all see a real identity.
    const doc = await ctx.caps.reactor.create(
      makeGithubEventDocument({ ...input, ingestedBy: ctx.user!.address }),
    );
    return { id: doc.header.id };
  });

// ── Receiver: verify HMAC, THEN translate the verified sender into the principal ──────────
const REPLAY_WINDOW_MS = 5 * 60_000;
function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function end(res: ServerResponse, s: number): void { res.statusCode = s; res.end(); }
function readRaw(req: IncomingMessage, max = 512 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let d = ""; let n = 0;
    req.on("data", (c: Buffer) => { n += c.length; if (n > max) { req.destroy(); reject(new Error("too large")); } else d += c.toString("utf8"); });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

export class GithubServicePrincipalProjector implements TransportProjector {
  readonly transport = "webhook" as const;
  constructor(private readonly secret: string) {}

  project(_registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void {
    deps.httpAdapter.mountNodeRoute("POST", `${deps.basePath}/webhooks/github`, async (req, res) => {
      let raw: string;
      try { raw = await readRaw(req); } catch { return end(res, 413); }

      const tsHeader = String(req.headers["x-ph-timestamp"] ?? "");
      const sig = String(req.headers["x-ph-signature"] ?? "");
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return end(res, 401);
      const expected = "sha256=" + createHmac("sha256", this.secret).update(`${tsHeader}.${raw}`).digest("hex");
      if (!safeEq(expected, sig)) return end(res, 401);

      // THE BRIDGE: a verified HMAC is authority to act as the CONFIGURED principal — and nothing
      // else. The receiver is the only place allowed to make this translation; it mints a context
      // whose user IS the service principal. The op's `custom` policy then re-checks that identity.
      const ctx = await rt.makeContext(
        { user: { address: GITHUB_SERVICE_PRINCIPAL, chainId: 0, networkId: "service" } },
        "webhook",
      );
      try { await rt.invoke("githubEvent.ingest", JSON.parse(raw), ctx); return end(res, 202); }
      catch { return end(res, 403); } // wrong principal / validation -> not accepted
    });
  }
}

// ── Host boot: single-transport, host-wired (the service-principal variant) ──────────
const api = new SwitchboardApi({ corsAllowlist })
  .register(ingestGithubEventAsPrincipal)
  .use(rateLimit({ rpm: 600 }), observability(), logging())
  .build();

await api.project(
  [new GithubServicePrincipalProjector(process.env.GITHUB_WEBHOOK_SECRET!)],
  buildProjectionDeps(graphqlManager, authService),
);
```

**Notes**

- **Alternatives, pick one:** this and the public-op receiver above both target `githubEvent.ingest` on the same route. Choose the service principal when you need attributed ownership/audit or when a non-OPEN policy must actually authorize the create; choose `.public()` when the transport HMAC is genuinely the whole gate.
- **HMAC ≠ Powerhouse identity (the whole point):** the MAC proves possession of the shared secret; it is NOT a SIWE/renown login. The receiver is the sole trusted boundary that converts "this sender is authentic" into "act as principal X." Everything downstream (ownership, grants, audit) then works against a real address instead of `undefined`.
- **Why `custom` is OK here:** it pins one configured address — a fixed-identity assertion, not a per-id "am I logged in?" over a set (that anti-pattern is what `documentEach` exists to prevent). Grep-auditable and fail-closed.
- **Defense-in-depth:** the op re-checks `ctx.user.address` even though the receiver set it — if a future caller reaches this op through another path without the principal, authz still denies it (returns `FORBIDDEN`, mapped to 403 above).
- **Gotcha:** keep the principal address in config/secrets and normalize case; `isSupremeAdmin`/admin lists compare lower-cased. Never derive the identity FROM the payload — only from trusted configuration keyed to the verified secret.


---

## 7. Security cookbook — every policy, secure by default

Security in SAF is **structural, not disciplinary** (§10). `security` is a **mandatory, typed** field on every operation; the builder's `TAuth` guard makes "forgot to authorize" a compile error and `build()` is the runtime backstop for `as any` bypasses. There is no implicit default‑allow — the single opt‑out is the greppable `{ kind: "public" }` / `.public()`. Input `safeParse` and `authorize` are **fixed, non‑removable stages sandwiched inside the plugin chain** (§5), so no plugin — however buggy, hostile, or misordered — can reach a handler without passing them, and every transport inherits this because every transport calls `rt.invoke`.

Each `SecurityPolicy` kind maps **1:1 to an `IAuthorizationService` primitive** (§10.3): `public` → none, `authenticated` → identity present, `document` → `canRead`/`canWrite`/`canManage`, `documentEach` → per‑item `can*` (fail‑closed), `operation` → `canMutate(restricted op)`, `create` → `canCreate`, `drive` → collection‑scope `canRead`/`canWrite`, `custom` → your predicate. The only sanctioned `string → CanonicalDocumentId` cast lives in `DocumentAuthorizer`, so slug aliasing can't be an existence oracle, and a write handler reuses the **exact** `fetchIdentifier` the check authorized — the checked document and the mutated document are provably identical (no confused deputy).

Every example below is grounded in Appendix A and shows **the concrete failure it prevents**: the Drive‑Id IDOR that a bare `authenticated` list would open, the bulk confused‑deputy that `documentEach` closes, the column leak the closed output pick blocks, and the red squiggle that fires when you reach `.query` before deciding auth. Domains are consistent with the rest of the cookbook — `Invoice` for CRUD, `Todo` for the trivial case.


### `public` — the one greppable opt-out

**Level:** Simple · **Transports:** `rest`, `rpc`, `graphql`

`.public()` (and its data twin `{ kind: "public" }`) is the **only** escape from deny-by-default. Everything else in the pipeline still runs — validation, rate limiting, output projection — only the authz stage is waived.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";

// The ONLY opt-out from deny-by-default authorization. `.public()` flips the builder's TAuth
// generic to `true` (so the terminal below is callable) AND leaves an auditable trail:
//   grep -RnE '\.public\(\)|kind:\s*"public"'  <- enumerates every unauthenticated surface.
export const ping = operation("system.ping")
  .input(z.object({ echo: z.string().max(256).optional() }))
  .output(z.object({ pong: z.literal(true), echo: z.string().optional(), ts: z.string() }).strict())
  .public()                                     // decides auth -> `.query` becomes callable
  .query(async ({ echo }) => ({ pong: true as const, echo, ts: new Date().toISOString() }));

// A trivial public read (Todo domain) in the pure-data form — identical runtime, identical greppability:
import { defineOperation } from "@powerhousedao/switchboard-api";
export const todoCount = defineOperation({
  id: "todo.publicCount", kind: "query", requires: ["db"], middlewares: [],
  input: z.object({}).strict(),
  output: z.object({ open: z.number() }).strict(),
  security: { kind: "public" },               // <- explicit, greppable; no implicit default-allow exists
  handler: async (_i, ctx) => {
    // ... count open todos from ctx.caps.db ...
    return { open: 0 };
  },
});
```

**Notes**

- **What it prevents:** an *accidental* unauthenticated endpoint. Because deny-by-default is the only default, a missing policy is a compile error (see the `TAuth` example), so the sole way to expose something publicly is to *say so* with a token you can grep for in review/CI.
- **Still enforced under `public`:** input `safeParse`, the outer `rateLimit()` plugin, and the fixed output projection all run. Public means *unauthenticated*, not *unvalidated* or *unthrottled*.
- **Gotcha:** `public` is also the inbound-webhook contract — an HMAC-verified receiver whose op is not `{ kind: "public" }` must instead map to a configured service principal, since HMAC authenticates the *sender* but sets no `ctx.user` (§8.5).


### `authenticated` — identity present, and why it is NOT enough for a list

**Level:** Simple · **Transports:** `rest`, `rpc`, `graphql`

`{ kind: "authenticated" }` requires a verified `ctx.user` but asserts **nothing** about which documents or drives it may touch. Correct only for identity-scoped ops (a whoami); the *wrong* policy for any collection read — that is the Drive-Id IDOR (next examples).

```ts
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";

// `authenticated` maps to "ctx.user is present" and stops there. It does NOT authorize a subject,
// a drive, or an operation. Use it only for ops scoped to the caller's own identity.
export const whoami = operation("identity.whoami")
  .input(z.object({}).strict())
  .output(z.object({ address: z.string(), chainId: z.number(), networkId: z.string() }).strict())
  .security({ kind: "authenticated" })
  .query(async (_input, ctx) => {
    // The fixed authz stage already denied (UNAUTHENTICATED) if there were no user; this guard is a
    // type-level narrowing of the optional `ctx.user` (belt-and-suspenders, never a second check).
    if (!ctx.user) throw new ApiError("UNAUTHENTICATED", "sign in required");
    return { address: ctx.user.address, chainId: ctx.user.chainId, networkId: ctx.user.networkId };
  });

// ANTI-PATTERN — do NOT use `authenticated` for a collection read:
//   security.list = { kind: "authenticated" }
// A signed-in user is authorized for the *collection of another tenant* simply by setting the
// Drive-Id header (see the `drive` example). build() REJECTS a bare `authenticated` here at boot —
// security.list must be drive-scoped (§10.7).
```

**Notes**

- **What it prevents:** an anonymous caller reaching an identity endpoint. The policy = `ctx.user != null`; the fixed stage fails closed with `UNAUTHENTICATED` before the handler runs.
- **Why-it-works:** `ctx.user` is `{ address, chainId, networkId }` (== reactor-api `Context.user`, §6.2). It is typed *optional* on the context; the runtime guarantee comes from the policy, and the `ApiError` guard just narrows the type for the return.
- **Gotcha (load-bearing):** `authenticated` says *who* but never *what*. Any op that reads a drive-scoped collection MUST use `{ kind: "drive" }` instead. In the frozen contract `security.list`/`security.changes` are typed `SecurityPolicy<unknown>`, so the enforcing guard is the **`build()` runtime backstop**, which rejects a bare `{ kind: "authenticated" }` for these collection verbs at boot (§10.7) — the required shape is drive-scoped.


### The `TAuth` compile-error — `.query` is a red squiggle until auth is decided

**Level:** Simple · **Transports:** `compile-time (every transport)`

The terminals `.query/.mutation/.subscription` have type `AuthNotDecided` — a branded, **non-callable** type — until `.security(...)` or `.public()` flips `TAuth` to `true`. "Forgot to authorize" fails at the call site, not at runtime.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";

// AuthNotDecided = { readonly __SAF_ERROR: "call .security() or .public() before a terminal" }
// It has NO call signature, so `.query(handler)` cannot be invoked while auth is undecided.

// ❌ DOES NOT COMPILE — `.query` is `AuthNotDecided` here (no `.security()`/`.public()` yet):
const broken = operation("invoice.retrieve")
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }).strict())
  // @ts-expect-error  This expression is not callable. Type 'AuthNotDecided' has no call signatures.
  .query(async ({ id }) => ({ id }));

// ✅ COMPILES — `.security(...)` sets TAuth=true, so `.query` gains its call signature:
export const ok = operation("invoice.retrieve")
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }).strict())
  .requires("db")
  .security({ kind: "document", access: "read", subject: (i) => i.id })  // decides auth
  .query(async ({ id }) => ({ id }));

// Ordering rule this enforces (§6.6): a document/documentEach/operation subject selector is typed
// against InferOut<TIn>, so it only typechecks AFTER `.input()` has narrowed TIn. Convention:
//   operation(id).input(...).output(...).requires(...).security(...) BEFORE .query/.mutation.
```

**Notes**

- **What it prevents:** shipping an operation with no authorization decision. The guard is on the **property type** (`query: TAuth extends true ? (h)=>Def : AuthNotDecided`), not the return type — the naive `(h) => never` gate was *callable* (since `never` is assignable to everything), so the bug compiled clean and was caught only at runtime (§6.6 correction).
- **Why-it-works:** `.security()` and `.public()` both return `OperationBuilder<..., true>`; only in that state do the terminals resolve to a real function type.
- **Runtime backstop:** `build()` still throws if any registered op has an undecided `security` — defence in depth against an `as any` cast that erases the type guard (§6.8).
- **Gotcha:** put `.security()` **after** `.input()`. A `document`/`operation` subject `(i) => i.id` references the parsed input; before `.input()` narrows `TIn`, `i` is untyped and the selector won't compile.


### `create` — `canCreate`, and never `execute` a freshly-minted id

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

`{ kind: "create" }` is the only policy with **no subject** — the document does not exist yet, so authz is `canCreate`. The handler MINTS a document via `reactor.create`/`createEmpty`/`drives.addFile`; it must never `execute()` against a minted id.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";
import { makeInvoiceDocument } from "@acme/invoice-model";

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(),
  status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();

export const createInvoice = operation("invoice.create")
  .input(InvoiceCreate)
  .output(InvoiceOutput)
  .requires("reactor")
  .security({ kind: "create" })                 // canCreate — no subject; the doc doesn't exist yet
  .mutation(async (input, ctx) => {
    // REAL creation. A flat model -> reactor.create; a drive-container type would use
    // reactor.createEmpty(type, opts) or reactor.drives.addFile({...}). NEVER reactor.execute here:
    // execute() only mutates EXISTING documents, so executing a just-minted id is a race / CONFLICT.
    const doc = await ctx.caps.reactor.create(makeInvoiceDocument(input));
    const now = new Date().toISOString();
    return {
      id: doc.header.id, number: input.number, status: "draft" as const,
      counterparty: input.counterparty, amount: input.amount,
      currency: input.currency, dueDate: input.dueDate,
      createdAtUtc: now, updatedAtUtc: now,
    };
  });

// ANTI-PATTERN — do NOT do this:
//   const id = newId();
//   await ctx.caps.reactor.execute(id, "main", [createInvoiceAction(input)]);   // ❌ execute != create

// In defineResource this is the `write.create` factory + `security.create`:
//   write:   { create: (input) => ({ document: makeInvoiceDocument(input) }) }   // -> reactor.create
//   security:{ create: { kind: "create" } }
```

**Notes**

- **What it prevents:** authorizing against a subject that doesn't exist yet (there is nothing to `canRead`), and the classic create-via-execute race where actions are applied to an id before the document is materialized.
- **Why-it-works:** `canCreate` is a capability check on the *type*, not a document permission. The write path (`reactor.create(doc, parent?)` for flat models; `createEmpty`/`drives.addFile` for container types) is real creation (§7.6). `reactor.create` returns the created `PHDocument`, so `doc.header.id` is the new id.
- **Gotcha:** the create factory returns a **document to create** (`{ document }`) or a spec (`{ type, initialState }`) — never `Action[]`. `Action[]` is the shape for `update`/`remove`, which act on an existing authorized id.
- **Inbound webhook note:** a create-shaped inbound webhook can't land on `canCreate(undefined)` (dead under every non-OPEN policy) — the receiver op must be `{ kind: "public" }` or a service principal (§8.5).


### `document` — read / write / manage, reusing the authorized `fetchIdentifier`

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

The core policy: `{ kind: "document", access, subject }` maps to `canRead`/`canWrite`/`canManage`. The write/manage handlers execute against `handle.fetchIdentifier` — the *same* document the check authorized — so there is no confused deputy and no re-computed write target.

```ts
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";
import { InvoiceReadModel } from "@acme/invoice-api/processors";
import { editInvoiceAction, voidInvoiceAction } from "@acme/invoice-model";

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(),
  status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();

// READ (canRead). The subject selector resolves the id from typed input; the FIXED authz stage runs
// canRead(subject) before the handler. Read requires "db" (queries the read model).
export const getInvoice = operation("invoice.retrieve")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("db")
  .security({ kind: "document", access: "read", subject: (i) => i.id })
  .query(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("read", id, ctx);   // reuse the resolved identifier
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;                                                   // projected to InvoiceOutput
  });

// WRITE (canWrite). Actions are executed against handle.fetchIdentifier — the SAME document the
// check authorized. No re-computed target => no confused deputy.
export const editInvoice = operation("invoice.update")
  .input(z.object({ id: z.string(), amount: z.number().positive().optional(), dueDate: z.string().optional() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .security({ kind: "document", access: "write", subject: (i) => i.id })
  .mutation(async ({ id, ...patch }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [editInvoiceAction(patch)]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;
  });

// MANAGE (canManage) — the strongest verb, for destructive / ownership-changing ops. Void is manage.
export const voidInvoice = operation("invoice.delete")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .security({ kind: "document", access: "manage", subject: (i) => i.id })
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("manage", id, ctx);
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [voidInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;
  });
```

**Notes**

- **What it prevents:** the confused-deputy write. The `subject` selector and the fixed authz stage resolve *one* canonical id via the single sanctioned `DocumentAuthorizer`; the handler reuses `handle.fetchIdentifier` for `execute` — so the document that was checked and the document that is mutated are provably identical (§6.4, §7.6). It also blocks the slug-as-existence-oracle: id-resolution failure fails closed to `FORBIDDEN`.
- **Why-it-works:** `access` maps directly — `read→canRead`, `write→canWrite`, `manage→canManage`. `assert()` is idempotent: the fixed stage already ran it, so the in-handler call returns the same handle without a second decision cost.
- **Gotcha:** `manage` is a *stronger* grant than `write`, not a synonym — reserve it for destroy/void/ownership transitions so a plain editor can't delete. And never re-derive the write target from raw input (`reactor.execute(input.id, ...)`) — always go through `handle.fetchIdentifier`.
- **Read requires `db`; writes require `reactor` (+`db` to project the row back).** `ctx.caps` contains *only* the declared capabilities, so an undeclared `ctx.caps.reactor` is a compile error.


### `operation` — `canMutate` on a restricted action (stricter than `write`)

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

`{ kind: "operation", operationType, subject }` maps to `canMutate(operationType)` on a specific document — a per-**action** grant stricter than blanket `canWrite`. Use it when a particular state transition (approve, refund, publish) is gated separately from ordinary edits.

```ts
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";
import { InvoiceReadModel } from "@acme/invoice-api/processors";
import { approveInvoiceAction } from "@acme/invoice-model";

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(),
  status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();

// A user may hold canWrite on the invoice yet still be DENIED the APPROVE transition. The `operation`
// policy checks canMutate("APPROVE_INVOICE", subject) — a distinct grant on a distinct action type.
export const approveInvoice = operation("invoice.approve")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .security({ kind: "operation", operationType: "APPROVE_INVOICE", subject: (i) => i.id })
  .mutation(async ({ id }, ctx) => {
    // canMutate(APPROVE_INVOICE, id) already passed in the fixed stage. `assert` covers read/write/
    // manage only, so reuse the single sanctioned string -> CanonicalDocumentId resolution
    // (fail-closed, no existence oracle) as the execute target — the same doc the check authorized.
    const canonicalId = await ctx.authorize.canonical(id, ctx);
    await ctx.caps.reactor.execute(canonicalId, "main", [approveInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", canonicalId).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;
  });
```

**Notes**

- **What it prevents:** privilege creep where anyone with edit rights can trigger a sensitive transition. `canMutate(operationType)` is a separate primitive from `canWrite`, so APPROVE can be granted to finance while general editing stays broad (§10.3).
- **Why-it-works:** `operationType` names the restricted action; `subject` names the document; the fixed stage runs `canMutate` against both, fail-closed (a restricted op with no caller address → deny, §10.4).
- **Gotcha:** `DocumentAuthorizer.assert` only accepts `read|write|manage`, so for the `operation` policy the handler reuses `ctx.authorize.canonical(id, ctx)` (the sanctioned resolver the fixed stage also used) as the execute target — deterministic, so it yields the same id that was authorized. Do **not** hand-cast `input.id` to a document id anywhere else.
- **Do not conflate with `custom`:** `operation` is a first-class authz primitive; a hand-rolled `custom` role check would bypass `canMutate` and re-implement it worse.


### `drive` — closing the Drive-Id IDOR on `list` / `changes`

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`, `ws`

The flagship. `ctx.driveId` comes from the client's `Drive-Id` header and drive-middleware only checks **shard ownership** (→421), not per-user authz. A bare `authenticated` list lets any signed-in user read another tenant's drive. `{ kind: "drive" }` authorizes the caller against the collection's drive before the query's namespace is even selected.

```ts
import { z } from "zod";
import {
  defineResource, keyset, type FilterSet, type OrderingBackend, type Serializer,
} from "@powerhousedao/switchboard-api";
import { InvoiceReadModel } from "@acme/invoice-api/processors";
import { INVOICE_DOC_TYPE } from "@acme/invoice-model";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";

interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}

// ─────────────────────────────────────────────────────────────────
// THE ATTACK (what a bare `authenticated` list policy allows):
//
//   ctx.driveId is populated from the CLIENT-SUPPLIED `Drive-Id` header. Powerhouse's
//   drive-middleware only checks SHARD OWNERSHIP (wrong shard -> HTTP 421), never per-user
//   authorization. So with security.list = { kind: "authenticated" }, Mallory (a valid, signed-in
//   user of her OWN drive) simply retargets the header:
//
//     POST /invoice/rest/invoices
//     Authorization: Bearer <Mallory's perfectly valid token>
//     Drive-Id: acme-tenant-drive          <-- a drive she has NO grant on
//
//   The list handler then runs InvoiceReadModel.query(ctx.driveId!, ...) against acme's Postgres
//   namespace and streams acme's invoices back. Classic IDOR — authenticated != authorized.
//
// THE FIX: a { kind: "drive", access: "read" } policy authorizes the caller against the collection's
// drive BEFORE the query namespace is selected. In the frozen contract security.list is
// SecurityPolicy<unknown>, so the guarantee is enforced by the build() runtime backstop: it rejects a
// bare { kind: "authenticated" } for list/changes at boot and requires a drive-scoped policy (§10.7).
// ─────────────────────────────────────────────────────────────────

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();                                    // ownerAddress excluded (closed pick)

const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];
const serializer: Serializer<typeof InvoiceOutput> = { output: InvoiceOutput };

export const invoiceResource = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
    changes: { search: (): SearchFilter => ({ type: INVOICE_DOC_TYPE }) },
  },
  security: {
    // ❌ list: { kind: "authenticated" },   // REJECTED by build() at boot — list must be drive-scoped (§10.7)
    list:    { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },  // ✅ collection scope
    get:     { kind: "document", access: "read",  subject: (i) => i.id },
    changes: { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },  // ✅ subscribe-time authz
  },
});
```

**Notes**

- **What it prevents:** cross-tenant reads via a spoofed `Drive-Id` header. The `drive` policy runs `canRead(drive)` for the caller *before* the namespace is chosen, so pointing the header at `acme-tenant-drive` is denied at authz, not silently served (§10.7).
- **Why `list` specifically:** a detail `get` is already `{ kind: "document" }` (per-doc `canRead`), but a *collection* read has no single document to check — its scope IS the drive, so the drive is what must be authorized.
- **`changes` too:** the subscription carries a **required** subscribe-time `drive` policy (§10.9), so a WS subscriber cannot open a stream over another tenant's drive; the per-event `canReadDocument` still runs on each change.
- **Structural, not advisory:** the drive-scoping requirement is enforced by the **`build()` runtime backstop** (the frozen `security.list`/`security.changes` are `SecurityPolicy<unknown>`), so a resource with a bare `{ kind: "authenticated" }` list/changes policy fails at boot — you cannot ship the vulnerable shape.
- **Gotcha:** don't validate `driveId` with a bare `!` deep in a handler; the drive selector is a first-class, validated part of the request (absence → `VALIDATION`, not an `INTERNAL` from `getNamespace(undefined)`, §6.9).


### `documentEach` — bulk void that authorizes every item (fail-closed)

**Level:** Advanced · **Transports:** `rpc`, `rest`, `graphql`

`{ kind: "documentEach", access, subjects }` resolves and `can*`-checks **each** id before the handler runs. A bulk void/update cannot become a confused deputy — this is the blessed pattern that replaces a `custom` "am I logged in?" check over many ids.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";
import { voidInvoiceAction } from "@acme/invoice-model";

export const invoiceBulkVoid = operation("invoice.bulkVoid")
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ voided: z.array(z.string()) }).strict())
  .requires("reactor")
  // PER-ITEM authorization: every id is resolved and canWrite-checked, fail-closed, BEFORE the
  // handler runs. If ANY id fails, the whole op is denied — a bulk void can't confused-deputy.
  .security({ kind: "documentEach", access: "write", subjects: (i) => i.ids })
  .mutation(async ({ ids }, ctx) => {
    const res = await ctx.caps.reactor.executeBatch({
      jobs: ids.map((id) => ({
        key: id, documentId: id, scope: "global", branch: "main",
        actions: [voidInvoiceAction({ id })], dependsOn: [],
      })),
    });
    return { voided: Object.keys(res.jobs) };
  });

// THE FOOTGUN documentEach exists to prevent:
//   .security({ kind: "custom", check: async (_i, ctx) => Boolean(ctx.user) })   // "am I logged in?"
// That authorizes the CALLER, not the 100 targets. Any signed-in user could void 100 invoices they
// don't own. `custom` never iterates ids for you — documentEach is the blessed bulk pattern (§10.8).
```

**Notes**

- **What it prevents:** the bulk confused deputy — one coarse "is the caller authenticated?" gate standing in for 100 per-document decisions. `documentEach` runs the `access` check (here `canWrite`) against **every** id, fail-closed: any failure denies the whole op before a single write (§10.8).
- **Why-it-works:** `subjects: (i) => i.ids` returns the full set the op will touch; the fixed authz stage expands it into N per-item decisions through the same sanctioned resolver used by `document`, so there is no gap between what was checked and what `executeBatch` mutates. The batch job shape (`{ key, documentId, scope, branch, actions, dependsOn }`) and the `{ jobs: Record<key, JobInfo> }` result are the real `IReactorClient.executeBatch` contract.
- **Gotcha:** bound the input (`.max(100)`) — the per-item authz cost and the batch fan-out both scale with the id count; an unbounded array is an authz-DB amplification vector. Pair with the RPC `batchLimit` for defence in depth (§8.4).
- **Use `documentEach`, not `custom`, whenever the op touches more than one document** — `custom` puts the per-item loop (and the fail-closed discipline) on you.


### `custom` — the escape hatch, its footguns, and when `documentEach` is correct instead

**Level:** Advanced · **Transports:** `rest`, `rpc`

`{ kind: "custom", check }` is for policies that are genuinely not a document/drive/create/operation relationship. Its closure is generic over the op's *declared* `TCaps` (so it still can't reach an undeclared capability), but you own the logic — including any per-item authz, which is exactly where it becomes a footgun.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";

const OPS_ALLOWLIST = new Set(["0xabc0000000000000000000000000000000000001",
                               "0xdef0000000000000000000000000000000000002"].map((a) => a.toLowerCase()));

// LEGITIMATE custom: an ops-only endpoint gated on a configured address allowlist. This is NOT a
// document/drive/create/operation relationship, so no first-class policy expresses it. The check
// closure is generic over the op's DECLARED TCaps (never by default), so it can reach ONLY declared
// capabilities — never an undeclared one (no ctx.caps.db unless the op .requires("db")). §6.4.
export const opsMetrics = operation("ops.metrics")
  .input(z.object({}).strict())
  .output(z.object({ activeDrives: z.number(), queueDepth: z.number() }).strict())
  .requires("db")
  .security({
    kind: "custom",
    check: async (_i, ctx) =>
      Boolean(ctx.user) && OPS_ALLOWLIST.has(ctx.user!.address.toLowerCase()),
  })
  .query(async (_i, ctx) => {
    // ctx.caps.db is present because it was declared; the check could NOT have reached it undeclared.
    // ... compute activeDrives / queueDepth from ctx.caps.db ...
    return { activeDrives: 0, queueDepth: 0 };
  });

// ── FOOTGUN #1 — custom over many ids is a confused deputy ─────────────────────────────────
// WRONG (authorizes the CALLER, not the targets):
//   .input(z.object({ ids: z.array(z.string()) }))
//   .security({ kind: "custom", check: async (_i, ctx) => Boolean(ctx.user) })
//   .mutation(async ({ ids }, ctx) => { /* voids ids the caller may not own */ });
// RIGHT (documentEach resolves & canWrite-checks EACH id, fail-closed):
//   .security({ kind: "documentEach", access: "write", subjects: (i) => i.ids })
//
// ── FOOTGUN #2 — custom that dereferences a single doc re-implements `document` badly ──────────
// You'd resolve the id yourself (existence-oracle risk) and must remember to fail closed. Prefer
//   .security({ kind: "document", access: "write", subject: (i) => i.id })
// so the sanctioned resolver + assert handle canonicalization and fail-closed for you.
```

**Notes**

- **What it prevents (when used right):** it *enables* a policy no primitive covers (allowlist, feature-flag, break-glass) without loosening the pipeline — validation, output projection, and capability scoping still apply.
- **The documented warning (§10.8):** `custom` is "you must enforce per-item authorization yourself." A "logged in?" check over a set of ids is the exact hole `documentEach` was added to close — reach for `documentEach` for bulk, `document`/`operation` for single-doc, and `custom` only for the genuinely-not-a-document cases.
- **Why-it-works safely here:** the check reads only `ctx.user` (always available) and a static allowlist; it declares no document subject because there is none. Crucially the closure is typed over the op's `TCaps` (defaulting to `never`), so it can never reach `ctx.caps.db`/`ctx.caps.reactor` the op didn't `.requires()` — no policy closure is typed `OperationContext<any, any>`.
- **Gotcha:** never use `custom` as a de-facto role check that shadows `canMutate` — that's what `{ kind: "operation" }` is for, and it goes through the real authz service.


### Output-strip — the closed allowlist pick that blocks column leaks

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`, `ws`, `webhook`

The fixed output stage **explicitly picks** the declared `output` keys — it does not trust the validator to strip. So a `SELECT *` read model can never leak `ownerAddress` or a soft-delete flag, regardless of validator, and `build()` rejects a non-closed output schema.

```ts
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";
import { InvoiceReadModel } from "@acme/invoice-api/processors";

// The read-model row carries INTERNAL columns that must never cross the wire:
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string;
  ownerAddress: string;      // internal — the authorization subject
  isSoftDeleted: boolean;    // internal — soft-delete flag
}

// CLOSED output schema (.strict()). The FIXED output stage does an allowlist PICK of exactly these
// keys; it does NOT rely on unknown-key stripping (Zod/Valibot strip; ArkType does not, by default).
// build() REJECTS a non-closed output schema, so you cannot accidentally ship an open one.
const InvoiceOutput = z.object({
  id: z.string(), number: z.string(),
  status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();               // <- closed. A bare z.object({...}) (no .strict) is rejected by build().

export const getInvoice = operation("invoice.retrieve")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("db")
  .security({ kind: "document", access: "read", subject: (i) => i.id })
  .query(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("read", id, ctx);
    const row: InvoiceRow | undefined = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()                          // SELECT * — ownerAddress IS in the row…
      .where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    // TypeScript happily allows returning `row` (extra props satisfy a narrower type) — that is the
    // whole point: TS does NOT catch the leak, the RUNTIME output pick strips ownerAddress/isSoftDeleted.
    return row;
  });
```

**Notes**

- **What it prevents:** the `SELECT *` field leak. Even though `row` carries `ownerAddress` and `isSoftDeleted`, and TypeScript permits returning it (structural typing lets a wider value satisfy a narrower return), the fixed output stage projects to *exactly* the declared keys before the value leaves the pipeline (§10.6).
- **Why explicit pick, not validator strip:** validators disagree on unknown keys — Zod/Valibot strip, ArkType keeps them. SAF does not depend on that behavior; it picks. `build()` additionally rejects an output schema it cannot prove closed, so an open schema never ships.
- **Applies to every transport** because output projection is a fixed pipeline stage inside `rt.invoke` — the same guard covers the REST body, the RPC result, the GraphQL type, and webhook egress.
- **Gotcha:** the guard protects declared vs undeclared keys; per-*caller* redaction of a declared key (e.g. hide `counterparty` from anonymous) is a separate concern — that's `fieldGuards` (next).


### `serializer.fieldGuards` — auto-enforced per-field redaction

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`, `webhook`

`fieldGuards` redacts individual declared fields per caller via an inner plugin that is **auto-injected** whenever the serializer declares them — you never "remember to add `fieldRedaction()`". It composes with (runs after) the closed output pick.

```ts
import { z } from "zod";
import {
  defineResource, keyset, cache, type FilterSet, type OrderingBackend, type Serializer,
} from "@powerhousedao/switchboard-api";
import { InvoiceReadModel } from "@acme/invoice-api/processors";
import { INVOICE_DOC_TYPE } from "@acme/invoice-model";

interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();

const serializer: Serializer<typeof InvoiceOutput> = {
  output: InvoiceOutput,
  sortable: ["amount", "dueDate", "createdAtUtc"],
  // Per-FIELD redaction. An inner plugin is AUTO-INJECTED whenever fieldGuards is declared — it is
  // structural, not a plugin you can forget to register. Predicate true => keep; false => redact,
  // per caller, AFTER the closed output pick. (The old free-string `sensitive` map is dropped.)
  fieldGuards: {
    counterparty: (ctx) => Boolean(ctx.user),          // hidden from anonymous callers
    amount:       (ctx) => Boolean(ctx.user),          // "
  },
};

const filterable: FilterSet<InvoiceRow> = {
  status: { type: "string", ops: ["eq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];

export const invoiceResource = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  security: {
    list: { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },   // drive-scoped (no IDOR)
    get:  { kind: "document", access: "read",  subject: (i) => i.id },
  },
  // cache() is REFUSED on an op whose serializer declares fieldGuards UNLESS the guard inputs are in
  // the key. Default keying already includes user.address + driveId, so a value redacted for an
  // anonymous caller is never served to a signed-in one sharing the same drive.
  plugins: [cache({ ttlMs: 5_000 })],
});
```

**Notes**

- **What it prevents:** leaking a *declared* field to a caller who shouldn't see it (e.g. `counterparty`/`amount` to anonymous). The redaction is enforced by an inner plugin SAF injects automatically when `fieldGuards` is present — there is no "remember to add the redactor" step, so it can't be dropped in review (§7.4, §10.6).
- **Why-it-works / ordering:** `fieldGuards` runs *after* the closed output pick, so it only ever operates on already-allowlisted fields; the predicate receives the full `ctx` (identity, drive, transport) and returns keep/redact per request.
- **Cache safety (§9):** `cache()` is **refused** on any op with `fieldGuards` unless the guard-relevant inputs are in the cache key. Default keying is `op.id + driveId + user.address + input + redaction surface`, so a response redacted for one caller is never served to another sharing the same address/drive.
- **Webhook egress inherits it:** outbound webhook delivery serializes through the op's output pipeline (pick + `fieldGuards`) per subscriber, so a subscriber's hook never receives a field it couldn't read interactively (§8.5).
- **Gotcha:** `fieldGuards` keys are constrained to `keyof InferOut<TOut>` — you can only guard fields that survive the output pick; guarding an internal column that was never declared is a type error (and unnecessary — it was already stripped).


---

## 8. Using the primitives directly

Everything `defineResource` (§7.5–7.7) generates, you can assemble by hand — and you keep **every** guarantee, because the guarantees do not live in the resource layer. Input `safeParse`, `authorize`, and the closed output **pick** are *fixed, non-removable pipeline stages* (§5, §10.2/§10.6) that wrap every op no matter how it was authored; `defineResource` is just sugar that emits the same `operation()` calls. Dropping to the primitives therefore buys you arbitrary SQL, custom pagination, extra typed context, cross-cutting plugins, and even whole new transports **without** surrendering drive-scoped collection reads, allowlisted filters, closed output, or deny-by-default authz.

This section climbs the low-level layer bottom-up. First a context-extending middleware (`.use<TAdd>()`) that resolves a tenant onto `ctx.ext`. Then a fully hand-written list endpoint — `compileFilter` + `keyset` + `envelope` computing an invoice **aging report** over a join — that keeps all guarantees. Then two custom `Paginator`s that honestly implement the *two separate* contracts (§7.2): a DRF-style `OffsetPaginator` with a companion `totalCount`, and a deterministic-snapshot `SeekPaginator`. Then a custom `Plugin` that wraps every transport at the op level *and* short-circuits HTTP at the fetch edge, wiring its metric through the injected `PluginHost`. Finally a brand-new `TransportProjector` (SSE-only) that adds a transport with **zero** edits to `OperationDef`, `Serializer`, or any existing projector (OCP).

Domains stay consistent with the rest of the cookbook: `Todo` for the simplest case, `Invoice` for the computed read and the paginators, `ChatMessage` for the streaming projector. Every read here declares `.requires("db")` and reaches only the read-only `IRelationalQueryBuilder`; nothing in this section takes the write path — for `create`/`update` (which authorize the exact document they mutate via `ctx.authorize.assert(...)` + `reactor.create`/`reactor.execute`) see the full CRUD resource in §7.7.


### A context-extending middleware: resolve the tenant onto ctx.ext

**Level:** Simple · **Transports:** `graphql`, `rest`, `rpc`

`.use<TAdd>()` runs a typed `ContextMiddleware` that resolves the caller's tenant and merges `{ tenant }` into `ctx.ext`, so the handler reads `ctx.ext.tenant.id` with full type inference. The middleware reaches `ctx.caps.db` only because `.requires("db")` was called first, and it runs **post-authz** — a subtlety that dictates both builder order and what the security policy may reference.

```ts
import { z } from "zod";
import {
  operation, keyset, ApiError,
  type ContextMiddleware, type SortSpec,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { PagingOptions } from "@powerhousedao/reactor/shared/types";
import type { SelectQueryBuilder } from "kysely";

// ── read model ────────────────────────────────────────────────────────────────
interface TodoRow    { id: string; tenantId: string; title: string; done: boolean; createdAtUtc: string; ownerAddress: string }
interface TenantRow  { id: string; memberAddress: string; plan: "free" | "pro" }
interface TodoDb     { todo: TodoRow; tenant: TenantRow }
export class TodoReadModel extends RelationalDbProcessor<TodoDb> { /* onOperations() projects todo actions; body omitted */ }

// ── the context-extending middleware ────────────────────────────────────────────
// ContextMiddleware<TCaps, TExtIn, TAdd> = (input, ctx) => Promise<TAdd>. TAdd is inferred from the
// COVARIANT return, and the builder merges it into a fresh ctx.ext before calling the handler.
type ResolvedTenant = { tenant: { id: string; plan: "free" | "pro" } };

const withTenant: ContextMiddleware<"db", {}, ResolvedTenant> = async (_input, ctx) => {
  // ctx.caps.db is reachable ONLY because the op declared .requires("db") before .use(withTenant).
  if (!ctx.user) throw new ApiError("UNAUTHENTICATED", "sign-in required");
  const row = await TodoReadModel.query(ctx.driveId!, ctx.caps.db)
    .selectFrom("tenant").select(["id", "plan"])
    .where("memberAddress", "=", ctx.user.address)
    .executeTakeFirst();
  if (!row) throw new ApiError("FORBIDDEN", "caller is not a member of any tenant in this drive");
  return { tenant: { id: row.id, plan: row.plan } };
};

// ── DTO: closed output — ownerAddress & tenantId are internal and can never leak ────
const TodoDto = z.object({
  id: z.string(), title: z.string(), done: z.boolean(), createdAtUtc: z.string(),
}).strict();

export const todoList = operation("todo.list")
  .input(z.object({
    done: z.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }).strict())
  .output(z.object({ results: z.array(TodoDto), nextCursor: z.string().optional() }).strict())
  .requires("db")            // (1) declare the capability FIRST — locks TCaps so withTenant can read ctx.caps.db
  .use(withTenant)          // (2) extend ctx.ext with { tenant } (typed)
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }) // (3) drive-scoped collection read
  .query(async (input, ctx) => {
    const paginator = keyset<TodoRow>({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 });
    const page: PagingOptions = { cursor: input.cursor ?? "", limit: input.limit ?? 0 };
    const sort: SortSpec<TodoRow>[] = [{ field: "createdAtUtc", dir: "desc" }];

    let q = TodoReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("todo")
      .where("tenantId", "=", ctx.ext.tenant.id);   // ← typed ctx.ext, resolved by the middleware
    if (input.done !== undefined) q = q.where("done", "=", input.done);

    const qb = q.selectAll() as unknown as SelectQueryBuilder<any, any, TodoRow>;
    const rows = (await paginator.apply(qb, sort, page).execute()) as unknown as TodoRow[];
    return paginator.envelope(rows, page);   // fixed output stage strips `options`/`next`, picks TodoDto keys
  });
```

**Notes**

- **Why the order `.requires("db").use(withTenant)` matters:** `.use<TAdd>(mw)` types `mw` as `ContextMiddleware<TCaps, TExt, TAdd>` where `TCaps` is whatever has been declared *so far*. Put `.use` before `.requires("db")` and `TCaps` is still `never`, so `ctx.caps.db` is a compile error inside the middleware. Declare capabilities first.
- **Security must NOT read `ctx.ext`:** context middleware is an `op.middlewares` step and runs *after* the fixed authorize stage (§5). At authz time `ctx.ext.tenant` does not exist yet. Keep the tenant as handler-only business context and let the drive policy (not the tenant) be the authorization boundary. If you need tenant-derived authz, use a `{ kind: "custom" }`/`{ kind: "drive" }` closure that resolves it itself, or an `outer` plugin.
- **Drive-scoped, not authenticated:** `list` uses `{ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }`. A bare `{ kind: "authenticated" }` would let any logged-in user point the `Drive-Id` header at another tenant's drive and read it (§10.7 IDOR).
- **Closed output:** `ownerAddress`/`tenantId` are never in `TodoDto`, and the fixed output stage *picks* exactly the declared keys — a `SELECT *`-style read model cannot leak them regardless of validator (§10.6). The `strict()` is belt-and-suspenders; the pick is the real guard.
- **All transports:** a middleware and its `ctx.ext` are transport-agnostic — the same `todo.list` projects identically to GraphQL, REST, and RPC because all call `rt.invoke`.


### A hand-written aging report: compileFilter + keyset + envelope over a join

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

The flagship low-level read: `operation()` + a CTE join computing outstanding balance and an aging bucket, then the **exact same primitives** the generated handler uses — `compileFilter` (closed allowlist → bound SQL), `keyset` (indexed, opaque cursor, hard page cap), and `envelope` (slice the sentinel, mint the cursor). Every guarantee survives: drive-scoped authz, `VALIDATION` on unlisted filter field/op, closed output pick, no `totalCount` leak of the whole tenant.

```ts
import { z } from "zod";
import {
  operation, compileFilter, keyset,
  type FilterSet, type SortSpec,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { PagingOptions } from "@powerhousedao/reactor/shared/types";
import { sql, type SelectQueryBuilder } from "kysely";

// ── read model: invoice + payment (ownerAddress is internal and MUST NOT leak) ──────
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string; dueDate: string;
  createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface PaymentRow { id: string; invoiceId: string; amount: number; postedAtUtc: string }
interface InvoiceDb  { invoice: InvoiceRow; payment: PaymentRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> { /* body omitted */ }

// The computed, joined row — the shape the paginator, filter allowlist and output DTO all agree on.
interface AgingRow {
  id: string; number: string; counterparty: string; currency: string;
  status: "open" | "paid"; dueDate: string; amount: number; paid: number; outstanding: number;
  agingBucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

// ── closed allowlists ───────────────────────────────────────────────────────────
// Only unambiguous CTE columns are filterable. `outstanding` IS filterable because the CTE
// materialises it — you get "show invoices with outstanding >= X" without exposing a raw expression.
const filterable: FilterSet<AgingRow> = {
  status:       { type: "string", ops: ["eq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  dueDate:      { type: "string", ops: ["gte", "lte", "range"] },
  outstanding:  { type: "number", ops: ["gt", "gte", "range"] },
};

const AgingRowDto = z.object({
  id: z.string(), number: z.string(), counterparty: z.string(), currency: z.string(),
  status: z.enum(["open", "paid"]), dueDate: z.string(),
  amount: z.number(), paid: z.number(), outstanding: z.number(),
  agingBucket: z.enum(["current", "1-30", "31-60", "61-90", "90+"]),
}).strict();

const AgingFilter = z.object({
  status:       z.object({ eq: z.string().optional(), in: z.array(z.string()).optional() }).partial().optional(),
  counterparty: z.object({ eq: z.string().optional(), contains: z.string().optional() }).partial().optional(),
  dueDate:      z.object({ gte: z.string().optional(), lte: z.string().optional(), range: z.tuple([z.string(), z.string()]).optional() }).partial().optional(),
  outstanding:  z.object({ gt: z.number().optional(), gte: z.number().optional(), range: z.tuple([z.number(), z.number()]).optional() }).partial().optional(),
}).partial();

export const invoiceAging = operation("invoice.aging")
  .input(z.object({
    filter: AgingFilter.optional(),
    oldestFirst: z.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }).strict())
  .output(z.object({ results: z.array(AgingRowDto), nextCursor: z.string().optional() }).strict())
  .requires("db")
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! }) // collection scope → closes Drive-Id IDOR
  .query(async (input, ctx) => {
    const paginator = keyset<AgingRow>({ orderBy: "dueDate", tieBreaker: "id", default: 25, max: 100 });
    const page: PagingOptions = { cursor: input.cursor ?? "", limit: input.limit ?? 0 };
    // keyset can only order by its cursor column (direction may flip) — an unlisted sort → VALIDATION.
    const sort: SortSpec<AgingRow>[] = [{ field: "dueDate", dir: input.oldestFirst ? "asc" : "desc" }];

    // 1) hand-built join in a CTE so the OUTER row has flat, unambiguous keyset columns (id/dueDate).
    //    `.with` is part of the read-only IRelationalQueryBuilder surface (§7.1).
    let qb = InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .with("aging", (db) =>
        db.selectFrom("invoice")
          .leftJoin("payment", "payment.invoiceId", "invoice.id")
          .where("invoice.status", "in", ["open", "paid"])
          .groupBy(["invoice.id", "invoice.number", "invoice.counterparty",
                    "invoice.currency", "invoice.status", "invoice.dueDate", "invoice.amount"])
          .select((eb) => [
            "invoice.id as id", "invoice.number as number", "invoice.counterparty as counterparty",
            "invoice.currency as currency", "invoice.status as status",
            "invoice.dueDate as dueDate", "invoice.amount as amount",
            eb.fn.coalesce(eb.fn.sum("payment.amount"), sql<number>`0`).as("paid"),
            sql<number>`invoice.amount - coalesce(sum(payment.amount), 0)`.as("outstanding"),
            sql<AgingRow["agingBucket"]>`case
                when invoice.due_date >= now() then 'current'
                when invoice.due_date >= now() - interval '30 days' then '1-30'
                when invoice.due_date >= now() - interval '60 days' then '31-60'
                when invoice.due_date >= now() - interval '90 days' then '61-90'
                else '90+' end`.as("agingBucket"),
          ]),
      )
      .selectFrom("aging").selectAll("aging") as unknown as SelectQueryBuilder<any, any, AgingRow>;

    // 2) closed allowlist → parameterized WHERE (unlisted field/op → ApiError("VALIDATION"), never a 500).
    qb = compileFilter(filterable, input.filter ?? {})(qb);
    // 3) keyset: orderBy + row-value seek + limit(+1 sentinel). `max` caps the page (DoS guard).
    qb = paginator.apply(qb, sort, page);

    const rows = (await qb.execute()) as unknown as AgingRow[];
    // 4) pure post-processing: slice the sentinel, mint the opaque base64url cursor.
    return paginator.envelope(rows, page);   // no totalCount (counting defeats the seek); output pick drops options/next
  });
```

**Notes**

- **All the guarantees are still on, by construction, not by discipline:** the drive policy authorizes the collection *before* the namespace is selected; `compileFilter` binds every value as a Kysely parameter and rejects unlisted columns/operators with `VALIDATION` (no injection, no enumeration oracle); `keyset`'s `max: 100` hard-caps the page; and the fixed output stage picks exactly `AgingRowDto`'s keys — `ownerAddress` is never even selected, let alone declared, so it cannot leak.
- **Why a CTE:** keyset's seek predicate runs in `WHERE`, which cannot see `SELECT` aliases and must reference *unambiguous* physical columns. A raw `invoice ⋈ payment` join makes `id` ambiguous (both tables have it). Materialising the aggregate in a `with("aging", …)` CTE gives the outer query a flat rowset whose `id`/`dueDate` are unambiguous — and, as a bonus, makes the computed `outstanding` a first-class filterable column.
- **Computed columns you *don't* materialise are not filterable:** if you compute the bucket only in the outer `SELECT`, keep it out of `filterable` — `FilterSet<Row>` keys are `keyof Row`, but the runtime allowlist is the actual boundary; never allowlist a column the emitted SQL can't bind.
- **Direction flips, fields don't:** a seek paginator accepts `dir: "asc"|"desc"` on its configured column; any *other* sort field is a `VALIDATION` (§7.2). That's why the input exposes `oldestFirst: boolean`, not a free `sort` string.
- **The one cast is honest:** `compileFilter`/`Paginator.apply` operate on `SelectQueryBuilder<any, any, Row>` (Kysely's column API is stringly-typed inside that generic); a single boundary cast bridges the concrete builder type. Per §7.2 an optional `SelectQueryBuilder<DB, TB, Row>` variant removes it — the allowlist is the security boundary either way.
- **Read-your-write caveat:** the relational read model is eventually consistent (§15.3); a `list`/report right after a write may be momentarily stale. Reads that must be strongly consistent belong on the `create`/`update` re-read path, not here.


### A custom OffsetPaginator: DRF-style page numbers with an honest totalCount

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

A hand-written `OffsetPaginator<Row>` implementing the `"offset"` contract (§7.2): it honors an **arbitrary** allowlisted sort and pages by 1-based page number, fetching one sentinel row to decide `hasNext` without a count. Because `envelope(rows, page)` can't see a total, the paginator stays pure and the caller runs the **companion `count()`** query — the honest way an offset paginator provides `totalCount`.

```ts
import { z } from "zod";
import {
  operation, ApiError,
  type OffsetPaginator, type SortSpec, type OrderingBackend,
} from "@powerhousedao/switchboard-api";
import type { PagingOptions, PagedResults } from "@powerhousedao/reactor/shared/types";
import type { SelectQueryBuilder } from "kysely";
// InvoiceRow / InvoiceReadModel as defined in the aging-report example (one system):
import { InvoiceReadModel, type InvoiceRow } from "./invoice-aging.saf.js";

// ── the custom paginator (mode: "offset") ───────────────────────────────────────
// NOTE: `offset()` and `pageNumber()` already SHIP from @powerhousedao/switchboard-api (Appendix A).
// This hand-rolls the same OffsetPaginator contract under a DISTINCT name to show exactly what a
// bespoke variant implements — a custom paginator gets its own name so importing the built-in
// `pageNumber` alongside it cannot collide. Reach for a custom one only when the built-ins fall short.
// page.cursor carries the 1-based page number for this variant; page.limit is an optional
// per-request size override, hard-capped at `max`.
export function offsetPages<Row>(o: { size: number; max: number }): OffsetPaginator<Row> {
  const sizeFor   = (p: PagingOptions) => Math.min(p.limit || o.size, o.max);
  const pageNoFor = (p: PagingOptions) => Math.max(1, Number(p.cursor) || 1);
  return {
    mode: "offset",
    apply(qb, sort, page) {
      // offset pagination is only stable with a total order → require an explicit allowlisted sort.
      if (sort.length === 0) throw new ApiError("VALIDATION", "offset pagination requires an explicit sort");
      const size = sizeFor(page), pageNo = pageNoFor(page);
      let q = qb;
      for (const s of sort) q = q.orderBy(s.field, s.dir);        // arbitrary OrderingBackend sort — offset honors it
      return q.offset((pageNo - 1) * size).limit(size + 1);       // +1 sentinel → hasNext without a count
    },
    envelope(rows, page): PagedResults<Row> {
      const size = sizeFor(page), pageNo = pageNoFor(page);
      const hasNext = rows.length > size;
      const results = hasNext ? rows.slice(0, size) : rows;
      return { results, options: page, nextCursor: hasNext ? String(pageNo + 1) : undefined };
    },
  };
}

// ── a self-contained sort parser over a closed OrderingBackend (DRF `-field` convention) ──
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];
function parseSort<Row>(fields: readonly string[], allow: readonly string[]): SortSpec<Row>[] {
  return fields.map((raw) => {
    const dir = raw.startsWith("-") ? "desc" : "asc";
    const field = raw.replace(/^-/, "");
    if (!allow.includes(field)) throw new ApiError("VALIDATION", `sort field '${field}' is not allowlisted`);
    return { field: field as keyof Row & string, dir };
  });
}

const InvoiceDto = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(), dueDate: z.string(),
}).strict();

// ── a hand-written list that opts INTO a total count via the companion query ───────
export const invoicePage = operation("invoice.page")
  .input(z.object({
    sort: z.array(z.string()).optional(),
    page: z.string().optional(),
    size: z.number().int().positive().max(100).optional(),
  }).strict())
  .output(z.object({ results: z.array(InvoiceDto), nextCursor: z.string().optional(), totalCount: z.number() }).strict())
  .requires("db")
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! })
  .query(async (input, ctx) => {
    const paginator = offsetPages<InvoiceRow>({ size: 25, max: 100 });
    const page: PagingOptions = { cursor: input.page ?? "1", limit: input.size ?? 0 };
    const sort = parseSort<InvoiceRow>(input.sort ?? ["-createdAtUtc"], sortable);

    const base = InvoiceReadModel.query(ctx.driveId!, ctx.caps.db).selectFrom("invoice");
    // companion count() — offset's honest totalCount (a second parameterized query, same WHERE scope)
    const counted = await base.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
    const qb = base.selectAll() as unknown as SelectQueryBuilder<any, any, InvoiceRow>;
    const rows = (await paginator.apply(qb, sort, page).execute()) as unknown as InvoiceRow[];

    return { ...paginator.envelope(rows, page), totalCount: Number(counted.n) };
  });
```

**Notes**

- **The built-ins already cover this shape:** `offset()` and `pageNumber()` ship from `@powerhousedao/switchboard-api` (Appendix A, §7.2). This example hand-rolls the `OffsetPaginator` contract under the distinct name `offsetPages` purely to show what a bespoke variant implements; do not re-declare a paginator under a shipped name (`pageNumber`/`offset`) — it shadows the export and collides if the built-in is ever imported.
- **This is the `"offset"` half of the honest-Liskov split (§7.2):** `OffsetPaginator` and `SeekPaginator` are *separate* interfaces precisely because they accept different sort inputs. Offset honors an arbitrary `OrderingBackend` sort and can report a total; seek can only order by its cursor columns and refuses to count. Don't try to make one substitute for the other.
- **`totalCount` is a companion query, not an `envelope` output:** `PaginatorBase.envelope(rows, page)` never receives a count, so a pure offset paginator leaves `totalCount` undefined. In a hand-written handler *you* own the flow: run `countAll()` over the same builder scope and spread it onto the envelope. This is exactly what `defineResource`'s offset path does internally.
- **DoS guard preserved:** `max: 100` caps `size` even if a caller passes a larger `size`; `offset` still reads `(pageNo-1)*size` rows server-side, so pair deep-page access with a UX/limit policy — keyset (next example) is O(1) per page and is the default for a reason.
- **`VALIDATION`, never 500:** an empty sort or an unlisted `-field` throws `ApiError("VALIDATION")`, which every projector maps to its idiom (HTTP 400 / GraphQL BAD_USER_INPUT / RPC -32602).
- **Closed output still applies:** the paginator is orthogonal to the output pick; `InvoiceDto` is closed and the fixed stage narrows each row.


### A custom SeekPaginator: deterministic snapshot pagination

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`

A `SeekPaginator<Row>` that pins a **snapshot boundary** in its opaque cursor so rows inserted after page 1 never shift the window (stable, gap-free paging under concurrent inserts). It implements the `"seek"` contract verbatim: a row-value `(orderBy, tieBreaker)` seek, direction-flippable on the configured column, a hard `max` cap, an opaque base64url cursor, and deliberately **no `totalCount`**.

```ts
import {
  ApiError,
  type SeekPaginator,
} from "@powerhousedao/switchboard-api";
import type { PagedResults } from "@powerhousedao/reactor/shared/types";

// Cursor payload is opaque to clients; we pin `snap` (the snapshot boundary) on page 1 and carry it forward.
type SnapCursor = { snap: string; o: unknown; t: unknown };
const enc = (c: SnapCursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
const dec = (s: string): SnapCursor | null => (s ? (JSON.parse(Buffer.from(s, "base64url").toString()) as SnapCursor) : null);

/**
 * snapshotKeyset — a seek paginator that freezes the result set at first-page time.
 *   orderBy/tieBreaker : the compound seek key (must be indexed, unambiguous columns)
 *   snapshotColumn     : a monotonic column (e.g. createdAtUtc) bounded to the snapshot instant
 */
export function snapshotKeyset<Row>(o: {
  orderBy: keyof Row & string;
  tieBreaker: keyof Row & string;
  snapshotColumn: keyof Row & string;
  default: number;
  max: number;
}): SeekPaginator<Row> {
  return {
    mode: "seek",
    columns: [o.orderBy, o.tieBreaker],
    apply(qb, sort, page) {
      const s = sort[0];
      if (s && s.field !== o.orderBy) {
        throw new ApiError("VALIDATION", `sort field '${s.field}' is not supported by this keyset`);
      }
      const dir = s?.dir ?? "asc";
      const cmp: ">" | "<" = dir === "asc" ? ">" : "<";
      const limit = Math.min(page.limit || o.default, o.max);   // hard page cap (DoS guard)
      const cur = dec(page.cursor);
      const snap = cur?.snap ?? new Date().toISOString();       // freeze the window on page 1

      let q = qb.where(o.snapshotColumn as any, "<=", snap as any); // inserts after `snap` never appear
      if (cur) {
        // row-value seek: (orderBy, tieBreaker) `cmp` (last.orderBy, last.tieBreaker)
        q = q.where((eb: any) => eb.or([
          eb(o.orderBy as any, cmp, cur.o),
          eb.and([ eb(o.orderBy as any, "=", cur.o), eb(o.tieBreaker as any, cmp, cur.t) ]),
        ]));
      }
      return q.orderBy(o.orderBy, dir).orderBy(o.tieBreaker, dir).limit(limit + 1); // +1 sentinel
    },
    envelope(rows, page): PagedResults<Row> {
      const cur = dec(page.cursor);
      const limit = Math.min(page.limit || o.default, o.max);
      const hasNext = rows.length > limit;
      const results = hasNext ? rows.slice(0, limit) : rows;
      const last = results[results.length - 1] as Record<string, unknown> | undefined;
      const snap = cur?.snap
        ?? ((rows[0] as Record<string, unknown> | undefined)?.[o.snapshotColumn] as string | undefined)
        ?? new Date().toISOString();
      const nextCursor = hasNext && last
        ? enc({ snap, o: last[o.orderBy], t: last[o.tieBreaker] })
        : undefined;
      return { results, options: page, nextCursor }; // NO totalCount — counting defeats the seek (§7.2)
    },
  };
}

// Usage is a drop-in for keyset() in any hand-written read or a ResourceConfig.read.pagination:
//   const paginator = snapshotKeyset<InvoiceRow>({
//     orderBy: "createdAtUtc", tieBreaker: "id", snapshotColumn: "createdAtUtc", default: 25, max: 100,
//   });
//   // then: paginator.apply(qb, sort, page) / paginator.envelope(rows, page) — exactly as in the aging report.
```

**Notes**

- **Determinism is the whole point:** a plain keyset is stable under *appends past the cursor* but a client paging slowly can still interleave brand-new rows. Pinning `snapshotColumn <= snap` (captured on page 1, carried in the opaque cursor) makes the window immutable for the life of the pagination — no dupes, no skips.
- **Contract fidelity:** it satisfies `SeekPaginator<Row>` exactly — `mode: "seek"`, `columns` advertising the cursor key (so `build()` can reject a resource whose `sortable` exceeds it, §7.2/§6.8), a row-value seek that's O(1) per page on the compound index, direction-flippable on `orderBy`, `VALIDATION` on any other sort field, `max` cap, and **no `totalCount`**.
- **Opaque cursor:** clients get a base64url blob, not a page offset — they cannot forge a `snap` in the past to widen the window or enumerate. Keep the payload minimal; if you need tamper-evidence, HMAC the cursor (the framework treats it as opaque either way).
- **Cursor columns must be physical & unambiguous** — same discipline as the aging report: seek predicates live in `WHERE`. If you seek over a computed value, materialise it in a CTE first.
- **The `as any` on columns** is the acknowledged Kysely stringly-typed-column boundary inside `<any, any, Row>`; the paginator is pure and trivially unit-testable (feed it `rows` + a `page`, assert the sliced results and the minted cursor — no DB, no HTTP).


### A custom Plugin: op-level wrap + HTTP 429 edge + metered install(host)

**Level:** Advanced · **Transports:** `graphql`, `rest`, `ws`, `rpc`, `webhook`

A daily-quota `Plugin` that adds a cross-cutting concern **without editing core** (OCP). It runs `wrap` at the op level on *every* transport (the authoritative counter, `phase: "outer"` so it rejects pre-authz), short-circuits with a real **HTTP 429 at the fetch edge before the body is buffered**, and wires its rejection metric through the injected `PluginHost.getMeter` (DIP — it never reaches for a global exporter).

```ts
import type { Plugin, Middleware, OperationDef, OperationContext } from "@powerhousedao/switchboard-api";
import { ApiError } from "@powerhousedao/switchboard-api";
import type { FetchHandler } from "@powerhousedao/reactor-api/graphql/gateway/types";
import type { Counter } from "@opentelemetry/api";

export function dailyQuota(o: { max: number; by?: "user" | "ip" }): Plugin {
  type Bucket = { n: number; resetAt: number };
  const buckets = new Map<string, Bucket>();
  const DAY = 86_400_000;
  let rejected: Counter | undefined;

  // bounded + TTL-evicted map (no unbounded growth from header rotation — the §9 rate-limit lesson)
  const bump = (key: string): boolean => {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) { b = { n: 0, resetAt: now + DAY }; buckets.set(key, b); }
    b.n += 1;
    if (buckets.size > 100_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return b.n > o.max;
  };
  const peek = (key: string): boolean => {
    const b = buckets.get(key);
    return !!b && b.resetAt > Date.now() && b.n >= o.max;
  };
  const subjectOf = (ctx: OperationContext<any, any>) =>
    o.by === "ip" ? (ctx.headers.get("x-real-ip") ?? "anon") : (ctx.user?.address ?? "anon");

  return {
    name: "dailyQuota",
    phase: "outer",                                  // pre-authz: throttle before doing any work
    appliesTo: (op) => op.kind !== "subscription",   // streams are governed by connection caps (§10.9)

    // (1) op-level, ALL transports — the authoritative per-op/per-subject counter.
    wrap: ((next, op) => async (input, ctx) => {
      if (bump(`${op.id}:${subjectOf(ctx)}`)) {
        rejected?.add(1, { op: op.id, by: o.by ?? "user" });
        throw new ApiError("RATE_LIMITED", `daily quota for '${op.id}' exhausted`, undefined, /* retryable */ true);
      }
      return next(input, ctx);
    }) as Middleware,

    // (2) HTTP-edge short-circuit: 429 BEFORE the body is buffered/parsed (coarse, IP-keyed).
    //     On the multiplexed /rpc mount op === null → we fall back to a global IP pre-buffer reject.
    asFetchMiddleware: (op: OperationDef | null) => (h: FetchHandler) => async (req: Request) => {
      const ip = req.headers.get("x-real-ip") ?? "anon";
      const key = op ? `${op.id}:${ip}` : `rpc-batch:${ip}`;
      if (peek(key)) {
        rejected?.add(1, { op: op?.id ?? "rpc-batch", by: "ip" });
        return new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "3600" },
        });
      }
      return h(req);
    },

    // (3) DIP: the host injects the meter — the plugin owns neither the exporter nor a global.
    install(host) {
      rejected = host.getMeter("@acme/quota").createCounter("saf.quota.rejected", {
        description: "operations rejected by the daily quota plugin",
      });
    },
    dispose() { buckets.clear(); },
  };
}

// Wiring (host boot) — added like any other plugin; core is untouched:
//   const api = new SwitchboardApi().register(invoiceAging).use(dailyQuota({ max: 5_000, by: "user" })).build();
```

**Notes**

- **Two layers, on purpose:** `wrap` is the *authoritative* limiter — it runs inside `rt.invoke` on every transport (GraphQL/REST/RPC/webhook), keyed by the real authenticated subject, and throwing `ApiError("RATE_LIMITED")` lets each projector map to its idiom (HTTP 429 / RPC -32029). `asFetchMiddleware` is a *cheap HTTP-edge guard* that returns a 429 `Response` before the body is even buffered — DoS relief that never reaches the pipeline. Per §9 it only wraps SAF-mounted REST/RPC handlers, so the `wrap` counter is what covers every transport.
- **`phase: "outer"` is mandatory here:** a quota must reject *before* authz and handler work (§5 — outer plugins run pre-authz). An `inner` limiter would authorize and possibly hit the DB before deciding to throttle.
- **`op === null` on `/rpc`:** the multiplexed RPC/GraphQL mounts hand `asFetchMiddleware` a `null` op (one route, many methods). Handle it — fall back to a coarse IP/global bucket — exactly as the built-in `rateLimit()` does (§8.4). The precise per-op accounting still happens in `wrap`.
- **Edge keys must be coarse:** at the fetch edge you have headers, not a verified identity (GET/OPTIONS skip bearer verification), so key the 429 by a *trusted-proxy* IP header, never a spoofable raw `X-Forwarded-For`, and keep the bucket map bounded + TTL-evicted (the §9 spoofing/memory-DoS lesson).
- **DIP via `PluginHost`:** `install(host)` takes the meter from `host.getMeter(...)`; the host owns the OpenTelemetry exporter. `dispose()` releases state on shutdown. A plugin that needs invalidation (like `cache()`) would call `ensureGlobalDocumentSubscription(host.reactor)` here and hold the unsubscribe for `dispose()` — never assume a subscription projector is mounted.
- **It cannot unseat the fixed stages:** a plugin wraps *around* input `safeParse`/authorize/output-pick but can never reach a handler bypassing them (§10.2) — even a hostile/misordered plugin is contained.


### A brand-new TransportProjector: an SSE-only subscription projector (OCP)

**Level:** Advanced · **Transports:** `ws`

A sixth transport added as a single new `TransportProjector` with **zero** edits to `OperationDef`, `Serializer`, or any existing projector. It projects each `subscription` op (e.g. `chatMessage.changes`) to Server-Sent Events via `mountNodeRoute` (raw streaming), and — because the Fetch middleware chain does not wrap node routes — runs the **same pipeline in-handler** through `rt.invoke`, so subscribe-time drive authz, per-event `canReadDocument`, and the closed output pick all still fire.

```ts
import type {
  TransportProjector, OperationRegistry, ProjectionRuntime, ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import { ApiError } from "@powerhousedao/switchboard-api";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * SSE-only projector for subscription ops. Demonstrates OCP: a whole new wire is a new projector and
 * nothing else. Streaming delivery-semantics class is "ws"; the distinct wire label is "sse" (§6.2).
 */
export class SseSubscriptionProjector implements TransportProjector {
  readonly transport = "ws" as const;

  project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void {
    for (const [id, op] of registry.operations) {
      if (op.kind !== "subscription") continue;              // only streams project to SSE
      const path = `${deps.basePath}/sse/${id.replaceAll(".", "/")}`;

      // mountNodeRoute → raw Node req/res (streaming needs it; the Fetch middleware chain does NOT
      // wrap node routes), so we run the SAME pipeline in-handler via rt.invoke (MCP precedent, §8.6).
      deps.httpAdapter.mountNodeRoute("GET", path, async (req: IncomingMessage, res: ServerResponse) => {
        // makeContext resolves identity + validated driveId; we label the wire "sse".
        const ctx = await rt.makeContext(
          { headers: req.headers, url: req.url, wire: "sse" },
          this.transport,
        );
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        try {
          const input = Object.fromEntries(new URL(req.url ?? "", "http://local").searchParams);
          // rt.invoke runs FIXED input safeParse + FIXED authorize (the subscription's REQUIRED drive
          // policy, §10.9) and returns the handler's AsyncIterable. Per-event canReadDocument still
          // fires inside that stream (fail-closed), identical to the WS path (§8.3).
          const stream = (await rt.invoke(id, input, ctx)) as AsyncIterable<unknown>;
          for await (const event of stream) {
            if (ctx.signal?.aborted) break;
            // `event` is already serialized THROUGH the op's output pipeline (closed pick + fieldGuards).
            res.write(`event: ${op.webhook?.event ?? "message"}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } catch (err) {
          const code = err instanceof ApiError ? err.code : "INTERNAL";  // ApiError.code → SSE error frame
          res.write(`event: error\ndata: ${JSON.stringify({ code })}\n\n`);
        } finally {
          res.end();
        }
      });
    }
  }
}

// Wiring (host boot) — ADD it; existing projectors and every OperationDef are untouched (OCP):
//   await api.project([new GraphqlProjector(), new SseSubscriptionProjector()], deps);
```

**Notes**

- **OCP, literally:** the class only *reads* the registry and calls `deps.httpAdapter.mountNodeRoute` + `rt.invoke`. No `OperationDef` field, no `Serializer`, no other projector changes. A `chatMessage.changes` subscription authored once now also streams over SSE just by adding `new SseSubscriptionProjector()` to `api.project([...])` in the host boot (the non-GraphQL projectors are wired there, §12.2 — SSE does not ship from a package).
- **Security is not re-implemented — it's re-used:** `mountNodeRoute` bypasses the Fetch auth/drive middleware, so a naive raw stream would be an open pipe. Routing through `rt.invoke` keeps the *fixed* stages: input `safeParse`, the subscription's **required** `{ kind: "drive" }` subscribe-time policy (§10.9), the per-event `canReadDocument` inside the handler's `AsyncIterable` (§8.3), and the closed output pick + `fieldGuards`. You do your own *transport plumbing*, not your own authz.
- **`transport` vs `wire`:** SSE shares streaming *delivery semantics* with WS, so `transport = "ws"`; the *distinct channel* is `wire: "sse"`. Header-keyed plugins must branch on `wire` (§6.2). This is the same pattern a NATS RPC bridge uses (`transport: "rpc", wire: "nats"`).
- **Only subscription ops project here:** queries/mutations have no SSE meaning; the loop skips them. Conversely `build()` rejects unsupported `(kind, transport)` pairs elsewhere (e.g. a subscription over REST/RPC) — §8.6.
- **Streaming honesty:** SSE over a buffered adapter is a trap — some Fetch adapters `await response.text()` and defeat streaming, which is exactly why this uses `mountNodeRoute` (raw `res.write`) rather than a `FetchHandler`. Verify true flush behavior on your adapter, and steer heavy push consumers to WS or webhooks (§8.3 SSE caveat).
- **Backpressure/cleanup:** honor `ctx.signal` to stop iterating when the client disconnects, and cap concurrent SSE connections per identity (subscription DoS, §10.9) — the same per-identity caps the WS owner enforces.


---

## 9. Using the abstractions (defineResource)

`defineResource` is SAF's batteries layer — the `ModelViewSet` analog. One `ResourceConfig` wires a read model (a `RelationalDbProcessor` or a small-N `IReactorClient.find` binding), a serializer (output/create/update DTOs + `fieldGuards`), closed filter/sort allowlists, a paginator, document-model write bindings, and per-verb deny-by-default security into a full CRUD surface: `list` / `retrieve` / `create` / `update` / `delete` / `changes` plus any custom `@action`s you attach. It emits ordinary `OperationDef`s — there is **no second code path**; anything `defineResource` produces you could have hand-written with `operation()`.

The payoff is DRY across the whole transport matrix. A single config projects to GraphQL SDL, REST routes, JSON-RPC methods, WebSocket subscriptions, outbound webhooks, **and** the inferred RPC client type — every one calling the identical `rt.invoke` pipeline (fixed input `safeParse` → fixed authz → handler → fixed output pick), so validation, authorization and business logic can never diverge by transport. The filter DTO derives from the SQL allowlist; the client type derives from `typeof registry.typed`. You define once.

These examples build a single invoicing system from the simplest possible resource up to the full seven-op Invoice with a custom action, then show the two read bindings (processor vs `find`), how the filter DTO is derived from `filterable`, safe bulk writes, and the one-time host wiring that lights up every transport. Every block is grounded in Appendix A of the spec and is internally consistent; where I intentionally diverge from the spec's §7.7 listing (the `keyset` + `sortable` mismatch that §7.2 would reject at `build()`), I call it out in the notes.


### The minimal resource — five CRUD verbs from one config (Todo)

**Level:** Simple · **Transports:** `graphql`, `rest`, `rpc`

The smallest complete `defineResource`: a Kysely read-model row + processor, output/create/update DTOs, a `keyset` paginator, and per-verb deny-by-default security. One config yields `todo.list/retrieve/create/update/delete` across GraphQL, REST and RPC — no custom actions, no realtime, no ceremony.

```ts
import { z } from "zod";
import {
  defineResource, keyset,
  type FilterSet, type OrderingBackend,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import {
  makeTodoDocument, editTodoAction, deleteTodoAction, TODO_DOC_TYPE,
} from "@acme/todo-model";

// 1) Read-model row (Kysely schema) + processor. `ownerAddress` is internal and
//    MUST NOT leak — note it is absent from TodoOutput below.
interface TodoRow {
  id: string; title: string; done: boolean; createdAtUtc: string; ownerAddress: string;
}
interface TodoDb { todo: TodoRow }
export class TodoReadModel extends RelationalDbProcessor<TodoDb> {
  // initAndUpgrade() creates the indexed `todo` table; onOperations() projects
  // CREATE/EDIT/DELETE actions into rows. Ships from @acme/todo-api/processors.
}

// 2) DTOs. `output` is CLOSED (.strict()); the fixed output stage picks EXACTLY
//    these keys, so a SELECT * read model cannot leak ownerAddress.
const TodoOutput = z.object({
  id: z.string(), title: z.string(), done: z.boolean(), createdAtUtc: z.string(),
}).strict();
const TodoCreate = z.object({ title: z.string().min(1) }).strict();
const TodoUpdate = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
}).strict();

// 3) Closed allowlists + the default (keyset) paginator.
const filterable: FilterSet<TodoRow> = {
  done:  { type: "boolean", ops: ["eq"] },
  title: { type: "string",  ops: ["eq", "contains"] },
};
const sortable: OrderingBackend<TodoRow> = ["createdAtUtc"];

// 4) ONE config -> todo.list / .retrieve / .create / .update / .delete
export const todoRegistry = defineResource({
  name: "todo",
  version: "1.0.0",
  documentType: TODO_DOC_TYPE,
  serializer: {
    output: TodoOutput, create: TodoCreate, update: TodoUpdate,
    sortable: ["createdAtUtc"],
    // serializer.filter omitted -> derived from read.filterable (one source of truth)
  },
  read: {
    source: TodoReadModel, table: "todo", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  write: {
    create: (input) => ({ document: makeTodoDocument(input) }),  // reactor.create — real creation
    update: (patch) => [editTodoAction(patch)],                  // applied to the authorized id
    remove: () => [deleteTodoAction({})],
  },
  security: {
    list:   { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! }, // §10.7
    get:    { kind: "document", access: "read",   subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write",  subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
});
// todoRegistry = { "todo.list", "todo.retrieve", "todo.create", "todo.update", "todo.delete" }
// — every entry a precisely-typed OperationDef.
```

**Notes**

- **Deny-by-default, per verb.** Every verb carries an explicit `SecurityPolicy`; there is no default-allow and no way to omit it (`security` is required, and `build()` rejects a `list` that isn't drive-scoped).
- **`list` is `{ kind: "drive" }`, not `authenticated`.** `ctx.driveId` comes from the client `Drive-Id` header, and drive-middleware only checks shard ownership (421), not per-user authz — so a bare `authenticated` `list` would let any logged-in user read another tenant's drive (the IDOR of §10.7). `defineResource`'s `security.list` type won't accept `authenticated`.
- **CREATE = real creation.** `write.create` returns `{ document }` → `reactor.create`. Never `execute()` against a freshly-minted id (that only mutates existing docs). `update`/`remove` produce `Action[]` applied to the **authorized** document the id resolved to.
- **Field-leak guard.** `ownerAddress` is on the row but absent from `TodoOutput.strict()`; the fixed output stage explicitly picks the declared keys, so `selectAll()` can't leak it.
- **Gotcha:** no `read.changes` and no `webhook.event`, so there's no `todo.changes` subscription and no outbound webhook — this resource only projects to GraphQL/REST/RPC. Add `read.changes` to light up WS + webhooks (Example 2).


### The full Invoice resource — read model + serializer + write bindings + changes + a custom @action

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`, `ws`, `webhook`

The centerpiece: an end-to-end Invoice `defineResource` with a `RelationalDbProcessor` read model, a serializer carrying create/update DTOs and a `fieldGuards` redaction, closed filter/sort allowlists, a `keyset` paginator, document-model write bindings, a drive-scoped `changes` subscription, and a custom `invoice.send` `@action` built on the low-level `operation()`. One config → seven ops across all five transports.

```ts
import { z } from "zod";
import {
  defineResource, operation, keyset,
  type FilterSet, type OrderingBackend, type Serializer,
  ApiError,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import {
  makeInvoiceDocument, editInvoiceAction, voidInvoiceAction, sendInvoiceAction,
  INVOICE_DOC_TYPE,
} from "@acme/invoice-model";

// ── 1) Read-model row (Kysely schema) + processor ───────────────────────────
// `ownerAddress` is internal bookkeeping and MUST NOT leak to any transport.
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {
  // initAndUpgrade() creates the indexed `invoice` table; onOperations() projects
  // CREATE/EDIT/VOID/SEND actions into rows. Ships from @acme/invoice-api/processors.
}

// ── 2) Serializer: closed DTOs + a per-field guard ──────────────────────────
// `output` is CLOSED and EXCLUDES ownerAddress; the fixed output stage picks
// exactly these keys, so a SELECT * read model still cannot leak it.
export const InvoiceOutput = z.object({
  id: z.string(),
  number: z.string(),
  status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(),
  amount: z.number(),
  currency: z.string(),
  dueDate: z.string(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
}).strict();
export const InvoiceCreate = z.object({
  number: z.string().min(1),
  counterparty: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  dueDate: z.string(),
}).strict();
export const InvoiceUpdate = InvoiceCreate.partial();

export const serializer: Serializer<typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate,
  // keyset can only order by its cursor column, so advertise EXACTLY that (§7.2):
  sortable: ["createdAtUtc"],
  // counterparty is redacted for anonymous callers by an AUTO-injected inner plugin:
  fieldGuards: { counterparty: (ctx) => Boolean(ctx.user) },
};

// ── 3) Closed filter + sort allowlists ──────────────────────────────────────
export const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte", "range"] },
  currency:     { type: "string", ops: ["eq", "in"] },
  dueDate:      { type: "string", ops: ["gte", "lte", "range"] },
};
// OrderingBackend must NOT exceed the keyset seek columns (createdAtUtc, id):
export const sortable: OrderingBackend<InvoiceRow> = ["createdAtUtc"];

// ── 4) A custom @action on the low-level builder — writes the AUTHORIZED doc ─
// Ordering is load-bearing: .security() must run BEFORE .mutation is callable —
// until auth is decided the terminal is typed AuthNotDecided (uncallable).
export const sendInvoice = operation("invoice.send")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .meta({ rest: { method: "POST", path: "/:id/send" }, webhook: { event: "invoice.sent" } })
  .security({ kind: "document", access: "write", subject: (i) => i.id })
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);   // reuse the checked identifier
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [sendInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", handle.fetchIdentifier)
      .executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;   // projected to InvoiceOutput by the fixed output stage
  });

// ── 5) ONE config -> list/retrieve/create/update/delete/changes/send ────────
export const invoiceRegistry = defineResource({
  name: "invoice",
  version: "1.0.0",
  documentType: INVOICE_DOC_TYPE,
  serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
    changes: { search: (): SearchFilter => ({ type: INVOICE_DOC_TYPE }) }, // enables changes + webhooks
  },
  write: {
    branch: () => "main",
    create: (input) => ({ document: makeInvoiceDocument(input) }),  // reactor.create — real creation
    update: (patch) => [editInvoiceAction(patch)],                  // applied to the authorized id
    remove: () => [voidInvoiceAction({})],
    async: false,                                                   // execute() waits + re-reads the doc
  },
  security: {
    list:    { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! }, // §10.7
    get:     { kind: "document", access: "read",   subject: (i) => i.id },
    create:  { kind: "create" },
    update:  { kind: "document", access: "write",  subject: (i) => i.id },
    remove:  { kind: "document", access: "manage", subject: (i) => i.id },
    changes: { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! }, // subscribe-time
  },
  actions: [sendInvoice],
});
// invoiceRegistry = {
//   "invoice.list", "invoice.retrieve", "invoice.create", "invoice.update",
//   "invoice.delete", "invoice.changes", "invoice.send"
// } — all precisely-typed OperationDefs.
```

**Notes**

- **Builder ordering is type-enforced.** `sendInvoice` runs `.input().output().requires().meta().security()` before `.mutation`. Until `.security()`/`.public()` decides auth, the terminal property is typed `AuthNotDecided` and `.mutation(...)` literally won't typecheck (§6.6) — 'forgot to authorize' is a compile error, not a runtime surprise.
- **Capabilities are gated by `.requires`.** The handler can touch `ctx.caps.reactor`/`ctx.caps.db` *only* because it declared `.requires("reactor", "db")`; an undeclared capability is a compile error. `ctx.caps` is a `Pick`, nothing more.
- **No confused deputy.** `authorize.assert("write", id)` returns a handle whose `fetchIdentifier` the handler reuses for both `execute` and the row read — the document that was authorized is provably the one written and returned.
- **Field security is structural.** `fieldGuards.counterparty` is enforced by an inner plugin that is auto-injected whenever a serializer declares guards — you can't forget to add redaction. Combined with the closed `output` pick, `ownerAddress` never leaves and `counterparty` is hidden from anonymous callers.
- **Collections are drive-scoped.** `list` and `changes` use `{ kind: "drive" }` (subscribe-time authz); the `changes` stream additionally runs per-event `matchesFilter` + `canReadDocument` fail-closed (§10.9).
- **One config → all transports** (§8 mapping): `changes` rides the shared WS server; `send` + `create`/`update`/`delete` emit outbound webhook events (`invoice.sent`/`.created`/`.updated`/`.deleted`), each authorized per-subscriber and redacted through this same output pipeline.
- **Gotcha — keyset vs §7.2 (intentional divergence from the spec's 7.7 listing):** `sortable` is `["createdAtUtc"]`, exactly the keyset cursor column. Advertising `amount`/`dueDate` (as §7.7 does) would *exceed* the seek columns `[createdAtUtc, id]`, and `build()` rejects that. Filtering by `amount`/`dueDate` is fine — that's the (separate) `filterable` allowlist. To *sort* by amount, switch paginators (Example 3).
- **`async: false`** → `execute()` waits and does a strongly-consistent re-read; `async: true` → `executeAsync` returns a `JobInfo` instead.


### Deriving the filter DTO from `filterable`, and choosing a paginator

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

Two things authors keep asking about `list`. First: the filter DTO is *derived from* `read.filterable` (one source of truth) — this shows the derivation helper so you can hand-narrow it, and the nested `{ field: { op: value } }` wire shape. Second: `keyset` and `offset`/`pageNumber` are separate interfaces with different sort contracts — pick per read.

```ts
import { z } from "zod";
import {
  defineResource, keyset, pageNumber,
  type FilterSet, type FilterOp, type Serializer,
} from "@powerhousedao/switchboard-api";
// InvoiceRow / InvoiceOutput / InvoiceCreate / InvoiceUpdate / InvoiceReadModel /
// filterable / makeInvoiceDocument / editInvoiceAction / voidInvoiceAction /
// INVOICE_DOC_TYPE come from the full resource in Example 2.

// ── Derive a wire/SDL filter DTO straight from `filterable` — this is exactly
//    what defineResource does when serializer.filter is OMITTED. Each declared
//    op maps to its value shape (in/range are the interesting ones). ─────────
const opShape: Record<FilterOp, (base: z.ZodTypeAny) => z.ZodTypeAny> = {
  eq: (b) => b, neq: (b) => b, gt: (b) => b, gte: (b) => b, lt: (b) => b, lte: (b) => b,
  in: (b) => z.array(b),
  contains: () => z.string(),
  range: (b) => z.tuple([b, b]),
};
const zodBase = (t: "string" | "number" | "boolean") =>
  t === "number" ? z.number() : t === "boolean" ? z.boolean() : z.string();

export function deriveFilterSchema<Row>(allow: FilterSet<Row>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [field, spec] of Object.entries(allow) as [
    string, { type: "string" | "number" | "boolean"; ops: readonly FilterOp[] },
  ][]) {
    const base = zodBase(spec.type);
    const ops: Record<string, z.ZodTypeAny> = {};
    for (const op of spec.ops) ops[op] = opShape[op](base);
    shape[field] = z.object(ops).partial().strict().optional();
  }
  return z.object(shape).strict();
}

// (a) AUTO: omit serializer.filter — defineResource derives exactly this DTO.
const serializerAuto: Serializer<typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate, sortable: ["createdAtUtc"],
};

// (b) EXPLICIT: hand-narrow the derived DTO to a subset (docs/SDL surface only).
//     compileFilter(read.filterable, ...) is STILL the runtime security boundary,
//     so a narrowed DTO can never widen what is actually filterable.
const InvoiceFilter = deriveFilterSchema(filterable).pick({ status: true, dueDate: true });
const serializerNarrow: Serializer<
  typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate, typeof InvoiceFilter
> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate,
  filter: InvoiceFilter, sortable: ["createdAtUtc"],
};

// ── keyset (DEFAULT): seek by the cursor column, opaque cursor, O(1) pages,
//    NO totalCount; sort is limited to that column (direction may flip). ─────
export const invoiceKeyset = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer: serializerAuto,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable,
    sortable: ["createdAtUtc"],                                   // == the seek column
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  write: {
    create: (i) => ({ document: makeInvoiceDocument(i) }),
    update: (p) => [editInvoiceAction(p)], remove: () => [voidInvoiceAction({})],
  },
  security: {
    list:   { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! },
    get:    { kind: "document", access: "read",   subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write",  subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
});

// ── pageNumber (OFFSET): honors ARBITRARY OrderingBackend sort + totalCount,
//    at O(n) on deep pages. Widen `sortable` to match. ───────────────────────
export const invoiceByAmount = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE,
  serializer: { ...serializerAuto, sortable: ["amount", "dueDate", "createdAtUtc"] },
  read: {
    source: InvoiceReadModel, table: "invoice", filterable,
    sortable: ["amount", "dueDate", "createdAtUtc"],              // offset accepts arbitrary ordering
    pagination: pageNumber({ size: 25, max: 100 }),
  },
  write: {
    create: (i) => ({ document: makeInvoiceDocument(i) }),
    update: (p) => [editInvoiceAction(p)], remove: () => [voidInvoiceAction({})],
  },
  security: {
    list:   { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! },
    get:    { kind: "document", access: "read",   subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write",  subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
});

// ── Wire shape the client sends (nested { field: { op: value } }). Unlisted
//    field/op -> ApiError("VALIDATION"); sort uses DRF's `-field` convention. ─
// client["invoice.list"]({
//   filter: { status: { in: ["open", "draft"] },
//             dueDate: { range: ["2026-01-01", "2026-03-31"] } },
//   sort: ["-createdAtUtc"],   // keyset: only the cursor column, direction may flip
//   limit: 25,
// });
```

**Notes**

- **`filterable` is the one source of truth.** It's the closed allowlist that `compileFilter` turns into parameterized SQL (values bound, unlisted columns invisible, unlisted operators rejected). When `serializer.filter` is omitted, `defineResource` derives the wire/SDL DTO from it — `deriveFilterSchema` shows that derivation so you can hand-narrow the *advertised* surface. The narrowed DTO can only ever be a **subset**: the runtime `compileFilter` allowlist stays the security boundary, so you can't accidentally widen what's filterable through the DTO.
- **`keyset` and `offset`/`pageNumber` are genuinely different interfaces (honest LSP).** Keyset seeks by its configured cursor column(s) — opaque base64url cursor, O(1) per page, stable under concurrent inserts, but **no `totalCount`** and sort limited to that column ± direction. Offset/pageNumber honor an arbitrary `OrderingBackend` and give `totalCount`, at O(n) for deep pages. They aren't substitutable, which is why they're separate types (`SeekPaginator` vs `OffsetPaginator`).
- **`build()` cross-checks sort against the paginator.** A `sortable` set that exceeds a `SeekPaginator`'s columns is rejected at registration — that's why the keyset variant advertises only `createdAtUtc` while the offset variant can advertise `amount`/`dueDate`.
- **Every paginator has a hard `max`** (a DoS guard) — the client can't ask for an unbounded page.
- **Gotcha:** both resources here are named `invoice` and therefore mint the same op ids (`invoice.list`, …). They're **alternatives** — register only one in a given API. The `.pick(...)` on the derived schema is runtime-dynamic (the helper builds `z.object` from a `Record`), so treat it as a wire/SDL convenience, not a compile-time contract.


### The small-N variant — bind reads to `IReactorClient.find` instead of a processor

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`

When a resource is a handful of singleton-ish documents, you don't have to stand up a `RelationalDbProcessor`. Swap the `read` binding for a `document` binding: `list`/`retrieve` read straight through `IReactorClient.find`/`get`, `requires` becomes `["reactor"]`, and you inherit `find`'s limits. Everything else — write bindings, per-verb security, the closed output pick — is identical.

```ts
import {
  defineResource,
} from "@powerhousedao/switchboard-api";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import {
  makeInvoiceDocument, editInvoiceAction, voidInvoiceAction, INVOICE_DOC_TYPE,
} from "@acme/invoice-model";
// serializer (InvoiceOutput/Create/Update) is REUSED verbatim from Example 2.

// The ONLY change vs the processor-backed resource is the read binding:
// `document` (find/get) instead of `read` (a RelationalDbProcessor). Pick ONE.
export const invoiceSmallN = defineResource({
  name: "invoice",
  version: "1.0.0",
  documentType: INVOICE_DOC_TYPE,
  serializer,   // same closed DTOs + fieldGuards as the full resource

  // No RelationalDbProcessor. list -> reactor.find(search, view, paging);
  // retrieve -> canonicalize + reactor.get. Scope the search to this drive.
  document: {
    search: (ctx): SearchFilter => ({ type: INVOICE_DOC_TYPE, parentId: ctx.driveId }),
    // view? is optional (branch/scope selection); omitted -> defaults.
  },

  // Write bindings don't care HOW you read — identical to the processor variant.
  write: {
    create: (input) => ({ document: makeInvoiceDocument(input) }),
    update: (patch) => [editInvoiceAction(patch)],
    remove: () => [voidInvoiceAction({})],
  },

  security: {
    // list is STILL drive-scoped — the document binding does NOT relax §10.7.
    list:   { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! },
    get:    { kind: "document", access: "read",   subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write",  subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
    // No `changes`: realtime needs a processor's read.changes (or a direct
    // reactor subscription). The document binding yields the 5 CRUD verbs.
  },
});
// invoiceSmallN = { "invoice.list", "invoice.retrieve", "invoice.create",
//                   "invoice.update", "invoice.delete" }
// list/retrieve now `requires: ["reactor"]` (find/get), not `["db"]`.
```

**Notes**

- **When to reach for it.** A handful of singleton or slowly-growing documents where standing up an indexed read model isn't worth it. `find(search, view, paging) -> PagedResults<PHDocument>` gives you `list`; `retrieve` canonicalizes then `get`s. `requires` flips from `["db"]` to `["reactor"]` for the read verbs.
- **The tradeoff is real.** There is no compiled `filterable`/`sortable` allowlist here — you inherit `find`'s limits (no arbitrary sort/filter operators, no keyset seek). For anything that must scale or filter richly, use the processor (`read`) binding of Example 2. The two are mutually exclusive on one resource.
- **Security does not relax.** `list` is still `{ kind: "drive" }` — the collection is authorized against the drive before any `find` runs, so the document binding doesn't reintroduce the `Drive-Id` IDOR (§10.7). Scoping the `search` to `ctx.driveId` (via `SearchFilter.parentId`) is defense-in-depth on top of that policy.
- **No `changes` without a processor.** `changes` is gated on `read.changes`; a pure `document` binding yields the five CRUD verbs. If you need realtime, add a processor with `read.changes` or subscribe to the reactor directly.
- **Write path is unchanged.** `create`/`update`/`remove` go through `reactor.create` / `execute(handle.fetchIdentifier, …)` exactly as before — the read binding and the write binding are independent concerns (SRP).


### Custom @actions + a safe bulk write attached to the resource

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`, `webhook`

Beyond CRUD, attach any number of custom `@action`s via `actions: [...]` — they get the same fixed pipeline and project to every transport. This shows a single-document mutation (`invoice.markPaid`) and a *safe* bulk mutation (`invoice.bulkVoid`) that authorizes every id per-item with `documentEach` before one bounded `executeBatch` — not a `custom` 'am I logged in?' check over N ids.

```ts
import { z } from "zod";
import {
  operation, defineResource, keyset, ApiError,
} from "@powerhousedao/switchboard-api";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import {
  makeInvoiceDocument, editInvoiceAction, voidInvoiceAction, markPaidInvoiceAction,
  INVOICE_DOC_TYPE,
} from "@acme/invoice-model";
// InvoiceOutput, serializer, filterable, InvoiceReadModel, sendInvoice from Example 2.

// A single-document custom mutation — writes the AUTHORIZED document.
export const markInvoicePaid = operation("invoice.markPaid")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .meta({ rest: { method: "POST", path: "/:id/mark-paid" }, webhook: { event: "invoice.paid" } })
  .security({ kind: "document", access: "write", subject: (i) => i.id })
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [markPaidInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll()
      .where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;
  });

// A SAFE bulk mutation — EVERY id authorized per-item (fail-closed) BEFORE the
// handler runs, then a single BOUNDED executeBatch. Not an unbounded Promise.all.
export const bulkVoidInvoices = operation("invoice.bulkVoid")
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ voided: z.array(z.string()) }).strict())
  .requires("reactor")
  .security({ kind: "documentEach", access: "write", subjects: (i) => i.ids })   // §10.8
  .mutation(async ({ ids }, ctx) => {
    const res = await ctx.caps.reactor.executeBatch({
      jobs: ids.map((id) => ({
        key: id, documentId: id, scope: "global", branch: "main",
        actions: [voidInvoiceAction({ id })], dependsOn: [],
      })),
    });
    return { voided: Object.keys(res.jobs) };
  });

// Attach ALL of them. defineResource folds each into the op map by its id.
export const invoiceRegistry = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable: ["createdAtUtc"],
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
    changes: { search: (): SearchFilter => ({ type: INVOICE_DOC_TYPE }) },
  },
  write: {
    create: (input) => ({ document: makeInvoiceDocument(input) }),
    update: (patch) => [editInvoiceAction(patch)],
    remove: () => [voidInvoiceAction({})],
  },
  security: {
    list:    { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! },
    get:     { kind: "document", access: "read",   subject: (i) => i.id },
    create:  { kind: "create" },
    update:  { kind: "document", access: "write",  subject: (i) => i.id },
    remove:  { kind: "document", access: "manage", subject: (i) => i.id },
    changes: { kind: "drive",    access: "read",   drive: (_i, ctx) => ctx.driveId! },
  },
  actions: [sendInvoice, markInvoicePaid, bulkVoidInvoices],
});
// + "invoice.send", "invoice.markPaid", "invoice.bulkVoid" alongside the CRUD verbs.
```

**Notes**

- **Actions are first-class ops.** `actions: [...]` merges each `OperationDef` into the resource's op map by `id`; they run the identical fixed pipeline (validate → authz → handler → output pick) and project to every transport just like the generated verbs — GraphQL mutation, REST route (from `.meta({ rest })`), RPC method, and (with `webhook.event`) an outbound webhook.
- **Bulk = per-item authz, always.** `{ kind: "documentEach", subjects }` resolves and checks **every** id fail-closed before the handler runs (§10.8). This is the blessed pattern precisely so a `{ kind: "custom" }` 'am I logged in?' check can't become a confused deputy that voids 100 documents the caller doesn't own.
- **Bounded fan-out.** `executeBatch({ jobs })` submits one batch with `dependsOn` wiring; the transport edge caps batch size and uses bounded concurrency — no unbounded `Promise.all` amplification.
- **Single-doc actions reuse the authorized identifier.** `authorize.assert("write", id)` → `execute(handle.fetchIdentifier, …)` → re-read the same identifier: authorized, written, and returned documents are provably identical.
- **Gotcha:** an action's `(kind, transport)` must be projectable — a `subscription` action has no REST/RPC projection and is rejected at `build()`. Keep custom writes as `mutation`s and custom reads as `query`s.


### One config → all five transports: host wiring, package boundary, and the typed RPC client

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`, `ws`, `webhook`

The single `invoiceRegistry` is registered once and projected to GraphQL, REST, RPC, WebSocket and webhooks — but only the GraphQL slice ships *from the package*; the other transports are wired once in the host boot because `GraphQLManager` keeps those seams private. Shows the honest package layout, the one-time `api.project([...])` call, and the zero-codegen RPC client inferred from `typeof registry.typed`.

```ts
// ═══ @acme/invoice-api — package layout (only the GraphQL slice is contributable) ═══
// subgraphs/index.ts   -> export * as invoice from "./invoice.saf.js"  // PackageManager discovers this
// processors/index.ts  -> export { InvoiceReadModel }                  // the read model
// invoice.saf.ts       -> the ResourceConfig + defineResource(...)     // transport-agnostic

// ─────────────────────── switchboard/src/server.mts (host boot) ────────────────
import {
  SwitchboardApi, createRpcClient,
  GraphqlProjector, RestProjector, RpcProjector, WebhookProjector,
  rateLimit, observability, logging,
  type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";
import { invoiceRegistry } from "@acme/invoice-api/subgraphs";

// 1) Register the ONE config; add cross-cutting plugins. rateLimit/observability/
//    logging are on by default — hoisted so wrapFetch can fold their HTTP-edge middleware.
const plugins = [rateLimit({ rpm: 600 }), observability(), logging()];
const api = new SwitchboardApi({
  corsAllowlist: ["https://app.acme.xyz"], batchLimit: 50, bodyLimit: "8mb",
})
  .register(invoiceRegistry)
  .use(...plugins);

// 2) build() -> a precisely-typed registry. `registry.typed` is the SINGLE source
//    of truth for the RPC client type (zero codegen).
const registry = api.build();
export type InvoiceApi = typeof registry.typed;

// 3) Assemble ProjectionDeps from GraphQLManager's (new, §13) read-only accessors,
//    then project ALL transports ONCE. WS rides the GraphQL registration —
//    there is deliberately NO separate subscription projector.
function buildProjectionDeps(gm: GraphQLManager, authService: AuthService): ProjectionDeps {
  return {
    basePath: gm.getBasePath(),
    httpAdapter: gm.getHttpAdapter(),
    graphqlManager: gm,
    gatewayAdapter: gm.getGatewayAdapter(),
    wsServer: gm.getWsServer(),
    pubsub: gm.getPubSub(),
    driveOwnershipCache: gm.getDriveOwnershipCache(),
    authService,
    subgraphArgs: gm.getSubgraphArgs(),
    // wrapFetch folds the registered plugins' asFetchMiddleware (e.g. rateLimit's
    // pre-buffer 429) as the OUTERMOST edge layer. Each projector then composes
    // gm.getAuthFetch() (401) then gm.getDriveFetch() (421) INSIDE it, around its own
    // handler (§8.2) — so the request order is plugins -> auth -> drive -> handler, and
    // auth/drive are NOT re-applied here.
    wrapFetch: (h) =>
      plugins.reduceRight(
        (acc, p) => (p.asFetchMiddleware ? p.asFetchMiddleware(null)(acc) : acc),
        h,
      ),
  };
}

export async function wireTransports(gm: GraphQLManager, authService: AuthService) {
  await api.project(
    [new GraphqlProjector(), new RestProjector(), new RpcProjector(), new WebhookProjector()],
    buildProjectionDeps(gm, authService),
  );
  // From the SINGLE invoiceRegistry, now live on every transport:
  //   GraphQL: Query invoices/invoice · Mutation createInvoice/updateInvoice/
  //            deleteInvoice/sendInvoice · Subscription invoiceChanges
  //   REST:    GET/POST /rest/invoices · GET/PATCH/DELETE /rest/invoices/:id ·
  //            POST /rest/invoices/:id/send
  //   RPC:     invoice.list/.retrieve/.create/.update/.delete/.send
  //   Webhook: invoice.created/.updated/.deleted/.sent (per-subscriber authz + redaction)
}

// ─────────────────────── a consumer: the typed RPC client ──────────────────────
// Inputs are InferIn (pre-parse wire types). Subscriptions are EXCLUDED.
const client = createRpcClient<InvoiceApi>("https://api.acme.xyz/graphql/rpc");

const created = await client["invoice.create"]({
  number: "INV-1001", counterparty: "0xC0FFEE", amount: 4200, currency: "USD", dueDate: "2026-09-01",
});
const page = await client["invoice.list"]({
  filter: { status: { in: ["open", "draft"] } }, sort: ["-createdAtUtc"], limit: 25,
});
await client["invoice.send"]({ id: created.id });
// client["invoice.changes"]  // ❌ not on the client — subscriptions are WS-only
```

**Notes**

- **Packaging honesty.** Only the GraphQL projection ships from a package, via the `subgraphs/index.ts` subpath export that `PackageManager` discovers. `GraphQLManager` keeps the HTTP adapter, gateway adapter, shared WS server and fetch middlewares **private**, so REST/RPC/WS/webhook cannot be driven from inside a package — they're wired once in the host boot through the new §13 accessors. Don't claim a package ships non-GraphQL transports.
- **Truly one definition.** `register(invoiceRegistry)` + `project([...projectors])` lights up all five transports from the same `OperationDef`s; every transport is a projection that only adapts the wire shape and calls `rt.invoke` — identical validation, authz and logic, guaranteed.
- **The fetch edge is layered, not doubled.** `deps.wrapFetch` folds the plugin `asFetchMiddleware` chain (rate-limit pre-buffer 429, etc.) as the outermost wrapper; each projector composes `authFetch`(401)`/driveFetch`(421) around its own handler *inside* that (§8.2). Throttle fires before auth; auth before drive. `wrapFetch` does **not** apply auth/drive — doing so there would double-wrap them.
- **WS has one owner.** Registering the `hasSubscriptions` GraphQL subgraph already wires WS **and** SSE on the shared socket, so there is no separate subscription projector (a second `graphql-ws` server would double-handle every connection).
- **Zero-codegen client.** `createRpcClient<typeof registry.typed>` infers the entire surface from the single built registry; input types are `InferIn` (pre-parse wire shape) and subscriptions (`invoice.changes`) are excluded from the client type — reach for WS there.
- **Gotcha — `cache()` + `fieldGuards`.** If you add `cache({ ttlMs })`, it is refused on any op whose serializer declares `fieldGuards` unless the guard inputs are in the cache key — otherwise a value redacted for one caller could be served to another sharing the same address/drive. Invoice's `counterparty` guard means you must key on identity or skip caching that read.
- **Gotcha — CORS is a core seam.** `corsAllowlist` is threaded into the single `GraphQLManager.init → setupMiddleware` call (defaulting to same-origin), not stacked as a second `cors()` middleware — stacking wouldn't close the permissive default that already answered preflight (§10.11, §13).


---

## 10. Complex, real-world compositions

These are the end-to-end compositions — the point where the batteries, the plugin phases, and the transport projectors all have to agree at once. Every example below is still *only* `OperationDef`s flowing through the single `rt.invoke` pipeline (§5): the same fixed `input safeParse → authorize → inner plugins → handler → output-pick` stages, whichever transport delivered the call. What changes between them is how much you compose on top — an analytics store beside a read model, a dependency-ordered batch, a cache keyed by its redaction surface, a full host-boot wiring, a byte-compatible subgraph migration.

Two invariants carry through all of them. **Security is structural, not remembered.** Collection reads are `{ kind: "drive" }` (closing the `Drive-Id` IDOR, §10.7); bulk writes are `{ kind: "documentEach" }` (per-item, fail-closed, §10.8); the terminal `.query`/`.mutation`/`.subscription` is literally uncallable (`AuthNotDecided`, §6.6) until `.security()`/`.public()` decides a policy — which is exactly why every builder below calls `.input().output().requires().security()` *before* the terminal. **And the write path never fakes creation:** `create` returns a document for `reactor.create`/`createEmpty`, while `update`/`remove`/bulk act on the *authorized* `fetchIdentifier` through `execute`/`executeBatch` — never `execute` against a freshly minted id.

We keep one domain throughout — `Invoice`, with a `Ledger` account it settles into and a `ChatMessage`/`GithubEvent` pair that appear only in the host wiring — so the cached read, the cross-table report, the atomic batch, the boot file and the migration all read as facets of one system. Field names (`counterparty`, `amount`, `currency`, `status`, `createdAtUtc`) are reused verbatim across examples.


### Warm-up: a cache-eligible, drive-scoped computed count

**Level:** Simple · **Transports:** `graphql`, `rest`, `rpc`

The smallest cross-cutting composition — a hand-written computed query that opts into the globally-installed `cache()` via `idempotent: true`, is drive-scoped so it can't be pointed at another tenant, and is auto-observed. Establishes the read-model + drive-policy shape the bigger examples build on.

```ts
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";
// InvoiceReadModel is defined in the CRUD example below and ships from `<pkg>/processors`.
import { InvoiceReadModel } from "@acme/invoice-api/read-model.js";

// A computed read that reuses the same indexed read model the CRUD `list` uses.
// `.meta({ idempotent: true })` is the ONLY thing that makes it cache-eligible: the inner
// cache() plugin (installed once, app-wide) refuses to cache non-idempotent / non-query ops.
export const openInvoiceCount = operation("invoice.openCount")
  .input(z.object({ currency: z.string().length(3).optional() }))
  .output(z.object({ open: z.number().int(), currency: z.string().optional() }).strict())
  .requires("db")
  .meta({ idempotent: true })
  // COLLECTION read -> MUST be drive-scoped. `{ kind: "authenticated" }` here would let any
  // logged-in caller set `Drive-Id` to another tenant's drive and count it (§10.7). The drive
  // policy authorizes the caller against the drive BEFORE the namespace is even selected.
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! })
  .query(async (input, ctx) => {
    let qb = InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice")
      .select((eb) => eb.fn.countAll<number>().as("open"))
      .where("status", "=", "open");
    if (input.currency) qb = qb.where("currency", "=", input.currency);
    const row = await qb.executeTakeFirstOrThrow();
    return { open: Number(row.open), currency: input.currency };
  });
```

**Notes**

**Security / why it works**
- `requires("db")` is the whole DI contract: `ctx.caps` is `Pick<Capabilities, "db">`, so this handler *cannot* reference `ctx.caps.reactor` — that's a compile error, not a convention.
- The drive policy runs inside the fixed authz stage, so it fires identically on GraphQL, REST and RPC. There is no per-transport code path to forget it in.
- The output schema is `.strict()`; the fixed output stage picks exactly `{ open, currency }`, so a `SELECT *` regression can never leak a column.

**Gotchas**
- Caching is opt-in per op via `idempotent`; a query with side-effects must NOT set it.
- `ctx.driveId!` is safe here *because* the drive policy already asserted it — for a raw `operation()` read, the drive selector must be validated (in the input schema or the fixed drive step), never a bare header `!`-dereference (§6.9).


### Cached detail read with a self-bridged cache, a per-op rate-limit override, and metrics

**Level:** Intermediate · **Transports:** `graphql`, `rest`, `rpc`

A full `defineResource` whose resource-scoped plugins add `cache()` (keyed by id + driveId + user.address + input + redaction surface, self-bridged invalidation), a tighter `rateLimit()` scoped to just `invoice.retrieve` via `appliesTo`, and `observability()`. Shows how the `fieldGuards` ↔ cache-key interaction is what *permits* caching here.

```ts
import { z } from "zod";
import {
  defineResource, keyset, cache, rateLimit, observability,
  type FilterSet, type OrderingBackend, type Serializer, type Plugin,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import {
  INVOICE_DOC_TYPE, makeInvoiceDocument, editInvoiceAction, voidInvoiceAction,
} from "@acme/invoice-model";

// Read-model row + processor (ships from `<pkg>/processors`). `ownerAddress` is internal.
export interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {
  /* initAndUpgrade() creates the indexed `invoice` table; onOperations() projects actions. */
}

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string(), amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();                                    // CLOSED — ownerAddress is not a key -> never projected
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();
const InvoiceUpdate = InvoiceCreate.partial();

const serializer: Serializer<typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate> = {
  output: InvoiceOutput, create: InvoiceCreate, update: InvoiceUpdate,
  sortable: ["amount", "dueDate", "createdAtUtc"],
  // The ONLY guarded field. Its sole determinant is `Boolean(ctx.user)` — caller presence —
  // which the cache key ALREADY carries via `user.address`. That is precisely why cache() will
  // accept this op: the redaction surface is a function of something the key distinguishes.
  fieldGuards: { counterparty: (ctx) => Boolean(ctx.user) },
};

const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte", "range"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];

// PER-OP rate-limit override: a rateLimit plugin narrowed by `appliesTo` to exactly one op id.
// `appliesTo` is the OCP hook — no core edit, no second code path; the global bucket still
// covers every other op, this one gets a tighter budget.
const retrieveThrottle: Plugin = {
  ...rateLimit({ rpm: 60, by: "user" }),
  name: "rateLimit:invoice.retrieve",
  appliesTo: (op) => op.id === "invoice.retrieve",
};

export const invoiceRegistry = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
  },
  write: {
    create: (input) => ({ document: makeInvoiceDocument(input) }),  // reactor.create — real creation
    update: (patch) => [editInvoiceAction(patch)],                  // applied to the AUTHORIZED id
    remove: () => [voidInvoiceAction({})],
  },
  security: {
    list:   { kind: "drive",    access: "read",  drive: (_i, ctx) => ctx.driveId! },
    get:    { kind: "document", access: "read",  subject: (i) => i.id },
    create: { kind: "create" },
    update: { kind: "document", access: "write", subject: (i) => i.id },
    remove: { kind: "document", access: "manage", subject: (i) => i.id },
  },
  // Resource-scoped plugins compose AROUND the fixed stages; the framework orders them by phase.
  plugins: [
    // inner (post-authz), query-only. install() self-calls ensureGlobalDocumentSubscription(host.reactor)
    // and evicts by document id on DOCUMENT_CHANGES — so eviction works even in a REST/RPC-only deploy.
    cache({ ttlMs: 15_000 }),
    retrieveThrottle,   // outer (pre-authz) — rejects before any work, per-op
    observability(),    // outer — install(): host.getMeter("@powerhousedao/switchboard-api")
  ],
});
```

**Notes**

**Security / why it works**
- **Cache key = the whole authz+redaction surface.** The `cache()` plugin keys by `op.id` + `driveId` + `user.address` + input + the redaction-relevant surface. Because the only `fieldGuard` (`counterparty`) depends solely on *caller presence*, and presence is already encoded by `user.address` in the key, an anonymous cache entry (no address) and an authenticated one (address present) are distinct — a value redacted for one caller is never served to another. That is what lets `cache()` accept an op that declares `fieldGuards` at all (§9).
- **Self-bridged invalidation.** `cache().install()` itself holds the `ensureGlobalDocumentSubscription` unsubscribe, so invalidation does not silently depend on a webhook/subscription projector being mounted; eviction is keyed by document id, never a whole-store `clear()`.
- **Per-op override is additive, not a fork.** `retrieveThrottle` is the same hardened limiter (trusted-proxy IP, bounded/TTL-evicted buckets) with a narrower `appliesTo`; the global limiter from the host still applies everywhere else.

**Gotchas**
- If a guard depended on something *not* in the key — e.g. group membership resolved server-side — `cache()` would (correctly) refuse the op until you add that role to the key. Never widen `ttlMs` to paper over that.
- `observability()` is on by default at app scope (see the wiring example); listing it again here double-registers meters. Shown for completeness — in practice keep it global and let resource plugins carry only `cache` + the override.
- Resource plugins wrap *around* the fixed `safeParse`/`authorize` stages; none of them can reach a handler that skipped authz.


### Computed cross-table report: read model ⋈ analytics rollups, offset-paged with a real totalCount

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`

A hand-written `operation()` that groups the invoice read model by counterparty (`ctx.caps.db`), enriches each returned row with a trailing-90-day `PaidVolume` series from the analytics store (`ctx.caps.analytics`), offset-paginates with an honest companion-COUNT `totalCount`, and is drive-scoped to close the collection IDOR.

```ts
import { z } from "zod";
import {
  operation, offset, compileFilter, ApiError,
  type FilterSet, type OrderingBackend, type SortSpec,
} from "@powerhousedao/switchboard-api";
import {
  AnalyticsPath, type AnalyticsSeriesQuery,
} from "@powerhousedao/analytics-engine-core";
import type { SelectQueryBuilder } from "kysely";
import { DateTime } from "luxon";
import { InvoiceReadModel } from "@acme/invoice-api/read-model.js";

// The GROUPED projection the report produces — a different shape than InvoiceRow.
interface RevenueRow {
  counterparty: string; currency: string;
  invoiceCount: number; openAmount: number; paidAmount: number;
}

// Closed output; the offset connection carries a real totalCount (keyset couldn't).
const ReportRow = z.object({
  counterparty: z.string(), currency: z.string(),
  invoiceCount: z.number().int(), openAmount: z.number(), paidAmount: z.number(),
  trailing90PaidVolume: z.number(),          // enriched from the analytics store
}).strict();
const ReportPage = z.object({
  results: z.array(ReportRow),
  totalCount: z.number().int(),
  nextCursor: z.string().optional(),
}).strict();

// Two closed allowlists over the GROUPED row -> unlisted field/op is ApiError("VALIDATION"), never a 500.
const reportFilterable: FilterSet<RevenueRow> = {
  currency:     { type: "string", ops: ["eq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  paidAmount:   { type: "number", ops: ["gte", "lte", "range"] },
};
const reportSortable: OrderingBackend<RevenueRow> = ["paidAmount", "openAmount", "invoiceCount"];

// DRF `-field` parsing against the sort allowlist (offset paginators honor ARBITRARY sort).
function toSortSpecs(fields: string[], allow: OrderingBackend<RevenueRow>): SortSpec<RevenueRow>[] {
  return fields.map((f) => {
    const dir = f.startsWith("-") ? "desc" : "asc";
    const field = (f.startsWith("-") ? f.slice(1) : f) as keyof RevenueRow & string;
    if (!allow.includes(field)) throw new ApiError("VALIDATION", `unsortable field '${field}'`);
    return { field, dir };
  });
}

export const revenueReport = operation("invoice.revenueReport")
  .input(z.object({
    filter: z.record(z.any()).default({}),
    sort:   z.array(z.string()).default(["-paidAmount"]),
    limit:  z.number().int().min(1).max(200).default(50),
    cursor: z.string().default(""),
  }))
  .output(ReportPage)
  .requires("db", "analytics")
  // COLLECTION read across the whole drive -> drive-scoped, never { kind: "authenticated" } (§10.7).
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! })
  .query(async (input, ctx) => {
    const paginator = offset<RevenueRow>({ default: 50, max: 200 });   // OFFSET -> totalCount is available
    const page = { cursor: input.cursor, limit: input.limit };
    const sort = toSortSpecs(input.sort, reportSortable);

    // 1) CROSS-TABLE aggregate over the indexed read model (parameterized Kysely).
    const base = InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice")
      .select((eb) => [
        "counterparty", "currency",
        eb.fn.countAll<number>().as("invoiceCount"),
        eb.fn.sum<number>(eb.case().when("status", "=", "open").then(eb.ref("amount")).else(0).end()).as("openAmount"),
        eb.fn.sum<number>(eb.case().when("status", "=", "paid").then(eb.ref("amount")).else(0).end()).as("paidAmount"),
      ])
      .groupBy(["counterparty", "currency"]);

    // allowlisted filter -> arbitrary sort -> offset window. The allowlist is the security boundary;
    // the single cast is the documented Kysely dynamic-column seam (§7.2), not an authz bypass.
    let qb = compileFilter(reportFilterable, input.filter)(
      base as unknown as SelectQueryBuilder<any, any, RevenueRow>,
    );
    qb = paginator.apply(qb, sort, page);
    const rows = (await qb.execute()) as RevenueRow[];
    const env = paginator.envelope(rows, page);        // slices the sentinel row, mints nextCursor

    // 2) Honest totalCount for offset pagination — a companion COUNT over the distinct grouped set.
    const counted = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice")
      .select((eb) => eb.fn.count<number>("counterparty").distinct().as("n"))
      .executeTakeFirstOrThrow();

    // 3) ENRICH only the returned page from the analytics store (trailing-90d PaidVolume rollup).
    const analyticsQuery: AnalyticsSeriesQuery = {
      start: DateTime.utc().minus({ days: 90 }), end: DateTime.utc(),
      metrics: ["PaidVolume"],
      select: {
        drive:        [AnalyticsPath.fromString(`ph/drive/${ctx.driveId}`)],
        counterparty: env.results.map((r) => AnalyticsPath.fromString(`invoice/counterparty/${r.counterparty}`)),
      },
    };
    const series = await ctx.caps.analytics.getMatchingSeries(analyticsQuery);
    const volByPath = new Map<string, number>();
    for (const s of series) {
      const dim = s.dimensions.counterparty;
      const key = typeof dim === "string" ? dim : dim?.path.toString() ?? "";
      volByPath.set(key, (volByPath.get(key) ?? 0) + s.value);
    }

    return {
      results: env.results.map((r) => ({
        ...r,
        trailing90PaidVolume: volByPath.get(`invoice/counterparty/${r.counterparty}`) ?? 0,
      })),
      totalCount: Number(counted.n),
      nextCursor: env.nextCursor,
    };
  });
```

**Notes**

**Security / why it works**
- **Two capabilities, exactly two.** `requires("db", "analytics")` makes `ctx.caps` `Pick<Capabilities, "db" | "analytics">`; the handler still cannot touch `reactor` or `authz`. The analytics store is the read-only `IAnalyticsStore` (`getMatchingSeries`), not a write handle.
- **Drive scope is mandatory for a report too.** It reads across the whole drive, so it is a collection read: `{ kind: "drive", access: "read" }` authorizes the caller against the drive before any namespace query runs — a merely-authenticated policy would be the `Drive-Id` IDOR.
- **Closed output + allowlists.** `ReportPage`/`ReportRow` are `.strict()`; `reportFilterable`/`reportSortable` reject any unlisted field/op with `VALIDATION`. Every filter value is bound as a Kysely parameter — no interpolation, no enumeration oracle.

**Why offset here (not keyset)**
- `offset()` is the honest choice precisely because the report needs **arbitrary sort + a real `totalCount`**; keyset (§7.2) forbids counting and can only order by its cursor columns. They are separate interfaces (`OffsetPaginator` vs `SeekPaginator`) on purpose — don't try to bolt `totalCount` onto a `SeekPaginator`.

**Gotchas**
- The grouped projection type differs from the base row, so there is one documented cast at the `compileFilter` boundary (`<any, any, Row>`, §7.2). The allowlist — not the cast — is the security boundary.
- Analytics is eventually-consistent relative to writes (§15.3); the report is a rollup, not a strongly-consistent read-your-write. Enrich only `env.results` (the page you return), not the pre-slice `rows`, or you fan out analytics work for rows you discard.
- `AnalyticsSeries.dimensions[k]` is `string | AnalyticsDimension`; normalize both when keying (an `AnalyticsDimension` carries the `AnalyticsPath` on `.path`), as shown.


### Atomic batch settle: pay N invoices, then post one ledger entry — dependency-ordered, per-item authorized

**Level:** Advanced · **Transports:** `graphql`, `rest`, `rpc`

`invoice.settleBatch` marks up to 100 invoices paid and posts a single consolidated entry to a `Ledger` account document that `dependsOn` every settlement (executeBatch dependency ordering). `{ kind: "documentEach" }` authorizes every invoice id AND the account id per-item, fail-closed — the blessed pattern over a `{ kind: "custom" }` "am I logged in?" check.

```ts
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";
import type { ExecutionJobPlan, BatchExecutionResult } from "@powerhousedao/reactor";
import { markInvoicePaidAction } from "@acme/invoice-model";
import { postLedgerEntryAction } from "@acme/ledger-model";

export const settleBatch = operation("invoice.settleBatch")
  .input(z.object({
    accountId: z.string(),
    settlements: z.array(z.object({
      id: z.string(), paidAmount: z.number().positive(), paidAtUtc: z.string(),
    })).min(1).max(100),                       // hard bulk cap (DoS guard)
  }))
  .output(z.object({
    settled: z.array(z.string()),
    ledgerJobId: z.string(),
  }).strict())
  .requires("reactor")
  // PER-ITEM authorization: EVERY invoice id AND the account doc must pass canWrite, fail-closed,
  // BEFORE the handler runs. This is the confused-deputy fix (§10.8): a single "logged in?" custom
  // check could otherwise settle 100 invoices the caller doesn't own.
  .security({
    kind: "documentEach", access: "write",
    subjects: (i) => [i.accountId, ...i.settlements.map((s) => s.id)],
  })
  .mutation(async (input, ctx) => {
    // 1) One independent job per invoice — no sibling dependencies.
    const settleJobs: ExecutionJobPlan[] = input.settlements.map((s) => ({
      key: `settle:${s.id}`, documentId: s.id, scope: "global", branch: "main",
      actions: [markInvoicePaidAction({ id: s.id, amount: s.paidAmount, at: s.paidAtUtc })],
      dependsOn: [],
    }));

    // 2) The consolidated ledger entry runs ONLY AFTER every settlement lands.
    //    `dependsOn` names intra-batch plan keys; executeBatch resolves them to job UUIDs and orders.
    const total = input.settlements.reduce((sum, s) => sum + s.paidAmount, 0);
    const ledgerJob: ExecutionJobPlan = {
      key: "ledger", documentId: input.accountId, scope: "global", branch: "main",
      actions: [postLedgerEntryAction({ kind: "invoice-settlement", amount: total, count: settleJobs.length })],
      dependsOn: settleJobs.map((j) => j.key),
    };

    // executeBatch (on IReactorClient) applies jobs in dependency order, AWAITS every one, and THROWS a
    // RAW Error if any lands FAILED — so a failed settlement also fails the dependent ledger post. A
    // handler may surface ONLY ApiError (HARD RULE), so re-type that raw throw as CONFLICT/retryable
    // (the actions are idempotent, so re-driving the batch is safe).
    let res: BatchExecutionResult;
    try {
      res = await ctx.caps.reactor.executeBatch({ jobs: [...settleJobs, ledgerJob] });
    } catch (e) {
      throw new ApiError("CONFLICT", `settle batch failed: ${(e as Error).message}`, e, /* retryable */ true);
    }

    // Belt-and-suspenders: the ledger job must be present and identified. (Unreachable once executeBatch
    // has thrown on failure, but keeps the closed output honest if the batch model ever changes.)
    const ledger = res.jobs["ledger"];
    if (!ledger?.id) {
      throw new ApiError("CONFLICT", "ledger post did not complete", res, /* retryable */ true);
    }
    return { settled: settleJobs.map((j) => j.documentId), ledgerJobId: ledger.id };
  });
```

**Notes**

**Security / why it works**
- **`documentEach` resolves and checks each subject before the handler runs.** The subject list is `[accountId, ...invoiceIds]`, so the ledger target is authorized on the same footing as every invoice; there is no id the batch touches that authz didn't clear. `{ kind: "custom" }` remains available but is documented as "you enforce per-item authz yourself" — `documentEach` is the blessed path (§10.8).
- **`requires("reactor")` only.** `executeBatch` lives on `ctx.caps.reactor`; no `db` is injected, so this write op literally cannot read the read model behind authz's back.
- **Closed output.** `.strict()` returns only `{ settled, ledgerJobId }` — no `JobInfo` internals (error histories, consistency tokens, the full failed `job`) leak to the wire.

**Why it's the write path, done right**
- Every job targets an **existing** `documentId` and mutates it via actions — `execute`/`executeBatch` only mutate existing documents. Creation (a brand-new invoice) would go through `reactor.create`/`createEmpty`, never a batch job against a freshly minted id.
- **Dependency ordering** is `dependsOn: [plan keys]`. The ledger job names the settle keys; executeBatch topologically orders and resolves keys→UUIDs. Sibling settlements have `dependsOn: []` and may run concurrently.

**Gotchas**
- `executeBatch` is atomic in *ordering and fail-fast*, not in *rollback*: it awaits every job and throws a **raw `Error`** if any lands FAILED, while siblings may already have applied. Because a handler must surface only `ApiError`, that raw throw is caught and re-typed as `CONFLICT`/`retryable` (as here) — and the actions are designed to be idempotent on retry.
- The 100-item `.max(100)` cap is a real DoS guard — it also keeps `documentEach` from resolving an unbounded number of canonical ids per request.
- On `/rpc`, this mutation is additionally subject to the batch cap + tighter `bodyLimit` (§8.4); a giant `settlements` array is rejected pre-buffer, not expanded first.


### Host-boot wiring (server.mts): many resources, global plugins, all transports projected

**Level:** Advanced · **Transports:** `graphql`, `rest`, `ws`, `rpc`, `webhook`

The one-time host wiring that lights up the non-GraphQL transports. Registers the invoice resource + the report + the batch + a realtime `ChatMessage` resource + an inbound `GithubEvent` webhook, installs the on-by-default global plugins, assembles `ProjectionDeps` from GraphQLManager's §13 accessors, and projects all transports — with the honest note about which actually need this file vs which ship from a package.

```ts
// switchboard/src/server.mts (schematic) — the ONE place non-GraphQL transports are wired.
import {
  SwitchboardApi, rateLimit, observability, logging,
  GraphqlProjector, RestProjector, RpcProjector, WebhookProjector,
  type ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";

import { invoiceRegistry } from "@acme/invoice-api/invoice.saf.js";     // CRUD + cache/override plugins
import { revenueReport }  from "@acme/invoice-api/reports.js";          // computed analytics report
import { settleBatch }    from "@acme/invoice-api/bulk.js";             // atomic batch settle
import { chatRegistry }   from "@acme/chat-api/chat.saf.js";            // ChatMessage — has a `changes` subscription
import { githubInbound }  from "@acme/github-api/inbound.js";           // GithubEvent — inbound webhook, { kind:"public" }

export async function wireSwitchboardApi(graphqlManager: GraphQLManager, authService: AuthService) {
  // 1) ONE api instance. Each register(...) FOLDS the ops' ids -> types into R, so the built
  //    `registry.typed` (below) is the single, honest source the RPC client infers from — no
  //    hand-maintained id->op map. register() and use() return the SwitchboardApi; build() and
  //    project() are BOTH called on it (build() yields the typed registry; project() is the mount).
  const api = new SwitchboardApi({
      corsAllowlist: ["https://app.acme.example"],   // plumbed to the core setupMiddleware call (§10.11/§13)
      batchLimit: 50, bodyLimit: "8mb",              // tighter than the 50mb default; caps /rpc amplification
    })
    .register(invoiceRegistry, revenueReport, settleBatch, chatRegistry, githubInbound)
    .use(
      rateLimit({ rpm: 600, by: "user", trustedProxyHops: 1 }),  // IP from a TRUSTED hop, not raw XFF
      observability(),
      logging(),
    );

  // build() is the runtime backstop behind the TAuth compile guard: it throws if any op lacks a decided
  // policy, has a non-closed output, or a keyset paginator whose sort set exceeds its columns — so a bad
  // resource never reaches project(). It returns the TypedRegistry; `typeof registry.typed` is exactly
  // what the zero-codegen RPC client infers from.
  const registry = api.build();   // TypedRegistry<R> — has .typed / .operations / .resources (NOT .project)

  // 2) Assemble ProjectionDeps from GraphQLManager's NEW read-only accessors. These are PRIVATE today;
  //    exposing them is the §13.1 core change that lets REST/RPC/webhook mount at all.
  const deps: ProjectionDeps = {
    basePath:            graphqlManager.getBasePath(),
    httpAdapter:         graphqlManager.getHttpAdapter(),          // NEW (§13.1)
    graphqlManager,
    gatewayAdapter:      graphqlManager.getGatewayAdapter(),       // NEW (§13.1)
    wsServer:            graphqlManager.getWsServer(),             // NEW (§13.1) — the ONE shared socket
    pubsub:              graphqlManager.getPubSub(),               // NEW (§13.1)
    driveOwnershipCache: graphqlManager.getDriveOwnershipCache(),  // NEW (§13.1) — SAME instance GraphQL uses
    authService,
    subgraphArgs:        graphqlManager.getSubgraphArgs(),         // NEW (§13.1)
    wrapFetch:           (h) => graphqlManager.getComposedFetch(h),// NEW (§13.1): authFetch ∘ driveFetch, plugins folded
  };

  // 3) Project transports — project() is a method on the SwitchboardApi INSTANCE (`api`), not on the
  //    TypedRegistry that build() returned. HONEST boundary:
  //    - GraphqlProjector is ALSO contributable from a package via `<pkg>/subgraphs` (PackageManager).
  //    - Rest/Rpc/Webhook can ONLY be wired HERE — they need the private seams assembled above.
  //    - There is NO WsProjector: registering chat's hasSubscriptions GraphQL subgraph already wires
  //      WS + SSE inside GraphQLManager (§8.3). A second projector would double-handle the socket.
  await api.project(
    [new GraphqlProjector(), new RestProjector(), new RpcProjector(), new WebhookProjector()],
    deps,
  );

  return registry;   // `typeof registry.typed` -> createRpcClient<typeof registry.typed>(url), zero codegen
}
```

**Notes**

**Security / why it works**
- **One pipeline, five projections.** All four projectors (plus the GraphQL-owned WS) call `rt.invoke` — validation, authz and business logic can't diverge by transport. `api.build()` is the runtime backstop behind the `TAuth` compile guard: a resource missing a policy or leaking an open output throws at `build()` and so never reaches `api.project()`.
- **Hardened defaults, on by default.** `rateLimit` + `observability` + `logging` are installed globally; `rateLimit` derives client IP from a configured `trustedProxyHops`, not raw `X-Forwarded-For`, and its bucket map is bounded/TTL-evicted.
- **CORS and `/rpc` limits are set at the seam.** `corsAllowlist` is threaded to the single core `setupMiddleware` call (§10.11 — a real core change, not a stacked second `cors()`); `bodyLimit`/`batchLimit` cap RPC batch amplification pre-buffer.

**Contract note (build vs project)**
- `build()` returns a `TypedRegistry` (`{ typed, operations, resources }`) — it does **not** carry `project()`. `project()` lives on the `SwitchboardApi` instance. So keep the instance (`api`) to mount transports and use the built `registry` only for its `.typed` handle. Calling `.project()` on the `build()` result would not typecheck.

**Honest packaging boundary (say it out loud)**
- Only the **GraphQL** slice ships from a consumer package (`<pkg>/subgraphs`, discovered by `PackageManager` and constructed with just `SubgraphArgs`).
- **REST / RPC / webhook** are wired *once, here*, because `GraphQLManager` keeps the HTTP adapter, gateway adapter, shared WS server and fetch middlewares private. This file exists precisely to reach the §13 accessors.
- **WS is not a projector at all** — the `hasSubscriptions` GraphQL registration owns the socket. Do not add an `attachWebSocket` caller.

**Gotchas**
- The accessor names (`getHttpAdapter`, `getGatewayAdapter`, `getWsServer`, `getPubSub`, `getDriveOwnershipCache`, `getSubgraphArgs`, composed-fetch) are the §13.1 core additions; without them this file cannot compile against today's `GraphQLManager`.
- `driveOwnershipCache` MUST be the same instance GraphQLManager uses, or REST shard decisions diverge from GraphQL's (§8.2).


### Migration: a hand-written BaseSubgraph → defineResource, byte-compatible federated schema

**Level:** Advanced · **Transports:** `graphql`

Replace an existing hand-rolled `invoice` subgraph with a `defineResource` + `GraphqlProjector`, keeping the subgraph NAME stable so the composed supergraph is byte-compatible. The GraphQL projection ships from `<pkg>/subgraphs`; adding the other projectors in the host (previous example) then lights up REST/RPC/webhooks for free.

```ts
// ─────────────────────────────────────────────────────────────────────────────
// BEFORE — invoice.subgraph.ts: hand-rolled, GraphQL-only, authz remembered per resolver.
// ─────────────────────────────────────────────────────────────────────────────
import { BaseSubgraph } from "@powerhousedao/reactor-api/graphql/base-subgraph";
import { gql } from "graphql-tag";

export class InvoiceSubgraph extends BaseSubgraph {
  name = "invoice";                         // <-- the FEDERATED subgraph name; MUST stay stable
  typeDefs = gql`
    type Invoice { id: ID! number: String! status: String! counterparty: String!
                   amount: Float! currency: String! dueDate: String! }
    type InvoiceConnection { results: [Invoice!]! nextCursor: String totalCount: Int }
    input InvoiceFilter { status: [String!] counterparty: String }
    type Query {
      invoices(filter: InvoiceFilter, sort: [String!], cursor: String, limit: Int): InvoiceConnection!
      invoice(id: ID!): Invoice
    }
  `;
  resolvers = {
    Query: {
      invoices: async (_p: unknown, args: any, ctx: any) => {
        // hand-written: manual drive scoping, manual Kysely, manual paging, manual field-strip.
        // Every new resolver must REMEMBER to authorize — easy to miss.
        return this.listInvoices(args, ctx);
      },
      invoice: async (_p: unknown, { id }: { id: string }, ctx: any) => {
        const canon = await this.resolveCanonicalDocumentId(id, ctx);
        await this.assertCanRead(canon, ctx);   // forget this line -> silent IDOR
        return this.getInvoice(canon, ctx);
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AFTER — invoice.saf.ts: transport-agnostic resource (see the CRUD example for the full config).
// ─────────────────────────────────────────────────────────────────────────────
export { invoiceRegistry } from "@acme/invoice-api/invoice.saf.js";
// invoiceRegistry === { "invoice.list", "invoice.retrieve", "invoice.create",
//                       "invoice.update", "invoice.delete", ... } — all typed OperationDefs.

// ─────────────────────────────────────────────────────────────────────────────
// AFTER — subgraphs/index.ts: the ONLY package-contributable projection.
// PackageManager discovers `<pkg>/subgraphs` and constructs this with just SubgraphArgs.
// ─────────────────────────────────────────────────────────────────────────────
import { GeneratedSubgraph } from "@powerhousedao/switchboard-api";
import type { SubgraphArgs } from "@powerhousedao/reactor-api/graphql/types";
import { invoiceRegistry } from "@acme/invoice-api/invoice.saf.js";

// The projector's GeneratedSubgraph compiles the SAME SDL (Invoice, InvoiceConnection { results,
// nextCursor, totalCount }, InvoiceFilter, Query.invoices/invoice) and REUSES the core reactor
// scalars/enums rather than re-emitting them — so cross-subgraph composition still merges.
export class InvoiceSubgraph extends GeneratedSubgraph {
  constructor(args: SubgraphArgs) {
    // Bind the resource's ops + the STABLE name. Same name -> byte-compatible supergraph.
    super(args, Object.values(invoiceRegistry), "invoice");
  }
}
// Registration is unchanged from the hand-written case:
//   graphqlManager.registerSubgraphInstance(new InvoiceSubgraph(args), "graphql");
//   graphqlManager.updateRouter();   // debounced recompose
```

**Notes**

**Why it's byte-compatible / why it works**
- **The subgraph name never changes** (`"invoice"`). Two subgraphs both owning `Query.invoices` is a fatal federation conflict, and `GraphQLManager` has no unregister API today — so you migrate *in place* under the same name, not via a version-in-name canary (§8.1).
- **Both are `ISubgraph`s registered identically.** A `GeneratedSubgraph` contributes only `typeDefs`/`resolvers`; `registerSubgraphInstance` + `updateRouter` are the same calls the hand-written class used. Migration is one-line-per-resource and reversible.
- **Shared value types.** The projector imports/reuses the core `DateTime`/enum scalars instead of re-emitting per-resource definitions that could differ by member order or nullability and break the merge.
- **Authz is no longer remembered.** The hand-written `invoice` resolver had to call `assertCanRead` by hand; the resource's `get` policy `{ kind: "document", access: "read" }` runs in the fixed authz stage for every transport. The migration *closes* the class of "forgot to authorize a new resolver" bug.

**Migration order**
1. Wrap the read as a `RelationalDbProcessor` (or a small-N `document` binding) and the mutations as `write` bindings.
2. Express `typeDefs` as serializer DTOs; keep the name stable.
3. Register the generated subgraph *instead of* the hand-written one; gate with a **golden-SDL snapshot** (including cross-subgraph composition) so the supergraph is provably unchanged.
4. Add `RestProjector`/`RpcProjector`/`WebhookProjector` in the host boot (previous example) to light up the other transports for free.

**Gotchas**
- Until the §13 `replaceSubgraph`/`unregisterSubgraph` + `subgraphHandlerCache` invalidation lands, restrict in-place schema changes to **additive, `@shareable`-safe** ones — a breaking change under the same name has no clean swap path.
- `Object.values(invoiceRegistry)` yields the `OperationDef[]` (the registry is keyed by `op.id`); pass them straight to `GeneratedSubgraph`.
- The projector must emit the *same* connection shape (`results`/`nextCursor`/`totalCount`) the old SDL exposed, or clients break even though the name matched — that's exactly what the golden-SDL snapshot guards.


---

## 11. Testing & validation

Testing SAF code is easy for one structural reason: an operation is a pure `(input, ctx) => output` (or, for subscriptions, `(input, ctx) => AsyncIterable<output>`). There is no HTTP, no schema plumbing, and no transport to stand up — you fake only the capability seams the op *declared* (`requires(...)`), and everything else falls out. This section shows five techniques, simple to advanced:

- **(a) Unit-test a handler** with a `fakeContext` whose `caps` holds *only* the declared seams, and assert the two guarantees that live in the pipeline, not the handler: the write targets the **authorized** document (`handle.fetchIdentifier`, no confused deputy) and the **closed output pick** strips internal columns.
- **(b) Type-level tests** (`expectTypeOf` under `vitest typecheck`) that encode three invariants as compile errors: a terminal is uncallable until `.security()`/`.public()` decides auth; `ctx.caps.db` is absent unless `requires("db")`; and the inferred RPC client's input is `InferIn` (the pre-parse wire type), with subscriptions excluded.
- **(c) Snapshot the `defineResource` expansion** — `OperationDef` is pure data, so you snapshot the serializable shape (ids, kinds, `requires`, policy `kind`, `rest`/`webhook` meta), never the closures.
- **(d) Assert a projector artifact** — drive a `GraphqlProjector` and snapshot the emitted `GeneratedSubgraph`'s `typeDefs` (golden SDL) while asserting its resolvers merely delegate to `rt.invoke`; drive a `RestProjector` and assert the `Response` it returns (`PagedResults` → JSON + RFC-5988 `Link`, `ApiError.code` → `ERROR_HTTP`).
- **(e) Realtime without WebSockets** — WS is disabled under `VITEST` (the existing harness), so the subscription *handler* is unit-tested by consuming its `AsyncIterable` directly, and realtime *integration* leans on REST/RPC/SSE.

One load-bearing gotcha threads through everything: **the FIXED `input safeParse` and the FIXED `output` pick are pipeline stages** (`assembleInvoker`), not part of `op.handler`. Calling `op.handler(input, ctx)` directly is perfect for asserting business logic and authorized-document reuse, but to prove the field-leak guard you must run the assembled invoker (or the serializer's project step). The examples make that split explicit rather than papering over it.

Every example imports a small, project-owned `test/fakes.ts` (defined in the first example) — the ISP testability win in practice: you write minimal doubles for exactly the seams you use.


### The unit harness — a handler + a fakeContext holding only the declared seam

**Level:** Simple · **Transports:** `all (transport-agnostic)`

Establishes the shared `test/fakes.ts` doubles and unit-tests a read handler that declared only `requires("db")`. Because an op is a pure `(input, ctx) => output`, the fake `caps` contains *just* `db` — no reactor, no analytics — and the test is pure logic with no HTTP or transport.

```ts
// test/fakes.ts — minimal, PROJECT-OWNED doubles. Every later test imports from here.
// (The ISP win: you fake only the seams your ops declared via requires(...).)
import { vi } from "vitest";
import { ApiError } from "@powerhousedao/switchboard-api";
import type {
  Capabilities, DocumentAuthorizer, ProjectionRuntime, ProjectionDeps,
} from "@powerhousedao/switchboard-api";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { IRelationalDb } from "@powerhousedao/shared/processors/relational/types";
import type {
  IAuthorizationService, AuthorizedDocumentHandle,
} from "@powerhousedao/reactor-api/services/authorization.service";

// fakeContext is shipped by the framework's test kit (see §11); re-export so tests import one place.
export { fakeContext } from "@powerhousedao/switchboard-api/test";

export const alice = { address: "0xA11ce", chainId: 1, networkId: "eip155" };

// A recording IReactorClient fake — only the methods our handlers touch.
export function fakeReactor(seed: { get?: unknown } = {}) {
  const executed: Array<{ id: string; branch: string; actions: unknown[] }> = [];
  const batched: Array<{ key: string; documentId: string }> = [];
  const impl = {
    executed, batched,
    execute: vi.fn(async (id: string, branch: string, actions: unknown[]) => {
      executed.push({ id, branch, actions }); return { status: "COMPLETED" };
    }),
    executeBatch: vi.fn(async ({ jobs }: { jobs: Array<{ key: string; documentId: string }> }) => {
      jobs.forEach((j) => batched.push({ key: j.key, documentId: j.documentId }));
      return { jobs: Object.fromEntries(jobs.map((j) => [j.key, { status: "COMPLETED" }])) };
    }),
    get: vi.fn(async () => seed.get),
    create: vi.fn(async (doc: unknown) => doc),
    // Realtime seam (§4): ensureGlobalDocumentSubscription(reactor) calls reactor.subscribe(); return unsub.
    subscribe: vi.fn(() => () => {}),
  };
  return impl as unknown as IReactorClient & typeof impl;
}

// A chainable Kysely-shaped fake: builder methods return `this`; terminals resolve the seeded rows.
function chain(rows: any[]) {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "execute") return async () => rows;
      if (prop === "executeTakeFirst") return async () => rows[0];
      if (prop === "then") return undefined;      // NOT a thenable — don't auto-resolve on await
      return () => p;                             // selectFrom/selectAll/where/orderBy/limit -> this
    },
    apply: () => p,
  });
  return p;
}
export function fakeDb(rows: any[] = []) {
  // RelationalDbProcessor.query(driveId, db) calls db.queryNamespace(ns); we only need that seam.
  return { queryNamespace: () => chain(rows) } as unknown as IRelationalDb;
}

// A permissive DocumentAuthorizer whose assert() returns a handle for the CANONICAL id — which may differ
// from the slug the handler passed. That lets a test prove the handler writes the AUTHORIZED document.
export function allow(access: "read" | "write" | "manage", canonicalId: string): DocumentAuthorizer {
  const handle = { fetchIdentifier: canonicalId, access } as unknown as AuthorizedDocumentHandle;
  const svc = { canReadDocument: vi.fn(async () => true) } as unknown as IAuthorizationService;
  return { svc, canonical: vi.fn(async () => canonicalId as any), assert: vi.fn(async () => handle) };
}
export function deny(): DocumentAuthorizer {
  // The real authorizer rejects with ApiError("FORBIDDEN") — the contract's ONLY throw type. Mirror it,
  // async, so the FIXED authorize stage's `await authorizer.assert(...)` sees a proper rejected promise.
  const boom = async () => { throw new ApiError("FORBIDDEN", "forbidden"); };
  return {
    svc: { canReadDocument: vi.fn(async () => false) } as unknown as IAuthorizationService,
    canonical: vi.fn(boom), assert: vi.fn(boom),
  };
}

// A capturing ProjectionRuntime and a stub ProjectionDeps for the projector tests (examples 5 & 6).
export function fakeRuntime(invoke: (opId: string, input: unknown) => Promise<unknown>): ProjectionRuntime {
  return {
    reactor: fakeReactor(), authorizer: allow("read", "x"),
    invoke: vi.fn((opId, input) => invoke(opId, input)),
    has: () => true, makeContext: async () => ({}) as any,
  } as unknown as ProjectionRuntime;
}
export function fakeProjectionDeps(over: Partial<ProjectionDeps> = {}): ProjectionDeps {
  return {
    basePath: "/d/hello",
    httpAdapter: { mount: vi.fn(), getRoute: vi.fn(), mountNodeRoute: vi.fn() },
    graphqlManager: { registerSubgraphInstance: vi.fn(), updateRouter: vi.fn() },
    gatewayAdapter: {}, wsServer: {}, pubsub: {}, driveOwnershipCache: {},
    authService: {}, subgraphArgs: {}, wrapFetch: (h: any) => h,
    ...over,
  } as unknown as ProjectionDeps;
}
```

```ts
// todo.get.test.ts — a handler is a pure function; fake ONLY the seam it declared.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { operation, ApiError } from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import { fakeContext, fakeDb, allow, alice } from "./fakes";

interface TodoRow { id: string; title: string; done: boolean; ownerAddress: string }
class TodoReadModel extends RelationalDbProcessor<{ todo: TodoRow }> {}
const TodoOutput = z.object({ id: z.string(), title: z.string(), done: z.boolean() }).strict();

const getTodo = operation("todo.get")
  .input(z.object({ id: z.string() }))
  .output(TodoOutput)
  .requires("db")                                           // declares ONLY the db seam
  .security({ kind: "document", access: "read", subject: (i) => i.id })
  .query(async ({ id }, ctx) => {
    const row = await TodoReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("todo").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `todo '${id}' not found`);
    return row;                                             // pipeline projects this to TodoOutput
  });

describe("todo.get handler", () => {
  it("reads via ctx.caps.db and needs no other seam", async () => {
    const ctx = fakeContext({
      user: alice, driveId: "drv1",
      caps: { db: fakeDb([{ id: "t1", title: "Write tests", done: false, ownerAddress: "0xOWNER" }]) },
      authorize: allow("read", "t1"),
    });

    const out = await getTodo.handler({ id: "t1" }, ctx);
    expect(out).toMatchObject({ id: "t1", title: "Write tests", done: false });

    // The fake exposes ONLY the declared seam — no reactor, no analytics.
    expect(ctx.caps).not.toHaveProperty("reactor");
    expect(ctx.caps).not.toHaveProperty("analytics");
  });
});
```

**Notes**

- **Why it works:** `requires("db")` makes the handler's `ctx.caps` exactly `Pick<Capabilities, "db">`, so a fake with `{ db }` is *complete*. If the handler reached for `ctx.caps.reactor`, it would not compile — the test can't accidentally under-fake.
- **Security:** the read is drive-scoped through `ctx.driveId!` into the read model's namespace, and because this is a single-document `retrieve` the authorized subject (`i.id`) and the queried key are the same string — no confused deputy. (Collection `list`/`changes` must instead use a `{ kind: "drive" }` policy; see examples 4 and 7.)
- **Gotcha (previewed here, asserted next):** the returned `row` still carries `ownerAddress` at the handler seam — the closed-output pick that removes it is a *pipeline* stage, not the handler's job. Example 2 asserts the strip via `assembleInvoker`.
- **Fakes philosophy:** `fakeDb` is a Proxy that returns itself for every builder method and resolves seeded rows at `.execute()/.executeTakeFirst()`; it deliberately ignores filters/sort, because those are the paginator's/`compileFilter`'s job and are unit-tested separately.


### Authorized-document reuse and the closed-output strip

**Level:** Intermediate · **Transports:** `all (transport-agnostic)`

The core (a) test. Against `invoice.send` from §7.7, prove two guarantees: (1) the handler executes against `handle.fetchIdentifier` (the canonical id authz resolved) — *not* the raw input slug, closing the confused-deputy hole; and (2) the FIXED output stage strips the internal `ownerAddress` column. Crucially it shows the two live at different seams: (1) is visible from `op.handler`, (2) requires `assembleInvoker`.

```ts
// invoice.send.test.ts
import { describe, it, expect } from "vitest";
import { assembleInvoker } from "@powerhousedao/switchboard-api";
import { sendInvoiceAction } from "@acme/invoice-model";
import { sendInvoice } from "./invoice.saf";              // the custom @action op from §7.7
import { fakeContext, fakeReactor, fakeDb, allow, deny, alice } from "./fakes";

// The read-model row the fake db returns — note it CARRIES ownerAddress (a SELECT * column that must not leak).
const openInvoice = {
  id: "did:ph:inv1", number: "INV-2026-001", status: "open",
  counterparty: "Globex", amount: 4200, currency: "USD",
  dueDate: "2026-08-01", createdAtUtc: "2026-07-01T00:00:00Z", updatedAtUtc: "2026-07-10T00:00:00Z",
  ownerAddress: "0xOWNER",
};

const mkCtx = () => fakeContext({
  user: alice, driveId: "drv1",
  caps: { reactor: fakeReactor(), db: fakeDb([openInvoice]) },   // send requires ("reactor", "db")
  authorize: allow("write", "did:ph:inv1"),               // canonical id ≠ the human slug below
});

describe("invoice.send", () => {
  it("writes the AUTHORIZED document, not the raw input slug (no confused deputy)", async () => {
    const ctx = mkCtx();
    const reactor = ctx.caps.reactor as ReturnType<typeof fakeReactor>;

    await sendInvoice.handler({ id: "inv-2026-001" }, ctx);   // caller passes a HUMAN slug

    // The write TARGET is handle.fetchIdentifier — the canonical id authz resolved (§6.4, §10.3).
    // The ACTION still carries the raw input id; only the execute target is canonicalized.
    expect(reactor.executed).toEqual([
      { id: "did:ph:inv1", branch: "main", actions: [sendInvoiceAction({ id: "inv-2026-001" })] },
    ]);
  });

  it("strips ownerAddress via the FIXED output stage (assembled invoker, not the raw handler)", async () => {
    const ctx = mkCtx();

    // Calling .handler DIRECTLY returns the raw row — the output pick is a PIPELINE stage:
    const raw = await sendInvoice.handler({ id: "inv-2026-001" }, ctx);
    expect(raw).toHaveProperty("ownerAddress");               // unstripped at the handler seam

    // assembleInvoker(op, caps, plugins, authorizer) composes:
    //   safeParse -> authorize -> handler -> the FIXED output pick (field-leak guard).
    const invoke = assembleInvoker(sendInvoice, ctx.caps, [], ctx.authorize);
    const out = (await invoke({ id: "inv-2026-001" }, ctx)) as Record<string, unknown>;

    expect(out).not.toHaveProperty("ownerAddress");           // InvoiceOutput is CLOSED — no such key survives
    expect(out).toMatchObject({ id: "did:ph:inv1", status: "open" });
  });

  it("rejects with FORBIDDEN before the handler runs when authz denies", async () => {
    const ctx = mkCtx();
    const invoke = assembleInvoker(sendInvoice, ctx.caps, [], deny());   // authorizer says no
    await expect(invoke({ id: "inv-2026-001" }, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((ctx.caps.reactor as ReturnType<typeof fakeReactor>).executed).toEqual([]);  // never reached
  });
});
```

**Notes**

- **Security (confused deputy):** `allow("write", "did:ph:inv1")` returns a handle whose `fetchIdentifier` differs from the slug the caller sent. The first assertion pins the `execute` *target* to that canonical id, proving the handler reused the exact document authz checked (§10.3) — a slug can't be swapped for a doc the caller doesn't own.
- **Security (field-leak guard):** `InvoiceOutput` is `z.object({...}).strict()` with no `ownerAddress`. The fixed output stage *explicitly picks* the declared keys (it does not trust the validator to strip), so a `SELECT *` row can never leak an internal column (§10.6).
- **Why two seams:** `op.handler` is business logic; `safeParse`-in and output-pick are non-removable stages *around* it (§5). `assembleInvoker(op, caps, plugins, authorizer)` is the sanctioned way to exercise the whole sandwich in a unit test — pass `[]` for plugins to isolate the fixed stages.
- **Gotcha:** don't assert the strip off a direct `op.handler` call — it returns the raw row, so the test would falsely pass/fail depending on what the fake db returns. Assert the strip through the invoker; assert logic/authz-reuse off the handler.
- **Negative path:** `deny()` now rejects with `ApiError("FORBIDDEN")` (the contract's only throw type), so `assembleInvoker(sendInvoice, ctx.caps, [], deny())` fails at the FIXED authorize stage and the handler never executes — assert both the `.code` and that no write happened.


### Type-level tests: the auth guard, capability gating, and InferIn client input

**Level:** Intermediate · **Transports:** `rpc`, `all (transport-agnostic)`

Three compile-time invariants encoded with `expectTypeOf` (run under `vitest typecheck`/`tsc`): (i) a terminal `.query` is the branded `AuthNotDecided` — literally uncallable — until `.security()`/`.public()` is called; (ii) `ctx.caps.db` exists only when `requires("db")` was declared; (iii) the inferred RPC client's input is `InferIn` (pre-parse wire type), and subscription ops are excluded from the client entirely.

```ts
// saf.types.test-d.ts — type-level assertions. `@ts-expect-error` lines MUST error, or the suite fails.
import { expectTypeOf } from "vitest";
import { z } from "zod";
import {
  operation, SwitchboardApi, createRpcClient,
  type ApiClient, type AuthNotDecided, type InferIn, type Capabilities,
} from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "./invoice.saf";          // defineResource(...) from §7.7

// (i) A terminal is UNCALLABLE until auth is decided.
const undecided = operation("todo.ping")
  .input(z.object({ nonce: z.string() }))
  .output(z.object({ pong: z.boolean() }).strict())
  .requires("db");                                        // no .security()/.public() yet

expectTypeOf(undecided.query).toEqualTypeOf<AuthNotDecided>();   // branded, has no call signature
// @ts-expect-error — AuthNotDecided is not callable: "This expression is not callable."
undecided.query(async () => ({ pong: true }));

expectTypeOf(undecided.public().query).toBeFunction();          // decided -> the terminal is callable

// (ii) ctx.caps is EXACTLY Pick<Capabilities, TCaps>.
operation("todo.get")
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), title: z.string() }).strict())
  .requires("db")                                        // declares ONLY "db"
  .public()
  .query(async (input, ctx) => {
    expectTypeOf(ctx.caps).toEqualTypeOf<Pick<Capabilities, "db">>();
    expectTypeOf(ctx.caps.db).not.toBeNever();
    // @ts-expect-error — "reactor" was never required, so it is absent from ctx.caps.
    ctx.caps.reactor;
    return { id: input.id, title: "x" };
  });

// (iii) The inferred RPC client input is InferIn (the pre-parse WIRE type); subscriptions are excluded.
const BumpInput = z.object({ by: z.coerce.number() });   // wire may carry a string; server coerces to number
const bump = operation("counter.bump")
  .input(BumpInput)
  .output(z.object({ value: z.number() }).strict())
  .requires("db")
  .public()
  .query(async ({ by }, _ctx) => {
    expectTypeOf(by).toBeNumber();                        // handler sees InferOut (coerced number)
    return { value: by };
  });

const registry = new SwitchboardApi()
  .register(invoiceRegistry, { "counter.bump": bump })   // literal keys survive -> honest typed registry
  .build();
const client: ApiClient<typeof registry.typed> =
  createRpcClient<typeof registry.typed>("https://api.example.com/rpc");

// Client INPUT is InferIn<BumpInput> (pre-coercion, broader than number) — NOT the handler's post-parse type:
expectTypeOf(client["counter.bump"]).parameter(0).toEqualTypeOf<InferIn<typeof BumpInput>>();

// Subscription ops (invoice.changes) are NOT on the RPC client surface:
expectTypeOf<keyof typeof client>().not.toEqualTypeOf<"invoice.changes">();
// @ts-expect-error — a subscription has no RPC method.
client["invoice.changes"];
```

**Notes**

- **(i) Why it fails to compile:** the terminals are gated on the *property type*, not the return type — with `TAuth=false` the property is `AuthNotDecided`, which has no call signature (§6.6). The naive `(...) => never` gating would have compiled clean because `never` is assignable everywhere; this catches "forgot to authorize" at the call site.
- **(ii) Least authority, statically:** `Pick<Capabilities, TCaps>` means an undeclared capability is a *type error*, not a runtime `undefined`. The `@ts-expect-error` on `ctx.caps.reactor` is the whole point — it must error.
- **(iii) InferIn vs InferOut:** the client speaks the wire, so its parameter is `InferIn` (what a caller actually sends before the server's coercion/transform runs); the handler receives `InferOut`. Asserting against `InferIn<typeof BumpInput>` avoids hard-coding zod's coercion input type. Subscriptions are mapped to `never` keys in `ApiClient`, so they vanish from the surface — matching the runtime RPC projector that rejects them.
- **Gotcha:** register standalone ops with a *literal* key (`{ "counter.bump": bump }`), not a computed `[bump.id]` — `op.id` is typed `string`, so a computed key collapses the registry to an index signature and you lose `client["counter.bump"]` typing. `defineResource` already returns literal keys.
- Wire these into `vitest --typecheck` (or a dedicated `tsc --noEmit` pass); `@ts-expect-error` lines are assertions, so a *removed* bug (line stops erroring) correctly fails the build.


### Snapshot the defineResource expansion (pure data)

**Level:** Intermediate · **Transports:** `all (transport-agnostic)`

`OperationDef` is pure data, so a `defineResource(...)` result is snapshot-testable — but you snapshot the *serializable* shape (id, kind, `requires`, security policy `kind`, `rest`/`webhook` meta), never the handler/subject closures. This locks in which ops the resource expands to and their contract, and doubles as a structural check that no verb is bare-`authenticated`.

```ts
// invoice.resource.snapshot.test.ts
import { describe, it, expect } from "vitest";
import type { OperationDef } from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "./invoice.saf";          // defineResource(...) from §7.7

// Project each OperationDef to its SERIALIZABLE fields — closures don't snapshot deterministically.
const describeOp = (op: OperationDef) => ({
  id: op.id,
  kind: op.kind,
  requires: [...op.requires].sort(),
  securityKind: op.security.kind,          // the policy KIND is data; the subject selector is a closure
  rest: op.rest ?? null,
  webhook: op.webhook ?? null,
});

describe("defineResource('invoice') expansion", () => {
  it("expands to the expected op set (pure data)", () => {
    const shape = Object.values(invoiceRegistry)
      .map(describeOp)
      .sort((a, b) => a.id.localeCompare(b.id));

    // Illustrative golden (webhook events per the §8 canonical mapping; requires per §7.6):
    expect(shape).toMatchInlineSnapshot(`
      [
        { "id": "invoice.changes",  "kind": "subscription", "requires": ["reactor"],       "securityKind": "drive",    "rest": null, "webhook": null },
        { "id": "invoice.create",   "kind": "mutation",     "requires": ["db", "reactor"], "securityKind": "create",   "rest": null, "webhook": { "event": "invoice.created" } },
        { "id": "invoice.delete",   "kind": "mutation",     "requires": ["reactor"],       "securityKind": "document", "rest": null, "webhook": { "event": "invoice.deleted" } },
        { "id": "invoice.list",     "kind": "query",        "requires": ["db"],            "securityKind": "drive",    "rest": null, "webhook": null },
        { "id": "invoice.retrieve", "kind": "query",        "requires": ["db"],            "securityKind": "document", "rest": null, "webhook": null },
        { "id": "invoice.send",     "kind": "mutation",     "requires": ["db", "reactor"], "securityKind": "document", "rest": { "method": "POST", "path": "/:id/send" }, "webhook": { "event": "invoice.sent" } },
        { "id": "invoice.update",   "kind": "mutation",     "requires": ["db", "reactor"], "securityKind": "document", "rest": null, "webhook": { "event": "invoice.updated" } },
      ]
    `);
  });

  it("every verb has a DECIDED, non-bare-authenticated policy (build() backstop, structural)", () => {
    for (const op of Object.values(invoiceRegistry)) {
      expect(op.security.kind).toBeTruthy();               // no undecided policy survives build()
      // §10.7: list/changes must be drive-scoped; a bare { kind: "authenticated" } is a Drive-Id IDOR.
      expect(op.security.kind).not.toBe("authenticated");
    }
    const byId = Object.fromEntries(Object.values(invoiceRegistry).map((o) => [o.id, o]));
    expect(byId["invoice.list"].security.kind).toBe("drive");
    expect(byId["invoice.changes"].security.kind).toBe("drive");
  });
});
```

**Notes**

- **Why pure data:** `defineResource` returns a `Record<string, OperationDef>` keyed by `op.id`; none of the snapshotted fields are functions, so the snapshot is deterministic across runs and machines.
- **Gotcha:** never `toMatchSnapshot()` a raw `OperationDef` — `handler`, `input`/`output` schemas, and `security.subject` are closures/opaque objects that serialize unstably (or not at all). Project to the serializable subset first (`describeOp`).
- **Security regression guard:** the second test turns §10.7 into an executable invariant — if someone edits the resource and downgrades `list`/`changes` to `{ kind: "authenticated" }`, the test fails before the IDOR ships. This complements `build()`'s runtime backstop, which also refuses a bare-`authenticated` `list`/`changes`.
- **Contract lock:** the id set is the public wire surface (RPC method names, GraphQL field derivations, REST routes). Snapshotting it means an accidental rename (`invoice.retrieve` → `invoice.get`) surfaces as a reviewable diff, not a silent client break.
- The inline values are illustrative — the *technique* is the deliverable; run once against your real resource to capture the true golden.


### Assert the GraphQL projector artifact (golden SDL + resolver delegation)

**Level:** Advanced · **Transports:** `graphql`

Drive a `GraphqlProjector` against a built registry and capture the `GeneratedSubgraph` it registers. Assert three things without standing up Apollo: exactly one subgraph under a single stable name with subscriptions wired; a golden-SDL snapshot of its `typeDefs` (the spec's riskiest component, §15.2); and that a generated resolver is a thin projection that just calls `rt.invoke(opId, args, ctx)`.

```ts
// graphql.projector.test.ts
import { describe, it, expect, vi } from "vitest";
import { SwitchboardApi, GraphqlProjector } from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "./invoice.saf";
import { fakeRuntime, fakeProjectionDeps } from "./fakes";

describe("GraphqlProjector artifact", () => {
  it("emits ONE 'invoice' subgraph whose resolvers delegate to rt.invoke", async () => {
    const registry = new SwitchboardApi().register(invoiceRegistry).build();

    let subgraph: any;
    const graphqlManager = {
      registerSubgraphInstance: vi.fn((sg: any) => { subgraph = sg; }),
      updateRouter: vi.fn(),
    };
    const deps = fakeProjectionDeps({ graphqlManager: graphqlManager as any });
    const rt = fakeRuntime(async () => ({ results: [], nextCursor: "", totalCount: 0 }));

    // Driving ONE projector in isolation IS the test-time analog of restricting transports in prod via
    // api.project([new GraphqlProjector()], deps). GraphQL is also the only projection contributable
    // through the <pkg>/subgraphs PackageManager seam (§12.1); REST/RPC/WS/webhook are host-wired only.
    await new GraphqlProjector().project(registry, rt, deps);

    // (1) exactly one subgraph, single STABLE name (§8.1 — no version-in-name), subscriptions wired (§8.3):
    expect(graphqlManager.registerSubgraphInstance).toHaveBeenCalledTimes(1);
    expect(graphqlManager.updateRouter).toHaveBeenCalled();       // debounced recompose
    expect(subgraph.name).toBe("invoice");
    expect(subgraph.hasSubscriptions).toBe(true);

    // (2) golden SDL — byte-stability gates every projector change (§15.2):
    expect(subgraph.typeDefs).toMatchSnapshot("invoice.sdl.graphql");

    // (3) the resolver is a PROJECTION: adapt args -> rt.invoke(opId, input, ctx). No business logic here.
    const gqlCtx = { user: undefined, headers: new Headers(), driveId: "drv1" };
    await subgraph.resolvers.Query.invoices(null, { filter: { status: { in: ["open"] } } }, gqlCtx);

    expect(rt.invoke).toHaveBeenCalledWith(
      "invoice.list",
      expect.objectContaining({ filter: { status: { in: ["open"] } } }),
      expect.anything(),
    );
  });
});
```

**Notes**

- **Single-transport, honestly:** calling `new GraphqlProjector().project(...)` directly exercises exactly one transport — the unit-test form of `api.project([new GraphqlProjector()], deps)`. All five transports funnel through the same `rt.invoke` pipeline (§5), so this projector can't diverge in validation or authz from REST/RPC.
- **Why assert the artifact, not a server:** a projector's contract is the *emitted* `GeneratedSubgraph` (`name`/`typeDefs`/`resolvers`/`hasSubscriptions`) — capturing it via a spy `registerSubgraphInstance` tests exactly what federates, with no Apollo/HTTP.
- **Golden SDL (§15.2):** Standard-Schema→SDL fidelity (nullability, enums, `DateTime`/`JSONObject` scalars, federation directives) is the single riskiest component. A committed SDL snapshot catches a member-order or nullability drift that would break cross-subgraph composition — treat a snapshot diff as a release gate, and extend it with a compose check across subgraphs.
- **Single stable name (§8.1):** `registerSubgraphInstance` called once with `name === "invoice"` encodes "no version-in-name canary" — two subgraphs owning `Query.invoices` is a fatal, silently-swallowed federation conflict. In-place schema changes need the core replace/unregister capability (§13).
- **Gotcha:** the resolver reads `ctx` (identity/drive), so pass a realistic `gqlCtx`; asserting `expect.anything()` for it keeps the test about delegation, not context assembly (covered by `rt.makeContext` tests).


### Assert the REST projector artifact (Response, Link header, ApiError mapping)

**Level:** Advanced · **Transports:** `rest`

Drive a `RestProjector`, capture the `FetchHandler` it mounts, and assert the `Response` it returns. Three checks: the resource is mounted as a PREFIX with `{ exact: true }` (§8.2); a `PagedResults` serializes to `{ results, nextCursor, totalCount }` plus an RFC-5988 `Link: …; rel="next"` header; and an `ApiError.code` maps to the right `ERROR_HTTP` status. Auth/drive middleware are stubbed pass-through so the test targets the projector's *own* Response responsibility.

```ts
// rest.projector.test.ts
import { describe, it, expect, vi } from "vitest";
import { SwitchboardApi, RestProjector, ApiError, ERROR_HTTP } from "@powerhousedao/switchboard-api";
import { invoiceRegistry } from "./invoice.saf";
import { fakeRuntime, fakeProjectionDeps } from "./fakes";

async function mountRest(invoke: (opId: string, input: unknown) => Promise<unknown>) {
  const registry = new SwitchboardApi().register(invoiceRegistry).build();
  let handler!: (req: Request) => Promise<Response>;
  const mount = vi.fn((_path: string, h: any) => { handler = h; });

  const deps = fakeProjectionDeps({
    basePath: "/d/hello",
    httpAdapter: { mount, getRoute: vi.fn(), mountNodeRoute: vi.fn() } as any,
    // Auth/drive middleware are exercised elsewhere; here they pass through so we assert the projector's
    // OWN responsibility: PagedResults -> Response (+ Link) and ApiError.code -> ERROR_HTTP status.
    authService: { authenticate: vi.fn(async () => ({ address: "0xA11ce", chainId: 1, networkId: "eip155" })) } as any,
    driveOwnershipCache: { owns: vi.fn(async () => true) } as any,
    wrapFetch: (h: any) => h,
  });

  // Prod exposes REST-only via api.project([new RestProjector()], deps) in the host boot (server.mts) —
  // REST is NOT package-contributable (§12.1). The test drives that same projector directly.
  await new RestProjector().project(registry, fakeRuntime(invoke), deps);
  return { handler, mount };
}

const authed = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { Authorization: "Bearer t", "Drive-Id": "drv1", ...(init.headers ?? {}) } });

describe("RestProjector artifact", () => {
  it("mounts the resource PREFIX with { exact: true } (§8.2)", async () => {
    const { mount } = await mountRest(async () => ({ results: [], nextCursor: "", totalCount: 0 }));
    expect(mount).toHaveBeenCalledWith("/d/hello/rest/invoices", expect.any(Function), { exact: true });
  });

  it("serializes PagedResults as { results, nextCursor, totalCount } + an RFC-5988 Link header", async () => {
    const page = {
      results: [{ id: "did:ph:inv1", number: "INV-2026-001", status: "open" }],
      nextCursor: "c2", totalCount: 1,
    };
    const { handler } = await mountRest(async (opId) => (opId === "invoice.list" ? page : {}));

    const res = await handler(authed("http://x/d/hello/rest/invoices?filter[status][in]=open"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(res.headers.get("Link")).toMatch(/cursor=c2>;\s*rel="next"/);
  });

  it("maps ApiError.code -> ERROR_HTTP status (NOT_FOUND -> 404)", async () => {
    const { handler } = await mountRest(async () => { throw new ApiError("NOT_FOUND", "invoice 'nope' not found"); });
    const res = await handler(authed("http://x/d/hello/rest/invoices/nope"));
    expect(res.status).toBe(ERROR_HTTP.NOT_FOUND);            // 404, from the exhaustive map (§6.3)
  });
});
```

**Notes**

- **Packaging honesty:** REST is wired **once in the host boot** (`server.mts`) via `api.project([new RestProjector()], deps)`, not from a package — only the GraphQL slice ships through `<pkg>/subgraphs` (§12.1). Driving `new RestProjector().project(...)` directly is the test-time equivalent of that single-transport wiring.
- **Scope of the test:** the mounted handler is `wrapFetch(authFetch(driveFetch(restHandler)))`. We stub `wrapFetch`/`authService`/`driveOwnershipCache` as pass-through and send an already-authorized `Request`, so the assertions isolate the projector's contract — Response shape, headers, error mapping — not the middleware chain (tested separately).
- **Security (transport edge, §8.2/§10.10):** mutations project to POST/PATCH/DELETE, never GET (the AuthService skips bearer verification on GET/OPTIONS). The prefix mount with the *inverted* `{ exact: true }` flag matches the internal method+path router.
- **Error taxonomy (§6.3):** `ERROR_HTTP` is an exhaustive `Record<ApiErrorCode, number>`; asserting `ERROR_HTTP.NOT_FOUND` (rather than a literal `404`) keeps the test honest against the single source. Handlers throw only `ApiError`, so every code has a defined status — no raw `Error` leaks a 500 with a stack.
- **Pagination (§7.2, §8.2):** the RFC-5988 `Link` header carries the opaque `nextCursor` for keyset paging; asserting it guards the client's forward-seek contract. `PagedResults` is the one envelope every transport shares.
- **Gotcha:** `driveFetch`'s cache-bypass path parses the body as *GraphQL* — a real REST POST against an un-cached drive would 421. Production uses a REST-aware drive step sharing the *same* `DriveOwnershipCache` instance; in-test we stub `owns()` so shard decisions don't diverge (§8.2 caveat).


### Realtime without WebSockets — subscription iterable + the VITEST note

**Level:** Intermediate · **Transports:** `ws`, `sse`, `rpc`

WS is disabled under `VITEST` (the existing harness), so a subscription is unit-tested by consuming its `AsyncIterable` directly — the handler is a pure async generator. Against a `ChatMessage.changes` op, assert the three per-event guards (drive scope, filter, per-event `canReadDocument`) and the redacted yield. Realtime *integration* then leans on SSE (`/stream`), RPC, or REST — never a live socket in tests.

```ts
// chat.changes.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { operation } from "@powerhousedao/switchboard-api";
import type { DocumentChangeEvent } from "@powerhousedao/reactor";
import { getPubSub, ensureGlobalDocumentSubscription } from "@powerhousedao/reactor-api/graphql/reactor/pubsub";
import { fakeContext, fakeReactor, allow, alice } from "./fakes";

const DOCUMENT_CHANGES = "DOCUMENT_CHANGES";              // match the real trigger name in your codebase
const tick = () => new Promise((r) => setTimeout(r, 0));   // let the generator subscribe before we publish

// A ChatMessage `changes` subscription: drive-scoped subscribe-time authz (§10.9),
// then per-event filter + canReadDocument (fail-closed), yielding a REDACTED payload.
const ChatOutput = z.object({ id: z.string(), room: z.string(), body: z.string() }).strict();
const chatChanges = operation("chat.changes")
  .input(z.object({ room: z.string() }))
  .output(ChatOutput)
  .requires("reactor")
  .security({ kind: "drive", access: "read", drive: (_i, ctx) => ctx.driveId! })   // subscribe-time, drive-scoped
  .subscription(async function* ({ room }, ctx) {
    await ensureGlobalDocumentSubscription(ctx.caps.reactor);        // ref-counted global subscription
    for await (const ev of getPubSub().asyncIterator<DocumentChangeEvent>(DOCUMENT_CHANGES)) {
      const data = (ev as any).data as { id: string; room: string; body: string };
      if ((ev as any).driveId !== ctx.driveId) continue;             // drive scope
      if (data.room !== room) continue;                              // filter
      if (!(await ctx.authorize.svc.canReadDocument((ev as any).documentId, ctx.user))) continue; // per-event authz
      yield { id: data.id, room: data.room, body: data.body };       // projected/redacted output
    }
  });

describe("chat.changes (realtime; WS is off under VITEST)", () => {
  it("yields only in-drive, in-room, readable events", async () => {
    const ctx = fakeContext({
      user: alice, driveId: "drv1",
      caps: { reactor: fakeReactor() },                              // fake supplies the subscribe seam
      authorize: allow("read", "x"),                                 // svc.canReadDocument -> true
    });

    // A subscription handler returns an AsyncIterable directly — consume it, no socket involved.
    const it = chatChanges.handler({ room: "general" }, ctx)[Symbol.asyncIterator]();
    const first = it.next();                                          // subscribe BEFORE publishing
    await tick();

    const pubsub = getPubSub();
    pubsub.publish(DOCUMENT_CHANGES, { driveId: "drv2", documentId: "m0", data: { id: "m0", room: "general", body: "wrong drive" } });
    pubsub.publish(DOCUMENT_CHANGES, { driveId: "drv1", documentId: "m1", data: { id: "m1", room: "random",  body: "wrong room" } });
    pubsub.publish(DOCUMENT_CHANGES, { driveId: "drv1", documentId: "m2", data: { id: "m2", room: "general", body: "hello" } });

    expect((await first).value).toEqual({ id: "m2", room: "general", body: "hello" });
    await it.return?.();                                              // unsubscribe / clean up
  });
});
```

**Notes**

- **The VITEST note (e):** the shared `WebSocketServer` is not attached under `VITEST` (per the existing harness), so *don't* assert realtime by opening a `graphql-ws` client. Unit-test the handler's `AsyncIterable` as above; for integration, drive realtime through SSE (`/stream`) or poll via RPC/REST. Registering the `hasSubscriptions` subgraph is what owns the socket in production (§8.3) — there is no separate subscription projector to test.
- **Fake reactor seam:** `ensureGlobalDocumentSubscription(ctx.caps.reactor)` calls `reactor.subscribe(...)` (§4 realtime seam), so `fakeReactor` exposes a no-op `subscribe` returning an unsubscribe fn. The test publishes to `getPubSub()` directly, so the reactor→pubsub bridge is inert — it just must not throw on a missing method.
- **Security (§10.9):** the required `{ kind: "drive" }` policy is the *subscribe-time* gate (deny-by-default like every verb), and `canReadDocument` re-checks *every event* fail-closed. The test's three publishes prove drive scope, filter, and authz independently. Swap `allow` for `deny()` (its `svc.canReadDocument` returns false) to assert nothing is yielded when the per-event check fails.
- **Output redaction:** the generator yields only the `ChatOutput` fields — the same closed-pick discipline as request/response ops; a raw `DocumentChangeEvent` is never emitted (this is exactly what closes the webhook cross-tenant hole in §8.5).
- **Gotcha (timing):** `graphql-subscriptions` buffers only after `asyncIterator(...)` subscribes, which happens inside the generator after its first `await`. Kick off `it.next()`, then `await tick()` before publishing, or the events race the subscription. Always `it.return()` to unsubscribe so tests don't leak listeners into the shared pubsub.
- **Why the handler is enough:** `.subscription` handlers are `(input, ctx) => AsyncIterable<InferOut<TOut>>` — a plain async generator. All the transport concerns (socket lifecycle, SSE buffering) live in the projector, so the *logic* is testable as a pure function.
