# Switchboard API Framework (SAF) — Design Specification

**Status:** Draft / RFC · **Scope:** design only (no implementation in this document) · **Target package:** `@powerhousedao/switchboard-api`

> A transport‑agnostic API framework for Powerhouse Switchboard. Define an API **once**, in typesafe
> TypeScript, and project it to **GraphQL** (a federated subgraph, exactly as Switchboard does today),
> **REST**, **WebSocket subscriptions**, **JSON‑RPC**, and **Webhooks** — with batteries for CRUD,
> pagination, filtering and sorting that make it as productive as Django REST Framework, and a plugin
> system that adds observability, throttling, logging and caching without editing a line of core.

---

## Table of contents

1. [Motivation](#1-motivation)
2. [Goals & non‑goals](#2-goals--nongoals)
3. [The thesis: define once, project everywhere](#3-the-thesis-define-once-project-everywhere)
4. [Where SAF sits on the real Powerhouse seams](#4-where-saf-sits-on-the-real-powerhouse-seams)
5. [The request pipeline (the load‑bearing invariant)](#5-the-request-pipeline-the-loadbearing-invariant)
6. [Core primitives](#6-core-primitives)
7. [Data primitives & CRUD abstractions](#7-data-primitives--crud-abstractions)
8. [Transport projections](#8-transport-projections)
9. [Plugin & middleware system](#9-plugin--middleware-system)
10. [Security model (secure by default)](#10-security-model-secure-by-default)
11. [Testing & validation](#11-testing--validation)
12. [Authoring, packaging, codegen & migration](#12-authoring-packaging-codegen--migration)
13. [Required core changes to `reactor-api`](#13-required-core-changes-to-reactor-api)
14. [Design‑principle mapping (SOLID / KISS / DRY / secure / lightweight)](#14-designprinciple-mapping)
15. [Known limitations & open questions](#15-known-limitations--open-questions)
16. [Appendix A — the frozen core contract (TypeScript)](#appendix-a--the-frozen-core-contract-typescript)

---

## 1. Motivation

Switchboard already exposes every document model as an auto‑generated **GraphQL subgraph**, federated
into one supergraph by `GraphQLManager` (`packages/reactor-api/src/graphql/graphql-manager.ts`).
Developers who need something bespoke write a `BaseSubgraph` subclass with `typeDefs` + `resolvers`
(`packages/reactor-api/src/graphql/base-subgraph.ts`) and register it. This works, but it has three
structural limits:

1. **GraphQL is the only first‑class transport.** REST, RPC and webhooks are possible — the HTTP seam
   is generic (see §4) — but every one is a hand‑rolled `FetchHandler` with its own ad‑hoc validation,
   its own auth wiring, and its own error mapping. There is no shared contract, so the same resource
   exposed two ways drifts.
2. **Cross‑cutting concerns are copy‑pasted.** Authorization is a set of `assert*` helpers each subgraph
   must remember to call; there is **no rate limiting anywhere** in `reactor-api` today; observability,
   logging and caching are per‑resolver.
3. **No batteries.** Every list endpoint re‑implements pagination, filtering and sorting by hand, and
   the generated document‑model subgraphs degrade to in‑memory slicing at scale.

SAF makes the **operation** — not the transport — the unit of definition, and turns each transport into
a thin, read‑only *projection* of a shared operation registry.

## 2. Goals & non‑goals

### Goals

- **One definition → many transports.** A single `OperationDef` (or a `defineResource` config) is
  projected to GraphQL, REST, WS, RPC and webhooks with identical business logic, validation and authz.
- **End‑to‑end type safety** from the input/output schema through the handler to the inferred RPC client,
  with **no `any` at any boundary an author touches**.
- **DRF‑level batteries:** `defineResource` (a `ModelViewSet` analog), swappable pagination, an allowlist
  filtering/sorting DSL, and serializers — plus a clean escape hatch to raw primitives.
- **Pluggable by construction (Open/Closed):** observability, throttling, logging and caching are added
  as `Plugin`s; a new transport is a new `TransportProjector`; a new auth policy is a new
  `IAuthorizationService` strategy. Core is never edited to add any of these.
- **Secure by default, structurally:** deny‑by‑default authorization and input validation are *fixed*,
  non‑removable pipeline stages that no plugin can unseat.
- **Testable:** operations are pure `(input, ctx) => output`; projectors and plugins are unit‑testable in
  isolation; every artifact (SDL, route table, `Response`) is assertable.
- **Lightweight:** no new server, process, datastore, pubsub or query builder. SAF is a set of thin
  adapters over seams that already exist. Bring‑your‑own validator (any Standard Schema library).

### Non‑goals

- **SAF is not a new HTTP server or GraphQL engine.** It mounts onto the existing `IHttpAdapter` /
  `IGatewayAdapter`. It does not replace Apollo federation.
- **SAF stores nothing of its own** except a small, explicit outbox table for durable webhook egress
  (§8.5) and the DB read models you already run as processors.
- **SAF does not add horizontal‑scale fan‑out.** Realtime and webhook fan‑out inherit the single‑process
  `getPubSub()` limit (§15). SAF makes egress *durable* (an outbox), not *distributed*.
- **This document is design only.** No code ships here; every snippet is illustrative of the intended
  surface.

## 3. The thesis: define once, project everywhere

There is exactly **one define‑once unit**: an `OperationDef` — pure, isomorphic **data** (zero runtime
dependencies, snapshot‑testable) describing one logical call. It declares:

- **(a)** an **input** and **output** schema through a validator‑agnostic *Standard Schema* boundary
  (Zod / Valibot / ArkType all satisfy `StandardSchemaV1`);
- **(b)** the **typed capabilities** it needs (`requires: readonly CapabilityKey[]`), so the runtime
  injects *exactly those and only those* real Powerhouse interfaces as `ctx.caps`. An op that did not
  declare `"db"` cannot reference `ctx.caps.db` — that is a **compile error** (Interface‑Segregation as a
  type, not a convention);
- **(c)** a **mandatory, typed `SecurityPolicy`** (deny‑by‑default): you cannot construct an operation
  without stating who may call it, and `{ kind: "public" }` is the single greppable opt‑out;
- **(d)** one imperative **handler** `(input, ctx) => output`.

Two authoring altitudes sit on top of this one unit:

| Altitude | API | For |
| --- | --- | --- |
| **High** (batteries) | `defineResource(cfg)` | CRUD: `list` / `retrieve` / `create` / `update` / `delete` / `changes` + custom `@action`s, wired to a read model and a document‑model write path in ~30 lines. |
| **Low** (primitives) | `operation(id).input().output().requires().security().query/mutation/subscription()` | Anything: computed reports, bulk writes, bespoke sockets. Full control, same guarantees. |

Both altitudes emit ordinary `OperationDef`s. There is **no second code path** — anything `defineResource`
does, a hand‑written `operation()` can do, and vice‑versa (DRY).

## 4. Where SAF sits on the real Powerhouse seams

SAF invents no infrastructure. Every capability and every mount point is an interface that already exists
in the monorepo.

| Concern | Real seam SAF builds on | File |
| --- | --- | --- |
| HTTP mount (REST / RPC / inbound webhook) | `IHttpAdapter.mount(path, FetchHandler, {exact})`, `mountNodeRoute` (streaming), `getRoute` (GET) | `reactor-api/src/graphql/gateway/types.ts` |
| GraphQL federation | `IGatewayAdapter` + `GraphQLManager.registerSubgraphInstance()` / `updateRouter()` | `reactor-api/src/graphql/graphql-manager.ts` |
| Wire currency | `FetchHandler = (request: Request) => Promise<Response>` (WHATWG Fetch; **always buffered**) | `.../gateway/types.ts:23` |
| Reused request middleware | `AuthFetchMiddleware`, `DriveFetchMiddleware` — both `(FetchHandler) => FetchHandler` | `.../gateway/auth-middleware.ts`, `drive-middleware.ts` |
| Writes | `IReactorClient.execute / executeAsync / executeBatch` (apply `Action[]`), `create / createEmpty`, `drives.addFile`, `deleteDocument` | `reactor/src/client/types.ts` |
| Reads (scale path) | `IRelationalDb` = **Kysely**, per‑drive read models via `RelationalDbProcessor` | `shared/processors/relational/types.ts` |
| Reads (small‑N) | `IReactorClient.find(search, view, paging) → PagedResults<PHDocument>` | `reactor/src/client/types.ts` |
| Realtime | `IReactorClient.subscribe(search, cb, view)`, `getPubSub()`, `ensureGlobalDocumentSubscription()` | `reactor-api/src/graphql/reactor/pubsub.ts` |
| Authorization | `IAuthorizationService` (`canRead/canWrite/canMutate/canCreate`, policies, `isSupremeAdmin`, fail‑closed) | `reactor-api/src/services/authorization.service.ts` |
| Identity | `Context.user = { address, chainId, networkId }` (SIWE / renown) | `reactor-api/src/graphql/types.ts` |
| Analytics | `IAnalyticsStore` | `analytics-engine-core` |
| Observability | OpenTelemetry `metrics.getMeter(...)`, `ReactorInstrumentation` | `opentelemetry-instrumentation-reactor` |
| Config / flags | `PowerhouseConfig`, OpenFeature | `@powerhousedao/config`, `switchboard/src/feature-flags.ts` |
| Packaging | `PackageManager` discovers `<pkg>/subgraphs` (+ `<pkg>/processors`) | `reactor-api/src/packages/package-manager.ts` |

**Capabilities are these interfaces, never re‑invented:**

```ts
export interface Capabilities {
  reactor:   IReactorClient;         // writes (execute/executeAsync/executeBatch/create/…) + subscribe
  db:        IRelationalDb;          // Kysely read models (RelationalDbProcessor.query)
  analytics: IAnalyticsStore;        // rollups
  authz:     IAuthorizationService;  // the single decision seam
}
export type CapabilityKey = keyof Capabilities;
```

> **Honest boundary (see §12 and §13).** Only the **GraphQL** projection is contributable through the
> `<pkg>/subgraphs` package seam today, because a package is constructed with just `SubgraphArgs` and
> `GraphQLManager` keeps `httpAdapter`, `gatewayAdapter`, `wsServer` and the fetch middlewares **private**.
> REST / RPC / WS / webhook projection requires a **one‑time host wiring change** in `server.ts` plus a
> few new public accessors on `GraphQLManager`. SAF does **not** pretend these ship "with zero core
> edits." §13 lists exactly what must change.

## 5. The request pipeline (the load‑bearing invariant)

Every logical call — no matter which transport received it — runs the **same assembled pipeline**. Input
validation and authorization are **fixed, non‑removable stages sandwiched *inside* the plugin chain**, so
no plugin, however buggy or hostile or misordered, can reach a handler without passing validation and
authz.

```
             ┌─────────────────────── outer plugins (pre‑authz) ───────────────────────┐
 request ──▶ │  rate‑limit · logging · tracing                                          │
             │      ▼                                                                    │
             │  [FIXED] input safeParse ─▶ [FIXED] authorize ─▶ ┌── inner plugins ──┐   │
             │                                                  │ cache · redaction │   │
             │                                                  │      ▼            │   │
             │                                                  │  op.middlewares   │   │
             │                                                  │      ▼            │   │
             │                                                  │    handler        │   │
             │                                                  │      ▼            │   │
             │                                                  │ [FIXED] output    │   │
             │                                                  └───────────────────┘   │
             └──────────────────────────────────────────────────────────────────────────┘
                                              ▼
                              ApiError.code ─▶ transport wire idiom
```

- **`outer` plugins** run *before* authz (rate limiting must reject before doing work; logging/tracing
  must observe rejected calls). They can short‑circuit but cannot see authorized state.
- **`[FIXED] input safeParse`** parses the raw input against `op.input` and yields **typed** issues
  (never throws) — always on.
- **`[FIXED] authorize`** evaluates `op.security` against the identity and the resolved subject. Fails
  closed.
- **`inner` plugins** run *after* authz (cache, field redaction) — they may see authorized identity.
- **`op.middlewares`** are per‑op context‑extending steps (typed).
- **handler** runs. **`[FIXED] output`** validates *and* projects the result to exactly the declared
  output shape (the field‑leak guard, §10.6).

A `TransportProjector` only ever: **(a)** adapts the wire shape to the op's input, **(b)** calls
`rt.invoke(opId, input, ctx)`, **(c)** maps `ApiError.code` to the transport's error convention. Business
logic, validation and authz can never diverge by transport, because there is only one pipeline.

## 6. Core primitives

### 6.1 The validation boundary (Standard Schema)

The **only** validation surface is `StandardSchemaV1`, so any conforming validator works and none is a
runtime dependency of SAF.

```ts
import type { StandardSchemaV1 } from "@standard-schema/spec";

export type Schema<In = unknown, Out = In> = StandardSchemaV1<In, Out>;
// Use the official extractors — do NOT re-derive with `infer`, which can collapse to `unknown`
// for validators whose `~standard.types` is a phantom.
export type InferIn<S extends Schema>  = StandardSchemaV1.InferInput<S>;
export type InferOut<S extends Schema> = StandardSchemaV1.InferOutput<S>;

// The gate used by the FIXED input stage. Discriminate on the result explicitly (no `as any`):
export async function validateInput<S extends Schema>(
  s: S, raw: unknown,
): Promise<{ ok: true; value: InferOut<S> } | { ok: false; issues: readonly StandardSchemaV1.Issue[] }> {
  const r = await s["~standard"].validate(raw);
  return "value" in r ? { ok: true, value: r.value as InferOut<S> } : { ok: false, issues: r.issues };
}
```

> **Correction vs the naive draft:** `InferIn`/`InferOut` alias the official `StandardSchemaV1.InferInput/
> InferOutput` helpers (not a home‑grown `S extends Schema<infer I>`, which silently degrades to
> `unknown` for some validators), and `validateInput` discriminates on `"value" in r` rather than casting
> the value to `any` at the single most security‑load‑bearing gate.

### 6.2 Context — identity + transport metadata + only the declared capabilities

```ts
export type TransportKind = "graphql" | "rest" | "ws" | "rpc" | "webhook";

export interface OperationContext<TCaps extends CapabilityKey = never, TExt = {}> {
  readonly user?: { address: string; chainId: number; networkId: string }; // == reactor-api Context.user
  readonly headers: Headers;
  readonly transport: TransportKind;
  readonly wire: string;                    // distinct wire label (e.g. "nats", "sse") — see note
  readonly driveId?: string;                // validated (see 6.9); undefined only where truly optional
  readonly signal?: AbortSignal;
  readonly caps: Pick<Capabilities, TCaps>; // `db` present IFF `requires` includes "db"
  readonly log: (event: Record<string, unknown>) => void;
  readonly authorize: DocumentAuthorizer;   // the ONLY sanctioned string -> CanonicalDocumentId path
  readonly ext: TExt;                       // output of context-extending middleware (§6.7)
}
```

`transport` is the *delivery‑semantics* class (used by projectors to decide buffered vs streaming); `wire`
is a *distinct label* so a plugin can branch on the concrete channel. (A NATS RPC bridge sets
`transport: "rpc"`, `wire: "nats"`; header‑keyed plugins must guard on `wire`, because a non‑HTTP wire has
no `headers`.)

### 6.3 The typed error model

Handlers throw **only** `ApiError`. Each projector maps `ApiError.code` to its own idiom via an exhaustive
`Record<ApiErrorCode, …>`.

```ts
export type ApiErrorCode =
  | "VALIDATION"       // 400 · GraphQL BAD_USER_INPUT · JSON-RPC -32602
  | "UNAUTHENTICATED"  // 401 · reuses reactor-api errors.ts UNAUTHENTICATED
  | "FORBIDDEN"        // 403 · reuses reactor-api errors.ts FORBIDDEN
  | "NOT_FOUND"        // 404
  | "CONFLICT"         // 409 · job FAILED / write conflict
  | "RATE_LIMITED"     // 429 · NEW (nothing throttles in reactor-api today)
  | "INTERNAL";        // 500

export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string,
              readonly details?: unknown, readonly retryable = false) { super(message); }
}
export const ERROR_HTTP: Record<ApiErrorCode, number> = {
  VALIDATION: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, INTERNAL: 500,
};
export const ERROR_RPC: Record<ApiErrorCode, number> = {
  VALIDATION: -32602, UNAUTHENTICATED: -32001, FORBIDDEN: -32003,
  NOT_FOUND: -32004, CONFLICT: -32009, RATE_LIMITED: -32029, INTERNAL: -32603,
};
```

### 6.4 The security policy — mandatory, typed, deny‑by‑default

```ts
export type SubjectSelector<I, TCaps extends CapabilityKey = never, TExt = {}> =
  (input: I, ctx: OperationContext<TCaps, TExt>) => string;

export type SecurityPolicy<I, TCaps extends CapabilityKey = never, TExt = {}> =
  | { kind: "public" }                                                       // explicit, greppable opt-out
  | { kind: "authenticated" }                                               // ctx.user present
  | { kind: "document"; access: "read" | "write" | "manage";
      subject: SubjectSelector<I, TCaps, TExt> }                            // canRead / canWrite / canManage
  | { kind: "documentEach"; access: "read" | "write" | "manage";
      subjects: (input: I, ctx: OperationContext<TCaps, TExt>) => readonly string[] } // PER-ITEM (bulk) — §10.8
  | { kind: "operation"; operationType: string;
      subject: SubjectSelector<I, TCaps, TExt> }                            // canMutate(restricted op)
  | { kind: "create" }                                                       // canCreate
  | { kind: "drive"; access: "read" | "write";
      drive: (input: I, ctx: OperationContext<TCaps, TExt>) => string }      // collection scope — §10.7 (closes list IDOR)
  | { kind: "custom"; check: (input: I, ctx: OperationContext<TCaps, TExt>) => Promise<boolean> };
```

Two policies exist specifically to close review‑surfaced holes:

- **`documentEach`** authorizes **every id** a bulk operation touches (fail‑closed), so a `{kind:"custom"}`
  "am I logged in?" check can no longer void 100 documents the caller does not own (§10.8).
- **`drive`** authorizes the **collection scope** a `list`/`changes` reads from, so a merely
  *authenticated* user cannot point the `Drive-Id` header at another tenant's drive and read it (§10.7).

`SubjectSelector` and every policy closure are generic over `TCaps`/`TExt` and **default to
`OperationContext<never, {}>`** — an author writing a `custom` check still cannot reach an undeclared
capability. No policy closure is typed `OperationContext<any, any>`.

The **only** sanctioned `string → CanonicalDocumentId` conversion is confined to one object, so slug
aliasing cannot be used as an existence oracle:

```ts
export interface DocumentAuthorizer {
  readonly svc: IAuthorizationService;
  // Resolution only (wraps BaseSubgraph.resolveCanonicalDocumentId → CanonicalDocumentId):
  canonical(idOrSlug: string, ctx: OperationContext<any, any>): Promise<CanonicalDocumentId>;
  // Assertion that RETURNS a handle carrying fetchIdentifier (wraps BaseSubgraph.assertCan* helpers):
  assert(access: "read" | "write" | "manage", idOrSlug: string,
         ctx: OperationContext<any, any>): Promise<AuthorizedDocumentHandle>;
}
```

> **Correction vs the naive draft:** the draft returned an `AuthorizedDocumentHandle` from
> `resolveCanonicalDocumentId`, which actually returns a branded string. The two concerns are split:
> `canonical()` resolves; `assert()` produces the handle whose `fetchIdentifier` the handler reuses for
> the fetch (so the checked document and the fetched document are provably identical).

### 6.5 The define‑once unit

```ts
export type OperationKind = "query" | "mutation" | "subscription";

export type Handler<TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey,
                    K extends OperationKind, TExt> =
  K extends "subscription"
    ? (input: InferOut<TIn>, ctx: OperationContext<TCaps, TExt>) => AsyncIterable<InferOut<TOut>>
    : (input: InferOut<TIn>, ctx: OperationContext<TCaps, TExt>) => Promise<InferOut<TOut>>;

export interface OperationDef<
  TIn extends Schema = Schema, TOut extends Schema = Schema,
  TCaps extends CapabilityKey = never, K extends OperationKind = OperationKind, TExt = {},
> {
  readonly id: string;                          // "invoice.list" — globally unique; == JSON-RPC method
  readonly kind: K;
  readonly input: TIn;
  readonly output: TOut;
  readonly requires: readonly TCaps[];          // the typed DI contract
  readonly security: SecurityPolicy<InferOut<TIn>, TCaps, TExt>;  // REQUIRED — omission is a compile error
  readonly middlewares: readonly Middleware[];  // one middleware shape (§6.7)
  readonly handler: Handler<TIn, TOut, TCaps, K, TExt>;
  readonly rest?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path?: string; status?: number };
  readonly webhook?: { event: string; retries?: number };
  readonly graphql?: { fieldName?: string; typeName?: string };
  readonly idempotent?: boolean;                // query-only; gates the inner cache plugin
}
```

### 6.6 The low‑level builder — the auth guard that actually fires

```ts
// A branded, NON-callable type. When auth is undecided the terminal properties have THIS type,
// so `.query(...)` fails to typecheck with "This expression is not callable."
export type AuthNotDecided =
  { readonly __SAF_ERROR: "call .security(...) or .public() before choosing a terminal (.query/.mutation/.subscription)" };

export class OperationBuilder<
  TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey, TExt, TAuth extends boolean,
> {
  input<S extends Schema>(s: S):  OperationBuilder<S, TOut, TCaps, TExt, TAuth>;
  output<S extends Schema>(s: S): OperationBuilder<TIn, S, TCaps, TExt, TAuth>;
  requires<C extends CapabilityKey>(...caps: C[]): OperationBuilder<TIn, TOut, TCaps | C, TExt, TAuth>;
  use<TAdd>(mw: ContextMiddleware<TCaps, TExt, TAdd>): OperationBuilder<TIn, TOut, TCaps, TExt & TAdd, TAuth>;
  meta(m: Pick<OperationDef, "rest" | "webhook" | "graphql" | "idempotent">): this;

  security(p: SecurityPolicy<InferOut<TIn>, TCaps, TExt>): OperationBuilder<TIn, TOut, TCaps, TExt, true>;
  public(): OperationBuilder<TIn, TOut, TCaps, TExt, true>;

  // The TERMINALS are gated on the METHOD TYPE (not the return type). Undecided => AuthNotDecided,
  // which has no call signature, so `.query(handler)` is a red squiggle at the call site.
  query:        TAuth extends true
    ? (h: Handler<TIn, TOut, TCaps, "query", TExt>) => OperationDef<TIn, TOut, TCaps, "query", TExt>
    : AuthNotDecided;
  mutation:     TAuth extends true
    ? (h: Handler<TIn, TOut, TCaps, "mutation", TExt>) => OperationDef<TIn, TOut, TCaps, "mutation", TExt>
    : AuthNotDecided;
  subscription: TAuth extends true
    ? (h: Handler<TIn, TOut, TCaps, "subscription", TExt>) => OperationDef<TIn, TOut, TCaps, "subscription", TExt>
    : AuthNotDecided;
}

export function operation(id: string): OperationBuilder<Schema, Schema, never, {}, false>;
```

> **Correction vs the naive draft (critical).** The draft typed the terminals as
> `query(h): TAuth extends true ? OperationDef : never`, gating only the **return type**. With
> `TAuth=false` the method's type is `(h) => never`, which is *perfectly callable*, and `never` is
> assignable to everything — so "forgot to authorize" compiled clean and was caught only at runtime.
> Gating the **property** (`query: TAuth extends true ? (...) => ... : AuthNotDecided`) makes `.query(...)`
> genuinely uncallable until `.security()`/`.public()` has been called. A runtime backstop in `build()`
> still catches `as any` bypasses (§6.8).

**Ordering rule (type‑enforced where it matters).** A `document`/`documentEach`/`operation` policy's
subject selector is typed against `InferOut<TIn>`, so it only typechecks after `.input()` has narrowed
`TIn`. Convention: call `.input().output().requires()` before `.security()`. `build()` re‑validates the
stored policy against the final `TIn` as a backstop.

The pure‑data authoring form threads capabilities into the handler via independent generics (so `requires`
flows to `ctx.caps`):

```ts
export function defineOperation<
  TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey, K extends OperationKind, TExt,
>(d: OperationDef<TIn, TOut, TCaps, K, TExt>): OperationDef<TIn, TOut, TCaps, K, TExt>;
```

> **Correction vs the naive draft:** the draft's `defineOperation<D extends OperationDef>(d: D): D`
> could not infer `requires → ctx.caps` and in fact rejected any capability‑declaring op (the default
> `OperationDef` has `requires: readonly never[]`). Independent generics link `requires` to the handler
> context. (If co‑dependent inference in one object literal proves flaky in practice, steer authors to the
> builder, whose `.requires()` locks `TCaps` before `.query()` supplies the handler.)

### 6.7 One middleware shape

There is **one** middleware concept. Cross‑cutting concerns are `Plugin`s (§9); per‑op steps are
`Middleware`s. Context‑extending middleware (`.use<TAdd>()`) is adapted into the same shape at builder
time — it does not introduce a second stored type.

```ts
export type Invoker<I, O> = (input: I, ctx: OperationContext<any, any>) => Promise<O>;
export type Middleware = <I, O>(next: Invoker<I, O>, op: OperationDef) => Invoker<I, O>;

// Ergonomic surface for context extension; TAdd is inferred from a COVARIANT return position
// (reliable for inline, unannotated middleware). The builder adapts this into a `Middleware` that
// merges `patch` into a fresh ctx.ext before calling next.
export type ContextMiddleware<TCaps extends CapabilityKey, TExtIn, TAdd> =
  (input: unknown, ctx: OperationContext<TCaps, TExtIn>) => Promise<TAdd>;
```

> **Correction vs the naive draft:** the draft had three overlapping "wrap a call" shapes (`OpMiddleware`,
> `TypedMiddleware`, `Plugin.wrap`) and stored the incompatible `TypedMiddleware` in an `OpMiddleware[]`.
> Collapsed to one stored shape (`Middleware`); `.use()`'s `TAdd` is inferred from the covariant return of
> a `(input, ctx) => Promise<TAdd>` (not from a nested `next` parameter), which inline middleware infers
> reliably.

### 6.8 The app / wiring surface (accumulating registry generic)

```ts
export class SwitchboardApi<R extends Record<string, OperationDef> = {}> {
  constructor(opts?: { corsAllowlist?: string[]; batchLimit?: number; bodyLimit?: string });
  // Each register(...) FOLDS the ops' ids -> types into R, so the registry type is honest:
  register<Ops extends readonly (OperationDef | Record<string, OperationDef>)[]>(
    ...defsOrResources: Ops
  ): SwitchboardApi<R & IdMap<Ops>>;
  use(...plugins: Plugin[]): this;             // rateLimit() + observability() + logging() ON by default
  build(): TypedRegistry<R>;                   // runtime backstop: throws if any op lacks a decided policy
  project(projectors: TransportProjector[], deps: ProjectionDeps): Promise<void>;
}

// The typed registry keyed by op.id — the single source the RPC client infers from:
export interface TypedRegistry<R extends Record<string, OperationDef>> extends OperationRegistry {
  readonly typed: R;                           // { "invoice.list": OperationDef<…>, … }
}

// Inferred RPC client: input is InferIn (pre-parse wire type), subscriptions excluded, keyed by op.id.
export type ApiClient<R extends Record<string, OperationDef>> = {
  [K in keyof R as R[K] extends OperationDef<any, any, any, "subscription", any> ? never : K]:
    R[K] extends OperationDef<infer I, infer O, any, any, any>
      ? (input: InferIn<I>) => Promise<InferOut<O>> : never;
};
export function createRpcClient<R extends Record<string, OperationDef>>(
  url: string, fetchImpl?: typeof fetch,
): ApiClient<R>;
// Usage — ONE source of truth, no hand-maintained id->op map:
//   const registry = api.register(invoice).build();
//   const client = createRpcClient<typeof registry.typed>(url);
//   const page = await client["invoice.list"]({ filter: { status: { in: ["open"] } } });
```

> **Corrections vs the naive draft (three highs):** (1) the client's input is `InferIn` (what the wire
> carries), not `InferOut` (the post‑parse type) — otherwise a coercing schema forces callers to hand‑apply
> the server transform. (2) `subscription` ops are excluded from the client (the RPC projector rejects them
> at runtime). (3) `SwitchboardApi` carries an **accumulating `R`** and `defineResource` returns a record
> **keyed by `op.id`** (§7.6), so `typeof registry.typed` is the honest, single inference source — no
> parallel `{ "invoice.retrieve": invoice.get } as const` map to keep in sync.

Runtime backstop in `build()` (defence in depth behind the `TAuth` type guard): throw if any registered op
has no decided `security`, if any output schema is not closed (§10.6), or if a keyset paginator's advertised
sort set is incompatible with the resource's `sortable` (§7.2).

### 6.9 Drive selection is validated, not dereferenced

Read handlers scope to a per‑drive Postgres schema. `driveId` must be a **validated** part of the request,
never an unchecked header dereferenced with `!` deep in a handler.

- For **`defineResource`** reads, `driveId` is resolved by a fixed pre‑handler step and, when a `drive`
  security policy is present (required for `list`/`changes`, §10.7), it is **authorized** before the query
  runs. Absence yields `ApiError("VALIDATION")`, not an `INTERNAL` from `getNamespace(undefined)`.
- For **raw `operation()`** reads, put the drive selector in the input schema (or rely on the fixed step)
  so `safeParse` covers it.

> **Correction vs the naive draft:** the draft did `RelationalDbProcessor.query(ctx.driveId!, …)` — but
> `createDriveFetchMiddleware` passes through with **no** `driveId` when the `Drive-Id` header is absent
> (`drive-middleware.ts:47`), and the REST examples sent none. SAF makes the drive selector first‑class and
> validated.

## 7. Data primitives & CRUD abstractions

Two layers, one substrate: small swappable primitives you can call by hand, and `defineResource` that wires
them into a full CRUD surface. Reads compile to **parameterized Kysely** over an indexed read model; writes
are **document‑model actions/creations** through `IReactorClient`.

### 7.1 The read substrate

```ts
// RelationalDbProcessor (packages/shared/processors/relational/types.ts), verbatim:
//   static getNamespace(driveId) => `${this.name}_${driveId.replaceAll("-", "_")}`
//   static query(driveId, db)    => db.queryNamespace(this.getNamespace(driveId))
// IRelationalQueryBuilder is Pick<QueryCreator, "selectFrom"|"selectNoFrom"|"with"|"withRecursive">
// & { withSchema } — read-only. The write-capable Kysely handle is NOT reachable from ctx.caps.db.

const qb = InvoiceReadModel.query(driveId, ctx.caps.db);   // IRelationalQueryBuilder<InvoiceDb>
const rows = await qb.selectFrom("invoice").selectAll().where("status", "=", "open").execute();
```

> **Namespace hashing footgun (real).** `getNamespace()` returns the **raw** `${name}_${driveId}` string,
> but `createNamespace`/`queryNamespace` hash it internally by default (`shouldHash ?? true`). **Never**
> pass `getNamespace()` output to `withSchema()` directly — write and read through the same
> `queryNamespace`/processor handle so hashing is applied consistently on both ends, or seed data lands in
> a different schema than reads target. Server and browser must agree on the hashing option.

**Small‑N alternative — the `document` binding.** When a resource is a handful of singleton documents and
you would rather not stand up a processor, read through `IReactorClient.find(search, view, paging) →
PagedResults<PHDocument>`; `requires` becomes `["reactor"]`, and you inherit `find`'s limits (no arbitrary
sort/filter operators). Use `read` (a processor) for anything that must scale.

### 7.2 Pagination — two honest contracts, not one leaky one

Pagination is a strategy object. Because keyset and offset paginators **accept different sort inputs**,
they are **two interfaces**, not one substitutable `Paginator` (honest Liskov):

```ts
export type SortDir = "asc" | "desc";
export interface SortSpec<Row> { field: keyof Row & string; dir: SortDir; }

interface PaginatorBase<Row> {
  apply(qb: SelectQueryBuilder<any, any, Row>, sort: readonly SortSpec<Row>[], page: PagingOptions):
    SelectQueryBuilder<any, any, Row>;
  envelope(rows: Row[], page: PagingOptions): PagedResults<Row>;   // { results, options, nextCursor?, totalCount?, next?() }
}
// SEEK paginators can only order by their configured cursor column(s) (direction may flip).
// An unsupported sort field -> ApiError("VALIDATION"). No totalCount (counting defeats the seek).
export interface SeekPaginator<Row> extends PaginatorBase<Row> { readonly mode: "seek"; readonly columns: readonly (keyof Row & string)[]; }
// OFFSET paginators honor ARBITRARY OrderingBackend sort; totalCount available via a companion count().
export interface OffsetPaginator<Row> extends PaginatorBase<Row> { readonly mode: "offset"; }
export type Paginator<Row> = SeekPaginator<Row> | OffsetPaginator<Row>;

export function keyset<Row>(o: { orderBy: keyof Row & string; tieBreaker: keyof Row & string; default: number; max: number }): SeekPaginator<Row>; // DEFAULT — indexed, stable, opaque cursor
export function offset<Row>(o: { default: number; max: number }): OffsetPaginator<Row>;
export function pageNumber<Row>(o: { size: number; max: number }): OffsetPaginator<Row>;  // DRF PageNumberPagination
export function cursorPage<Row>(o: { default: number; max: number; by: (keyof Row & string)[] }): SeekPaginator<Row>; // compound keyset
```

`apply` is the only place a paginator touches SQL (orderBy + seek/offset + `limit`); `envelope` is pure
post‑processing (slice the sentinel row, mint the opaque `nextCursor`) — so paginators are trivially
unit‑testable. `max` is a **hard page cap on every paginator** (a DoS guard). `keyset` is the default:
O(1) per page, stable under concurrent inserts, opaque base64url cursor.

At `build()`, a resource whose `sortable` set exceeds a `SeekPaginator`'s `columns` is rejected — the
keyset sort constraint is caught at registration, not surfaced as a runtime surprise (closes the LSP
finding).

> **On "typed columns":** `FilterSet<Row>`/`OrderingBackend<Row>` keys are typed to `keyof Row`, so you
> cannot allowlist a column that does not exist. The **emitted SQL** is validated at **runtime** by the
> allowlist (Kysely's dynamic‑string column API is stringly typed inside `<any, any, Row>`). An optional
> `SelectQueryBuilder<DB, TB, Row>` variant carrying the DB‑schema generic gives compile‑time column
> checking and removes the internal `as any`; the allowlist is the security boundary either way.

### 7.3 Filtering DSL — closed allowlist compiled to parameterized SQL

```ts
export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "range";
export interface FieldSpec { type: "string" | "number" | "boolean"; ops: readonly FilterOp[]; }
export type FilterSet<Row> = { [K in keyof Row]?: FieldSpec };            // only declared columns are filterable
export type OrderingBackend<Row> = ReadonlyArray<keyof Row & string>;    // ordering_fields allowlist

export function compileFilter<Row>(allow: FilterSet<Row>, input: Record<string, unknown>):
  (qb: SelectQueryBuilder<any, any, Row>) => SelectQueryBuilder<any, any, Row>;
```

Wire shape is a nested `{ field: { op: value } }` map. `compileFilter` rejects any unlisted field or
operator with `ApiError("VALIDATION")` and binds every value as a Kysely parameter (no interpolation).
Security properties, by construction: unlisted columns are invisible (no enumeration oracle); unlisted
operators are rejected (no `LIKE` exfiltration on an `eq`‑only column); all values are bound (no injection);
bad filters are typed `VALIDATION`, never a 500. Sorting is a second allowlist (`OrderingBackend`), parsed
from DRF's `-field` convention; an unknown sort field is `VALIDATION`.

### 7.4 The serializer — Standard Schema DTOs + field‑level security

```ts
export interface Serializer<
  TOut extends Schema, TCreate extends Schema = TOut,
  TUpdate extends Schema = TCreate, TFilter extends Schema = Schema,
> {
  output: TOut;                 // read shape — the FIXED output stage projects to EXACTLY these keys
  create?: TCreate;             // create body DTO
  update?: TUpdate;             // update patch DTO
  filter?: TFilter;             // derived from read.filterable when omitted (one source of truth)
  sortable?: readonly string[]; // advertised sort subset (docs/SDL)
  fieldGuards?: Partial<Record<keyof InferOut<TOut> & string, (ctx: OperationContext<any, any>) => boolean>>;
}
```

`output` doubles as the **field‑leak guard**, but SAF does **not** rely on a validator's default
unknown‑key behavior (Zod/Valibot strip; ArkType does not, by default). The FIXED output stage **explicitly
projects the result to exactly the declared `output` keys** (allowlist `pick`) and `build()` rejects an
output schema that is not provably closed. `fieldGuards` predicates are enforced by an inner plugin that is
**auto‑injected whenever a serializer declares them** (structural, not "remember to add
`fieldRedaction()`"). The old free‑string `sensitive: Record<string,string>` is dropped — it fully
overlapped `fieldGuards` and implied roles `holdsRole` cannot resolve.

### 7.5 CRUD config — parameterized over the DTO types

```ts
export interface ResourceConfig<
  Row, TOut extends Schema, TCreate extends Schema, TUpdate extends Schema, TFilter extends Schema,
> {
  name: string;                                    // "invoice"
  version: string;                                 // "1.0.0"
  basePath?: string;                               // REST base; defaults to pluralized name
  documentType: string;                            // e.g. "powerhouse/invoice" — write path branches on this
  serializer: Serializer<TOut, TCreate, TUpdate, TFilter>;

  read?: {
    source: RelationalDbProcessorClass<Row>;
    table: string;
    filterable: FilterSet<Row>;
    sortable: OrderingBackend<Row>;
    pagination: Paginator<Row>;                    // keyset() default
    changes?: { search: (ctx: OperationContext<never, {}>) => SearchFilter }; // enables changes + webhooks
  };
  document?: { search: (ctx: OperationContext<"reactor", {}>) => SearchFilter; view?: ViewFilter }; // small-N

  write?: {
    branch?: (ctx: OperationContext<never, {}>) => string;          // shared by all verbs (default "main")
    // CREATE returns a document to create — NOT Action[] applied to a minted id:
    create?: (input: InferOut<TCreate>, ctx: OperationContext<"reactor", {}>) =>
      | { document: PHDocument; parent?: string }                   // flat model -> reactor.create
      | { type: string; initialState?: unknown; parent?: string };  // -> reactor.createEmpty (+ drives.addFile if container)
    // UPDATE/REMOVE apply actions to the AUTHORIZED document (the id authz resolved), never a re-computed target:
    update?: (patch: InferOut<TUpdate>) => Action[];
    remove?: () => Action[];
    async?: boolean;                               // executeAsync (JobInfo) vs execute (waits + returns doc)
  };

  security: {                                      // per-verb, REQUIRED, deny-by-default
    list:    SecurityPolicy<ListArgs<TFilter>>;    // MUST be a { kind: "drive" } (or stricter) — §10.7
    get:     SecurityPolicy<{ id: string }>;
    create?: SecurityPolicy<InferOut<TCreate>>;
    update?: SecurityPolicy<{ id: string }>;
    remove?: SecurityPolicy<{ id: string }>;
    changes?: SecurityPolicy<ChangesArgs<TFilter>>; // REQUIRED when read.changes is set — §10.9
  };
  actions?: readonly OperationDef[];
  plugins?: readonly Plugin[];
}
```

> **Corrections vs the naive draft (multiple highs):** DTO types (`TCreate/TUpdate/TFilter`) now flow into
> the write bindings (no `input: unknown` hand‑casts, closing the mass‑assignment gap); `create` returns a
> **document to create**, matching `reactor.create/createEmpty/drives.addFile`, **not** `Action[]` applied
> to a minted id via `execute` (which only mutates *existing* documents); `update`/`remove` act on the
> **authorized** document, not a re‑computed `target()` (no confused deputy); `write.target` is gone,
> replaced by a shared `branch` resolver + a create‑only document factory (SRP); `list`/`changes` policies
> are drive‑scoped (§10.7/§10.9).

### 7.6 `defineResource` — precisely typed, keyed by op.id

```ts
// Returns a record keyed by op.id (NOT by verb), each entry PRECISELY typed — so `typeof registry.typed`
// yields real wire method names and the RPC client infers correctly.
export function defineResource<
  Row, TOut extends Schema, TCreate extends Schema, TUpdate extends Schema, TFilter extends Schema,
>(cfg: ResourceConfig<Row, TOut, TCreate, TUpdate, TFilter>): DefinedResource<cfg>;

// DefinedResource expands (schematically) to a mapped type like:
// {
//   [`${name}.list`]:     OperationDef<ListArgs<TFilter>,    ConnectionOf<TOut>, "db",            "query",        {}>;
//   [`${name}.retrieve`]: OperationDef<{ id: string schema }, TOut,              "db",            "query",        {}>;
//   [`${name}.create`]:   OperationDef<TCreate,              TOut,               "reactor"|"db",  "mutation",     {}>;
//   [`${name}.update`]:   OperationDef<TUpdate,              TOut,               "reactor"|"db",  "mutation",     {}>;
//   [`${name}.delete`]:   OperationDef<{ id: string schema }, TOut,             "reactor",       "mutation",     {}>;
//   [`${name}.changes`]?: OperationDef<ChangesArgs<TFilter>, ChangeEventOf<TOut>, "reactor",     "subscription", {}>;
// } & { [A in cfg.actions[number]["id"]]: … }
```

Generated read handler (schematic) — the same primitives you would call by hand:

```ts
async (input, ctx) => {
  const page: PagingOptions = { cursor: input.cursor ?? "", limit: input.limit ?? 0 };
  const sort = parseSort(input.sort ?? [], cfg.read!.sortable);          // VALIDATION on unlisted field
  let qb = cfg.read!.source.query(ctx.driveId!, ctx.caps.db).selectFrom(cfg.read!.table);
  qb = compileFilter(cfg.read!.filterable, input.filter ?? {})(qb);      // VALIDATION on unlisted field/op
  qb = cfg.read!.pagination.apply(qb, sort, page);                       // orderBy + seek/offset + limit
  const rows = await qb.selectAll().execute();
  return cfg.read!.pagination.envelope(rows, page);                      // PagedResults<Row> -> stripped to TOut
}
```

Generated create handler (schematic) — creation, not mutation:

```ts
async (input, ctx) => {
  const spec = cfg.write!.create!(input, ctx);
  const doc = "document" in spec
    ? await ctx.caps.reactor.create(spec.document, spec.parent)                 // flat model
    : isDriveContainerType(spec.type)
      ? await ctx.caps.reactor.drives.addFile({ type: spec.type, parent: spec.parent, initialState: spec.initialState })
      : await ctx.caps.reactor.createEmpty(spec.type, { parentIdentifier: spec.parent });
  return project(doc);   // -> TOut
}
```

Generated update handler (schematic) — writes the **authorized** document:

```ts
async ({ id }, ctx) => {
  const handle = await ctx.authorize.assert("write", id, ctx);   // the FIXED authz stage already ran this;
  const branch = cfg.write!.branch?.(ctx) ?? "main";             // handler reuses the exact fetchIdentifier.
  await ctx.caps.reactor.execute(handle.fetchIdentifier, branch, cfg.write!.update!(patch));
  const updated = await ctx.caps.reactor.get(handle.fetchIdentifier);  // strongly-consistent re-read
  return project(updated);                                       // -> TOut
}
```

### 7.7 A full CRUD resource (corrected worked example)

```ts
import { z } from "zod";
import {
  defineResource, operation, keyset, offset, type FilterSet, type OrderingBackend,
  type Serializer, ApiError,
} from "@powerhousedao/switchboard-api";
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import type { SearchFilter } from "@powerhousedao/reactor/shared/types";
import {
  createInvoiceAction, editInvoiceAction, voidInvoiceAction, sendInvoiceAction,
  makeInvoiceDocument, INVOICE_DOC_TYPE,
} from "@acme/invoice-model";

// 1) Read-model row (Kysely schema) + processor. `ownerAddress` is internal and MUST NOT leak.
interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string; ownerAddress: string;
}
interface InvoiceDb { invoice: InvoiceRow }
export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {
  /* initAndUpgrade() creates the indexed `invoice` table; onOperations() projects CREATE/EDIT/VOID/SEND
     actions into rows. Ships from <pkg>/processors. Body omitted. */
}

// 2) Serializer — DTOs (Standard Schema) + field guard. output is CLOSED (ownerAddress excluded & picked).
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
  fieldGuards: { counterparty: (ctx) => Boolean(ctx.user) },   // hidden from anonymous callers (auto-enforced)
};

// 3) Allowlists + paginator.
const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte", "range"] },
  currency:     { type: "string", ops: ["eq", "in"] },
  dueDate:      { type: "string", ops: ["gte", "lte", "range"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];

// 4) A custom @action (detail) on the low-level builder — writes the AUTHORIZED document.
const sendInvoice = operation("invoice.send")
  .input(z.object({ id: z.string() }))
  .output(InvoiceOutput)
  .requires("reactor", "db")
  .meta({ rest: { method: "POST", path: "/:id/send" }, webhook: { event: "invoice.sent" } })
  .security({ kind: "document", access: "write", subject: (i) => i.id })   // decided BEFORE .mutation typechecks
  .mutation(async ({ id }, ctx) => {
    const handle = await ctx.authorize.assert("write", id, ctx);
    await ctx.caps.reactor.execute(handle.fetchIdentifier, "main", [sendInvoiceAction({ id })]);
    const row = await InvoiceReadModel.query(ctx.driveId!, ctx.caps.db)
      .selectFrom("invoice").selectAll().where("id", "=", handle.fetchIdentifier).executeTakeFirst();
    if (!row) throw new ApiError("NOT_FOUND", `invoice '${id}' not found`);
    return row;                                                            // projected to InvoiceOutput
  });

// 5) The resource — list & changes are DRIVE-SCOPED (not merely "authenticated").
export const invoiceRegistry = defineResource({
  name: "invoice", version: "1.0.0", documentType: INVOICE_DOC_TYPE, serializer,
  read: {
    source: InvoiceReadModel, table: "invoice", filterable, sortable,
    pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 }),
    changes: { search: (): SearchFilter => ({ type: INVOICE_DOC_TYPE }) },
  },
  write: {
    branch: () => "main",
    create: (input) => ({ document: makeInvoiceDocument(input) }),        // reactor.create — real creation
    update: (patch) => [editInvoiceAction(patch)],                        // applied to the authorized id
    remove: () => [voidInvoiceAction({})],
    async: false,
  },
  security: {
    list:    { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },  // drive-scoped
    get:     { kind: "document", access: "read",  subject: (i) => i.id },
    create:  { kind: "create" },
    update:  { kind: "document", access: "write", subject: (i) => i.id },
    remove:  { kind: "document", access: "manage", subject: (i) => i.id },
    changes: { kind: "drive",    access: "read", drive: (_i, ctx) => ctx.driveId! },  // subscribe-time authz
  },
  actions: [sendInvoice],
});
// invoiceRegistry = { "invoice.list", "invoice.retrieve", "invoice.create",
//                     "invoice.update", "invoice.delete", "invoice.changes", "invoice.send" } — all typed OperationDefs
```

### 7.8 A fully custom endpoint & a safe bulk write

Drop to `operation()` for anything without a CRUD shape (a computed aging report, etc.); you reuse
`compileFilter` + a `Paginator` + `envelope` and keep every guarantee. Bulk writes use `executeBatch` **and
a `documentEach` policy** so every id is authorized (no confused deputy):

```ts
export const invoiceBulkVoid = operation("invoice.bulkVoid")
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ voided: z.array(z.string()) }))
  .requires("reactor")
  // PER-ITEM authorization — every id must pass canWrite, fail-closed. Not a "logged in?" custom check.
  .security({ kind: "documentEach", access: "write", subjects: (i) => i.ids })
  .mutation(async ({ ids }, ctx) => {
    const res = await ctx.caps.reactor.executeBatch({
      jobs: ids.map((id) => ({ key: id, documentId: id, scope: "global", branch: "main",
        actions: [voidInvoiceAction({ id })], dependsOn: [] })),
    });
    return { voided: Object.keys(res.jobs) };
  });
```

## 8. Transport projections

A `TransportProjector` reads the operation registry and mounts each op onto a real seam, emitting a native
Powerhouse artifact — never a parallel server. All five call `rt.invoke(opId, input, ctx)` (§5).

```ts
export interface TransportProjector {
  readonly transport: TransportKind;
  project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void | Promise<void>;
}
export interface ProjectionDeps {
  basePath: string;                 // graphqlManager.getBasePath()
  httpAdapter: IHttpAdapter;        // mount / getRoute / mountNodeRoute  (NEW accessor — §13)
  graphqlManager: GraphQLManager;   // registerSubgraphInstance / updateRouter
  gatewayAdapter: IGatewayAdapter;  // createHandler / attachWebSocket   (NEW accessor — §13)
  wsServer: WebSocketServer;        // the ONE shared server              (NEW accessor — §13)
  pubsub: ReturnType<typeof getPubSub>;
  driveOwnershipCache: DriveOwnershipCache;   // the SAME instance GraphQLManager uses (NEW accessor — §13)
  authService: AuthService;
  subgraphArgs: SubgraphArgs;
  wrapFetch: (h: FetchHandler) => FetchHandler;  // folds plugin.asFetchMiddleware
}
```

**Canonical mapping** for an `invoice` resource:

| verb | kind | GraphQL | REST | RPC method | webhook |
| --- | --- | --- | --- | --- | --- |
| list | query · collection | `Query invoices(filter,sort,cursor,limit)` | `GET  <base>/rest/invoices` | `invoice.list` | — |
| retrieve | query · detail | `Query invoice(id)` | `GET  <base>/rest/invoices/:id` | `invoice.retrieve` | — |
| create | mutation · collection | `Mutation createInvoice(input)` | `POST <base>/rest/invoices` | `invoice.create` | `invoice.created` |
| update | mutation · detail | `Mutation updateInvoice(id,input)` | `PATCH <base>/rest/invoices/:id` | `invoice.update` | `invoice.updated` |
| delete | mutation · detail | `Mutation deleteInvoice(id)` | `DELETE <base>/rest/invoices/:id` | `invoice.delete` | `invoice.deleted` |
| send | mutation · detail | `Mutation sendInvoice(id)` | `POST <base>/rest/invoices/:id/send` | `invoice.send` | `invoice.sent` |
| changes | subscription · collection | `Subscription invoiceChanges(filter)` | (WS/SSE only) | — | stream |

### 8.1 GraphQL (matches Switchboard today)

The projector compiles each Standard Schema to SDL (output→type, create/update→input, filter→input,
list→`InvoiceConnection { results, nextCursor, totalCount }`) and emits a native subgraph:

```ts
class GeneratedSubgraph extends BaseSubgraph {           // reuses assertCan*/resolveCanonicalDocumentId
  constructor(args: SubgraphArgs, ops: readonly OperationDef[], name: string) { super(args); /* … */ }
  name = "invoice"; typeDefs = /* compiled SDL */; resolvers = /* (args, ctx) => rt.invoke("invoice.<verb>", args, gqlCtx(ctx)) */;
  hasSubscriptions = true;
}
// graphqlManager.registerSubgraphInstance(new GeneratedSubgraph(args, ops, "invoice"), "graphql");
// then graphqlManager.updateRouter();   // debounced 1s -> recompose Apollo supergraph
```

**Single subgraph name, no version‑in‑name canary.** Each resource occupies **one** subgraph name (e.g.
`invoice`). We do **not** encode the version in the subgraph name to hot‑swap schemas, because two
subgraphs both owning `Query.invoices` is a fatal federation composition conflict (`LocalCompose`
rejects an unshareable root field defined twice), the error is swallowed by `_updateRouter`'s try/catch,
and there is **no unregister API** on `GraphQLManager` to remove the old one (`setSupergraph` bulk‑replaces
but neither un‑mounts nor invalidates `subgraphHandlerCache`). A schema change therefore requires the core
**replace/unregister** capability listed in §13. Until that lands, restrict in‑place changes to additive,
`@shareable`‑safe ones on a single subgraph name.

**Shared value types.** The projector **imports/reuses** the core reactor scalars/enums (`DateTime`,
`DocumentChangeType`, …) rather than re‑emitting per‑resource definitions that could differ by member order
or nullability and break cross‑subgraph merge. A golden‑SDL snapshot suite (including cross‑subgraph
composition) gates any projector change.

**Depth/complexity limits are a core change, not a per‑projector default.** A `GeneratedSubgraph`
contributes only `typeDefs`/`resolvers`; it has no hook to install `validationRules` on the core‑owned
supergraph `ApolloServer`. Query‑cost/depth limiting must be added where the supergraph server is
constructed (`createSupergraphHandler`) — see §13. SAF documents this as required core work and does **not**
claim to deliver it through the subgraph seam.

### 8.2 REST

One `FetchHandler` with an internal method+path router, mounted **prefix** (`{ exact: true }` — the flag is
inverted) with auth **outermost**:

```ts
httpAdapter.mount("<base>/rest/invoices",
  deps.wrapFetch(authFetch(driveFetch(restHandler))),   // auth (401) before drive (421); wrapFetch folds plugins
  { exact: true });
```

`PagedResults` serializes as `{ results, nextCursor, totalCount }` plus an RFC 5988
`Link: <…&cursor=NEXT>; rel="next"` header. Mutations project to POST/PATCH/PUT/DELETE — **never GET**
(the AuthService skips bearer verification on GET/OPTIONS). Buffered is correct here (the Fetch seam always
`await response.text()`s).

> **Reusing `driveFetch` for REST — caveat (real).** `createDriveFetchMiddleware`'s cache‑bypass path
> parses the body as a **GraphQL** request (`body.operationName`/`body.query`), so a legitimate REST POST
> against a drive not yet in the ownership cache would 421. SAF therefore uses a **REST‑aware drive step**
> that shares GraphQLManager's *same* `DriveOwnershipCache` instance (via the new accessor in §13) rather
> than re‑instantiating the GraphQL‑shaped middleware — otherwise shard decisions diverge from the GraphQL
> routes.

### 8.3 WebSocket subscriptions — one owner, no double‑wiring

Subscriptions ride the **one shared** `WebSocketServer` (`/graphql/subscriptions`, `setMaxListeners(0)`).
**Registering a `hasSubscriptions` subgraph already wires WS *and* SSE** inside `GraphQLManager`'s
`#setupSubgraphs` (`attachWebSocket` + `/stream`). So the GraphQL registration **owns** the socket; there
is **no** separate `SubscriptionProjector` calling `attachWebSocket` again (that would register a second
`graphql-ws` server on the shared socket and double‑handle every connection). WS auth is
`authService.authenticateWebSocketConnection(connectionParams)` (it throws on failure — the header Fetch
middleware does not wrap WS). The handler's `AsyncIterable` is adapted to `graphql-subscriptions`, and the
`changes` subscription runs, per event, `matchesFilter` **and** per‑document `canReadDocument` (fail‑closed)
— identical to today's `documentChanges`. Subscribe‑time authz uses the required `changes` `drive` policy
(§10.9).

> **SSE caveat.** `graphql-sse` is offered as an HTTP‑auth‑friendly alternative, but the Express/Fastify
> `serveFetchHandler` still `await response.text()`s, so verify true streaming before relying on it; steer
> heavy push consumers to WS or webhooks.

### 8.4 JSON‑RPC 2.0

One buffered `FetchHandler` mounted `httpAdapter.mount("<base>/rpc", authFetch(driveFetch(rpcHandler)))`
(default exact). `method` = `op.id`; `params` are `safeParse`d against the op input; `query|mutation` only
(`subscription` → "use WS/SSE", and the inferred client excludes them). The typed client
`createRpcClient<typeof registry.typed>(url)` infers its whole surface — zero codegen.

**Batch hardening (closes a DoS + a limiter bypass):** a JSON array batch is **capped** (`batchLimit`,
default e.g. 50; over‑cap → `-32600`) and fanned out with **bounded concurrency** (no unbounded
`Promise.all`). Because the multiplexed `/rpc` mount has `op === null`, the rate‑limiter falls back to an
**IP/global pre‑buffer 429** even when the default plugin is `by:"user"`, and SAF enforces a **tighter
`bodyLimit`** on `/rpc` rather than inheriting the 50 MB default — so a single 50 MB array cannot be
buffered, parsed and expanded into hundreds of thousands of pipeline entries before any throttle applies.

### 8.5 Webhooks

**Outbound** delivery goes through the **same authorization and redaction pipeline as every other
transport** — it is *not* a raw fan‑out:

- For each op with `webhook.event`, ref‑count **one** `ensureGlobalDocumentSubscription(reactor)` and
  subscribe the `getPubSub()` stream.
- **Per event, per subscriber:** resolve the changed document to a `CanonicalDocumentId`, and only enqueue
  if `authz.canReadDocument(docId, subscriber.identity)` passes (subscribers carry an owner address /
  service identity). **Scope the fan‑out by `driveId`.** Serialize through the op's output pipeline
  (output projection + `fieldGuards`) — never a raw row.
- Deliver as `POST { id, type, data, ts }` with `X-PH-Signature: sha256=HMAC(secret, ts + "." + body)` and
  `X-PH-Timestamp`.

> **This closes a critical cross‑tenant exfiltration hole.** The naive draft's webhook projector never
> called `rt.invoke`, subscribed to **every** document change process‑wide, filtered only by resource/type,
> and delivered raw rows — so Tenant A's `invoice.created` hook received Tenant B's invoices, sensitive
> columns intact. Routing egress through per‑subscriber `canReadDocument` + drive scoping + output
> redaction restores deny‑by‑default for this projection.

**Durable egress (an explicit SAF‑owned table, not a `RelationalDbProcessor`).** Delivery is enqueued to a
small **outbox table SAF owns** (with its own write handle — a `RelationalDbProcessor` can only *write*
inside `onOperations`, and its `ctx.caps.db` surface is read‑only, so it structurally cannot back an
imperative outbox). The outbox worker does retry/backoff/dead‑letter for at‑least‑once egress that survives
restarts. Fan‑out remains single‑process (§15); durability is orthogonal to distribution.

**SSRF defense (mandatory).** Subscriber registration is **authorization‑gated**, and every destination URL
is validated at connect time: **HTTPS only**; **block loopback / link‑local / RFC‑1918 / metadata ranges**
(`127.0.0.0/8`, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16`, `::1`, `fc00::/7`); **resolve‑then‑pin
the IP** and re‑validate after any redirect; **disallow cross‑host redirects**; enforce a **timeout** and a
**response‑size cap**. Otherwise the server‑side, HMAC‑signing, auto‑retrying delivery worker becomes an SSRF
primitive against internal targets.

**Inbound** receiver is `mountNodeRoute("POST", "<base>/webhooks/<resource>", …)` (raw Node req/res — the
Fetch middleware chain does not wrap node routes) that verifies HMAC **and a timestamp replay window** in
the handler, then routes into an op via `invoke`. Because HMAC authenticates the *sender* but establishes no
Powerhouse identity (`ctx.user` is undefined), the target op must either be `{ kind: "public" }` **or** map
to a **configured service principal** via a dedicated policy the receiver satisfies — SAF requires you to
state which, rather than silently landing on `canCreate(undefined)` (dead under every non‑OPEN policy).

### 8.6 Adding a sixth transport

A new transport is a new `TransportProjector` and **zero** edits to `OperationDef`, `Serializer`, or
existing projectors (OCP). The buffered‑vs‑streaming split is encoded in the projectors, never in author
code: request/response → `FetchHandler` (`httpAdapter.mount`); subscriptions → the shared socket; streaming
→ `mountNodeRoute` (do your own authz in‑handler, per the MCP precedent); outbound push → a `getPubSub()`
subscriber. Unsupported `(kind, transport)` pairs are rejected at `build()` (e.g. a `subscription` has no
REST/RPC projection).

## 9. Plugin & middleware system

A `Plugin` is a two‑phase decorator plus an optional HTTP‑edge short‑circuit and lifecycle hooks. Plugins
wrap **around** the fixed stages but can never unseat them.

```ts
export interface Plugin {
  readonly name: string;
  readonly phase: "outer" | "inner";                 // outer = pre-authz, inner = post-authz
  readonly appliesTo?: (op: OperationDef) => boolean;
  wrap?: Middleware;                                  // op-level, ALL transports
  asFetchMiddleware?: (op: OperationDef | null) => (h: FetchHandler) => FetchHandler; // HTTP 429/403 pre-buffer
  install?(host: PluginHost): void | Promise<void>;  // lifecycle up
  dispose?(): void | Promise<void>;                  // lifecycle down
}
// The host injects real dependencies (DIP) — no plugin reaches for a global:
export interface PluginHost {
  getMeter(name: string): Meter;                     // OpenTelemetry — host owns the exporter
  reactor: IReactorClient;                           // e.g. cache() bridges its own DOCUMENT_CHANGES
  pubsub: ReturnType<typeof getPubSub>;
  logger: ILogger;
}
```

First‑class plugins (all added without editing core; `rateLimit` + `observability` + `logging` are **on by
default**):

```ts
export function rateLimit(o: { rpm: number; by?: "user" | "ip" | "global" }): Plugin;
export function observability(): Plugin;   // install(): host.getMeter("@powerhousedao/switchboard-api")
export function logging(): Plugin;
export function cache(o: { ttlMs: number }): Plugin;  // inner, query-only
```

**`rateLimit` hardening (closes spoofing + unbounded memory):** derive the client IP only from a
**configured trusted‑proxy hop**, never a raw `X-Forwarded-For` (else an attacker mints a fresh budget per
request and grows the bucket map unbounded); the bucket `Map` is **bounded and TTL‑evicted**; anonymous
traffic uses a **coarse global bucket** so header rotation cannot buy unlimited budget. Scope note: SAF's
`asFetchMiddleware` only wraps **SAF‑mounted** REST/RPC handlers; the pre‑existing `/graphql` supergraph and
core reactor mutations are mounted by `GraphQLManager` and are throttled only if the limiter is added to its
`#composeFetchMiddleware` chain (a core change, §13). SAF states this honestly rather than claiming it
"closes throttling everywhere."

**`cache` correctness (closes a stale‑read + a cross‑viewer leak):**

- `install()` **itself** calls `ensureGlobalDocumentSubscription(host.reactor)` and holds the unsubscribe in
  `dispose()`, so invalidation does **not** silently depend on a subscription/webhook projector being
  mounted (in a REST/RPC‑only deployment the draft's cache would never evict).
- Eviction is **keyed by resource/document id**, not a whole‑store `clear()` on any change.
- The cache key includes **everything authorization/redaction depend on** — `op.id`, `driveId`,
  `user.address`, input, **and** the redaction‑relevant surface (guarded‑field inputs / resolved roles).
  `cache()` is **refused on any op whose serializer declares `fieldGuards`** unless the guard inputs are in
  the key — so a value redacted for one caller is never served to another sharing the same address/drive.

## 10. Security model (secure by default)

Security in SAF is **structural** wherever possible — a property of the pipeline, not of author discipline.

### 10.1 Deny‑by‑default authorization

`security` is **mandatory and typed**. The `TAuth` builder guard (§6.6) makes "forgot to authorize" a
compile error; `build()` is the runtime backstop for `as any` bypasses. There is **no implicit
default‑allow**; the single opt‑out is the greppable `{ kind: "public" }` / `.public()`.

### 10.2 Authorization is a fixed pipeline stage

Input `safeParse` and `authorize` are **fixed, non‑removable** stages *inside* the plugin sandwich (§5). A
misordered or hostile plugin can wrap around them but can never reach a handler bypassing them. Every
transport inherits this because every transport calls `rt.invoke`.

### 10.3 One authorization decision seam

Every policy maps 1:1 to an `IAuthorizationService` primitive (`canRead`/`canWrite`/`canManage`/`canMutate`/
`canCreate`). `isSupremeAdmin` is **never** used as a role check (it is true for everyone under the OPEN
policy). The single sanctioned `string → CanonicalDocumentId` cast lives in `DocumentAuthorizer` (§6.4), so
slug aliasing cannot be an existence oracle, and the handler reuses the exact `fetchIdentifier` the check
authorized (no confused deputy).

### 10.4 Fail‑closed everywhere

Id‑resolution failure → `FORBIDDEN` (no existence oracle); a restricted op with no caller address → deny; any
non‑`DOCUMENT_PERMISSIONS` policy past supreme‑admin/OPEN → deny.

### 10.5 Input hardening

Input `safeParse` is on by default (closing reactor‑api's "generated‑but‑unused server input schemas" gap);
filter/sort allowlists compile to bound SQL (no injection/enumeration); a hard page `max` on every paginator;
a tighter `bodyLimit` and a batch cap on `/rpc` (§8.4). GraphQL query depth/cost limiting is required core
work (§8.1, §13).

### 10.6 Output is projected to a closed allowlist

The fixed output stage **explicitly picks the declared `output` keys** (not "trust the validator to strip"),
and `build()` rejects a non‑closed output schema — so a `SELECT *` read model cannot leak `ownerAddress` or a
soft‑delete flag regardless of which validator you use. Per‑field `fieldGuards` are enforced by an
**auto‑injected** inner plugin whenever a serializer declares them (structural, not forgettable).

### 10.7 Collection reads are drive‑scoped (closes IDOR)

`ctx.driveId` comes from the client‑supplied `Drive-Id` header, and `drive-middleware` only checks **shard
ownership** (→ 421), *not* per‑user authorization. So a `list` policy of `{ kind: "authenticated" }` would let
any logged‑in user set `Drive-Id` to another tenant's drive and read it. SAF therefore **requires** the
`list` (and `changes`) policy to be **drive‑scoped** — `{ kind: "drive", access, drive }` — which authorizes
the caller against the collection's drive before the query's namespace is even selected. `defineResource`'s
`security.list` type does not accept a bare `{ kind: "authenticated" }`; `build()` rejects it.

### 10.8 Bulk operations authorize every item

`{ kind: "documentEach", subjects }` resolves and checks **each** id (fail‑closed) before the handler runs,
so a bulk void/update cannot become a confused deputy. `{ kind: "custom" }` remains available but is
documented as "you must enforce per‑item authorization yourself" — `documentEach` is the blessed pattern.

### 10.9 Subscriptions are authorized and bounded

`changes` carries a **required** subscribe‑time `drive` policy (deny‑by‑default like every other verb); the
per‑event `canReadDocument` still runs. **Connection and subscription counts are capped per identity**, and
a subscriber already known‑unauthorized for a drive is short‑circuited, so a client cannot open many
subscriptions and amplify one `getPubSub()` fan‑out into an authz‑DB DoS.

### 10.10 Transport‑edge protections

Mutations project to POST (GET/OPTIONS skip bearer verification); webhooks are HMAC‑signed with a timestamp
replay window and SSRF‑guarded egress (§8.5); WS and `mountNodeRoute` do their own authz (MCP precedent);
CORS defaults to same‑origin at the **single** core middleware call (§10.11).

### 10.11 CORS is closed at the core seam (honest)

`GraphQLManager.init` calls `httpAdapter.setupMiddleware({ bodyLimit: "50mb" })` **once, with no
`corsOptions`**, so `cors()` currently runs with reflect‑request‑origin defaults. `setupMiddleware` is
**global and additive** — a second call from SAF only *stacks* another `cors()` after the permissive one has
already answered preflight. Therefore closing the reflect‑any‑origin default is a **core/boot change**
(pass a `corsAllowlist` into that one `setupMiddleware` call, defaulting to same‑origin `origin:false`) — see
§13. SAF does **not** claim a constructor option structurally closes a default it cannot reach; `corsAllowlist`
is plumbed to the core call, not applied as a second middleware.

### 10.12 Threat checklist

| Threat | Mitigation | Where |
| --- | --- | --- |
| Missing authz on a transport | single `rt.invoke` pipeline; fixed authz stage | §5, §10.2 |
| Forgot to authorize | `TAuth` compile guard + `build()` backstop | §6.6, §6.8 |
| IDOR via `Drive-Id` on `list` | mandatory `drive` policy | §10.7 |
| Bulk confused deputy | `documentEach` per‑item authz | §10.8 |
| Column/field leak | closed output pick + auto field redaction | §10.6 |
| SQL injection / enumeration | allowlist → bound SQL | §7.3 |
| Webhook cross‑tenant exfiltration | per‑subscriber `canReadDocument` + drive scope + redaction | §8.5 |
| Webhook SSRF | egress allowlist, IP pin, HTTPS‑only, no cross‑host redirect | §8.5 |
| Rate‑limit spoof / memory DoS | trusted‑proxy IP, bounded/evicted buckets, global anon bucket | §9 |
| RPC batch amplification | batch cap + bounded concurrency + IP pre‑buffer 429 + tight bodyLimit | §8.4 |
| GraphQL depth/cost | supergraph `validationRules` (**core change**) | §8.1, §13 |
| Stale/cross‑viewer cache | id‑keyed eviction, self‑bridged invalidation, redaction in key | §9 |
| Reflect‑any CORS | same‑origin default at the core call (**core change**) | §10.11, §13 |
| Subscription DoS | subscribe authz + per‑identity caps | §10.9 |
| Existence oracle via slug | single `DocumentAuthorizer` cast, fail‑closed | §10.3 |

## 11. Testing & validation

- **Operations are pure `(input, ctx) => output`.** Unit‑test a handler with a fake `OperationContext`
  whose `caps` contains only the declared seams (minimal fakes — the ISP testability win). No HTTP, no
  schema, no transport.
- **`OperationDef` is pure data** → snapshot‑testable, including the `defineResource` expansion.
- **Plugins are pure decorators** (`(next, op) => invoker`) tested with a fake `next`.
- **Projectors are tested by asserting the emitted artifact** — a `GeneratedSubgraph`'s `typeDefs`/
  `resolvers`, a REST `FetchHandler`'s `Response`, the RPC route table — never by standing up a server.
- **`safeParse` at both boundaries** yields typed input/output errors to assert directly.
- **Type‑level tests** (`expectTypeOf`) assert inference: that `.query(...)` on an undecided builder is a
  type error; that `client["invoice.list"]` input is `InferIn`; that `ctx.caps.db` is absent unless `"db"`
  is in `requires`.

```ts
import { describe, it, expect } from "vitest";
import { fakeContext } from "@powerhousedao/switchboard-api/test";  // builds an OperationContext with fakes

it("send authorizes the exact document it writes", async () => {
  const reactor = fakeReactor();
  const ctx = fakeContext({ user: alice, driveId: "drv1", caps: { reactor, db: fakeDb([openInvoice]) },
    authorize: allow("write", "inv1") });
  const out = await sendInvoice.handler({ id: "inv1" }, ctx);
  expect(reactor.executed).toEqual([{ id: "inv1", branch: "main", actions: [sendInvoiceAction({ id: "inv1" })] }]);
  expect(out).not.toHaveProperty("ownerAddress");   // closed output pick
});
```

> WS is disabled under `VITEST` (per the existing test harness), so realtime integration leans on
> REST/RPC/SSE.

## 12. Authoring, packaging, codegen & migration

### 12.1 Package layout (honest about what ships where)

SAF is one package, `@powerhousedao/switchboard-api`. A resource ships from a consumer package through the
existing subpath‑export + `PackageManager` seam — but **only the GraphQL slice is package‑contributable**:

```
@acme/invoice-api/
  subgraphs/index.ts   -> export * as invoice from "./invoice.saf.js"   // GraphQL projection (PackageManager discovers this)
  processors/index.ts  -> export { InvoiceReadModel }                    // read model
  invoice.saf.ts       -> the ResourceConfig + defineResource(...) (transport-agnostic)
```

`PackageManager` constructs a package's subgraph with just `SubgraphArgs`, and `GraphQLManager` keeps the
HTTP adapter, gateway adapter, shared WS server and fetch middlewares **private** — so **REST / RPC / WS /
webhook** projection cannot be driven from inside a package. Those transports are wired **once, in the host
boot** (`server.ts`), where `ProjectionDeps` is assembled and `api.project([...])` is called. This requires
the new `GraphQLManager` accessors in §13.

### 12.2 Host wiring (one time)

```ts
// switchboard/src/server.mts (schematic) — the one-time host wiring for non-GraphQL transports
const api = new SwitchboardApi({ corsAllowlist, batchLimit: 50, bodyLimit: "8mb" })
  .register(invoiceRegistry)
  .use(rateLimit({ rpm: 600 }), observability(), logging())
  .build();

await api.project(
  [new GraphqlProjector(), new RestProjector(), new RpcProjector(), new WebhookProjector()],
  buildProjectionDeps(graphqlManager, authService),   // reads the new accessors (§13)
);
```

### 12.3 Codegen / scaffolding

A `ph generate resource invoice` scaffold emits the `ResourceConfig` skeleton, an empty
`RelationalDbProcessor`, and the `subgraphs`/`processors` barrels — mirroring today's subgraph codegen
templates (`packages/codegen/src/templates/subgraphs/*`). Config remains **code‑first** (registration via
`packages[]`); a resource does not need file‑level `PowerhouseConfig` declaration.

### 12.4 Migration from a hand‑written subgraph

An existing `BaseSubgraph` and a SAF `GraphqlProjector` output are both `ISubgraph`s registered the same way,
so migration is incremental and GraphQL‑behavior‑preserving:

1. Wrap the subgraph's read as a `RelationalDbProcessor` (or a `document` binding) and its mutations as
   `write` bindings.
2. Express `typeDefs` as serializer DTOs; keep the subgraph name **stable** (§8.1) so the federated schema
   is byte‑compatible.
3. Register the generated subgraph *instead of* the hand‑written one; verify with the golden‑SDL snapshot.
4. Add the other projectors in the host wiring to light up REST/RPC/WS/webhooks for free.

## 13. Required core changes to `reactor-api`

SAF is honest that a handful of transports and secure‑by‑default guarantees **cannot** be delivered purely
from a contributed package. These are the minimal, well‑scoped core edits:

1. **Expose projection dependencies.** Add read‑only accessors to `GraphQLManager`:
   `getHttpAdapter()`, `getGatewayAdapter()`, `getWsServer()`, `getPubSub()`/`getDriveOwnershipCache()`, and
   the composed `authFetch`/`driveFetch`. Today these are private, so no package can mount REST/RPC/WS.
2. **Subgraph replace/unregister.** Add `replaceSubgraph(name, instance)` / `unregisterSubgraph(name)` that
   also **invalidate `subgraphHandlerCache`** and un‑mount, so a resource's schema can change in place
   without the version‑in‑name federation conflict (§8.1).
3. **CORS at the single middleware call.** Thread a `corsAllowlist` into
   `GraphQLManager.init → httpAdapter.setupMiddleware({ corsOptions, bodyLimit })`, defaulting to
   same‑origin (`origin: false`), instead of the current `cors(undefined)` reflect‑any default (§10.11).
4. **GraphQL depth/complexity `validationRules`.** Add cost/depth limiting where the supergraph
   `ApolloServer` is constructed in `createSupergraphHandler` (a gateway‑level plugin), since a subgraph
   instance cannot inject validation rules into the core gateway (§8.1).
5. **(Optional) Throttle the existing GraphQL surface.** Insert the rate limiter into
   `#composeFetchMiddleware` if the platform wants the pre‑existing `/graphql` + reactor mutations throttled,
   not only SAF‑authored ops (§9).

Each is additive and behind the interfaces SAF already depends on. Items 1–4 are prerequisites for the full
multi‑transport, secure‑by‑default promise; item 5 is an enhancement.

## 14. Design‑principle mapping

**Type safety (end to end).** `InferIn`/`InferOut` thread schema types into the handler and every
projection; `requires` makes `ctx.caps` exactly `Pick<Capabilities, TCaps>` (undeclared capability →
compile error); `SecurityPolicy` subjects are typed against the input; the `TAuth` property guard makes
"forgot to authorize" a call‑site error; the RPC client infers from `typeof registry.typed` (one source);
`ERROR_HTTP`/`ERROR_RPC` are exhaustive. No `any` at any author‑facing boundary.

**SOLID.** *SRP* — `OperationDef`, `Serializer`, `Paginator`, `FilterSet`, `TransportProjector`, `Plugin`,
`SecurityPolicy`, `Capability` each do one thing; `write` splits a shared `branch` resolver from a
create‑only document factory. *OCP* — new transport = new projector; new concern = new plugin; new auth
policy = new `IAuthorizationService` strategy; core is never edited (the required §13 edits are one‑time host
plumbing, not per‑feature). *LSP* — projectors substitute behind `TransportProjector`, plugins behind
`Plugin`; pagination is split into `SeekPaginator`/`OffsetPaginator` precisely because they are *not*
substitutable, so no Liskov surprise. *ISP* — `ctx.caps` is `Pick`ed; reads see the read‑only
`IRelationalQueryBuilder`, not the write‑capable Kysely; every seam interface is tiny. *DIP* — handlers
depend on capability *interfaces* injected via `ctx.caps` and plugin dependencies injected via `PluginHost`;
nothing reaches for a global (`getPubSub`, Express, Apollo).

**KISS.** One define‑once unit, one pipeline, one error taxonomy, one paging envelope (`PagedResults`), one
middleware shape. Two authoring altitudes; one greppable opt‑out.

**DRY.** Define once → GraphQL SDL + REST routes + WS subscriptions + RPC methods + webhooks + the RPC client
type all derive. The fixed base stages are shared verbatim by every transport; the filter DTO derives from
the SQL allowlist.

**Secure by default.** Structural, not conventional: mandatory typed policy (compile + runtime), fixed
non‑removable authz/validation stages, single decision seam, closed output pick with auto redaction,
drive‑scoped collections, per‑item bulk authz, hardened rate limiting on by default, SSRF‑guarded and
authorized webhook egress, same‑origin CORS. Every departure from a secure default is explicit and greppable.

**Lightweight / modular / reusable.** The only new runtime concept is Standard Schema (bring your own
validator). No new server, process, datastore, pubsub or query builder. Projectors and plugins are
tree‑shakeable — mount only the transports you use. The pure‑data contract is isomorphic (drives both server
resolvers and a browser reactive read), and a resource ships from a package via the standard subpath‑export
seam.

## 15. Known limitations & open questions

1. **Realtime/webhook fan‑out is single‑process.** `getPubSub()` is one in‑process
   `graphql-subscriptions` `PubSub`; WS subscriptions and webhook fan‑out are per‑node. The outbox gives
   at‑least‑once *egress*, not multi‑instance *fan‑out*. Multi‑instance Switchboard needs an external broker
   (Redis/NATS) behind `getPubSub()` — **who owns that adapter (this framework vs a `reactor-api` change)?**
2. **Standard Schema → GraphQL SDL fidelity is the single riskiest component.** Federation directives,
   nullability, enums and custom scalars (`JSONObject`/`DateTime`) must match what Apollo expects and must
   *byte‑match* the core reactor's shared value types. Requires a golden‑SDL snapshot suite (including
   cross‑subgraph composition) before any projector ships.
3. **Read‑your‑write on lists.** Relational read‑model tables are eventually consistent (populated off
   `JOB_WRITE_READY`, no consistency‑token gating). A `create`/`update` returns the reactor's own
   strongly‑consistent re‑read; a `list` right after a write may be momentarily stale. We deliberately do
   **not** pretend a token‑gated relational read exists (the substrate cannot provide it).
4. **Canonical‑id resolution cost off the GraphQL path.** `resolveCanonicalDocumentId` is memoized
   per‑request in `BaseSubgraph`; the non‑GraphQL `DocumentAuthorizer` path must share the same per‑request
   memo or REST/RPC pay an unmemoized resolve per authorized op.
5. **Validation CPU on hot read paths.** `safeParse`‑in + output‑pick on every boundary adds cost the
   current type‑trusting path avoids. For GraphQL specifically, Apollo already validated args against SDL
   compiled from the same schema — the projector should be able to skip the redundant input `safeParse` for
   that transport while keeping full parse for REST/RPC/webhook. Output pick stays unconditional (it is also
   the field‑leak guard).
6. **Under‑exercised adapters.** Only Express + Apollo are wired by `server.ts`; the Fastify HTTP adapter and
   Mercurius gateway adapter exist but diverge on match‑order and SSE buffering. Do we certify projectors
   only against Express + Apollo, or gate a Fastify/Mercurius conformance suite before claiming
   adapter‑agnosticism?
7. **`defineResource` compile‑time auth guard.** The `TAuth` guard lives on the `operation()` builder; the
   resource path relies on the runtime `build()` backstop plus a mapped‑type "every verb has a policy"
   check. Should the resource path also carry a compile‑time exhaustiveness guard over the verb set?

---

## Appendix A — the frozen core contract (TypeScript)

The corrected, self‑consistent type surface every section above uses. Real Powerhouse types are **imported,
never re‑declared**.

```ts
// ════════════════════════════════════════════════════════════════════════════
// @powerhousedao/switchboard-api — CORE CONTRACT
// ════════════════════════════════════════════════════════════════════════════
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { WebSocketServer } from "ws";
import type { Meter } from "@opentelemetry/api";
import type { ILogger } from "document-model";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import type { SelectQueryBuilder } from "kysely";
// transport/HTTP seam
import type { FetchHandler, IHttpAdapter, IGatewayAdapter } from "@powerhousedao/reactor-api/graphql/gateway/types";
import type { AuthFetchMiddleware } from "@powerhousedao/reactor-api/graphql/gateway/auth-middleware";
import type { DriveFetchMiddleware } from "@powerhousedao/reactor-api/graphql/gateway/drive-middleware";
import type { DriveOwnershipCache } from "@powerhousedao/reactor-api/graphql/gateway/drive-ownership-cache";
// subgraph registration seam
import type { ISubgraph, SubgraphArgs } from "@powerhousedao/reactor-api/graphql/types";
import { BaseSubgraph } from "@powerhousedao/reactor-api/graphql/base-subgraph";
import type { GraphQLManager, AuthService } from "@powerhousedao/reactor-api";
// authz seam
import type { IAuthorizationService, CanonicalDocumentId,
  AuthorizedDocumentHandle } from "@powerhousedao/reactor-api/services/authorization.service";
// write + realtime seam
import type { IReactorClient, JobInfo, DocumentChangeEvent } from "@powerhousedao/reactor";
import { getPubSub, ensureGlobalDocumentSubscription } from "@powerhousedao/reactor-api/graphql/reactor/pubsub";
// read-model / paging seam
import type { IRelationalDb, IRelationalQueryBuilder,
  RelationalDbProcessorClass } from "@powerhousedao/shared/processors/relational/types";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { PagedResults, PagingOptions, SearchFilter, ViewFilter } from "@powerhousedao/reactor/shared/types";

// 0. VALIDATION BOUNDARY
export type Schema<In = unknown, Out = In> = StandardSchemaV1<In, Out>;
export type InferIn<S extends Schema>  = StandardSchemaV1.InferInput<S>;
export type InferOut<S extends Schema> = StandardSchemaV1.InferOutput<S>;
export function validateInput<S extends Schema>(s: S, raw: unknown):
  Promise<{ ok: true; value: InferOut<S> } | { ok: false; issues: readonly StandardSchemaV1.Issue[] }>;

// 1. CAPABILITIES (the typed DI surface; each is a REAL Powerhouse interface)
export interface Capabilities {
  reactor: IReactorClient; db: IRelationalDb; analytics: IAnalyticsStore; authz: IAuthorizationService;
}
export type CapabilityKey = keyof Capabilities;

// 2. CONTEXT
export type TransportKind = "graphql" | "rest" | "ws" | "rpc" | "webhook";
export interface OperationContext<TCaps extends CapabilityKey = never, TExt = {}> {
  readonly user?: { address: string; chainId: number; networkId: string };
  readonly headers: Headers; readonly transport: TransportKind; readonly wire: string;
  readonly driveId?: string; readonly signal?: AbortSignal;
  readonly caps: Pick<Capabilities, TCaps>;
  readonly log: (event: Record<string, unknown>) => void;
  readonly authorize: DocumentAuthorizer;
  readonly ext: TExt;
}

// 3. ERRORS
export type ApiErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";
export class ApiError extends Error { constructor(code: ApiErrorCode, message: string, details?: unknown, retryable?: boolean); readonly code: ApiErrorCode; }
export const ERROR_HTTP: Record<ApiErrorCode, number>;
export const ERROR_RPC: Record<ApiErrorCode, number>;

// 4. SECURITY
export type SubjectSelector<I, TCaps extends CapabilityKey = never, TExt = {}> = (input: I, ctx: OperationContext<TCaps, TExt>) => string;
export type SecurityPolicy<I, TCaps extends CapabilityKey = never, TExt = {}> =
  | { kind: "public" } | { kind: "authenticated" }
  | { kind: "document"; access: "read" | "write" | "manage"; subject: SubjectSelector<I, TCaps, TExt> }
  | { kind: "documentEach"; access: "read" | "write" | "manage"; subjects: (input: I, ctx: OperationContext<TCaps, TExt>) => readonly string[] }
  | { kind: "operation"; operationType: string; subject: SubjectSelector<I, TCaps, TExt> }
  | { kind: "create" }
  | { kind: "drive"; access: "read" | "write"; drive: (input: I, ctx: OperationContext<TCaps, TExt>) => string }
  | { kind: "custom"; check: (input: I, ctx: OperationContext<TCaps, TExt>) => Promise<boolean> };
export interface DocumentAuthorizer {
  readonly svc: IAuthorizationService;
  canonical(idOrSlug: string, ctx: OperationContext<any, any>): Promise<CanonicalDocumentId>;
  assert(access: "read" | "write" | "manage", idOrSlug: string, ctx: OperationContext<any, any>): Promise<AuthorizedDocumentHandle>;
}

// 5. DEFINE-ONCE UNIT
export type OperationKind = "query" | "mutation" | "subscription";
export type Handler<TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey, K extends OperationKind, TExt> =
  K extends "subscription"
    ? (input: InferOut<TIn>, ctx: OperationContext<TCaps, TExt>) => AsyncIterable<InferOut<TOut>>
    : (input: InferOut<TIn>, ctx: OperationContext<TCaps, TExt>) => Promise<InferOut<TOut>>;
export interface OperationDef<TIn extends Schema = Schema, TOut extends Schema = Schema,
  TCaps extends CapabilityKey = never, K extends OperationKind = OperationKind, TExt = {}> {
  readonly id: string; readonly kind: K; readonly input: TIn; readonly output: TOut;
  readonly requires: readonly TCaps[];
  readonly security: SecurityPolicy<InferOut<TIn>, TCaps, TExt>;
  readonly middlewares: readonly Middleware[];
  readonly handler: Handler<TIn, TOut, TCaps, K, TExt>;
  readonly rest?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path?: string; status?: number };
  readonly webhook?: { event: string; retries?: number };
  readonly graphql?: { fieldName?: string; typeName?: string };
  readonly idempotent?: boolean;
}

// 6. BUILDER (auth guard gates the METHOD)
export type AuthNotDecided = { readonly __SAF_ERROR: "call .security() or .public() before a terminal" };
export class OperationBuilder<TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey, TExt, TAuth extends boolean> {
  input<S extends Schema>(s: S): OperationBuilder<S, TOut, TCaps, TExt, TAuth>;
  output<S extends Schema>(s: S): OperationBuilder<TIn, S, TCaps, TExt, TAuth>;
  requires<C extends CapabilityKey>(...caps: C[]): OperationBuilder<TIn, TOut, TCaps | C, TExt, TAuth>;
  use<TAdd>(mw: ContextMiddleware<TCaps, TExt, TAdd>): OperationBuilder<TIn, TOut, TCaps, TExt & TAdd, TAuth>;
  meta(m: Pick<OperationDef, "rest" | "webhook" | "graphql" | "idempotent">): this;
  security(p: SecurityPolicy<InferOut<TIn>, TCaps, TExt>): OperationBuilder<TIn, TOut, TCaps, TExt, true>;
  public(): OperationBuilder<TIn, TOut, TCaps, TExt, true>;
  query: TAuth extends true ? (h: Handler<TIn, TOut, TCaps, "query", TExt>) => OperationDef<TIn, TOut, TCaps, "query", TExt> : AuthNotDecided;
  mutation: TAuth extends true ? (h: Handler<TIn, TOut, TCaps, "mutation", TExt>) => OperationDef<TIn, TOut, TCaps, "mutation", TExt> : AuthNotDecided;
  subscription: TAuth extends true ? (h: Handler<TIn, TOut, TCaps, "subscription", TExt>) => OperationDef<TIn, TOut, TCaps, "subscription", TExt> : AuthNotDecided;
}
export function operation(id: string): OperationBuilder<Schema, Schema, never, {}, false>;
export function defineOperation<TIn extends Schema, TOut extends Schema, TCaps extends CapabilityKey, K extends OperationKind, TExt>(
  d: OperationDef<TIn, TOut, TCaps, K, TExt>): OperationDef<TIn, TOut, TCaps, K, TExt>;

// 7. MIDDLEWARE / PLUGIN (one shape)
export type Invoker<I, O> = (input: I, ctx: OperationContext<any, any>) => Promise<O>;
export type Middleware = <I, O>(next: Invoker<I, O>, op: OperationDef) => Invoker<I, O>;
export type ContextMiddleware<TCaps extends CapabilityKey, TExtIn, TAdd> =
  (input: unknown, ctx: OperationContext<TCaps, TExtIn>) => Promise<TAdd>;
export interface PluginHost { getMeter(name: string): Meter; reactor: IReactorClient; pubsub: ReturnType<typeof getPubSub>; logger: ILogger; }
export interface Plugin {
  readonly name: string; readonly phase: "outer" | "inner"; readonly appliesTo?: (op: OperationDef) => boolean;
  wrap?: Middleware;
  asFetchMiddleware?: (op: OperationDef | null) => (h: FetchHandler) => FetchHandler;
  install?(host: PluginHost): void | Promise<void>; dispose?(): void | Promise<void>;
}
export function assembleInvoker(op: OperationDef, caps: Partial<Capabilities>, plugins: readonly Plugin[], authorizer: DocumentAuthorizer): Invoker<unknown, unknown>;

// 8/9. PAGINATION + FILTER/SORT
export type SortDir = "asc" | "desc";
export interface SortSpec<Row> { field: keyof Row & string; dir: SortDir; }
interface PaginatorBase<Row> {
  apply(qb: SelectQueryBuilder<any, any, Row>, sort: readonly SortSpec<Row>[], page: PagingOptions): SelectQueryBuilder<any, any, Row>;
  envelope(rows: Row[], page: PagingOptions): PagedResults<Row>;
}
export interface SeekPaginator<Row> extends PaginatorBase<Row> { readonly mode: "seek"; readonly columns: readonly (keyof Row & string)[]; }
export interface OffsetPaginator<Row> extends PaginatorBase<Row> { readonly mode: "offset"; }
export type Paginator<Row> = SeekPaginator<Row> | OffsetPaginator<Row>;
export function keyset<Row>(o: { orderBy: keyof Row & string; tieBreaker: keyof Row & string; default: number; max: number }): SeekPaginator<Row>;
export function offset<Row>(o: { default: number; max: number }): OffsetPaginator<Row>;
export function pageNumber<Row>(o: { size: number; max: number }): OffsetPaginator<Row>;
export function cursorPage<Row>(o: { default: number; max: number; by: (keyof Row & string)[] }): SeekPaginator<Row>;
export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "range";
export interface FieldSpec { type: "string" | "number" | "boolean"; ops: readonly FilterOp[]; }
export type FilterSet<Row> = { [K in keyof Row]?: FieldSpec };
export type OrderingBackend<Row> = ReadonlyArray<keyof Row & string>;
export function compileFilter<Row>(allow: FilterSet<Row>, input: Record<string, unknown>): (qb: SelectQueryBuilder<any, any, Row>) => SelectQueryBuilder<any, any, Row>;

// 10. SERIALIZER + RESOURCE (parameterized over DTOs; create = real creation)
export interface Serializer<TOut extends Schema, TCreate extends Schema = TOut, TUpdate extends Schema = TCreate, TFilter extends Schema = Schema> {
  output: TOut; create?: TCreate; update?: TUpdate; filter?: TFilter;
  sortable?: readonly string[];
  fieldGuards?: Partial<Record<keyof InferOut<TOut> & string, (ctx: OperationContext<any, any>) => boolean>>;
}
export interface ResourceConfig<Row, TOut extends Schema, TCreate extends Schema, TUpdate extends Schema, TFilter extends Schema> {
  name: string; version: string; basePath?: string; documentType: string;
  serializer: Serializer<TOut, TCreate, TUpdate, TFilter>;
  read?: { source: RelationalDbProcessorClass<Row>; table: string; filterable: FilterSet<Row>;
    sortable: OrderingBackend<Row>; pagination: Paginator<Row>;
    changes?: { search: (ctx: OperationContext<never, {}>) => SearchFilter } };
  document?: { search: (ctx: OperationContext<"reactor", {}>) => SearchFilter; view?: ViewFilter };
  write?: { branch?: (ctx: OperationContext<never, {}>) => string;
    create?: (input: InferOut<TCreate>, ctx: OperationContext<"reactor", {}>) =>
      { document: PHDocument; parent?: string } | { type: string; initialState?: unknown; parent?: string };
    update?: (patch: InferOut<TUpdate>) => Action[]; remove?: () => Action[]; async?: boolean };
  security: {
    list: SecurityPolicy<unknown>; get: SecurityPolicy<{ id: string }>;
    create?: SecurityPolicy<InferOut<TCreate>>; update?: SecurityPolicy<{ id: string }>;
    remove?: SecurityPolicy<{ id: string }>; changes?: SecurityPolicy<unknown>;
  };
  actions?: readonly OperationDef[]; plugins?: readonly Plugin[];
}
export function defineResource<Row, TOut extends Schema, TCreate extends Schema, TUpdate extends Schema, TFilter extends Schema>(
  cfg: ResourceConfig<Row, TOut, TCreate, TUpdate, TFilter>): Record<string, OperationDef>; // keyed by op.id; precisely typed in impl

// 11. PROJECTION CONTRACT
export interface OperationRegistry { readonly operations: ReadonlyMap<string, OperationDef>; readonly resources: readonly ResourceConfig<any, any, any, any, any>[]; }
export interface TypedRegistry<R extends Record<string, OperationDef>> extends OperationRegistry { readonly typed: R; }
export interface ProjectionRuntime {
  readonly reactor: IReactorClient; readonly authorizer: DocumentAuthorizer;
  invoke(opId: string, input: unknown, ctx: OperationContext<any, any>): Promise<unknown>;
  has(opId: string): boolean;
  makeContext(source: Request | Record<string, unknown>, transport: TransportKind): Promise<OperationContext<any, any>>;
}
export interface ProjectionDeps {
  basePath: string; httpAdapter: IHttpAdapter; graphqlManager: GraphQLManager; gatewayAdapter: IGatewayAdapter;
  wsServer: WebSocketServer; pubsub: ReturnType<typeof getPubSub>; driveOwnershipCache: DriveOwnershipCache;
  authService: AuthService; subgraphArgs: SubgraphArgs; wrapFetch: (h: FetchHandler) => FetchHandler;
}
export interface TransportProjector { readonly transport: TransportKind; project(registry: OperationRegistry, rt: ProjectionRuntime, deps: ProjectionDeps): void | Promise<void>; }
export declare class GeneratedSubgraph extends BaseSubgraph { constructor(args: SubgraphArgs, ops: readonly OperationDef[], name: string); }

// 12. APP / CLIENT
export class SwitchboardApi<R extends Record<string, OperationDef> = {}> {
  constructor(opts?: { corsAllowlist?: string[]; batchLimit?: number; bodyLimit?: string });
  register<Ops extends readonly (OperationDef | Record<string, OperationDef>)[]>(...defsOrResources: Ops): SwitchboardApi<R & IdMapOf<Ops>>;
  use(...plugins: Plugin[]): this;
  build(): TypedRegistry<R>;
  project(projectors: TransportProjector[], deps: ProjectionDeps): Promise<void>;
}
export type ApiClient<R extends Record<string, OperationDef>> = {
  [K in keyof R as R[K] extends OperationDef<any, any, any, "subscription", any> ? never : K]:
    R[K] extends OperationDef<infer I, infer O, any, any, any> ? (input: InferIn<I>) => Promise<InferOut<O>> : never;
};
export function createRpcClient<R extends Record<string, OperationDef>>(url: string, fetchImpl?: typeof fetch): ApiClient<R>;

// Default plugins
export function rateLimit(o: { rpm: number; by?: "user" | "ip" | "global"; trustedProxyHops?: number }): Plugin;
export function observability(): Plugin;
export function logging(): Plugin;
export function cache(o: { ttlMs: number }): Plugin;
```
