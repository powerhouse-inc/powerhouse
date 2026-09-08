# Switchboard Object Framework (SOF) — Design Specification

**Status:** Draft / RFC · **Scope:** design only (no implementation in this document) · **Target package:** `@powerhousedao/switchboard-api-oo`

> A **class-first, transport-specific** API framework for Powerhouse Switchboard — the object-oriented sibling of the Switchboard API Framework (SAF). Where SAF is data-first (*define one transport-agnostic `OperationDef`, project it to every wire*), SOF is class-first: you **subclass a real per-transport primitive** — `RestView`, `GraphQLQuery`/`GraphQLMutation`/`GraphQLSubscription`, `WebSocketGateway`, `RpcMethod`, `InboundWebhook`/`OutboundWebhook` — each a thin class over a real Powerhouse seam, on top of shared object-oriented abstractions: **permission objects that double as guards**, serializers, pipes and interceptors. It blends **Django REST Framework** (permission objects, generic views, `ModelSerializer`, routers) with **NestJS** (guard/pipe/interceptor/filter role-separation, transport-agnostic `ExecutionContext`, dynamic modules) — expressed as **plain classes, not a reflective runtime** — and generates full CRUD across one or many transports from a document model. Every SAF security guarantee survives, structurally: deny-by-default is a **compile error**, the security pipeline is **non-removable**, and object-level authorization sees typed input.

> **Relationship to SAF.** This document is a standalone sibling of `SWITCHBOARD-API-FRAMEWORK-SPEC.md`. It reuses SAF's verified Powerhouse seams and its security model verbatim; it replaces SAF's data-first authoring surface with an OO one. Where a concept is identical to SAF's, this document says so rather than re-deriving it.

---

## Table of contents

1. [Motivation](#1-motivation)
2. [Goals & non-goals](#2-goals--non-goals)
3. [Thesis: transport-specific primitives, one non-removable pipeline, generated from document models](#3-thesis-transport-specific-primitives-one-non-removable-pipeline-generated-from-document-models)
4. [Where SOF sits on the real Powerhouse seams](#4-where-sof-sits-on-the-real-powerhouse-seams)
5. [The request lifecycle — the load-bearing invariant](#5-the-request-lifecycle--the-load-bearing-invariant)
6. [Core kernel & dependency injection](#6-core-kernel--dependency-injection)
7. [The permission system — DRF objects that are NestJS guards](#7-the-permission-system--drf-objects-that-are-nestjs-guards)
8. [Serializers — Standard Schema DTOs + field-level security + closed output](#8-serializers--standard-schema-dtos--field-level-security--closed-output)
9. [Pipes, validation & input hardening](#9-pipes-validation--input-hardening)
10. [Interceptors & the plugin/cross-cutting system](#10-interceptors--the-plugincross-cutting-system)
11. [Transport primitives, one by one](#11-transport-primitives-one-by-one)
12. [The document-model generic layer — generate CRUD from a model](#12-the-document-model-generic-layer--generate-crud-from-a-model)
13. [Routing, modules & registration](#13-routing-modules--registration)
14. [Security model (secure by default)](#14-security-model-secure-by-default)
15. [Testing & validation](#15-testing--validation)
16. [Required core changes to reactor-api](#16-required-core-changes-to-reactor-api)
17. [Packaging, codegen & migration](#17-packaging-codegen--migration)
18. [Design-principle mapping (SOLID + DI + GoF patterns)](#18-design-principle-mapping-solid--di--gof-patterns)
19. [Known limitations & open questions](#19-known-limitations--open-questions)
20. [Appendix A — the frozen core contract (TypeScript)](#appendix-a--the-frozen-core-contract-typescript)

---

## 1. Motivation

SAF (`SWITCHBOARD-API-FRAMEWORK-SPEC.md`) proved a thesis: make the **operation** the unit of definition, describe it once as transport-agnostic data (`OperationDef`), and project it to every wire through a pipeline whose security stages are structural and non-removable. That security model — deny-by-default, a fixed authenticate→validate→authz pipeline, one decision seam, validation-before-object-authz — is the part worth keeping forever.

But the mechanism is data-first. You *configure* an operation; you do not *subclass* one. For a large cohort of Powerhouse contributors that is exactly backwards. Teams arriving from **Django REST Framework** and **NestJS** reach for classes, inheritance, permission objects, serializers, guards, generic views and routers before they reach for a builder. Handed a data-first API they either learn a second mental model or, worse, hand-roll a `FetchHandler` with ad-hoc validation and forgotten authz because the ergonomic on-ramp did not match their instincts.

**SOF (Switchboard Object Framework, `@powerhousedao/switchboard-api-oo`) is the object-oriented sibling of SAF: identical security guarantees, inverted mechanism.** Where SAF is data-first, SOF is class-first and transport-specific — you subclass a real per-transport primitive and inherit shared OO abstractions (permission objects, serializers, pipes, interceptors) underneath. Contributing a GraphQL query, a webhook or a REST endpoint should feel native to someone whose muscle memory is `APIView` and `CanActivate`, not a translation exercise.

### 1.1 The vocabulary those teams already speak

SOF maps DRF's permission-object / generic-view / `ModelSerializer` / router layering onto NestJS's guard / pipe / interceptor / filter role-separation and transport-agnostic `ExecutionContext` — expressed as **plain classes**, not reflective runtime.

| You already know (DRF / NestJS) | In SOF (see Appendix A) |
| --- | --- |
| `BasePermission` + `&` `|` `~` / `CanActivate` guard | `BasePermission`, `.and()`/`.or()`/`.not()`, `and`/`or`/`not` — one object is both |
| `permission_classes` / `@UseGuards` | `Endpoint.permissionClasses` (abstract — omitting it is a compile error) |
| `APIView.dispatch` initial template method | `Endpoint.dispatch` → the FINAL `ExecutionPipeline` |
| `GenericAPIView` + the five model mixins | `GenericView` + `ListModelMixin`…`DestroyModelMixin` |
| `ModelSerializer` | `DocumentSerializer.fromDocumentModel(...)` |
| `ModelViewSet` + router | `DocumentModelViewSet` / `DocumentResource` + `Router` |
| `@Controller` + `@Get/@Post`, `@Resolver` + `@Query` | `RestController`/`RestView`, `GraphQLQuery`/`Mutation`/`Subscription` |
| `PipeTransform` / `ExceptionFilter` / `NestInterceptor` | `StandardSchemaPipe` / `IExceptionFilter` / `IInterceptor` |

A Todo query is a class, and it reads like one:

```ts
export class TodoQuery extends GraphQLQuery<typeof TodoArgs, typeof TodoOut, "reactor"> {
  readonly id = "todo";
  readonly fieldName = "todo";
  readonly rootType = "Query" as const;
  readonly sdl = `extend type Query { todo(id: ID!): Todo }`;
  readonly inputSchema = TodoArgs;
  readonly outputSchema = TodoOut;
  readonly requires = ["reactor"] as const;
  readonly permissionClasses = [new DocumentPermission("read")]; // deny-by-default: this line is mandatory
  getSubject = (input: InferOut<typeof TodoArgs>) => input.id;    // checked-id → fetched-id (§5)
  protected async handle(_input, ctx, subject) {
    return ctx.caps.reactor.get(subject!.fetchIdentifier);        // IReactorClient.get(identifier, view?, signal?)
  }
}
```

A REST endpoint with a custom method is the same shape with a wire binding, using the Invoice running example (§12):

```ts
export class SendInvoiceView extends RestView<typeof SendArgs, typeof InvoiceOut, "reactor"> {
  readonly id = "invoice.send";
  readonly method = "POST" as const;
  readonly path = "/invoices/:id/send";
  readonly kind = "mutation" as const;
  readonly inputSchema = SendArgs;
  readonly outputSchema = InvoiceOut;
  readonly requires = ["reactor"] as const;                       // ctx.caps.reactor present IFF declared here (§6)
  readonly permissionClasses = [and(new AuthenticatedPermission(), new DocumentPermission("write"))];
  readonly serializer = DocumentSerializer.fromDocumentModel(invoiceModel, {
    fields: "__all__",
    fieldGuards: { ownerAddress: () => false }, // internal field must NOT leak (§8)
  });
  getSubject = (input: InferOut<typeof SendArgs>) => input.id;
  protected async handle(input, ctx, subject) {
    // execute<T>(documentIdentifier, branch, actions[]) — branch is required, actions is an Action[]
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, "main", [sendInvoiceAction(input)]);
    return this.serializer.toRepresentation(await ctx.caps.reactor.get(subject!.fetchIdentifier), ctx);
  }
}
```

Permissions compose as objects — the headline case (§7) reads exactly as it does in DRF's `&|~` algebra, minus the operator overloading TypeScript lacks:

```ts
readonly permissionClasses = [
  or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission())),
];
```

### 1.2 The tension SOF resolves

The design pressure is three-way, and the honest goal is to satisfy all three at once:

1. **OO ergonomics** — classes, inheritance, permission objects, serializers, generic views: the on-ramp above.
2. **SAF's structural security, undiluted.** SOF does not soften a single guarantee. Deny-by-default becomes a compile error (`permissionClasses` is an *abstract* member — a subclass that omits it does not typecheck), backstopped at runtime and again by `Router.build()`. The security-critical stages live inside a non-overridable `ExecutionPipeline`; subclasses override `handle()` and wire adapters, never the skeleton (§5, §11).
3. **Extensibility and flexibility as first-class goals.** New transports are new `TransportProjector`s; new cross-cutting behavior is a new `IInterceptor`; new authorization is a new `IPermission` funnelling to the one `IAuthorizationService` seam. Core is extended, never edited.

> **What SOF explicitly rejects from NestJS.** Nest's authorization is opt-in-by-default: `@UseGuards` is something you can *forget*. SOF makes forgetting a compile error and the pipeline non-bypassable — strictly stronger than DRF's `DEFAULT_PERMISSION_CLASSES = [AllowAny]`, which SOF also rejects. SOF likewise refuses Nest's `reflect-metadata` + legacy-decorator runtime: the monorepo ships **zero `@nestjs/*`, zero `reflect-metadata`, and no `experimentalDecorators`** (verified across every `package.json`/`tsconfig`). Decorators in SOF (§17) are *optional* Stage-3 standard-decorator sugar that only writes routing/schema/permission metadata and lowers to the identical plain-class config — never the DI mechanism, never the source of truth. There are no parameter decorators and no type-based DI; capabilities are a static `Pick<Capabilities, TCaps>` narrowed by an explicit `requires` list.

### 1.3 One shared definition, when you want it

The class-first path gives ergonomics but, unlike SAF, does **not** force cross-transport consistency for hand-written primitives — a `TodoQuery` and a hand-written `TodoView` can drift in policy or logic. Where that guarantee matters, `DocumentResource` (the `ModelViewSet`/router factory behind `DocumentModelViewSet`) restores it: it reads a `DocumentModelModule` and *manufactures* the concrete L1 primitives across one or many transports from a single shared serializer + permission set, so the generated endpoints cannot drift:

```ts
const invoices = new DocumentResource({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: invoiceModel,
  serializer: DocumentSerializer.fromDocumentModel(invoiceModel, {
    fields: "__all__",
    fieldGuards: { ownerAddress: () => false }, // internal field must NOT leak (§8)
  }),
  read: { source: InvoiceReadModel, table: "invoice", filterable: {}, sortable: [], pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id" }) },
  permissions: { list: [new DriveMemberPermission("read")], get: [new DocumentPermission("read")] },
  transports: ["graphql", "rest"],
});
// invoices.emitAll() → { graphql: GraphQLField[], rest: RestController } from ONE serializer + permission set
```

> **Honest boundary.** Only GraphQL is package-contributable today via the existing `<pkg>/subgraphs` → `registerSubgraph` seam; REST/RPC/WS/webhook require a one-time host wiring change (public accessors on `GraphQLManager`, `verifyBearer` for GET, explicit CORS) covered in §16. SOF's class model is designed for all five transports; its *deployment* leads with GraphQL until that wiring lands.

The remainder of this spec ports SAF's guarantees one by one into this OO vocabulary: the fixed pipeline (§5), primitives (§11), permissions as guards (§7), generics and the resource factory (§12), routing and host wiring (§13, §16), and the frozen contract every name above is drawn from (Appendix A).

---

## 2. Goals & non-goals

SOF has one job: give teams fluent in Django REST Framework and NestJS the class-first vocabulary they expect — permission objects, serializers, guards, generic views, routers — while preserving *every* structural security guarantee SAF earned (§14) and reusing the *same* real Powerhouse seams SAF stands on (§4). The goals below bound what "class-first" buys you; the non-goals fence off the NestJS runtime machinery we deliberately do **not** adopt.

### 2.1 Goals

- **The transport primitive is the unit of authorship.** Where SAF authors one transport-agnostic `OperationDef` and *projects* it everywhere, SOF authors a concrete per-wire class that is auditable on its own terms: `RestView`, `GraphQLQuery` / `GraphQLMutation` / `GraphQLSubscription`, `WebSocketGateway`, `RpcMethod`, `InboundWebhook` / `OutboundWebhook`. Each — except the egress-only `OutboundWebhook`, an SSRF-guarded delivery primitive rather than a request/response pipeline — is a thin subclass of `Endpoint` bound to one verified seam. A GraphQL query is ~10 lines and reads like a NestJS resolver:

  ```ts
  class GetTodo extends GraphQLQuery<typeof TodoArgs, typeof TodoView, "reactor"> {
    readonly id = "todo.get";
    readonly fieldName = "todo";
    readonly sdl = `extend type Query { todo(id: ID!): Todo }`;
    readonly inputSchema = TodoArgs;
    readonly outputSchema = TodoView;
    readonly serializer = DocumentSerializer.fromDocumentModel(todoModel);         // closed output projection
    readonly requires = ["reactor"] as const;
    readonly permissionClasses = [new AuthenticatedPermission(), new DocumentPermission("read")];
    getSubject(input: InferOut<typeof TodoArgs>) { return input.id; }               // → object-authz
    protected async handle(input, ctx, subject) {                                    // the only hook
      return this.serializer.toRepresentation(await ctx.caps.reactor.get(subject!.fetchIdentifier), ctx);
    }
  }
  ```

  A `RestView` adds an explicit HTTP method and path — including custom, non-CRUD verbs (`voidInvoiceAction`, `sendInvoiceAction`) that DRF would model as `@action`:

  ```ts
  class VoidInvoice extends RestView<typeof VoidArgs, typeof InvoiceView, "reactor"> {
    readonly id = "invoice.void";
    readonly method = "POST" as const;
    readonly path = "/invoices/:id/void";
    readonly kind = "mutation" as const;
    readonly inputSchema = VoidArgs; readonly outputSchema = InvoiceView;
    readonly serializer = DocumentSerializer.fromDocumentModel(invoiceModel, { writeOnly: ["ownerAddress"] }); // never leaks
    readonly requires = ["reactor"] as const;
    readonly permissionClasses = [new OperationPermission("voidInvoiceAction")];
    getSubject(i: InferOut<typeof VoidArgs>) { return i.id; }
    getObjectAccess() { return "write" as const; }
    protected async handle(input, ctx, subject) {
      await ctx.caps.reactor.execute(subject!.fetchIdentifier, [voidInvoiceAction({ reason: input.reason })]);
      return this.serializer.toRepresentation(await ctx.caps.reactor.get(subject!.fetchIdentifier), ctx);
    }
  }
  ```

  (`VoidInvoice` requires only `"reactor"`: its `OperationPermission` check funnels through `ctx.authorize` — the always-present `DocumentAuthorizer` — not through `ctx.caps.authz`, so `requires` lists exactly what `handle` reads from `ctx.caps`.)

- **Authorization is a composable object that *is* a guard.** Every builtin is a DRF `BasePermission` with the two hooks (`hasPermission` view-level, `hasObjectPermission` object-level) *and* a NestJS `CanActivate` — one object, two idioms, one decision seam (`IAuthorizationService`, §7). Because TypeScript has no operator overloading, DRF's `&|~` algebra becomes `.and()` / `.or()` / `.not()` plus the free `and` / `or` / `not` helpers. The headline composition — anonymous *or* an authenticated owner — is a single expression:

  ```ts
  readonly permissionClasses = [
    or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission())),
  ];
  ```

- **Full CRUD, generated from a document model.** A `DocumentResource` / `DocumentModelViewSet` factory reads a `DocumentModelModule` and *manufactures* the concrete L1 primitives above — across one or many transports — from **one** shared `DocumentSerializer` and **one** `CrudPermissionMap`, giving the DRF `ModelViewSet` ergonomic without SAF's projector magic (§12):

  ```ts
  const invoiceResource = new DocumentResource({
    name: "invoice", version: "1.0.0", basePath: "/invoices",
    documentModel: invoiceModel,
    serializer: DocumentSerializer.fromDocumentModel(invoiceModel, { writeOnly: ["ownerAddress"] }), // never leaks
    read: { source: InvoiceReadModel, table: "invoice", filterable: {}, sortable: ["dueDate"], pagination: keyset({ orderBy: "dueDate", tieBreaker: "id", max: 100 }) },
    write: { create: (i, ctx) => ({ document: makeInvoiceDocument(i) }), update: (p) => [editInvoiceAction(p)] },
    permissions: {
      list:   [new DriveMemberPermission("read")],   // view-level; closes list IDOR (§14)
      get:    [new DocumentPermission("read")],
      create: [new CreatePermission()],
      update: [new DocumentPermission("write")],
    },
    transports: ["graphql", "rest", "rpc"],
  });
  const { rest, graphql, rpc } = invoiceResource.emitAll(); // three wires, one serializer + one permission map
  ```

- **Every SAF guarantee, in OO form.** Deny-by-default is a *compile* error (`Endpoint.permissionClasses` is abstract); the security-critical stages live in a `FINAL` `ExecutionPipeline` no subclass can reorder or bypass; input validation runs *before* object-authz so subjects are typed and `checked-id == fetched-id` via `AuthorizedDocumentHandle`. §14 enumerates all twelve principles and their mechanisms.

- **Reuse, not reinvention.** SOF is thin adapters over seams that already exist — `IHttpAdapter.mount`, `GraphQLManager` + `BaseSubgraph`, the shared `WebSocketServer` + `getPubSub()`, `IReactorClient`, read-only `RelationalDbProcessor`, `IAuthorizationService` (§4). It brings your own validator (any `StandardSchemaV1`).

- **Extensibility is first-class and mechanical (Open/Closed).** A new transport is *one* `Endpoint` subclass + *one* `TransportProjector`; a new policy is *one* `BasePermission` subclass; a new cross-cutting concern is *one* `IInterceptor`. Core is never edited to add any of them (§13).

### 2.2 Non-goals

- **No NestJS runtime.** The monorepo ships zero `@nestjs/*`. SOF borrows Nest's *role separation* (guard / pipe / interceptor / filter, one transport-agnostic `ExecutionContext`) as plain classes — not its bootstrapper, module scanner, or RxJS-based interceptor pipe.
- **No `reflect-metadata`, no `experimentalDecorators`.** Verified absent across every `package.json` and `tsconfig`. Decorators in SOF are **optional** Stage-3 (TC39 / TS 5+) standard-decorator sugar that write only routing/schema/permission metadata into `context.metadata` and lower to the identical plain-class config (§17). There are no parameter decorators and no `design:paramtypes` type-DI — Stage-3 cannot express them.
- **Decorators are not mandatory and are not the DI mechanism.** Plain classes are the source of truth and the CI/type-test path. DI is static: a reflection-free boot-time `Container` (`useValue` / `useFactory` / `useClass` with explicit `deps` token lists) plus request-time `Pick<Capabilities, TCaps>` narrowing driven by `Endpoint.requires` (§6).
- **No runtime DI container graph.** No per-request container resolution, no bootstrap-time provider-graph errors, no `REQUEST`-scope contagion — `ctx` is a plain per-call object.
- **No new infrastructure.** SOF adds no server, process, datastore, pubsub, or query builder. Realtime and webhook fan-out inherit the single-process `getPubSub()` limit (§19); SOF does not distribute it.

> **Honest boundary — SOF *enables* cross-transport consistency but does not *force* it.** SAF's single pipeline makes a REST and a GraphQL projection of the same concept structurally identical. In SOF, a hand-written `RestView` and a hand-written `GraphQLQuery` for the "same" Invoice operation are two classes and *can* drift in validation, policy, or logic. Only the `DocumentResource` factory (§12) guarantees they share one serializer and one permission map. Closing the hand-written gap is a lint/CI concern, not a type-system one — see §19.

> **Honest boundary — only GraphQL is package-contributable today.** `GraphQLManager` holds `httpAdapter`, `wsServer`, `#authMiddleware`, and `#driveMiddleware` as private fields, so nothing outside it can mount a REST/RPC/WS/webhook `FetchHandler` yet. The REST/RPC/WS/webhook primitives are fully specified, but require the one-time host wiring of §16 (public accessors + `verifyBearer` for GET + explicit CORS allowlist) before they can mount. This is additive plumbing, mirroring SAF §13 — not per-feature edits.

---

## 3. Thesis: transport-specific primitives, one non-removable pipeline, generated from document models

SOF keeps every SAF security guarantee but inverts the mechanism. Where SAF is **data-first** — you author one transport-agnostic `OperationDef` and a projector fans it out to every wire (§3 of the SAF sibling) — SOF is **class-first and transport-specific**: the unit you author is a subclass of a real per-transport primitive (`RestView`, `GraphQLQuery` / `GraphQLMutation` / `GraphQLSubscription`, `WebSocketGateway`, `RpcMethod`, `InboundWebhook` / `OutboundWebhook`), each a thin class over a real Powerhouse seam (see §4). Business logic is shared the Nest way — a plain injected capability or service reached through `ctx.caps`, narrowed to a typed `Pick<Capabilities, TCaps>` by the endpoint's `requires` list — but **each wire is its own auditable class**, so the GraphQL resolver and the REST handler for the "same" concept are two objects you can read, diff, and review independently. That is the deliberate trade: SOF *enables* cross-transport consistency but, unlike SAF, does not *force* it for hand-written primitives.

> **Honest boundary.** The one place SOF *does* guarantee no drift is the `DocumentResource` factory (§3.2, §12): it manufactures the per-transport primitives from **one shared `DocumentSerializer` + one `CrudPermissionMap`**, so the generated set cannot diverge. Two hand-written endpoints for the same logical id can still drift in policy or validation — §19 tracks a proposed lint/CI rule to flag exactly that. A second boundary is just as important: emitted `RestView` / `RpcMethod` / `WebSocketGateway` / webhook primitives are inspectable, mountable-shaped objects, but they are **not host-mountable until the §16 host wiring lands** (public `IHttpAdapter` / `wsServer` accessors on `GraphQLManager`, `verifyBearer` for GET reads, and an explicit CORS allowlist). Today only GraphQL is package-contributable and actually served — everything else is a real object you can build and test, not yet a wire that carries traffic.

### 3.1 Class-first vs data-first, and vs NestJS/DRF

| Axis | SAF (data-first) | SOF (class-first) |
| --- | --- | --- |
| Unit of authorship | one `OperationDef` (pure data) | one `Endpoint` subclass per wire |
| Cross-transport | projected everywhere, forced-consistent | per-transport classes; consistency only via `DocumentResource` |
| Shared logic | the handler closure | injected capability/service via `ctx.caps` |
| Deny-by-default | a `TAuth`-extends-`true` type-state builder gate (won't compile until authorized) | `permissionClasses` is an **abstract member** (compile error) |
| Extensibility | plugins around a fixed pipeline | DRF permission objects + serializers + NestJS-role pipes/interceptors/filters |

Against NestJS and DRF, SOF is faithful in **shape** and stricter in **safety**. It keeps NestJS's guard/pipe/interceptor/filter role-separation and transport-agnostic `ExecutionContext` (`getType()` / `switchToHttp()` / `switchToWs()` / `switchToRpc()`), and DRF's permission-object + generic-view + `ModelSerializer` + router layering — but it is **decorator-free at its core**. The monorepo ships zero `@nestjs/*`, zero `reflect-metadata`, and no `experimentalDecorators` (§4); the decorators in Appendix A are therefore **optional Stage-3 sugar** that only write routing/schema/permission metadata into `context.metadata` and lower to identical plain-class config. There are no parameter decorators and no type-based DI. Plain classes are the source of truth.

### 3.2 The three inherited guarantees, as class structure

**(1) Deny-by-default is a compile error.** `Endpoint.permissionClasses` is an abstract member — omitting it does not typecheck. An empty list is denied at runtime by the `ExecutionPipeline` and re-checked by `Router.build()`. The only opt-out is the greppable `AnonymousPermission` / `AllowAny`.

```ts
import { GraphQLQuery, AuthenticatedPermission, ExecutionContext, type PermissionSpec } from "@powerhousedao/switchboard-api-oo";
import { z } from "zod";

// A 10-line GraphQL query over the Todo running example.
export class TodoQuery extends GraphQLQuery<typeof TodoQuery.In, typeof TodoQuery.Out, "reactor"> {
  static In = z.object({ id: z.string() });
  static Out = z.object({ id: z.string(), title: z.string(), done: z.boolean() });
  readonly id = "todo"; readonly fieldName = "todo";
  readonly inputSchema = TodoQuery.In; readonly outputSchema = TodoQuery.Out;
  readonly sdl = `extend type Query { todo(id: ID!): Todo }`;
  readonly requires = ["reactor"] as const;
  readonly permissionClasses: readonly PermissionSpec[] = [AuthenticatedPermission]; // omit → COMPILE ERROR
  protected async handle(input: { id: string }, ctx: ExecutionContext<"reactor">) {
    const doc = await ctx.caps.reactor.get(input.id);            // real IReactorClient read
    const { title, done } = doc.state.global as { title: string; done: boolean };
    return { id: doc.header.id, title, done };                   // projected through outputSchema (closed) at FIXED stage 6
  }
}
```

**(2) A FINAL `ExecutionPipeline` no subclass can reorder or remove.** `Endpoint.dispatch()` delegates to a single pipeline body whose stages are fixed: authenticate → throttle → input-validation → view-authz → object-authz → handler → closed-output. Subclasses override only `handle()` and their wire adapter. There is no `@UseGuards`-style opt-out; interceptors (outer/inner phases) *wrap* but cannot delete or reorder a fixed stage.

**(3) Input-validation runs before object-authz, giving typed subjects and checked==fetched.** Because stage 3 (the `StandardSchemaPipe`) runs before stage 5, `getSubject` sees **typed** input; `ctx.authorize.assert(access, idOrSlug, ctx)` returns an `AuthorizedDocumentHandle` whose `fetchIdentifier` the handler MUST fetch — checked-id == fetched-id, closing IDOR. Permission objects compose DRF-style. The headline composition, expressible because SOF extends `permission_classes` to accept pre-composed instances:

```ts
import { or, and, AnonymousPermission, AuthenticatedPermission, ObjectOwnerPermission } from "@powerhousedao/switchboard-api-oo";
// public reads, but writes only by the authenticated owner:
readonly permissionClasses = [
  or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission("write"))),
];
```

### 3.3 `DocumentResource` manufactures primitives — inspectable, overridable, non-drifting

`DocumentResource` is a factory, **not a hidden projector**. It reads a `DocumentModelModule`, and *emits* concrete L1 primitives (`emitRest()`, `emitGraphQL()`, `emitWs()`, `emitRpc()`) that you can inspect and override — but every emitted primitive is built from **one** `DocumentSerializer` and **one** `CrudPermissionMap`, so the transports cannot drift. This is the DRF `ModelViewSet` ergonomic without SAF's projector magic:

```ts
import { DocumentResource, DocumentSerializer, DriveMemberPermission,
         AuthenticatedPermission, ObjectOwnerPermission, DocumentPermission, and } from "@powerhousedao/switchboard-api-oo";
import { invoiceModel } from "@acme/invoice-model";

const invoices = new DocumentResource<InvoiceState, InvoiceRow>({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: invoiceModel,
  // ownerAddress is internal — writeOnly keeps it out of every wire's output projection:
  serializer: DocumentSerializer.fromDocumentModel(invoiceModel, { fields: "__all__", writeOnly: ["ownerAddress"] }),
  read: { source: InvoiceReadModel, table: "invoice", filterable: {/*…*/}, sortable: ["dueDate"], pagination: keyset({ orderBy: "dueDate", tieBreaker: "id" }) },
  permissions: {
    list:   [DriveMemberPermission],                     // Router.build() enforces this on list-capable views
    get:    [new DocumentPermission("read")],
    create: [AuthenticatedPermission],
    update: [and(new AuthenticatedPermission(), new ObjectOwnerPermission("write"))],
  },
  transports: ["graphql", "rest", "rpc"],                // one serializer + one permission map → three wires
});

// concrete, inspectable RestController / GraphQLField[] / RpcService — but only `graphql` is
// host-mountable today; `rest`/`rpc` stay inspectable objects until the §16 host wiring lands.
const { rest, graphql, rpc } = invoices.emitAll();
```

### 3.4 The blend, in one line

SOF = **DRF** permission objects + generic views + `ModelSerializer` + routers, **⊕ NestJS** guard/pipe/interceptor/filter roles + `ExecutionContext` + dynamic modules (`ApiModule.forRoot/forFeature`), **on Powerhouse's real interfaces** (`IReactorClient`, `IRelationalDb`, `IAuthorizationService`, `BaseSubgraph`, `IHttpAdapter`) with **static typing** — expressed as explicit plain-class objects, not reflective runtime. The full type surface is Appendix A.

---

## 4. Where SOF sits on the real Powerhouse seams

SOF invents no transport, no server, and no authorization engine. Where SAF projects one data-first `OperationDef` onto every wire, SOF gives you a **class per transport** — but each class is a thin skin over a mount point that already exists in `reactor-api`. The Powerhouse seams below already exist; SOF's classes are thin skins over them (reaching the non-GraphQL seams still needs the one-time §16 host wiring). The object graph exists only to make the security pipeline (§5) unavoidable and to give the primitives a place to bind. Capabilities are the same real interfaces SAF uses (see `Capabilities` in Appendix A — `reactor`, `db`, `analytics`, `authz`, `pubsub`), never re-declared.

### 4.1 The seam map

| SOF abstraction | Real Powerhouse seam it binds to | File |
| --- | --- | --- |
| `RestView` / `RpcService` / `InboundWebhook`.`toFetchHandler(rt)` | `IHttpAdapter.mount(path, handler, {exact})` — buffered; `mountNodeRoute(method, path, …)` for streaming (SSE/chunked); `getRoute(path, …)` for GET health/explorer | `reactor-api/src/graphql/gateway/types.ts` |
| Wire currency every primitive emits | `FetchHandler = (request: Request) => Promise<Response>` (WHATWG Fetch, **always buffered**) | `.../gateway/types.ts:23` |
| `GraphQLQuery` / `GraphQLMutation` / `GraphQLSubscription` → `GeneratedSubgraph extends BaseSubgraph` | `GraphQLManager.registerSubgraphInstance(instance)` (structural `ISubgraph`); reuses `BaseSubgraph`'s memoized `resolveCanonicalDocumentId` / `assertCanRead…` helpers | `graphql-manager.ts`, `graphql/base-subgraph.ts` |
| `WebSocketGateway` / `GraphQLSubscription` | the **one shared** `WebSocketServer` + `getPubSub()` singleton + refcounted `ensureGlobalDocumentSubscription(reactorClient)` | `reactor-api/src/graphql/reactor/pubsub.ts` |
| Writes (`create_` / `update_`, `WriteBinding`) | `IReactorClient.execute / executeAsync / executeBatch / create / createEmpty`, and `reactor.drives.addFile` (on `IDriveClient`) | `reactor/src/client/types.ts` |
| Small-N reads | `IReactorClient.find(search, view, paging) → PagedResults<PHDocument>`, `get`, `resolveIdOrSlug` | `reactor/src/client/types.ts` |
| Scale reads (`GenericView.getQuery`, `ReadBinding`) | `RelationalDbProcessor.query(driveId, db) → IRelationalQueryBuilder` — a read-only `Pick` (`selectFrom` / `selectNoFrom` / `with` / `withRecursive`) — **no insert/update/delete** | `shared/processors/relational/types.ts` |
| Every builtin `IPermission` → `DocumentAuthorizer` | `IAuthorizationService.canRead / canWrite / canManage / canMutate / canCreate / isSupremeAdmin` (fail-closed) | `reactor-api/src/services/authorization.service.ts` |
| `ExecutionContext.user: Identity` | `Context.user = { address, chainId, networkId }` (optional ⇒ anonymous) | `reactor-api/src/graphql/types.ts` |
| Package discovery | `PackageManager` loads `<pkg>/subgraphs` (`SubgraphClass[]`) and `<pkg>/processors` | `reactor-api/src/packages/package-manager.ts` |
| `DocumentSerializer` / `DocumentModelViewSet` source | `PHDocument` / `Action` / `DocumentModelModule` via the `@powerhousedao/shared/document-model` barrel | `packages/shared/document-model/*` |

> **`isSupremeAdmin` is not membership.** Under the `OPEN` authorization policy, `isSupremeAdmin(addr)` returns `true` for *everyone* — it means "no restrictions", not "is an admin". `AdminPermission` funnels to it verbatim, so a deployment's policy, not the permission class, decides the blast radius. SOF preserves this seam behaviour rather than papering over it.

### 4.2 GraphQL is the live seam

A `GraphQLField` compiles straight to a resolver, and `GeneratedSubgraph` assembles a set of them into one real `BaseSubgraph` that `registerSubgraphInstance` accepts today:

```ts
export class TodoQuery extends GraphQLQuery<typeof TodoArgs, typeof TodoOut, "reactor" | "authz"> {
  readonly id = "todo.get";
  readonly fieldName = "todo";
  readonly sdl = `type Todo { id: ID! title: String! done: Boolean! }
                  extend type Query { todo(id: ID!): Todo }`;
  readonly inputSchema = TodoArgs;                 // { id: string }
  readonly outputSchema = TodoOut;
  readonly requires = ["reactor", "authz"] as const;
  readonly permissionClasses = [new DocumentPermission("read")];   // object-level canRead
  getSubject = (i: InferOut<typeof TodoArgs>) => i.id;             // TYPED input → subject
  protected async handle(i, ctx, subject) {
    return ctx.caps.reactor.get(subject!.fetchIdentifier);        // checked-id == fetched-id
  }
}
// new GeneratedSubgraph(subgraphArgs, [new TodoQuery()], "todo", rt) → registerSubgraphInstance
```

### 4.3 REST / RPC / WS / webhook reach for the same seams — through a projector

A hand-written `RestView` with a custom method binds to `IHttpAdapter.mount` via its `FetchHandler`; the object-authz stage still fires before the handler — and here it actually gates the write, because `ObjectOwnerPermission.hasObjectPermission` denies any caller who is not the invoice's owner:

```ts
export class VoidInvoiceView extends RestView<typeof VoidArgs, typeof InvoiceOut, "reactor" | "authz"> {
  readonly id = "invoice.void";
  readonly method = "POST" as const;
  readonly path = "/invoices/:id/void";            // relative to controller basePath
  readonly kind = "mutation" as const;
  readonly inputSchema = VoidArgs;                 // { id: string; reason: string }
  readonly outputSchema = InvoiceOut;
  readonly requires = ["reactor", "authz"] as const;
  readonly permissionClasses = [
    and(new AuthenticatedPermission(), new ObjectOwnerPermission("write")),  // owner-only write
  ];
  getSubject = (i: InferOut<typeof VoidArgs>) => i.id;
  getObjectAccess = () => "write" as const;
  protected async handle(i, ctx, subject) {
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, "main",
      [voidInvoiceAction({ reason: i.reason })]);
    return ctx.caps.reactor.get<InferOut<typeof InvoiceOut>>(subject!.fetchIdentifier);
  }
}
// RestProjector.project([...], rt, deps) → deps.httpAdapter.mount("/invoices/:id/void", view.toFetchHandler(rt))
```

The `AnonymousPermission`-OR-headline composition (`or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission()))`) is reserved for the **read-oriented** §7 showcase, where an anonymous fallback is intended. It must never sit on a destructive mutation: `AnonymousPermission extends AllowAny`, so both its `hasPermission` and `hasObjectPermission` return `true`, and the DRF OR short-circuit (`(a.hasPermission && a.hasObjectPermission) || (b…)`) then evaluates the whole policy `true` for **any** caller — the object-authz stage runs but is guaranteed to pass, and the owner check becomes dead code.

`WebSocketGateway.attach(rt, deps)` and `GraphQLSubscription` bind to the **shared** `WebSocketServer` and subscribe through `getPubSub()` / `ensureGlobalDocumentSubscription` (Chat's message stream is one refcounted subscriber on the single global topic — see §11), returning a disposer so listeners never leak.

### 4.4 The factory reuses all of it from one document model

`DocumentResource` reads a `DocumentModelModule` and emits the primitives above from **one** shared serializer + permission set — the DRF `ModelViewSet` ergonomic without drift:

```ts
const invoiceResource = new DocumentResource({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: invoiceModel,                                   // @acme/invoice-model
  serializer: DocumentSerializer.fromDocumentModel(invoiceModel, {
    fields: "__all__", writeOnly: ["ownerAddress"],             // internal — MUST NOT leak
  }),
  read: { source: InvoiceReadModel, table: "invoice",           // RelationalDbProcessor read model
          filterable: { status: { type: "string", ops: ["eq", "in"] } },
          sortable: ["dueDate"], pagination: keyset({ orderBy: "dueDate", tieBreaker: "id" }) },
  write: { create: (i, ctx) => ({ document: makeInvoiceDocument(i) }),
           update: (p) => [editInvoiceAction(p)] },
  permissions: {
    list:   [new DriveMemberPermission("read")],                // closes list IDOR (§7)
    get:    [new DocumentPermission("read")],
    create: [new CreatePermission()],
    update: [new DocumentPermission("write")],
  },
  transports: ["graphql"],                                        // see the boundary below
});
```

> **Honest boundary (the central fact; the fix lives in §16).** Only the **GraphQL** projection is contributable through a public seam today. A package contributes `SubgraphClass[]` via `<pkg>/subgraphs`, and `GraphQLManager` keeps `private readonly httpAdapter: IHttpAdapter`, `private readonly wsServer: WebSocketServer`, and the `#authMiddleware` / `#driveMiddleware` fields (`graphql-manager.ts:114-115,140-142`) — so nothing outside `GraphQLManager` can `mount` a REST/RPC/WS/webhook `FetchHandler`. `RestProjector` / `WsProjector` / `RpcProjector` / `WebhookProjector` therefore require the `ProjectionDeps` bag (`httpAdapter`, `wsServer`, `pubsub`, `corsAllowlist`, `subgraphArgs`) to be handed in by a **one-time host wiring change** in `server.ts` plus new public accessors on `GraphQLManager` (following the existing `getBasePath()` / `getAuthorizationService()` pattern). SOF does **not** pretend REST/RPC/WS/webhook ship "with zero core edits" — §16 enumerates exactly what must change, and until it lands, `transports` beyond `"graphql"` are authorable and type-check but are mounted only in a host that provides `ProjectionDeps`.

> **Do not reuse the drive middleware for non-GraphQL wires.** `createDriveFetchMiddleware` parses the request as a GraphQL body (`request.clone().json()` → `body.operationName`/`body.query`, `drive-middleware.ts:72-81`) and returns `421 Misdirected Request` on a shard miss. A REST/RPC/webhook `FetchHandler` behind it fails the cache-bypass check silently or throws. Likewise `AuthService.authenticateRequest` **skips bearer verification on GET/OPTIONS** (`auth.service.ts:51-52`); `BearerAuthenticator` in SOF calls `verifyBearer(authorization)` directly so GET reads are still authenticated (§16). These are why each transport gets its own projector, not a blind wrap of the GraphQL chain.

---

## 5. The request lifecycle — the load-bearing invariant

SAF's central guarantee is that *every logical call runs the same assembled pipeline*. SOF keeps that guarantee but relocates it into class structure. There is exactly one request body in the framework — the fixed, non-overridable `ExecutionPipeline` — and every transport primitive reaches it through the same `Endpoint.dispatch()` template method. A `RestView`, a `GraphQLMutation`, a `WebSocketGateway`, an `RpcMethod` and an `InboundWebhook` differ only in how they *adapt their wire* to `dispatch()` and how they *render* an `ApiError` back to it. The security-critical work — authenticate, throttle, validate, view-authz, object-authz, closed output — happens **inside the pipeline, in a fixed order, where no subclass can reach it**.

This is the OO expression of SAF §5. Where SAF makes the pipeline the body of `rt.invoke`, SOF makes it the body of `dispatch()`. Neither is bypassable.

### 5.1 The fixed pipeline

`Endpoint.dispatch()` is **FINAL**. Its entire body constructs an `ExecutionPipeline` around `this` and runs it (Appendix A, §8):

```ts
// Appendix A — the ONLY body every transport shares. Never overridden.
dispatch(raw: unknown, ctx: ExecutionContext<TCaps, TExt>): Promise<unknown> {
  return new ExecutionPipeline(this).run(raw, ctx as ExecutionContext);
}
```

`ExecutionPipeline.run` sequences six FIXED stages, sandwiched between the endpoint's two interceptor phases. The order is not configurable; the stages are not removable:

```
             ┌──────────────────── outer interceptors (pre-authz) ────────────────────┐
 raw wire ─▶ │  logging · tracing · timeout · anon rate-limit                          │
             │      ▼                                                                   │
             │  [FIXED 1] authenticate   (IAuthenticator CoR; fail-open → anonymous)   │
             │  [FIXED 2] throttle       (shed load BEFORE parse; RATE_LIMITED)        │
             │  [FIXED 3] input validation (StandardSchemaPipe) ─▶ TYPED input         │
             │  [FIXED 4] view-level authz  (every permission.hasPermission)           │
             │  [FIXED 5] object-level authz                                           │
             │     getSubject(input) ─▶ authorize.assert ─▶ AuthorizedDocumentHandle   │
             │     (every permission.hasObjectPermission with the handle)              │
             │                       ┌──── inner interceptors (post-authz) ────┐        │
             │                       │ cache · field redaction                 │        │
             │                       │      ▼                                   │        │
             │                       │   [HANDLER] handle(input, ctx, handle)   │        │
             │                       │      ▼                                   │        │
             │                       └──────────────────────────────────────────┘        │
             │  [FIXED 6] closed output projection (serializer/outputSchema)            │
             └──────────────────────────────────────────────────────────────────────────┘
                                              ▼
                              catch ─▶ filter.catch(ApiError.code ─▶ wire idiom)
```

| # | Stage | Mechanism (Appendix A) | Failure |
|---|-------|------------------------|---------|
| — | outer interceptors | `interceptors.filter(i => i.phase === "outer")` | pass-through / short-circuit |
| 1 | authenticate | `authenticators` chain; first non-null `Identity` sets `ctx.user` | fail-open → `ctx.user` undefined (anonymous) |
| 2 | throttle | `throttleClasses[].allowRequest(ctx, this)` | `Throttled` → `RATE_LIMITED` |
| 3 | input validation | `StandardSchemaPipe(inputSchema)` → `InferOut<TIn>` | `ValidationError` → `VALIDATION` |
| 4 | view-level authz | every `permission.hasPermission(ctx, this)` | `NotAuthenticated` / `PermissionDenied` |
| 5 | object-level authz | `getSubject` → `authorize.assert` → `hasObjectPermission` | `PermissionDenied` / `NotFound` |
| — | inner interceptors | `interceptors.filter(i => i.phase === "inner")` | around the handler only |
| — | **HANDLER** | `handle(input, ctx, subject)` | any `ApiError` → filter |
| 6 | closed output | `serializer.toRepresentation` / parse through `outputSchema` | `InternalError` → `INTERNAL` (field-leak guard) |

A faithful reading of `run` makes the sequencing — and the deliberate deviations — concrete:

```ts
async run(raw: unknown, ctx: ExecutionContext): Promise<unknown> {
  const e = this.endpoint;
  return wrapOuter(e.interceptors, ctx, async () => {
    // [1] authenticate — chain of responsibility; NEVER throws for anonymous.
    ctx.user = await firstIdentity(e.authenticators, ctx);       // undefined ⇒ anonymous
    // [2] throttle — BEFORE parse, to shed load on cheap bytes (see §5.2).
    for (const t of e.throttleClasses)
      if (!(await t.allowRequest(ctx, e))) throw new Throttled(t.wait());
    // [3] input validation — BEFORE authz, so object checks see TYPED input (see §5.3).
    const input = await new StandardSchemaPipe(e.inputSchema)
      .transform(raw, { source: "body" }, ctx);                  // ValidationError on failure
    // [4] view-level authz — collection/view gate. Deny-by-default backstop:
    const policies = normalize(e.permissionClasses);             // [] ⇒ throw InternalError
    for (const p of policies)
      if (!(await p.hasPermission(ctx, e))) throw denial(ctx);
    // [5] object-level authz — only when the endpoint names a subject.
    let handle: AuthorizedDocumentHandle | undefined;
    const subjectId = e.getSubject?.(input, ctx);
    if (subjectId !== undefined) {
      const access = e.getObjectAccess?.(ctx) ?? "read";
      handle = await ctx.authorize.assert(access, subjectId, ctx); // resolve → check → handle
      for (const p of policies)
        if (!(await p.hasObjectPermission(ctx, e, handle))) throw denial(ctx);
    }
    // inner interceptors wrap ONLY the handler + output.
    const out = await wrapInner(e.interceptors, ctx, () =>
      e["handle"](input, ctx, handle));
    // [6] closed output — project through the declared shape; redact field guards.
    return e.serializer
      ? await e.serializer.toRepresentation(out, ctx)
      : project(e.outputSchema, out, ctx);                       // InternalError on leak
  }).catch((err) => e["filter"]().catch(err, ctx));               // ApiError.code ─▶ wire
}
```

> The stages are `[FIXED]` in the literal sense that they are lines in a method a subclass cannot re-enter. There is no `@UseGuards` to forget, no `permission_classes` default to inherit, no plugin slot between validation and authz to fill with the wrong thing. This is security principle **(2) — authorization is a fixed pipeline stage** — carried verbatim from SAF into class shape.

### 5.2 Stage 2 before stage 3 — throttle before parse (deviation from DRF)

Throttling runs **before** input validation, on the raw wire bytes, so an abusive caller is rejected before the framework spends CPU parsing a hostile payload. This preserves SAF's *outer-plugin intent* ("rate-limit must reject before doing work") in OO form: `AnonRateThrottle` / `UserRateThrottle` are consulted at `[FIXED 2]`, ahead of the `StandardSchemaPipe`.

> **Deviation from DRF.** `APIView.dispatch` runs `check_throttles` *after* `check_permissions`, and both after the request is already parsed. SOF deliberately inverts this: load-shedding on unauthenticated, unparsed input is the cheaper and safer default. The cost is that a throttle cannot key on validated fields — throttles see `ctx.user`, `ctx.headers` and the transport, not typed input. That is the intended trade: throttles are a load-shedding valve, not an authorization tool.
>
> **Transport caveat (per §19 open questions).** GraphQL bodies are already buffered and parsed by Apollo before `dispatch()` is reached, so pre-parse throttling on the GraphQL wire is pre-*SOF*-parse, not pre-Apollo-parse. A single large GraphQL document that expands into hundreds of thousands of operations is a batching concern owned at the transport edge, not something `[FIXED 2]` can see.

### 5.3 Stage 3 before stages 4–5 — typed input reaches object authz (deviation from NestJS)

Input validation runs **before** authorization, and object-level authorization (`[FIXED 5]`) reads its subject from the *already-typed* input via `getSubject(input, ctx)`. This is the invariant that closes IDOR at the framework level: an object permission never receives a raw, unparsed identifier.

> **Deviation from NestJS.** Nest runs **guards before pipes** — `canActivate` fires before `ValidationPipe` transforms the body. An object-level guard in Nest therefore either re-parses the request itself or authorizes against untyped input. SOF refuses that ordering: because `getSubject` is typed `(input: InferOut<TIn>, ctx) => string | undefined`, the subject id is guaranteed to have survived schema validation before it is used to resolve and check a document. View-level `hasPermission` (`[FIXED 4]`) still runs collection/role gates that need no subject; only object-level `hasObjectPermission` waits for the typed subject.

`hasObjectPermission` is invoked **only when `getSubject` returns a value** — mirroring DRF, which calls `check_object_permissions` only from `get_object`. An endpoint with no subject (a list, a create, a pure command) runs `[FIXED 4]` and skips `[FIXED 5]`; its collection safety is instead guaranteed by carrying `DriveMemberPermission` at the view level (security principle **(7)**, enforced by `Router.build()`, see §7).

### 5.4 The `AuthorizedDocumentHandle` — checked-id == fetched-id

`[FIXED 5]` does not merely return a boolean. `ctx.authorize` is a `DocumentAuthorizer` whose `assert(access, idOrSlug, ctx)` performs the full resolve → check → *bind* cycle and returns an `AuthorizedDocumentHandle`. That handle carries the `fetchIdentifier` the handler is **required** to fetch:

```ts
export interface DocumentAuthorizer {
  readonly svc: IAuthorizationService;
  canonical(idOrSlug: string, ctx: ExecutionContext): Promise<CanonicalDocumentId>;
  assert(access: Access, idOrSlug: string, ctx: ExecutionContext): Promise<AuthorizedDocumentHandle>;
}
```

The pipeline passes that same handle into the handler as the third argument. The handler must read the document through `subject.fetchIdentifier` — never re-derive an id from the raw request — so the document that was **authorized** is provably the document that gets **fetched**. This is SAF security principle **(5)** in OO form, and it is why `handle()` is the only business hook that ever sees the authorized handle:

```ts
import { and, AuthenticatedPermission, ObjectOwnerPermission }
  from "@powerhousedao/switchboard-api-oo";

// Void an invoice — object-level, owner-gated, fetched == checked. A DESTRUCTIVE
// mutation, so it MUST require authentication + ownership; there is no public branch.
class VoidInvoice extends GraphQLMutation<typeof VoidInput, typeof InvoiceOut, "reactor" | "authz"> {
  readonly id = "invoice.void";
  readonly fieldName = "voidInvoice";
  readonly sdl = `type Mutation { voidInvoice(id: ID!): Invoice! }`;
  readonly inputSchema = VoidInput;                 // { id: string }
  readonly outputSchema = InvoiceOut;
  readonly requires = ["reactor", "authz"] as const;
  // Deny-by-default is satisfied here — omitting this is a COMPILE error (§7).
  // AND-composition: authenticated AND owner. NEVER an OR with AllowAny on a write.
  readonly permissionClasses = [
    and(new AuthenticatedPermission(), new ObjectOwnerPermission("manage")),
  ];
  // Subject comes from TYPED input — so [FIXED 5] can only see a validated id.
  getSubject(input: InferOut<typeof VoidInput>) { return input.id; }
  getObjectAccess() { return "manage" as const; }

  protected async handle(input, ctx, subject?: AuthorizedDocumentHandle) {
    // MUST fetch through the authorized handle — never through input.id again.
    const doc = await ctx.caps.reactor.get(subject!.fetchIdentifier);
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, "main", [voidInvoiceAction({})]);
    // Return the RAW document. [FIXED 6] is the SINGLE projection point: it parses
    // through outputSchema (InvoiceOut) and redacts ownerAddress. Do NOT project here.
    return doc;
  }
}
```

> **Why not `or(anonymous, …)` here?** The §7 headline composition is `or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission()))` — a legitimately powerful shape, but only for a **read**. Because `AnonymousPermission extends AllowAny` and `BasePermission.hasPermission` / `hasObjectPermission` both default to `true` (Appendix A, §6), the `OrPermission` short-circuits on the anonymous branch to *always allow*: any caller, including an unauthenticated one, would pass both `[FIXED 4]` and `[FIXED 5]`. That is exactly what a public read wants — and exactly what a destructive `voidInvoice` must never have. So `VoidInvoice` uses the AND-only form above, and the OR headline belongs on a `GetInvoice` query:

```ts
import { or, and, AnonymousPermission, AuthenticatedPermission, ObjectOwnerPermission }
  from "@powerhousedao/switchboard-api-oo";

class GetInvoice extends GraphQLQuery<typeof GetInput, typeof InvoiceOut, "reactor" | "authz"> {
  readonly id = "invoice.get";
  readonly fieldName = "invoice";
  readonly sdl = `type Query { invoice(id: ID!): Invoice }`;
  readonly inputSchema = GetInput;                  // { id: string }
  readonly outputSchema = InvoiceOut;
  readonly requires = ["reactor", "authz"] as const;
  // The §7 headline: a PUBLIC-OR-OWNER read. The AllowAny branch makes the
  // read public; on a read that is the intent, not a footgun.
  readonly permissionClasses = [
    or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission())),
  ];
  getSubject(input: InferOut<typeof GetInput>) { return input.id; }
  getObjectAccess() { return "read" as const; }

  protected async handle(input, ctx, subject?: AuthorizedDocumentHandle) {
    return ctx.caps.reactor.get(subject!.fetchIdentifier);       // [FIXED 6] redacts ownerAddress
  }
}
```

The `GetInvoice` headline is evaluated by the pipeline at both `[FIXED 4]` and `[FIXED 5]`. `OrPermission` reproduces DRF's object-level short-circuit: the anonymous branch's `hasPermission`/`hasObjectPermission` are tried before the owner branch's, so a legitimately public read is not blocked by an owner check it was never meant to face. Carrying that same OR over to a write would silently make the write public — which is why the two endpoints deliberately do *not* share a composition.

### 5.5 `dispatch()` is final — one body, no per-wire drift

The only surfaces a transport primitive provides or overrides are `handle()` — the single **abstract** business hook — its wire adapter (`toResolver` / `toFetchHandler` / `attach`), and its per-transport `IExceptionFilter`. The wire adapters and `filter()` are concrete methods supplied by each L1 primitive (for example, `RestView.filter()` returns the `ERROR_HTTP` filter and `RpcService` renders through `ERROR_RPC`), not members of the base `Endpoint`. The pipeline is not among the overridable surfaces at all. Concretely:

- A `RestView` and a `GraphQLMutation` for the "same" invoice command both run the identical six stages — same authenticators resolved into `ctx.user`, same `StandardSchemaPipe(inputSchema)`, same `permissionClasses`, same closed output projection. They cannot diverge in *logic, validation, or authorization*, because there is one `ExecutionPipeline` and one `handle()` contract.
- What legitimately differs by wire is confined to the edges: how raw bytes become `raw` (a `Request` body, GraphQL `args`, an RPC `params`, a WS message), and how an `ApiError.code` renders (`ERROR_HTTP` 403 vs `ERROR_RPC` -32003) via the transport's `IExceptionFilter`.

> **Honest boundary (unlike SAF).** SOF *enables* but does not *force* cross-transport consistency for **hand-written** primitives. Two independently authored classes — a `RestView` and a `GraphQLMutation` — can still be given different `permissionClasses` or a different `inputSchema` by a careless author; the pipeline guarantees each *individually* runs all six stages, not that two hand-written siblings agree with each other. Only the `DocumentResource` factory (§12) manufactures a REST/GraphQL/WS/RPC family from **one** shared serializer + permission map, making drift structurally impossible. This is the deliberate price of class-first over SAF's project-once. An open question (§19) proposes a CI rule to flag two endpoints sharing a logical id across transports that do not originate from a shared resource.

### 5.6 Why the stages are non-removable

The pipeline hard-codes the three SAF structural guarantees so they cannot be individually defeated:

- **Deny-by-default (principle 1)** is enforced in three layers that the pipeline participates in: `Endpoint.permissionClasses` is an *abstract member* (omitting it fails to typecheck); `[FIXED 4]` throws `InternalError` if `normalize(permissionClasses)` yields an empty list at runtime; and `Router.build()` re-checks every registered endpoint before projection. The greppable, deliberate opt-out is `AllowAny` / `AnonymousPermission` — never silence. As §5.4 shows, that opt-out is powerful precisely because `hasPermission`/`hasObjectPermission` default to `true`, so it must be reserved for reads.
- **Fixed authz (principle 2)** — interceptors (`outer`/`inner`) *wrap* the pipeline but the pipeline calls them; they can observe or short-circuit, they cannot delete or reorder a `[FIXED]` stage. An `outer` interceptor runs before authentication and can reject (rate-limit, timeout); it can never reach a handler past a failed `[FIXED 4]`/`[FIXED 5]`, because the handler call is downstream of those throws inside `run`.
- **Fail-closed (principle 4)** — anonymous callers are *admitted* to the pipeline (authentication fails open to `ctx.user = undefined`) but *rejected* by authorization: `AuthenticatedPermission.hasPermission` returns false without a user, and `authorize.assert` throws `PermissionDenied`/`NotAuthenticated` rather than returning a null handle. Missing or unvalidated `driveId`, or an unresolved subject, deny rather than proceed.

> `dispatch()` and `ExecutionPipeline.run` are the load-bearing invariant of the whole framework. TypeScript has no `final` keyword, so "never override `dispatch()`" is enforced today by convention plus a lint rule, not the compiler — §19 tracks whether to additionally seal it as a construction-time closure (as SAF does) at the cost of a less idiomatic class shape. Everything else in SOF — the DRF generics, the NestJS-style interceptors, the transport primitives, the decorator sugar — is ergonomics layered on top of this one non-negotiable body.

---

## 6. Core kernel & dependency injection

Everything above `Endpoint` — the base every transport primitive in §9 subclasses — rests on a small, deliberately transport-agnostic **L0 vocabulary**: a validation boundary, a typed capability surface, and a two-layer dependency-injection scheme that is *reflection-free by construction*. No `reflect-metadata`, no `design:paramtypes`, no `experimentalDecorators` — none of which the monorepo has ever shipped (§17). This section specifies that kernel and argues why a **static** two-layer DI beats a runtime DI graph on the hot path. All names are used verbatim from `Appendix A`.

### 6.1 The validation boundary — `Schema` / `InferIn` / `InferOut` / `validateInput`

SOF is validator-agnostic: every schema is a [Standard Schema](https://standardschema.dev) value, so Zod, Valibot, ArkType, or a raw reactor value-type validator all satisfy `Schema<In, Out>` unchanged. `InferIn`/`InferOut` alias the *official* `StandardSchemaV1.InferInput/InferOutput` helpers — not a home-grown `S extends Schema<infer I>`, which silently degrades to `unknown` for some validators — and `validateInput` discriminates on `"value" in r` rather than casting at the single most security-load-bearing gate.

```ts
export type Schema<In = unknown, Out = In> = StandardSchemaV1<In, Out>;
export type InferIn<S extends Schema>  = StandardSchemaV1.InferInput<S>;
export type InferOut<S extends Schema> = StandardSchemaV1.InferOutput<S>;
// validateInput(schema, raw) → { ok: true; value } | { ok: false; issues }
```

> **Why this gate is genuinely load-bearing, not belt-and-suspenders.** At the reactor boundary `Action.input` is typed `unknown` and `Context.db` is `unknown`. There is **no** compiler-enforced input shape between wire bytes and reducers. The `StandardSchemaPipe` (§9) mounted on the FIXED pipeline stage (§5) is the *only* thing standing between them — which is also why input validation runs **before** object-level authorization, so `getSubject` sees typed input and `checked-id == fetched-id` can be enforced (§5, §12).

### 6.2 `Capabilities` — the typed DI surface

`Capabilities` is a plain, closed bag whose every key is a **real Powerhouse interface**. `CapabilityKey = keyof Capabilities` is the alphabet an endpoint draws its `requires` list from.

| Key | Type | Role |
| --- | --- | --- |
| `reactor` | `IReactorClient` | writes + small-N reads |
| `db` | `IRelationalDb` | read-only Kysely (scale reads) |
| `analytics` | `IAnalyticsStore` | metrics |
| `authz` | `IAuthorizationService` | the single authorization decision seam (§5, §7) |
| `pubsub` | `PubSub` | the `getPubSub()` singleton (§9 subscriptions) |

This is **Interface Segregation** made physical: an endpoint never receives a god-object. `TodoQuery` asks for `["db"]` and gets `Pick<Capabilities, "db">` — reaching for `ctx.caps.reactor` is a *compile* error, not a runtime surprise. And **Dependency Inversion**: primitives depend on `IReactorClient`/`IAuthorizationService` abstractions, never on a concrete Switchboard wiring.

### 6.3 Boot-time layer — the reflection-free `Container`

The host wires concrete implementations **once, at boot**, into a `Container`. Providers are Nest-style `useValue` / `useClass` / `useFactory` recipes, but dependencies are an **explicit `Token` list** (`deps` / `inject`) — *never* read from constructor `design:paramtypes`, which the monorepo cannot emit.

```ts
import { Container, REACTOR, DB, ANALYTICS, AUTHZ, PUBSUB, token } from "@powerhousedao/switchboard-api-oo";

const container = new Container()
  .provide({ token: REACTOR,   useValue: reactorClient })
  .provide({ token: DB,        useValue: relationalDb })
  .provide({ token: ANALYTICS, useValue: analyticsStore })
  .provide({ token: AUTHZ,     useValue: graphqlManager.getAuthorizationService() }) // existing GraphQLManager accessor
  .provide({ token: PUBSUB,    useValue: getPubSub() });

// A derived provider with an EXPLICIT deps list — the tokens ARE the graph edges.
const INVOICE_MAILER = token<InvoiceMailer>("invoice.mailer");
container.provide({
  token: INVOICE_MAILER,
  useFactory: (r, ps) => new InvoiceMailer(r, ps),
  inject: [REACTOR, PUBSUB],                 // resolved in order; no reflection
});

const caps: Capabilities = await container.toCapabilities(); // reads the five well-known tokens
```

`REACTOR`, `DB`, `ANALYTICS`, `AUTHZ`, and `PUBSUB` are the well-known tokens `toCapabilities()` reads to assemble the runtime bag. The `Token<T>` phantom `_t` carries `T` for `resolve()`'s return type without a nominal registry.

> **AUTHZ wiring is not blocked on §16.** `getAuthorizationService()` — like `getBasePath()` — is an accessor that **already exists** on `GraphQLManager`, so the AUTHZ capability is wireable today with no core change. Those two existing accessors are precisely the *pattern to follow* for the **new public accessors §16 still owes** (a public `IHttpAdapter` accessor and a `wsServer` accessor), which do **not** yet exist and which the REST/RPC/WS/webhook transports depend on (§11, §16). Only that host-wiring is future work; the authorization seam is not.

### 6.4 Request-time layer — capability narrowing

There is **no container resolution per request**. Once `toCapabilities()` has produced the bag, the only per-call operation is a `Pick`: `ProjectionRuntime.makeContext` (§13) hands the bag to a `CapabilityInjector` and narrows it against the endpoint's `requires` list.

```ts
const injector = new CapabilityInjector(caps);
const scoped   = injector.narrow(endpoint.requires); // Pick<Capabilities, TCaps> — a shallow property copy
```

`Endpoint.requires` is the *sole* driver of what `ctx.caps` contains, and its `TCaps` type parameter flows straight into `handle`:

```ts
class TodoQuery extends GraphQLQuery<typeof TodoIdIn, typeof TodoOut, "db"> {
  readonly id = "todo"; readonly fieldName = "todo";
  readonly sdl = `extend type Query { todo(id: ID!): Todo }`;
  readonly inputSchema = TodoIdIn; readonly outputSchema = TodoOut;
  readonly requires = ["db"] as const;                 // ← the ONLY narrowing driver
  readonly permissionClasses = [AuthenticatedPermission]; // §7 — abstract member, cannot be omitted

  protected async handle(input: InferOut<typeof TodoIdIn>, ctx: ExecutionContext<"db">) {
    // ctx.caps.db is IRelationalDb; ctx.caps.reactor is a COMPILE error — never provisioned.
    const row = await ctx.caps.db.selectFrom("todo").where("id", "=", input.id).executeTakeFirst();
    if (!row) throw new NotFound();
    return row;
  }
}
```

> **This snippet illustrates capability *typing* only — not a sanctioned read pattern.** A raw by-id `ctx.caps.db` read guarded solely by `AuthenticatedPermission` has no drive scoping and no object-level authorization, exactly the cross-drive/IDOR shape the framework closes elsewhere. Real reads flow through the drive-scoped `GenericView.getQuery` (which requires a validated `driveId`) and the object-authz / `DriveMemberPermission` path of §12, never by touching `ctx.caps.db` with an arbitrary id.

### 6.5 `ExecutionContext` — one context, every wire

`ExecutionContext` is SAF's `OperationContext` ⊕ Nest's `ExecutionContext`/`ArgumentsHost`: a **plain per-call object** carrying `user` (undefined ⇒ anonymous, authz fails closed — §5), the guarded `headers`, the *validated* `driveId`, an `AbortSignal`, the narrowed `caps`, the `authorize` seam (§5, the only sanctioned slug→`CanonicalDocumentId` path), and `ext` for context-middleware accretions. It also carries a two-part wire identity: `transport` is the **coarse** kind (`"graphql" | "rest" | "ws" | "rpc" | "webhook"`) returned by `getType()`, while `wire` is the **concrete channel label** for that kind (e.g. `"nats"`, `"sse"`). Its `getType()` / `switchToHttp()` / `switchToWs()` / `switchToRpc()` let one interceptor or exception filter branch per transport without knowing which primitive produced the context.

```ts
class RedactHeadersInterceptor implements IInterceptor {
  readonly name = "redact-headers"; readonly phase = "inner" as const;
  async intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O> {
    if (ctx.getType() === "rest") ctx.switchToHttp()?.request.headers.delete("authorization");
    if (ctx.getType() === "ws")   ctx.log({ socket: !!ctx.switchToWs()?.socket }); // read only; never mutate the shared server (§11)
    return next();
  }
}
```

> **Honest boundary.** `headers` is `undefined` on non-HTTP wires and `driveId` may be absent — both are `?`-optional precisely so callers guard before dereferencing rather than trusting a `!`. `switchTo*()` returns `undefined` off its transport; branch on `getType()` first. And note the WS branch only *reads* `switchToWs()?.socket`: the shared `WebSocketServer` is a one-time boot concern (§11) — a per-message inner interceptor must never mutate it.

### 6.6 Why static two-layer DI beats a runtime DI graph

| Runtime DI graph (Nest-style) | SOF static two-layer | Consequence |
| --- | --- | --- |
| Providers resolved lazily; a missing/mis-ordered dep is a **bootstrap resolution error** | `toCapabilities()` builds the bag once at boot; capabilities cannot fail to resolve mid-request | No per-request resolution errors; missing wiring fails loudly at startup |
| Tokens erase interfaces → wrong-token/`any`-injection footgun on the hot path | Narrowing is a typed `Pick<Capabilities, TCaps>`; `requires` drives both type and value | The type system, not a container, decides what a handler may touch |
| `REQUEST`-scoped providers propagate scope contagion up the graph | `ctx` is a plain object rebuilt per call; nothing is scope-tagged | No accidental request-lifetime singletons, no async-context leakage |

The boot-time `Container` exists only to wire the *host's* concrete services (and any derived providers) into the five capability tokens; it is never consulted on the request path. This keeps DIP intact — endpoints code against `Capabilities` interfaces — while paying zero reflection cost where latency matters. It is the mechanical complement to the deny-by-default and fixed-`ExecutionPipeline` guarantees of §5 and the drive-scoped, IDOR-closing generics of §12: static, greppable, and impossible to misconfigure into a resolution failure under load.

---

## 7. The permission system — DRF objects that are NestJS guards

SOF's authorization layer is one idea wearing two hats. To Django REST Framework it is a **permission object** with the two familiar hooks — a view/collection gate and an object/row gate — composable with the `&|~` algebra. To NestJS it is a **guard** whose `canActivate` decides whether the pipeline proceeds. SOF fuses them: `IPermission.hasPermission` *is* both `has_permission` and `canActivate`, and `hasObjectPermission` *is* `has_object_permission`. There is no third abstraction, no `@UseGuards` you can forget, and — per §8 — no way to reorder the stages where these hooks fire. Every builtin that makes a *document* authorization decision funnels to the single `IAuthorizationService` decision seam (§5) — the allow-any, presence-only, and custom-closure gates are the deliberate exceptions that touch no seam (§7.5) — so document authorization has exactly one place to be right or wrong.

### 7.1 `IPermission` — the two-hook object that is also a guard

```ts
export interface IPermission {
  hasPermission(ctx: ExecutionContext, view: Endpoint): boolean | Promise<boolean>;
  hasObjectPermission(ctx: ExecutionContext, view: Endpoint, handle: AuthorizedDocumentHandle): boolean | Promise<boolean>;
  and(o: IPermission): IPermission;   // &
  or(o: IPermission):  IPermission;   // |
  not(): IPermission;                 // ~
}
```

`hasPermission` is the **view-level** gate — it fires at FIXED stage 4 of the pipeline (§5), before any document is fetched, for *every* endpoint including list/collection reads. It answers "may this caller, in principle, reach this endpoint?" `hasObjectPermission` is the **object-level** gate — it fires at FIXED stage 5, and *only when a subject is present*, exactly as DRF only calls `check_object_permissions` after `get_object()`. Its third argument is the `AuthorizedDocumentHandle` returned by `ctx.authorize.assert(...)` — so an object permission never re-resolves a slug and never sees an id different from the one the handler will fetch (checked-id == fetched-id; the IDOR close, §5).

> **Faithful to DRF, not a reinvention.** The two hooks map name-for-name onto `rest_framework.permissions.BasePermission.has_permission` / `has_object_permission`, and the `view` argument is the `Endpoint` instance (DRF passes the `APIView`). The one deliberate widening: `hasObjectPermission` receives an `AuthorizedDocumentHandle` rather than a raw model instance, because in SOF the *authorizer* — not the ORM — is the thing that produced the object.

### 7.2 `BasePermission` — why both defaults return `true`

```ts
export abstract class BasePermission implements IPermission {
  hasPermission(_ctx: ExecutionContext, _v: Endpoint): boolean | Promise<boolean> { return true; }
  hasObjectPermission(_ctx: ExecutionContext, _v: Endpoint, _h: AuthorizedDocumentHandle): boolean | Promise<boolean> { return true; }
  and(o: IPermission): IPermission { return new AndPermission(this, o); }
  or(o: IPermission):  IPermission { return new OrPermission(this, o); }
  not():               IPermission { return new NotPermission(this); }
}
```

Both defaults return `true`, exactly as DRF's `BasePermission` does. This looks alarming for a deny-by-default framework, so the rationale is worth stating in full.

> **We explicitly reject the false-default (call it "Design C").** If `BasePermission` defaulted *both* hooks to `false`, a permission that only cares about the collection gate (say `DriveMemberPermission`, which has nothing to assert per-row) would silently deny every object-level check — and every *single-hook* permission would have to override the hook it doesn't use just to avoid vetoing the composition. In an `And`/`Or` tree that is a footgun: `AuthenticatedPermission & ObjectOwnerPermission` would fail because `AuthenticatedPermission.hasObjectPermission` returned `false`. Deny-by-default in SOF does **not** live in the permission object — it lives at the **`Endpoint`** level (§7.6: an abstract `permissionClasses` member, plus runtime and `Router.build()` backstops). A permission's job is to *contribute* a decision to a composition; the *absence* of a permission is what denies. Making the leaf default `true` is what keeps single-hook permissions composable — and it is what DRF does, so muscle memory transfers.

### 7.3 Composition — the `&|~` algebra, ported

Python overloads `&`, `|`, `~` via `BasePermission`'s metaclass; TypeScript has no operator overloading, so SOF exposes the same algebra three ways that all build the same composites:

```ts
// fluent (DRF instance style)
const p1 = new AuthenticatedPermission().and(new ObjectOwnerPermission());
// free helpers (variadic; reduce left-to-right)
const p2 = and(new AuthenticatedPermission(), new ObjectOwnerPermission());
// DRF permission_classes-flavored sugar
const p3 = P.all(new AuthenticatedPermission(), new ObjectOwnerPermission()); // P = { all: and, any: or, not }
```

`.and()`/`.or()`/`.not()` produce `AndPermission`/`OrPermission`/`NotPermission`; `and`/`or` `reduce` a variadic list; `P.all`/`P.any`/`P.not` are aliases for readers who think in `permission_classes`.

The composites evaluate **both** hooks structurally, and `OrPermission` reproduces DRF's crucial object-level short-circuit:

| Composite | `hasPermission` | `hasObjectPermission` |
|---|---|---|
| `AndPermission(a,b)` | `a.hasPermission && b.hasPermission` | `a.hasObjectPermission && b.hasObjectPermission` |
| `OrPermission(a,b)` | `a.hasPermission \|\| b.hasPermission` | `(a.hasPermission && a.hasObjectPermission) \|\| (b.hasPermission && b.hasObjectPermission)` |
| `NotPermission(a)` | `!a.hasPermission` | `!a.hasObjectPermission` |

> **The `Or` object-level detail is a real DRF bug-class fix, not a flourish.** DRF's `OR.has_object_permission` re-checks `has_permission` on each branch — `(a.has_permission(...) and a.has_object_permission(...)) or (b...)` — because a branch that only passed the *view* gate (and would have failed the *object* gate) must not "win" the OR at the object level. SOF ports that exact expression. A naive `a.hasObjectPermission || b.hasObjectPermission` would let an `AllowAny`-style branch (object gate `true`) mask a failing owner check on the other branch.
>
> **But the short-circuit only helps when the masking branch fails the *view* gate.** If a branch passes *both* gates — as `AllowAny`/`AnonymousPermission` does for everyone — then `(a.hasPermission && a.hasObjectPermission)` is `true` and that branch alone satisfies the OR; every other branch, owner check included, becomes dead code. This is exactly the trap traced honestly in §7.7: an `AllowAny` first branch does not "leak past the object gate on another branch's view pass" — it legitimately *is* public, so the composition reduces to public. Reach for the OR only when the first branch can actually fail.

### 7.4 `PermissionSpec` — a class *or* a pre-composed instance

```ts
export type PermissionSpec = IPermission | (new () => IPermission);
```

DRF's `permission_classes` is a **list of classes** it instantiates for you, and a list is an implicit AND. That muscle memory is worth keeping — but a class list cannot express `|` or `~` inline (you cannot write `AnonymousPermission | AuthenticatedPermission` as two list entries; that is an *and*). So SOF's `permissionClasses` accepts **either** form and the pipeline normalizes both: a bare class is `new`'d once and treated as an AND term; a pre-composed instance carries whatever `&|~` tree you built.

> **The dual form is a mild, deliberate footgun (§19 open question).** Two entries `[AuthenticatedPermission, ObjectOwnerPermission]` mean AND; a single entry `[or(new AnonymousPermission(), ...)]` means whatever the instance says. Mixing them is legal — `[DriveMemberPermission, or(a, b)]` is `DriveMemberPermission AND (a OR b)`. We keep the dual form because dropping classes would break DRF's list ergonomic and dropping instances would make `|`/`~` inexpressible. The rule of thumb: reach for a **class list** when you mean AND, and a **single composed instance** the moment an `or`/`not` appears.

### 7.5 The builtins — 1:1 with `IAuthorizationService`

Every builtin is a thin `BasePermission` subclass that overrides exactly the hook it needs and — *when its job is a document decision* — calls one `IAuthorizationService` method through `ctx.authorize`. The allow-any, presence-only, and custom-closure gates are the deliberate exceptions: they render a verdict without touching the seam. Nothing invents its own document-authorization logic.

| Permission | Hook(s) | `IAuthorizationService` call | Notes |
|---|---|---|---|
| `AllowAny` | — (both `true`) | none | greppable opt-out; == DRF `AllowAny` |
| `AnonymousPermission` | — | none | alias of `AllowAny`; the *intentional* public marker |
| `AuthenticatedPermission` | `hasPermission` | — (`ctx.user` present) | == `IsAuthenticated`; anonymous ⇒ `NotAuthenticated` |
| `AdminPermission` | `hasPermission` | `isSupremeAdmin` | == `IsAdminUser` |
| `CreatePermission` | `hasPermission` | `canCreate` | view-level; no subject exists yet |
| `DocumentPermission(access)` | `hasObjectPermission` | `canRead`/`canWrite`/`canManage` | object gate on the fetched handle |
| `ObjectOwnerPermission(access?)` | `hasObjectPermission` | owner check | `access` defaults to `"write"` |
| `OperationPermission(opType)` | `hasObjectPermission` | `canMutate` | restricted operation (e.g. `voidInvoiceAction`) |
| `DriveMemberPermission(access?)` | `hasPermission` | `canRead`/`canWrite` on drive | **view-level**; closes list IDOR (§7.6) |
| `DocumentEachPermission(access, subjects)` | `hasObjectPermission` | per-id `canRead`/`canWrite`/`canManage` | bulk; **every id fail-closed** before any write |
| `CustomPermission(check)` | `hasPermission` | your closure | escape hatch; still sees only `ctx` |

Two carry the sharpest SAF lessons. `DriveMemberPermission` is **view-level on purpose**: a collection read never fetches a per-row subject, so no `hasObjectPermission` runs on a list — DRF's own docs warn that `has_object_permission` is never called for `list`. Without a view-level drive check a merely-authenticated caller could point the `Drive-Id` header at another tenant's drive and read it. SOF closes that by *requiring* list-capable views to carry `DriveMemberPermission` (enforced by `Router.build()`, §7.6). `DocumentEachPermission` asserts **every** id in a bulk operation fail-closed before a single write lands, so a "am I logged in?" custom check can never be used to void 100 invoices the caller doesn't own.

> **`AdminPermission` is only as strong as the deployment's policy.** It calls `authz.isSupremeAdmin`, and under the reactor's **OPEN** authorization policy that method returns `true` for *everyone*. `AdminPermission` is a real gate only under a restrictive policy; on an OPEN reactor it is effectively `AllowAny`. This is a property of the seam SOF funnels to, not of SOF — but authors must not read `AdminPermission` as a hard wall in every deployment.

A worked object-level builtin (note it reads the handle's `canonicalId()` accessor — the `CanonicalDocumentId`-typed method the real `AuthorizedDocumentHandle` exposes — and passes `ctx.user?.address`, the `string` the `canRead/canWrite/canManage` signatures take), and the restricted-operation gate on the Invoice example:

```ts
// The example endpoint classes below elide the abstract Endpoint members that
// GraphQLField/GraphQLQuery/GraphQLMutation do NOT supply — `id`, `inputSchema`,
// `outputSchema` — for brevity; assume each is declared. Only the members that
// make the point are shown.
export class DocumentPermission extends BasePermission {
  constructor(private readonly access: Access) { super(); }
  async hasObjectPermission(ctx: ExecutionContext, _v: Endpoint, h: AuthorizedDocumentHandle) {
    const id = h.canonicalId();                 // CanonicalDocumentId — the checked == fetched id
    if (this.access === "read")  return ctx.authorize.svc.canRead(id, ctx.user?.address);
    if (this.access === "write") return ctx.authorize.svc.canWrite(id, ctx.user?.address);
    return ctx.authorize.svc.canManage(id, ctx.user?.address);
  }
}

// Only a manager may void an invoice — object-level canMutate on the void action.
class VoidInvoice extends GraphQLMutation<typeof VoidInput, typeof InvoiceOut, "reactor" | "authz"> {
  readonly id = "voidInvoice"; readonly fieldName = "voidInvoice"; readonly sdl = VOID_SDL;
  readonly inputSchema = VoidInput; readonly outputSchema = InvoiceOut;
  readonly permissionClasses = [new OperationPermission(voidInvoiceAction.type)];
  getSubject(input) { return input.invoiceId; }
  getObjectAccess() { return "manage" as const; }
  protected async handle(input, ctx, subject) { /* fetch subject!.fetchIdentifier, dispatch void */ }
}
```

### 7.6 Deny-by-default — three layers

SAF's `TAuth`-extends-`true` builder gate becomes three independent backstops. You have to defeat all three to ship an unauthorized endpoint, and defeating the first is a **compile error**:

1. **Compile-time — abstract member.** `Endpoint.permissionClasses` is `abstract readonly permissionClasses: readonly PermissionSpec[]`. A subclass that omits it does not typecheck. There is no default `[AllowAny]` (DRF's `DEFAULT_PERMISSION_CLASSES`); forgetting to declare authorization is not a runtime surprise, it is a red squiggle.

```ts
class LeakyView extends GraphQLQuery<typeof I, typeof O> {
  readonly id = "todo"; readonly fieldName = "todo"; readonly sdl = TODO_SDL;
  readonly inputSchema = I; readonly outputSchema = O;
  // all other abstract Endpoint members are present — ONLY permissionClasses is omitted,
  // so the single reported error is: TS2515 non-abstract class does not implement 'permissionClasses'
  protected async handle() { /* ... */ }
}
```

2. **Runtime — empty-list denial in the pipeline.** `permissionClasses = []` typechecks (it *is* a `readonly PermissionSpec[]`). So FIXED stage 4 of `ExecutionPipeline` treats an empty policy list as a hard **`InternalError` ("INTERNAL")**, never as "allow". An `as any` cast that erases the member reaches the same backstop.

3. **Boot-time — `Router.build()` re-check.** `Router.build()` walks every registered endpoint and throws if any has an empty policy, *and* additionally enforces that every list-capable view carries a drive-scoping `DriveMemberPermission` (§7.5) and that every serializer output is a closed schema (§8). Deny-by-default and the IDOR-close are both re-verified before the first request is served.

The *only* way through is the explicit, greppable opt-out: `new AnonymousPermission()` (or its base `AllowAny`, or the `@Public()` decorator sugar, §17). A reviewer greps one token to find every public surface.

### 7.7 The headline composition

The composition SOF is designed to make ordinary — "anonymous callers *or* an authenticated owner" — is exactly the shape a class list cannot express, and exactly what `PermissionSpec`-as-instance unlocks:

```ts
// AnonymousPermission | (AuthenticatedPermission & ObjectOwnerPermission)
const policy = or(
  new AnonymousPermission(),
  and(new AuthenticatedPermission(), new ObjectOwnerPermission()),
);

class GetInvoice extends GraphQLQuery<typeof GetInput, typeof InvoiceOut, "authz" | "reactor"> {
  readonly id = "invoice";
  readonly fieldName = "invoice";
  readonly sdl = INVOICE_SDL;
  readonly inputSchema = GetInput;                  // abstract Endpoint members, declared
  readonly outputSchema = InvoiceOut;
  readonly permissionClasses = [policy];            // one composed instance, not an AND-list
  getSubject(input) { return input.id; }
  getObjectAccess() { return "read" as const; }
  protected async handle(input, ctx, subject) {
    // getSubject returns a value, so FIXED stage 5 resolves the handle via
    // authorize.assert("read", input.id, ctx) BEFORE any hasObjectPermission runs —
    // the fetch is unconditional and independent of which OR branch matches.
    // The OR short-circuit governs only the DECISION over that already-resolved handle.
    return this.serializer!.toRepresentation(await fetchInvoice(subject!.fetchIdentifier, ctx), ctx);
  }
}
```

Trace it against the pipeline, honestly. At stage 4, `OrPermission.hasPermission` is `AnonymousPermission.hasPermission (true) || (...)`, so *everyone* clears the view gate — the endpoint is reachable anonymously. At stage 5 the handle has already been resolved by `authorize.assert` (because `getSubject` returned `input.id`), and the object gate applies the short-circuit from §7.3: `(anon.hasPermission && anon.hasObjectPermission)` is `(true && true) = true` **for every caller**, because `AnonymousPermission` extends `AllowAny` and both its hooks return `true`. The OR is therefore satisfied by the first branch for everyone, and the second branch — `AuthenticatedPermission & ObjectOwnerPermission` — is **inert on this endpoint**: its `ObjectOwnerPermission.hasObjectPermission` is never the deciding term and denies no one. On a *read* query like this, the composition simply reduces to **public read**. That is the correct, intended behaviour for an anonymously-readable invoice — but it means the owner check here is documentation of intent, not an active gate.

> **When does the `AND`-branch actually become load-bearing?** Only where the OR's first branch can genuinely *fail*, so control reaches the second branch. Two shapes make that happen: (a) the AND-branch is the *sole* policy on a write/mutation endpoint (e.g. the invoice `edit` mutation carries `[and(new AuthenticatedPermission(), new ObjectOwnerPermission())]` with no anonymous alternative — an authenticated non-owner then hits `ObjectOwnerPermission.hasObjectPermission`, which calls the authorizer and denies fail-closed); or (b) branch A is a *conditional* permission rather than `AllowAny` — say `DriveMemberPermission | (AuthenticatedPermission & ObjectOwnerPermission)`, where a caller who is not a drive member falls through to the owner branch. Pair an unconditional `AllowAny`/`AnonymousPermission` with an `OR` and you have written public access with a decorative second branch; that is only ever what you want when public access *is* the intent.

> **What SOF still will not do for you.** Everything above governs a *single* `Endpoint`. Two hand-written primitives for the "same" concept — a `RestView` and a `GraphQLQuery` for an invoice — can carry *different* `permissionClasses` and drift, because SOF does not force cross-transport consistency for hand-written classes. Only the `DocumentResource` factory (§12) shares **one** `CrudPermissionMap` across every emitted transport, so the primitives it manufactures cannot disagree. If you hand-write, you own keeping the policies aligned (§19 proposes a CI rule that flags same-logical-id endpoints not originating from a shared resource).

---

## 8. Serializers — Standard Schema DTOs + field-level security + closed output

`Serializer` is SOF's port of DRF's `ModelSerializer`, and it carries the single most security-critical guarantee in the framework: **the closed-output projection** (the field-leak guard, §10.6 of the SAF sibling; enforced here as FIXED pipeline stage 6, §5). A serializer answers three questions with one object — *what shape goes out on the wire*, *what shape may come in on a write*, and *how a validated write becomes a reactor mutation* — and it does so without ever trusting a validator's default unknown-key behavior to keep a secret. Where DRF collapses read/write asymmetry into a single field list annotated `read_only=` / `write_only=`, SOF splits it into **distinct schemas** (`output` / `create` / `update` / `filter`), because Standard Schema validators do not share DRF's field metaclass and because two separate schemas cannot be mixed up at a call site the way one annotated field list can.

### 8.1 The `ISerializer` shape — four schemas, one source of truth

`Serializer<TOut, TCreate, TUpdate, TFilter>` (locked contract, Appendix A §7) is generic over four Standard Schemas. Only `output` is abstract/required; the write schemas default off one another (create←output, update←create) and `filter` defaults to a bare `Schema`, so a read-only resource declares just `output`.

```ts
export interface ISerializer<
  TOut extends Schema, TCreate extends Schema = TOut,
  TUpdate extends Schema = TCreate, TFilter extends Schema = Schema,
> {
  readonly output: TOut;                 // read shape — FIXED output stage projects to EXACTLY these keys
  readonly create?: TCreate;             // create body DTO (mass-assignment closure)
  readonly update?: TUpdate;             // update patch DTO
  readonly filter?: TFilter;             // list query DTO
  readonly sortable?: readonly string[];
  readonly fieldGuards?: Partial<Record<keyof InferOut<TOut> & string, (ctx: ExecutionContext) => boolean>>;
  toRepresentation(instance: unknown, ctx: ExecutionContext): Promise<InferOut<TOut>>;
  toInternalValue(data: unknown, mode: "create" | "update", ctx: ExecutionContext): Promise<InferOut<TCreate> | InferOut<TUpdate>>;
}
```

The frozen contract declares `filter?` as merely optional — nothing more. (Separately, as a §10 `GenericView`/`ReadBinding` *design convenience* — not a contract behavior — an omitted `filter` may be populated from `read.filterable`; that derivation lives in the L2 batteries, not in `ISerializer` itself.)

| DRF `ModelSerializer` | SOF `Serializer` | Note |
|---|---|---|
| `Meta.fields` + `read_only_fields` | `output` schema | server-owned keys live only in `output` |
| `write_only=True` field | key present in `create`/`update`, **absent from `output`** | a password/secret is structurally un-readable |
| `read_only=True` field | key present in `output`, **absent from `create`/`update`** | over-posting is impossible, not merely ignored |
| `to_representation()` | `toRepresentation()` | closed allowlist pick, §8.3 |
| `to_internal_value()` | `toInternalValue()` | mass-assignment closure, §8.4 |
| `create()` / `update()` | `create_()` / `update_()` | reactor persistence hooks, §8.5 |
| field-level `read_only`/`write_only` + object-level visibility (NestJS `ClassSerializerInterceptor` / `@Expose` groups) | `fieldGuards` | per-field context predicate, §8.2 |

The Invoice serializer (`@acme/invoice-model`, our canonical CRUD resource) subclasses the abstract base. Note that `ownerAddress` — an internal field that MUST NOT leak — never appears in *any* schema:

```ts
import {
  Serializer, validateInput, InternalError, ValidationError, type ExecutionContext,
} from "@powerhousedao/switchboard-api-oo";
import type { PHDocument, Action } from "@powerhousedao/shared/document-model";
import type { AuthorizedDocumentHandle } from "@powerhousedao/reactor-api/services/authorization.service";
import { makeInvoiceDocument, editInvoiceAction, type InvoiceRow } from "@acme/invoice-model";
import { z } from "zod";

const InvoiceOutput = z.object({
  id: z.string(), number: z.string(), status: z.enum(["draft", "open", "paid", "void"]),
  counterparty: z.string().optional(),                  // guarded — optional so redaction re-validates
  amount: z.number(), currency: z.string(),
  dueDate: z.string(), createdAtUtc: z.string(), updatedAtUtc: z.string(),
}).strict();                                             // ownerAddress is NOT a key here — it cannot leak
const InvoiceCreate = z.object({
  number: z.string().min(1), counterparty: z.string().min(1),
  amount: z.number().positive(), currency: z.string().length(3), dueDate: z.string(),
}).strict();                                             // no `status`, no `id` — server-owned, un-postable
const InvoiceUpdate = InvoiceCreate.partial();
const InvoiceFilter = z.object({ status: z.string().optional(), counterparty: z.string().optional() }).strict();

class InvoiceSerializer extends Serializer<
  typeof InvoiceOutput, typeof InvoiceCreate, typeof InvoiceUpdate, typeof InvoiceFilter
> {
  readonly output = InvoiceOutput;
  readonly create = InvoiceCreate;
  readonly update = InvoiceUpdate;
  readonly filter = InvoiceFilter;
  readonly sortable = ["amount", "dueDate", "createdAtUtc"] as const;
  readonly fieldGuards = { counterparty: (ctx: ExecutionContext) => Boolean(ctx.user) };
  // toRepresentation / toInternalValue / create_ / update_ below (same module) …
}
```

### 8.2 `fieldGuards` — per-field object-level visibility

`fieldGuards` is the `write_only` / NestJS `ClassSerializerInterceptor` analog, extended with an `ExecutionContext` predicate so visibility can depend on identity, drive membership, or any capability the endpoint declared. Each guard is keyed on an `output` field and returns `true` to keep it. In the Invoice example, `counterparty` is present in the wire shape only for authenticated callers; anonymous readers see it dropped. This is **object-level, not view-level** redaction: it runs inside `toRepresentation` per instance, so a single list response can reveal a field on rows the caller owns and hide it on rows they do not (compose the predicate with the handle passed in `ctx.ext` when the endpoint sets one).

> **Guarded fields must be `optional`/`nullable` in the `output` schema.** Redaction *removes* the key, and the projection re-validates against `output` (§8.3). A guarded field declared required would fail its own closed-output re-parse the moment a guard denies it — surfacing as `INTERNAL`, not a silent leak. That failure mode is deliberate: fail-closed beats fail-open.

### 8.3 `toRepresentation` — the CLOSED allowlist projection

This is the field-leak guard. SOF does **not** rely on `.strict()` or a validator stripping unknown keys — Zod and Valibot strip, ArkType does not by default, and none of that is a security contract. `toRepresentation` builds the output object from an explicit allowlist of source fields, parses it through `output`, and returns **exactly** the declared keys with guarded fields redacted:

```ts
async toRepresentation(instance: unknown, ctx: ExecutionContext): Promise<InferOut<typeof InvoiceOutput>> {
  const row = instance as InvoiceRow;
  // 1. Copy ONLY declared output keys off the source. row.ownerAddress is never referenced.
  const candidate = {
    id: row.id, number: row.number, status: row.status, counterparty: row.counterparty,
    amount: row.amount, currency: row.currency,
    dueDate: row.dueDate, createdAtUtc: row.createdAtUtc, updatedAtUtc: row.updatedAtUtc,
  };
  // 2. Redact guarded fields BEFORE re-validation (deny-by-default per field).
  for (const [field, keep] of Object.entries(this.fieldGuards ?? {})) {
    if (!keep(ctx)) delete (candidate as Record<string, unknown>)[field];
  }
  // 3. Parse THROUGH output: type-checks the projection and drops anything not in the schema.
  const parsed = await validateInput(this.output, candidate);
  if (!parsed.ok) throw new InternalError("output projection failed", parsed.issues);
  return parsed.value;   // exactly the closed key set — the ONLY object the wire ever sees
}
```

The FIXED output stage of the `ExecutionPipeline` (§5) calls `toRepresentation` on every handler result — query rows, mutation results, and each yielded subscription frame — so a `SELECT *` read model or a full `PHDocument` state can never bypass the projection. `Router.build()` (§13) additionally **rejects a serializer whose `output` is not provably closed** (an open/passthrough schema), so the guarantee is checked at boot, not merely at request time.

### 8.4 `toInternalValue` — mass-assignment closure

The write mirror. `toInternalValue` parses raw wire input through `create` or `update` and returns only those keys, closing over-posting: a client cannot set `status`, `id`, `ownerAddress`, or `createdAtUtc` on a write because those keys exist in no write schema. This runs at FIXED pipeline stage 3 (input validation, *before* object-level authz, §5) so that `getSubject` and `getObjectAccess` (§5) see typed, closed input.

```ts
async toInternalValue(data: unknown, mode: "create" | "update", ctx: ExecutionContext) {
  const schema = mode === "create" ? this.create! : this.update!;
  const parsed = await validateInput(schema, data);   // throws ValidationError → 400 / -32602
  if (!parsed.ok) throw new ValidationError("Invalid invoice payload", parsed.issues);
  return parsed.value;                                 // no server-owned key can survive
}
```

> **Why two schemas, not one annotated field.** DRF's `read_only`/`write_only` share a field list, so a mis-set flag silently opens a write path. SOF makes the write surface a physically separate schema: the compiler, not a runtime flag, is the boundary. Adding a field to `output` grants read; adding it to `create`/`update` grants write; neither implies the other.

### 8.5 `create_` / `update_` — reactor persistence hooks

`create_` and `update_` are the `perform_create` / `perform_update` analogs, and they are the only place a serializer touches the write substrate. They require the `"reactor"` capability (typed `ExecutionContext<"reactor">`, §6) and map validated DTOs onto `IReactorClient`.

```ts
// perform_create → reactor.create (flat model) or reactor.createEmpty (+ Action[]) for container models.
async create_(v: InferOut<typeof InvoiceCreate>, ctx: ExecutionContext<"reactor">): Promise<PHDocument> {
  const doc = makeInvoiceDocument({
    number: v.number, counterparty: v.counterparty,
    amount: v.amount, currency: v.currency, dueDate: v.dueDate,
    ownerAddress: ctx.user!.address,        // server-derived, never client-supplied
  });
  return ctx.caps.reactor.create(doc);
}

// perform_update → execute(Action[]) against the AUTHORIZED handle (checked-id == fetched-id, §5).
async update_(handle: AuthorizedDocumentHandle, patch: InferOut<typeof InvoiceUpdate>, ctx: ExecutionContext<"reactor">): Promise<Action[]> {
  const actions = [editInvoiceAction({ ...patch })];
  await ctx.caps.reactor.execute(handle.fetchIdentifier, actions);   // fetch the id authz resolved
  return actions;
}
```

Two invariants ride here. First, `ownerAddress` is stamped from `ctx.user`, never from the DTO — the write schema having no such key (§8.4) makes that structural. Second, `update_` applies actions to `handle.fetchIdentifier` — the identifier the authorizer resolved and checked (§5) — never to a re-derived or client-echoed id, closing IDOR.

> **Async writes are not a hook concern.** The hand-written hooks' return types are *fixed* by the locked contract — `create_(): Promise<PHDocument>` and `update_(): Promise<Action[]>` — so a hook can never itself return a `JobInfo`. Asynchronous execution is instead the *declarative* `WriteBinding.async` path on the `DocumentResource` factory / `DocumentModelViewSet` (§12): when `WriteBinding.async` is set, the generated write calls `reactor.executeAsync` and returns a `JobInfo` envelope. Choosing async is therefore a factory/viewset configuration decision, not something a bespoke `create_`/`update_` opts into.

### 8.6 `DocumentSerializer.fromDocumentModel` — DTOs auto-derived from the model

`DocumentSerializer` is the true `ModelSerializer`: rather than hand-writing four schemas, it introspects a `DocumentModelModule` and derives them from the model's state schema, honoring server-owned read-only fields. This is the ergonomic that `DocumentModelViewSet` and the `DocumentResource` factory (§12) build on so that generated primitives cannot drift.

```ts
import { DocumentSerializer } from "@powerhousedao/switchboard-api-oo";
import { todoModel } from "@acme/todo-model";

const TodoSerializer = DocumentSerializer.fromDocumentModel(todoModel, {
  fields: "__all__",
  readOnly: ["id", "createdAtUtc", "updatedAtUtc"],          // in output, absent from create/update
  writeOnly: [],                                             // (none for Todo)
  fieldGuards: { assigneeAddress: (ctx) => Boolean(ctx.user) },
});
```

`fromDocumentModel` reads `model.documentModel` (the model spec, canonically `@powerhousedao/shared/document-model`) to enumerate state fields, then applies `read_only`/`write_only` as the split into `output` vs `create`/`update` — exactly DRF's `get_fields` introspection. Its `toRepresentation`/`toInternalValue`/`create_`/`update_` are generated to the same closed-projection contract as a hand-written `Serializer`, so §8.3–§8.5 hold identically.

> **Honest boundary.** `fromDocumentModel` derives DTOs from the document *model state*, not from a `RelationalDbProcessor` read row. When a `GenericView` (§12) reads a projected `Row` for scale, the derived `output` keys must be a subset of that `Row` — a mismatch surfaces at type-check and again at `Router.build()`. And unlike SAF, SOF only *enables* cross-transport consistency for hand-written serializers; it is the `DocumentResource` factory (§12) — sharing exactly one serializer instance across every emitted primitive — that *guarantees* the same closed output on REST, GraphQL, WS, and RPC. Two hand-written primitives for the "same" concept can still declare different serializers, so prefer the factory when a resource spans transports.

---

## 9. Pipes, validation & input hardening

A **pipe** in SOF is a transform placed between wire bytes and a handler — the NestJS `PipeTransform` role. Unlike NestJS, where a `ValidationPipe` is *opt-in* — registered globally, per-method, or per-parameter, and therefore easy to forget — SOF has exactly one pipe that matters and it runs *unconditionally*: `StandardSchemaPipe`, bound to `Endpoint.inputSchema`, executed as FIXED stage 3 of every `ExecutionPipeline` (§5). This section specifies that stage as fixed behaviour, and states honestly where input hardening is guaranteed by the framework versus where it is a property of the schema you author.

### 9.1 The pipe contract: `IPipe` and `StandardSchemaPipe`

`IPipe<In, Out>` (Appendix A) is a single `transform(value, meta, ctx)` method — the same shape as a Nest pipe, minus the metadata reflection Nest reads from `design:paramtypes` (which the monorepo does not enable, §12). The only builtin pipe is `StandardSchemaPipe`, which wraps a `StandardSchemaV1` schema and emits its **output** value or throws `ValidationError` (code `"VALIDATION"` → HTTP 400 / RPC −32602, Appendix A §3):

```ts
import { z } from "zod";                    // any StandardSchemaV1 validator — Zod/Valibot/ArkType; SOF adds no runtime dep
import { StandardSchemaPipe, type ArgMeta, type ExecutionContext } from "@powerhousedao/switchboard-api-oo";

// A CLOSED object schema for the Invoice `send` mutation. `.strict()` REJECTS unknown keys.
const SendInvoiceInput = z.object({
  invoiceId: z.string().uuid(),
  channel:   z.enum(["email", "portal"]),
  note:      z.string().max(2_000).optional(),
}).strict();                               // ← the forbidNonWhitelisted analog lives HERE, in the schema (see §9.4)

// What ExecutionPipeline does at FIXED stage 3, for EVERY endpoint — you never write this:
const pipe  = new StandardSchemaPipe(SendInvoiceInput);
const input = await pipe.transform(rawArgs, { source: "args" } satisfies ArgMeta, ctx);
//    ^ typed InferOut<typeof SendInvoiceInput>, or ValidationError is thrown and rendered by the filter
```

Because the boundary is `StandardSchemaV1`, SOF is validator-agnostic and carries no validator dependency: the schema author chooses. `validateInput`/`InferOut` (Appendix A §1) are the same primitives SAF exposes.

### 9.2 The fixed stage is bound to `inputSchema` and cannot be removed

`Endpoint.inputSchema` is an **abstract member** — a primitive that does not declare it does not typecheck — and the pipeline instantiates `new StandardSchemaPipe(this.inputSchema)` itself. There is no per-parameter attach step and therefore nothing to forget. Contrast Nest, where validation is opt-in and the hardening flags can be omitted, so a forgotten pipe silently forwards a raw body:

```ts
// NestJS — validation is OPT-IN; omit the pipe and the DTO is unchecked, untyped:
@Post() send(@Body() dto: SendInvoiceDto) { /* dto never validated */ }
// even when registered, the hardening flags (whitelist / forbidNonWhitelisted) are omittable:
@Post() send(@Body(new ValidationPipe({ whitelist: true })) dto: SendInvoiceDto) { /* must remember, every time */ }
```

> **Non-removable, not merely default.** Interceptors wrap the pipeline (`outer`/`inner`, §10) but cannot delete or reorder a FIXED stage, and there is no `@UseGuards`/`@UsePipes` opt-out surface. The stage also runs **before** view- and object-level authorization (FIXED 3 → 4 → 5), so `getSubject` and every `hasObjectPermission` (§7) see *typed* input — the property that lets object-level checks enforce `checked-id == fetched-id` and close IDOR (§5, Appendix A §5).

### 9.3 `ArgMeta`: source discrimination without parameter decorators

Stage-3 decorators cannot express parameter injection (no `@Body`/`@Param`/`@Args`, §17), so SOF does not split input across per-param pipes. Each transport adapter instead **merges its wire slots into one `input` object** and validates it with the single `inputSchema` in one `transform` call. That call receives one merged value and one `ArgMeta` carrying a single `source`, so `ArgMeta.source` conveys **coarse, transport-level provenance** — enough for source-aware coercion (e.g. path params arrive as strings and are numeric-coerced) — not per-key attribution back to param vs query vs body:

| Transport primitive | Wire slots merged into `input` | `ArgMeta.source` (one representative value per call) |
| --- | --- | --- |
| `RestView` / `GenericView` | path params, query string, body | one of `"param"` / `"query"` / `"body"` — the adapter's representative slot, not per-key |
| `GraphQLQuery`/`Mutation`/`Subscription` | resolver `args` | `"args"` |
| `WebSocketGateway` | subscribe message payload | `"message"` |
| `RpcMethod` | JSON-RPC `params` | `"rpc"` |
| `InboundWebhook` | verified request body | `"body"` |

`ArgMeta` is descriptive, not a validator selector: one `inputSchema` still owns the whole shape, and for a merged REST input the adapter passes a single representative `source` rather than tagging each key with its slot. This is the deliberate simplification over Nest's param-decorator model — one schema per endpoint, one obvious way to validate.

### 9.4 Input hardening is a property of the schema, not a flag

Nest offers `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — **flags** you can omit. SOF has no such knob. Unknown-key stripping (whitelist) and rejection (`forbidNonWhitelisted`) are expressed in the schema itself: `z.object` strips by default, `.strict()` rejects. `StandardSchemaPipe` always returns the validator's **output** value, never the raw input — so whatever hardening the schema encodes is *always on* and structurally un-forgettable.

> **Honest boundary.** SOF forces the *output* projection closed regardless of validator (the serializer explicitly picks declared keys and redacts `fieldGuards`, §8) — but it cannot force *input* unknown-key stripping across every validator, because ArkType, for example, does not strip by default. Hardening is therefore your schema-authoring discipline: write closed object schemas. The guarantee is only as tight as the schema — a lint rule could flag obviously permissive input schemas, but the framework does not backstop input shape (`Router.build()` (§13) backstops only non-empty policy, list drive-scoping, and closed *output* schemas). This is the one place SOF trades a hard structural guarantee for validator-agnosticism.

### 9.5 Why this gate is genuinely load-bearing

At the reactor boundary `Action.input` is typed `unknown` and `Context.db` is `unknown` — there is no compiler-enforced input shape between the wire and the reducers. Whatever `StandardSchemaPipe` emits at FIXED stage 3 is *exactly* what the handler hands to `reactor` writes. A passthrough or open schema would forward attacker-controlled keys straight into reducer state; a closed one cannot. The validation stage is not belt-and-suspenders — it is the *only* thing standing between bytes and reducers (Input-Hardening principle, §14). That is why `inputSchema` is abstract, why the stage is fixed, and why the pipe emits the parsed value and never the raw.

---

## 10. Interceptors & the plugin/cross-cutting system

Cross-cutting concerns — logging, tracing, timeouts, response caching — are `IInterceptor`s. An interceptor is **around-advice**: it receives the `ExecutionContext` and a `next` continuation, and it decides whether, when, and how to call it. Interceptors wrap the fixed pipeline (§5), but — exactly as SAF's plugins wrap the fixed `safeParse`/`authorize` stages — they can never unseat, reorder, or delete a stage. This is the OO carry of SAF's two-phase plugin system: `outer`/`inner` replaces RxJS pipe-position, and a DRF-style `throttleClasses` slot is kept **distinct** from interceptors so load-shedding is a fixed pipeline stage, not author-supplied advice. (Field **redaction** is deliberately *not* on that list: it is enforced by the FIXED output-projection stage F6 — `Serializer.toRepresentation` + `fieldGuards` (§8) — which, like an `inner` interceptor, sees the authorized identity, but is a non-removable pipeline stage, not author-supplied advice, and there is no `RedactionInterceptor` builtin.)

### 10.1 The around-advice shape — Promise-based, no RxJS

```ts
export type Next<O> = () => Promise<O>;
export type InterceptorPhase = "outer" | "inner";
export interface IInterceptor {
  readonly name: string;
  readonly phase: InterceptorPhase;
  intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>;
}
```

> **Divergence from NestJS (deliberate).** Nest's `NestInterceptor.intercept()` returns an `Observable` and you position work with `.pipe(tap(...), map(...))`; before/after is a property of the RxJS stream. **No Powerhouse package takes a direct `rxjs` dependency** (verified across every `package.json`) — `rxjs` appears only transitively in `pnpm-lock.yaml`, pulled in by dev tooling such as `concurrently`, and never on SOF's own runtime path. So SOF's `intercept` is a plain `Promise` around-advice — "before" is code before `await next()`, "after" is code after it, short-circuit is *not* calling `next`. Same expressive power for this problem, no `rxjs` in the framework's own dependency surface, and no cold/hot-observable subscription footguns.

### 10.2 Phases: `outer` (pre-authz) vs `inner` (post-authz)

The pipeline nests the two phases around the fixed stages. `outer` interceptors wrap the **whole** dispatch, so they run before authentication and observe *rejected* calls (a `RATE_LIMITED` throttle, a `FORBIDDEN` authz denial); `inner` interceptors wrap **only the handler**, so they run after object-authz and see the **authorized** `ctx.user` and subject handle.

```text
⟩ outer interceptors ─────────────────────────────────────────────────────┐
│  [F1] authenticate → [F2] throttle → [F3] validate → [F4] view-authz →   │
│  [F5] object-authz →  ⟩ inner interceptors ⟩ [HANDLER] ⟨ inner ⟨          │
│  → [F6] closed output projection                                          │
└──────────────── catch → filter.catch(ApiError.code → wire) ⟨ outer ⟨ ────┘
```

| Concern | Phase | Sees | Why |
|---|---|---|---|
| logging / tracing | `outer` | rejected + accepted calls | must record a 403/429 that never reaches the handler |
| request timeout / envelope | `outer` | the whole call | must bound authz + handler wall-time |
| response cache | `inner` | authorized identity, subject | key must include the caller authz depends on |
| field redaction | **F6 (fixed, post-`inner`)** | authorized identity | serializer `fieldGuards` (§8) run per authorized caller — *not an interceptor* |

Header-keyed interceptors (e.g. a trace-propagation `outer`) MUST guard on `ctx.headers` / `ctx.wire`: a non-HTTP wire (`"nats"`, `"sse"`) has no `Headers` (§4).

### 10.3 Short-circuit vs wrap

An interceptor **wraps** by calling `next()` inside its own logic, or **short-circuits** by returning a value without ever calling it. `TimeoutInterceptor` wraps (races `next()` against a clock); `CacheInterceptor` short-circuits (a hit never calls `next`, so the handler and its reactor reads never run).

```ts
// Todo query: cache hits skip the handler entirely; on a fixed 200ms budget.
class GetTodo extends GraphQLQuery</* … */> {
  readonly fieldName = "todo";
  readonly permissionClasses = [new AuthenticatedPermission(), new DocumentPermission("read")];
  readonly interceptors = [
    new TimeoutInterceptor(200),   // outer  → INTERNAL/RATE-safe abort via ctx.signal
    new CacheInterceptor(5_000),   // inner  → post-authz, per-caller
  ];
  protected async handle(input, ctx, subject) { /* … */ }
}
```

> **Cache correctness (adapted from SAF §9).** Because `CacheInterceptor` is `inner` (post-authz), its key MUST include **everything authorization depends on** — `endpoint.id`, `ctx.driveId`, `ctx.user?.address`, and the validated input — so a hit is only ever served to a caller who would have passed the same authz check for that subject.
> Redaction is a **separate** matter, and it is important to be precise about where it happens: an `inner` cache hit short-circuits **only the handler** (it sits downstream of object-authz, §10.7), *not* the fixed output projection. Per the §5 pipeline, F6 (`Serializer.toRepresentation` + `fieldGuards`, §8) runs **after** the `inner` interceptors and **re-runs per caller on every hit** — so the cache stores **pre-redaction** handler output, and F6 re-applies each caller's field guards afterward. A value redacted for one caller therefore cannot be emitted to another *from the cache*, because the cache never held the redacted form.
> Keying on the redaction-relevant surface — and **refusing the cache on any endpoint whose serializer declares `fieldGuards`** unless the guard inputs are in the key — is kept as a **conservative defense** (it protects against an author who redacts *inside* the handler rather than in F6), not a correctness necessity given F6 always re-projects.

### 10.4 Builtins

`LoggingInterceptor` (`outer`), `TimeoutInterceptor(ms)` (`outer`), `ObservabilityInterceptor` (`outer`, emits to an `IAnalyticsStore` / OpenTelemetry), and `CacheInterceptor(ttlMs)` (`inner`). `LoggingInterceptor` and `ObservabilityInterceptor` are the **recommended app-wide defaults** — the author wires them once via `SwitchboardOO.use` (§10.6); the rest are opt-in per endpoint.

Because an app-wide interceptor runs across **every** endpoint, it cannot read `ctx.caps`: `ctx.caps` is `Pick<Capabilities, TCaps>` and is present only when an endpoint's `requires` list names the key (§2), which no app-wide interceptor can assume. `ObservabilityInterceptor` therefore receives its `IAnalyticsStore` by **constructor injection at boot** — resolved from the reflection-free `Container` (§6) — and never reads `ctx.caps.analytics`. All four are plain classes — no decorator, no metadata:

```ts
class LoggingInterceptor implements IInterceptor {
  readonly name = "logging"; readonly phase = "outer" as const;
  async intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O> {
    const t0 = performance.now();
    try { const out = await next(); ctx.log({ id: ctx.wire, ok: true, ms: performance.now() - t0 }); return out; }
    catch (e) { ctx.log({ ok: false, ms: performance.now() - t0, code: (e as ApiError)?.code }); throw e; }
  }
}

class ObservabilityInterceptor implements IInterceptor {
  readonly name = "observability"; readonly phase = "outer" as const;
  // IAnalyticsStore injected at boot from the Container — NOT ctx.caps.analytics,
  // because this runs app-wide and no endpoint's `requires` gates it in.
  constructor(private readonly analytics: IAnalyticsStore) {}
  async intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O> {
    const t0 = performance.now();
    try { const out = await next(); this.analytics.record({ wire: ctx.wire, ok: true, ms: performance.now() - t0 }); return out; }
    catch (e) { this.analytics.record({ wire: ctx.wire, ok: false, ms: performance.now() - t0, code: (e as ApiError)?.code }); throw e; }
  }
}
```

### 10.5 Throttles are a distinct slot, not interceptors

Rate-limiting is **not** an interceptor in SOF. It is `Endpoint.throttleClasses: readonly IThrottle[]`, a DRF `throttle_classes` port, evaluated at **fixed stage F2 — before input parse** to shed load (§5; DRF runs throttles *after* permissions, SOF sheds first, matching SAF's outer-plugin intent). Keeping it a fixed slot rather than an author-supplied `outer` interceptor means an endpoint cannot accidentally omit or reorder load-shedding relative to authz.

```ts
class ListInvoices extends GenericView<InvoiceRow> {
  readonly permissionClasses = [new DriveMemberPermission("read")]; // closes list IDOR (§7)
  readonly throttleClasses  = [new AnonRateThrottle("30/min"), new UserRateThrottle("300/min")];
  // …
}
```

`AnonRateThrottle`/`UserRateThrottle` map 1:1 onto DRF's `AnonRateThrottle`/`UserRateThrottle`; `allowRequest → false` throws `Throttled(retryAfter)` → `RATE_LIMITED`, which an `outer` interceptor observes but an `inner` one never sees.

### 10.6 App-wide registration

Two ways to register interceptors for every endpoint: `SwitchboardOO.use(...)` (the `APP_INTERCEPTOR` analog) and `ApiModule.forRoot({ interceptors })` (the dynamic-module analog). App-wide interceptors compose *outside* each endpoint's own `interceptors` within the same phase. The recommended defaults (`LoggingInterceptor`, `ObservabilityInterceptor`) are wired here explicitly — there is no implicit default-on set in the contract — and `ObservabilityInterceptor` is constructed with the `IAnalyticsStore` resolved from the boot-time `Container` (§10.4):

```ts
const analytics = await container.resolve(ANALYTICS);              // boot-time, reflection-free (§6)
const app = new SwitchboardOO({ container, corsAllowlist })
  .use(new LoggingInterceptor(), new ObservabilityInterceptor(analytics)) // APP_INTERCEPTOR analog — recommended defaults, wired once
  .register(ApiModule.forRoot({
    interceptors: [new TimeoutInterceptor(2_000)],               // feature-wide
    resources: [invoiceResource],
  }));
```

### 10.7 Interceptors cannot bypass the security stages

This is the non-negotiable invariant, carried from SAF. `dispatch()` is FINAL and delegates to the non-overridable `ExecutionPipeline` (§5); interceptors are handed a `next` that is *already* the fixed skeleton. Therefore:

- An `outer` interceptor's `next()` **is** the authenticate→throttle→validate→authz→handler→output chain. It can wrap it, time it, log its rejection, or refuse to call it — it can never call the handler directly.
- An `inner` interceptor's `next()` **is** the handler, reached only *after* F1–F5 have passed. A cache hit short-circuits the handler but is itself downstream of object-authz, so it can only ever return data the caller was already authorized to read for that subject — and its result is still fed through F6 closed-output projection/redaction per caller.
- There is no `@UseGuards`-style opt-out and no interceptor slot that runs *between* two fixed stages. `Router.build()` (§13) still backstops deny-by-default independently of any interceptor.

> **Honest boundary.** A buggy or hostile interceptor can still degrade a call it is allowed to wrap — swallow errors, serve a stale cache entry, or exceed a timeout — the pipeline guarantees only that it cannot reach a handler *bypassing* authentication, validation, and authorization, and cannot widen output past the closed projection (§8): F6 is a fixed stage, so no interceptor can suppress `fieldGuards` redaction. Correctness of an interceptor's own logic (e.g. a sound cache key) remains the author's responsibility, which is why the security-load-bearing pieces (throttle, validate, authz, output/redaction) are fixed stages and not interceptors.

---

## 11. Transport primitives, one by one

Every L1 primitive is a *thin class over a real Powerhouse seam*. It extends `Endpoint` (Appendix A §8), so it inherits the FINAL `dispatch()` and the non-removable `ExecutionPipeline` (§5) — authenticate → throttle → input-validation → view-authz → object-authz → handler → closed-output — verbatim. A primitive is therefore never free to re-implement validation, authorization, or output projection; it may override only two things: the single business hook `handle()`, and its **wire adapter** — the method that translates bytes on one specific transport into `endpoint.dispatch(raw, ctx)` and back. This section specifies each primitive's base class, its wire adapter, the exact seam it binds to, its `IExceptionFilter`, and a minimal authoring example on the Invoice / Todo / Chat running examples.

| primitive | base class | wire adapter | real seam (§4) | error filter |
| --- | --- | --- | --- | --- |
| `RestView` / `RestController` | `Endpoint` | `toFetchHandler(rt)` | `IHttpAdapter.mount` (buffered `FetchHandler`) | `ApiErrorCode → ERROR_HTTP` |
| `GraphQLQuery/Mutation/Subscription` | `GraphQLField` → `Endpoint` | `toResolver(rt)` + `sdl` | `GraphQLManager.registerSubgraphInstance` (via `GeneratedSubgraph extends BaseSubgraph`) | `ApiErrorCode → GraphQLError.extensions.code` |
| `WebSocketGateway` | `Endpoint` | `attach(rt, deps)` | shared `WebSocketServer` + `getPubSub` / `ensureGlobalDocumentSubscription` | `ApiErrorCode → ws close/error frame` |
| `RpcMethod` / `RpcService` | `Endpoint` | `toFetchHandler(rt)` | `IHttpAdapter.mount` (one JSON-RPC `FetchHandler`) | `ApiErrorCode → ERROR_RPC` |
| `InboundWebhook` | `RestView` → `Endpoint` | `toFetchHandler(rt)` + `verifySignature` | `IHttpAdapter.mount` | `ApiErrorCode → ERROR_HTTP` |
| `OutboundWebhook` | (egress; not an `Endpoint`) | `deliver(payload, ctx)` | `getPubSub` subscriber → `fetch` | n/a (delivery worker) |

> **Honest boundary — only GraphQL is contributable today.** `GraphQLManager` holds its `IHttpAdapter`, `wsServer`, and drive/auth middleware as `private`/`#` fields (§4 gotchas), so a package can reach *only* the GraphQL seam (via `<pkg>/subgraphs`). REST, RPC, WS, and webhook primitives cannot be mounted from a contributed package until the one-time §16 host wiring lands (public `IHttpAdapter`/`wsServer` accessors on `GraphQLManager`, `verifyBearer`, and an explicit `corsAllowlist`). This section specifies the primitives as if that wiring exists; §12/§13 and §16 keep that acknowledgement front-and-centre.

### 11.1 REST — `RestView` + `RestController`

A `RestView` carries an explicit `method: HttpMethod` and a `path` relative to its controller. Its wire adapter `toFetchHandler(rt)` returns a **buffered** `FetchHandler` (`(request: Request) => Promise<Response>`) suitable for `IHttpAdapter.mount`. A `RestController` groups views under one `basePath`; the projector mounts the controller as a single prefix handler (`httpAdapter.mount(basePath, authOutermost(handler))`) whose internal router dispatches by `method + path`. Because the controller's own router does the sub-path matching, the mount is a **prefix** mount (`exact: false`, the default) — not `{ exact: true }`, which would require the request path to equal `basePath` exactly and so would never match `/rest/invoices/:id/send`. A request whose path matches but whose verb has no matching `RestView` returns **405 Method Not Allowed** with an `Allow` header — the controller knows its own verb set, so an unimplemented verb never silently 404s.

> **GET reads MUST verify bearer directly.** `AuthService.authenticateRequest` short-circuits `if (method === 'OPTIONS' || method === 'GET') return <empty AuthContext>` (§4 gotcha) — bearer is checked only for POST. The GraphQL path is POST-only, so this is safe there, but a `RestView` exposing a GET read behind `authenticateRequest` would receive an *unauthenticated* context and skip the token check. `BearerAuthenticator` therefore calls `AuthService.verifyBearer(authorization)` (the documented non-GraphQL path) directly, and every read `RestView` lists it in `authenticators`. Do **not** rely on `authenticateRequest` for GET.

> **Do not reuse the GraphQL drive middleware.** `createDriveFetchMiddleware` parses the request body as GraphQL (`body.operationName` / `body.query`) and returns 421 for a wrong shard (§4 gotcha). A REST POST with a plain JSON body silently fails the cache-bypass check. The `RestProjector` uses a REST-aware drive step that shares GraphQLManager's *same* `DriveOwnershipCache` rather than the GraphQL-shaped middleware.

A REST endpoint with a custom (non-CRUD) method — `POST <base>/rest/invoices/:id/send`:

```ts
class SendInvoiceView extends RestView<typeof SendInput, typeof InvoiceOut, "reactor" | "authz"> {
  readonly method = "POST" as const;
  readonly path = "/invoices/:id/send";
  readonly id = "invoice.send";                  // abstract Endpoint.id — omitting it is a compile error
  readonly kind = "mutation" as const;
  readonly inputSchema = SendInput;              // { id: string; note?: string }
  readonly outputSchema = InvoiceOut;
  readonly serializer = new InvoiceSerializer();  // supplies toRepresentation; justifies the `!` below
  readonly requires = ["reactor", "authz"] as const;
  readonly authenticators = [new BearerAuthenticator()];
  readonly permissionClasses = [new DocumentPermission("write")];        // object-level; compile error to omit
  getSubject(input: InferOut<typeof SendInput>) { return input.id; }      // typed (post-validation) input → object authz
  getObjectAccess() { return "write" as const; }
  protected async handle(input, ctx, subject) {                           // subject = AuthorizedDocumentHandle
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, "main", [sendInvoiceAction({ note: input.note })]);
    return this.serializer!.toRepresentation(await ctx.caps.reactor.get(subject!.fetchIdentifier), ctx);
  }
}
class InvoiceController extends RestController {
  readonly basePath = "/rest";
  readonly views = [new SendInvoiceView(/* … */)];
}
```

`getSubject` returns the id **from the already-validated input** — validation runs before object-authz (§5), so `getSubject` receives the parsed value (`InferOut`, not the raw wire `InferIn`), and `authorize.assert("write", input.id, ctx)` returns an `AuthorizedDocumentHandle` whose `fetchIdentifier` the handler *must* fetch (checked-id == fetched-id, closing IDOR). The view's `filter()` maps every thrown `ApiError.code` through `ERROR_HTTP` (`FORBIDDEN → 403`, `NOT_FOUND → 404`, `RATE_LIMITED → 429`), and `Throttled` sets `Retry-After`.

### 11.2 GraphQL — `GraphQLField` → `GeneratedSubgraph`

`GraphQLField` splits into `GraphQLQuery`, `GraphQLMutation`, and `GraphQLSubscription`, each pinning `rootType` and `kind`. Each field owns an `sdl` fragment (its field signature plus any types it introduces) and a wire adapter `toResolver(rt)` returning a nested resolver map keyed by `rootType → fieldName`, whose leaf simply calls `endpoint.dispatch(args, gqlCtx)`. Fields are assembled into **one** subgraph by `GeneratedSubgraph`, which `extends BaseSubgraph implements ISubgraph` and is handed to `GraphQLManager.registerSubgraphInstance(instance)`.

`GeneratedSubgraph` **reuses the inherited authz helpers** rather than re-implementing them: `resolveCanonicalDocumentId` (memoized per-request via a `WeakMap` — the slug→canonical seam with no existence oracle) and `assertCanRead` / `assertCanWrite` / `assertCanExecuteOperation` / `assertCanCreate`. `DocumentAuthorizer.canonical()`/`assert()` funnel into exactly these, so REST and GraphQL share one decision path.

A ~10-line GraphQL query — `Query.todo`:

```ts
class TodoQuery extends GraphQLQuery<typeof TodoArgs, typeof TodoOut, "reactor" | "authz"> {
  readonly fieldName = "todo";
  readonly id = "todo.retrieve";
  readonly sdl = `type Todo { id: ID! title: String! done: Boolean! }
                  extend type Query { todo(id: ID!): Todo }`;
  readonly inputSchema = TodoArgs;                 // { id: string }
  readonly outputSchema = TodoOut;
  readonly serializer = new TodoSerializer();      // supplies toRepresentation; justifies the `!` below
  readonly requires = ["reactor", "authz"] as const;
  readonly permissionClasses = [new DocumentPermission("read")];   // object-level read
  getSubject(input: InferOut<typeof TodoArgs>) { return input.id; }  // typed (post-validation) input
  protected async handle(input, ctx, subject) {
    return this.serializer!.toRepresentation(await ctx.caps.reactor.get(subject!.fetchIdentifier), ctx);
  }
}
// GeneratedSubgraph(subgraphArgs, [new TodoQuery(/* … */)], "todo", rt)  →  registerSubgraphInstance(instance)
```

> **Registration is append-only, debounced, and constructor-nominal.** `updateRouter = debounce(_updateRouter, 1000)` — a registered subgraph takes effect on a 1-second trailing edge, so register-then-immediately-query races. There is **no** unregister API: subgraphs are deduped by `name+path`, and re-registering the same name is a silent no-op — generated handlers cannot be hot-swapped and live for process life (§4). In-process `registerSubgraphInstance` accepts any object structurally satisfying `ISubgraph`, but the *package* discovery path (`<pkg>/subgraphs`) is typed `SubgraphClass[]` and the manager does `new C(SubgraphArgs)`, so a package-contributed subgraph MUST be constructor-compatible with `new C(SubgraphArgs)` (nominal), even though direct registration is structural.

A `GraphQLSubscription.handle` returns an `AsyncIterable<InferOut<O>>` backed by `getPubSub()`; the FIXED preamble (authenticate → throttle → validate → view-authz → object-authz) runs **before the first yield**, and per event the handler re-checks `canReadDocument` fail-closed. GraphQL's filter renders `ApiError.code` into `GraphQLError.extensions.code` (the closed union, never a raw stack).

### 11.3 WebSocket — `WebSocketGateway`

`WebSocketGateway` (`kind = "subscription"`) rides the **one** shared `WebSocketServer` — the same instance on which `GraphQLManager` calls `setMaxListeners(0)` because every subscription-enabled subgraph attaches listeners to it (§4). A gateway must **never** spin up its own server; its wire adapter `attach(rt, deps)` registers against `deps.wsServer` and returns a **disposer** tracked exactly like `subgraphWsDisposers`. Fan-in to the reactor uses the refcounted `ensureGlobalDocumentSubscription(reactorClient)` — the first gateway to subscribe opens the single `reactor.subscribe({}, …)` bridge onto `getPubSub()`; the disposer decrements the refcount and tears the bridge down at zero, so listeners never leak.

```ts
class ChatMessagesGateway extends WebSocketGateway<typeof ChatArgs, typeof ChatMsg, "authz" | "pubsub"> {
  readonly event = "chat.messages";
  readonly id = "chat.messages";
  readonly inputSchema = ChatArgs;                 // { driveId: string; roomId: string }
  readonly outputSchema = ChatMsg;
  readonly requires = ["authz", "pubsub"] as const;  // pubsub is a real CapabilityKey; needed for ctx.caps.pubsub
  readonly permissionClasses = [new DriveMemberPermission("read")];  // view-level drive gate (closes list IDOR)
  protected async *handle(input, ctx): AsyncIterable<InferOut<typeof ChatMsg>> {
    for await (const evt of subscribe(ctx.caps.pubsub, input.roomId))
      if (await ctx.authorize /* canRead per msg */) yield evt;      // preamble already ran before first yield
  }
  // attach(rt, deps) → deps.wsServer + ensureGlobalDocumentSubscription(reactor); returns disposer
}
```

Because there is one shared socket, the gateway carries `DriveMemberPermission` at the *view* level (no per-row object hook runs on a stream), and subscribe-time authz gates the whole subscription before any frame is sent.

### 11.4 JSON-RPC 2.0 — `RpcMethod` + `RpcService`

An `RpcMethod` exposes its `id` as the JSON-RPC `method` name (`get method() { return this.id; }`). An `RpcService` groups methods under a `namespace` and its wire adapter `toFetchHandler(rt)` returns **one** buffered `FetchHandler` mounted at `<base>/rpc`. The handler parses a JSON-RPC 2.0 envelope, dispatches **by `method` (== the endpoint `id`)**, validates `params` against that endpoint's `inputSchema` via the FIXED pipeline, and renders errors through `ERROR_RPC` (`VALIDATION → -32602`, `FORBIDDEN → -32003`, `RATE_LIMITED → -32029`, `INTERNAL → -32603`). Only `query`/`mutation` methods are exposed; a `subscription` id is rejected with "use WS" — RPC is request/response only. As with REST, GET is not used (RPC is POST-only), so the bearer skip is a non-issue, but batch arrays MUST be capped and fanned out with bounded concurrency to avoid a limiter-bypass DoS.

### 11.5 Webhooks — `InboundWebhook` (fail-closed) + `OutboundWebhook` (SSRF-guarded)

`InboundWebhook extends RestView` (`method = "POST"`, `kind = "mutation"`) and adds one abstract hook, `verifySignature(request, rawBody)`, which the wire adapter invokes **before `dispatch`** and treats as **fail-closed** — a missing or bad signature returns 401 and the pipeline never runs. Because HMAC authenticates the *sender* but establishes no Powerhouse identity (`ctx.user` is undefined), the target must either carry `AnonymousPermission` explicitly or map to a configured service principal — the author must state which. The receiver mounts via `IHttpAdapter.mount` and **must not reuse the GraphQL drive middleware** (a non-GraphQL body silently mis-shards, §4).

```ts
class StripeInvoicePaidWebhook extends InboundWebhook<typeof StripeEvt, typeof Ack, "reactor"> {
  readonly path = "/webhooks/stripe/invoice-paid";
  readonly id = "webhook.stripe.invoicePaid";
  readonly inputSchema = StripeEvt;
  readonly outputSchema = Ack;
  readonly requires = ["reactor"] as const;
  readonly permissionClasses = [new AnonymousPermission()];         // greppable: HMAC-authed, no ph identity
  async verifySignature(req: Request, rawBody: string) {            // fail-closed BEFORE dispatch
    return timingSafeEqual(hmacSha256(this.secret, rawBody), req.headers.get("stripe-signature") ?? "");
  }
  protected async handle(input, ctx) {
    await ctx.caps.reactor.execute(input.invoiceId, "main", [markInvoicePaidAction(input)]);
    return { ok: true };
  }
}
```

`OutboundWebhook` is *not* an `Endpoint` — it is an egress worker keyed to an `event`, subscribing to `getPubSub()` (one refcounted `ensureGlobalDocumentSubscription`). Its `deliver()` runs per subscriber through the **same output projection + `fieldGuards` redaction** as every other transport (never a raw row), gated by per-subscriber `canReadDocument` and scoped by `driveId` — closing the cross-tenant exfiltration hole. Its mandatory SSRF defence is the required `urlAllowlist`: HTTPS-only, host must be on the allowlist, and **no loopback / link-local / RFC-1918 / metadata IPs** (`127.0.0.0/8`, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16`, `::1`, `fc00::/7`), resolve-then-pin the IP and re-validate after redirects. Without it the signing, retrying delivery worker becomes an SSRF primitive.

```ts
class InvoiceCreatedWebhook extends OutboundWebhook<typeof InvoiceOut> {
  readonly event = "invoice.created";
  readonly urlAllowlist = ["https://hooks.acme.example"] as const;   // SSRF guard; no private IPs
  readonly retries = 3;
  async deliver(payload, ctx) { /* POST { id, type, data, ts } + X-PH-Signature: sha256=HMAC(secret, ts+"."+body) */ }
}
```

Each response-producing primitive owns exactly one `IExceptionFilter`, and every filter maps the **same** closed `ApiErrorCode` union to its wire (`ERROR_HTTP`, `GraphQLError.extensions.code`, `ERROR_RPC`, ws frame) — one error model, no per-transport drift (Appendix A §3). `OutboundWebhook` is the sole exception: as an egress worker it produces no wire response and so owns no filter (it retries or dead-letters instead). Hand-written primitives for the *same* concept can still diverge in policy or logic; only the `DocumentResource` factory (§12) manufactures REST/GraphQL/WS/RPC from one shared serializer + `CrudPermissionMap`, guaranteeing they cannot drift.

---

## 12. The document-model generic layer — generate CRUD from a model

§11's transport primitives are the hand-written floor: one `RestView`, one `GraphQLQuery`, each subclassed by hand. That floor is powerful and honest, but it is also where drift lives — two authors can write a REST invoice endpoint and a GraphQL invoice field with subtly different validation, redaction, or authorization. This section is the ceiling: a DRF-generics stack (`GenericView` → CRUD mixins → `DocumentModelViewSet`) and a `DocumentResource` factory that reads **one** `DocumentModelModule`, **one** `DocumentSerializer`, and **one** `CrudPermissionMap`, and manufactures the concrete §11 primitives across every transport you ask for. The generated primitives share those three objects by construction, so — unlike a hand-written pair — they *cannot* drift.

The layer is CQRS to its bones, exactly as SAF §7 was: **reads** compile to parameterized Kysely over an indexed read model (`ctx.caps.db`, a read-only surface), **writes** are document-model actions/creations through `IReactorClient` (`ctx.caps.reactor`). The read side never mutates; the write side never queries the projection to decide *what* to write.

> **Honest boundary (carried from §16).** Everything below emits `RestController`/`RpcService`/`WebSocketGateway` as well as `GraphQLField[]`, but only `emitGraphQL()`'s output is *package-contributable today* — `GraphQLManager` owns the private `IHttpAdapter`/`WebSocketServer` seams (§4). Until the §16 host wiring lands, `emitRest`/`emitRpc`/`emitWs` are constructed and unit-tested but projected only in-process by a host that already holds the adapters. This is a deployment limitation, not a design gap: the same `DocumentResource` produces all wires; the host decides which ones mount.

### 12.1 `GenericView` — the drive-scoped `GenericAPIView`

`GenericView<Row>` is the DRF `GenericAPIView` port: a `RestView` (§9) that owns a read source and two lookup template methods. `getQuery` is `get_queryset`; `getObject` is `get_object` + `check_object_permissions`.

```ts
export abstract class GenericView<Row, TCaps extends CapabilityKey = "db" | "reactor" | "authz">
  extends RestView<Schema, Schema, TCaps> {
  abstract readonly serializer: ISerializer<any, any, any, any>;
  readonly read?: ReadBinding<Row>;
  readonly document?: DocumentBinding;

  /** DRIVE-SCOPED. A collection read with no drive is a bug, not an empty result — fail closed. */
  protected getQuery(ctx: ExecutionContext<TCaps>): IRelationalQueryBuilder<{ [t: string]: Row }> {
    if (!ctx.driveId) throw new ValidationError("driveId is required for a collection read");
    return this.read!.source.query(ctx.driveId, ctx.caps.db);   // read-only Kysely, scoped to this drive
  }

  /** get_object: authorize FIRST (checked-id), then fetch THAT id (fetched-id) — closes IDOR. */
  protected async getObject(ctx: ExecutionContext<TCaps>, id: string): Promise<Row> {
    const access = this.getObjectAccess?.(ctx) ?? "read";
    const handle = await ctx.authorize.assert(access, id, ctx);          // resolve → check → AuthorizedDocumentHandle
    const row = await this.fetchOne(ctx, handle.fetchIdentifier);        // fetch the CHECKED id, never a re-derived one
    if (!row) throw new NotFound(`document '${id}' not found`);
    return row;                                                          // authz.assert already gated this id at the FIXED object-authz stage (against the handle, not the row); getObject just re-fetches the checked handle inside the handler
  }
  protected abstract fetchOne(ctx: ExecutionContext<TCaps>, id: string): Promise<Row | null>;
}
```

Two invariants are load-bearing. First, `getQuery` throws `VALIDATION` on a missing `driveId` — there is no "list everything" path, because no per-row `hasObjectPermission` runs on a collection (§7). A list is safe *only* because it is drive-scoped and its view-level policy carries `DriveMemberPermission`; `Router.build()` (§13) re-checks that every list-capable view does. Second, `getObject` calls `authorize.assert` **before** `fetchOne`, and fetches `handle.fetchIdentifier` — the id authz just checked. Because the FIXED pipeline validates input *before* object-authz, `getSubject` sees a typed id and the per-permission `hasObjectPermission` has already run at the fixed object-authz stage (against the `AuthorizedDocumentHandle`) by the time the handler invokes `getObject`: the confused-deputy / IDOR seam is closed here structurally, not by discipline.

### 12.2 The five CRUD mixins — functions, because TS has no MI diamond

DRF composes `ListModelMixin`, `RetrieveModelMixin`, `CreateModelMixin`, `UpdateModelMixin`, `DestroyModelMixin` via Python multiple inheritance. TypeScript has no MI diamond, so SOF ports them as **mixin functions** — each takes a `GenericView` constructor and returns it augmented with one action method whose `perform` hook maps to a reactor write:

```ts
export function ListModelMixin<Row, B extends Ctor<GenericView<Row>>>(Base: B) { /* + list()     */ }
export function RetrieveModelMixin<Row, B extends Ctor<GenericView<Row>>>(Base: B) { /* + retrieve() */ }
export function CreateModelMixin<B extends Ctor<GenericView<any>>>(Base: B) { /* + create()   */ }
export function UpdateModelMixin<B extends Ctor<GenericView<any>>>(Base: B) { /* + update()   */ }
export function DestroyModelMixin<B extends Ctor<GenericView<any>>>(Base: B) { /* + destroy()  */ }

// Compose exactly the verbs you want — a read-only resource simply omits the write mixins:
class InvoiceListView extends ListModelMixin<InvoiceRow, typeof InvoiceBase>(InvoiceBase) {}
class InvoiceRWView extends
  DestroyModelMixin(UpdateModelMixin(CreateModelMixin(
    RetrieveModelMixin<InvoiceRow, any>(ListModelMixin<InvoiceRow, any>(InvoiceBase))))) {}
```

| Mixin | Method | Read/Write | perform hook → reactor seam |
|---|---|---|---|
| `ListModelMixin` | `list(ctx, input)` | read | `getQuery` → `compileFilter` → `Paginator.apply` |
| `RetrieveModelMixin` | `retrieve(ctx, id)` | read | `getObject` (authz + `fetchOne`) |
| `CreateModelMixin` | `create(ctx, body)` | write | `serializer.create_` / `write.create` → `reactor.create`/`createEmpty` |
| `UpdateModelMixin` | `update(ctx, id, patch)` | write | `serializer.update_` / `write.update` → `reactor.execute(Action[])` |
| `DestroyModelMixin` | `destroy(ctx, id)` | write | `write.remove` → `reactor.execute(Action[])` |

The write mixins never mint an id and apply actions to it. `create` returns a *document to create*; `update`/`destroy` act on `getObject`'s authorized handle — the same checked-id == fetched-id rule as §12.1.

### 12.3 The read substrate — `ReadBinding` (scale) vs `DocumentBinding` (small-N)

`ReadBinding<Row>` is the scale path: a `RelationalReadModelClass` (a `RelationalDbProcessor` subclass), a `table`, a closed `FilterSet`, an `OrderingBackend` allowlist, and a `Paginator`.

```ts
import { RelationalDbProcessor } from "@powerhousedao/shared/processors/relational/types";
import { hashNamespace } from "@powerhousedao/shared/processors/relational/utils";

interface InvoiceRow {
  id: string; number: string; status: "draft" | "open" | "paid" | "void";
  counterparty: string; amount: number; currency: string;
  dueDate: string; createdAtUtc: string; updatedAtUtc: string;
  ownerAddress: string;                       // INTERNAL — must never leak to the wire (see §12.5 serializer)
}
interface InvoiceDb { invoice: InvoiceRow }

export class InvoiceReadModel extends RelationalDbProcessor<InvoiceDb> {
  // MUST override. The default getNamespace() returns `${this.name}_${driveId.replaceAll("-","_")}`
  // (relational/types.ts:75): a class name + a 36-char UUID blows past Postgres' 63-BYTE identifier cap
  // and collides/truncates. hashNamespace(str, 10) (relational/utils.ts:18, fnv1a → base26) is OPT-IN.
  static override getNamespace(driveId: string): string { return `inv_${hashNamespace(driveId, 10)}`; }
  // onOperations() projects CREATE/EDIT/VOID/SEND into `invoice` rows; initAndUpgrade() builds the index.
}
```

> **Namespace-hash footgun (real, cite it — and currently unbackstopped).** Generated read-model classes **must** apply `hashNamespace`, but the framework can neither apply it for you nor detect its absence: `getNamespace` is a `static` method a subclass owns, so there is no instance hook or registration-time value for the framework to inspect. `Router.build()` (§13) does **not** check namespaces — its fail-closed backstops are exactly three (every endpoint carries a non-empty policy, every list-capable view carries a drive-scoping permission, every serializer output is a closed schema), and a namespace-hash check is not among them. A generated read-model class that omits `hashNamespace` and keeps the raw default is therefore caught only by **convention and code review**, not by the framework — a truncation/cross-drive-read collision would surface at runtime as a silent mis-scoped read. This is a genuine open gap (§19), not a guarded seam; treat the `static override getNamespace` above as mandatory boilerplate on every generated read model.

`DocumentBinding` is the small-N escape hatch — a handful of singleton documents where standing up a processor is overkill. It reads through `IReactorClient.find(search, view, paging) → PagedResults<PHDocument>`, so `requires` collapses to `["reactor"]` and you inherit `find`'s limits (no arbitrary sort/filter operators). Use `ReadBinding` for anything that must scale; use `DocumentBinding` for a Todo list of ten items.

```ts
const todoRead: DocumentBinding = { search: (ctx) => ({ type: TODO_DOC_TYPE, parentId: ctx.driveId }) };
```

### 12.4 Pagination, filtering, ordering — closed allowlists

Pagination is a strategy object, and `SeekPaginator` / `OffsetPaginator` are **deliberately not substitutable** (honest Liskov, carried from SAF §7.2): a seek paginator can only order by its configured cursor columns and refuses an arbitrary sort with `VALIDATION`, while offset honors the full `OrderingBackend`. They share no leaky base — you pick one and its constraints are total.

```ts
const pagination = keyset<InvoiceRow>({ orderBy: "createdAtUtc", tieBreaker: "id", default: 25, max: 100 });
const filterable: FilterSet<InvoiceRow> = {
  status:       { type: "string", ops: ["eq", "neq", "in"] },
  counterparty: { type: "string", ops: ["eq", "contains"] },
  amount:       { type: "number", ops: ["eq", "gt", "gte", "lt", "lte"] },
  dueDate:      { type: "date",   ops: ["gte", "lte"] },
};
const sortable: OrderingBackend<InvoiceRow> = ["amount", "dueDate", "createdAtUtc"];
```

`compileFilter(filterable, input)` rejects any unlisted field or operator with `VALIDATION` and binds every value as a Kysely parameter — unlisted columns are invisible (no enumeration oracle), unlisted operators are rejected (no `contains` exfiltration on an `eq`-only column), no interpolation. `max` is a hard page cap on every paginator (a DoS guard). Sorting is a second allowlist; an unknown sort field is `VALIDATION`, never a 500.

### 12.5 `WriteBinding` — creation vs event-sourced mutation

The write side honors the reactor's own distinction between *creating* a document and *mutating* one. `create` returns a document (or a `type` for `createEmpty`/`drives.addFile`), never `Action[]` applied to a minted id — `execute` only mutates *existing* documents. `update`/`remove` return `Action[]` applied event-sourced to the authorized handle. `async: true` swaps `execute` for `executeAsync` and returns a `JobInfo` instead of the re-read document.

```ts
const write: WriteBinding<typeof InvoiceCreate, typeof InvoiceUpdate> = {
  create: (input, ctx) => ({ document: makeInvoiceDocument(input) }),   // → reactor.create (flat model)
  update: (patch) => [editInvoiceAction(patch)],                        // → reactor.execute(handle, "main", [..])
  remove: () => [voidInvoiceAction({})],                                // event-sourced soft-void, not a row delete
  async: false,                                                         // true → executeAsync → JobInfo
};
```

> `Action.input` is typed `unknown` at the reactor boundary (§4). The serializer's `toInternalValue` (`StandardSchemaPipe` on the FIXED validation stage) is the *only* thing standing between wire bytes and the reducer — the validation gate is genuinely load-bearing, not belt-and-suspenders.

### 12.6 `DocumentSerializer` — the `ModelSerializer` port

`DocumentSerializer.fromDocumentModel(model, opts)` introspects a `DocumentModelModule` to auto-derive the output/create/update DTOs (DRF `ModelSerializer.get_fields`), with `readOnly`/`writeOnly` mapping to `read_only`/`write_only` and `fieldGuards` giving per-field, per-caller redaction. `toRepresentation` is the **closed** projection: parse through `output`, return exactly those keys, redact guarded fields — never trust a validator's default key-stripping.

```ts
const serializer = DocumentSerializer.fromDocumentModel(invoiceModel, {
  fields: ["id", "number", "status", "counterparty", "amount", "currency", "dueDate", "createdAtUtc", "updatedAtUtc"],
  // ownerAddress is OMITTED from `fields`, so it can never appear on the wire — the field-leak guard.
  writeOnly: [],
  fieldGuards: { counterparty: (ctx) => Boolean(ctx.user) },   // hidden from anonymous callers
});
```

### 12.7 `DocumentModelViewSet` — the `ModelViewSet` analog

`DocumentModelViewSet` is the imperative sibling of the factory: subclass it, declare the four members, branch on `action` inside overridable hooks (`getQuery`/`create_`/etc.), then call `toResource()`.

```ts
export class InvoiceViewSet extends DocumentModelViewSet<InvoiceState, InvoiceRow> {
  readonly id = "invoice";
  readonly documentModel = invoiceModel;
  readonly serializer = serializer;
  readonly read = { source: InvoiceReadModel, table: "invoice", filterable, sortable, pagination };
  readonly write = write;
  readonly permissions: CrudPermissionMap = {
    // list MUST carry a drive-scoping permission (Router.build enforces) — no per-row hook runs on a collection.
    list:   [new DriveMemberPermission("read")],
    get:    [or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission()))],
    create: [new CreatePermission()],
    update: [and(new AuthenticatedPermission(), new ObjectOwnerPermission("write"))],
    remove: [and(new AuthenticatedPermission(), new ObjectOwnerPermission("manage"))],
  };
  readonly actions = [sendInvoice];   // §12.9 custom @action, folded in
}
export const invoiceResource = new InvoiceViewSet().toResource();
```

### 12.8 `DocumentResource` — one model, many wires, one serializer, one permission map

`DocumentResource` is the factory. Its whole value is that a single config — one `documentModel`, one `DocumentSerializer`, one `CrudPermissionMap`, one `ReadBinding | DocumentBinding`, one `WriteBinding` — emits concrete §9 primitives for every transport in `transports`, and every emitted primitive references *those same objects*. There is no way for the REST create and the GraphQL create to validate differently or authorize differently: they are two adapters over one `Endpoint` skeleton.

```ts
export const invoice = new DocumentResource({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: invoiceModel, serializer,
  read: { source: InvoiceReadModel, table: "invoice", filterable, sortable, pagination },
  write,
  permissions: {
    list:   [new DriveMemberPermission("read")],
    get:    [new DocumentPermission("read")],
    create: [new CreatePermission()],
    update: [and(new AuthenticatedPermission(), new ObjectOwnerPermission("write"))],
    remove: [and(new AuthenticatedPermission(), new ObjectOwnerPermission("manage"))],
    changes:[new DriveMemberPermission("read")],
  },
  actions: [sendInvoice],
  transports: ["graphql", "rest", "rpc", "ws"],
});

const rest = invoice.emitRest();      // RestController: GET /invoices, GET/PUT/DELETE /invoices/:id, POST /invoices, POST /invoices/:id/send
const gql  = invoice.emitGraphQL();   // GraphQLField[]: invoices(query), invoice(query), createInvoice/updateInvoice/... (mutations), invoiceChanges (subscription)
const rpc  = invoice.emitRpc();       // RpcService "invoice": invoice.list / invoice.get / invoice.create / ...
const ws   = invoice.emitWs();        // WebSocketGateway[]: invoice.changes over the SHARED server + getPubSub
const all  = invoice.emitAll();       // { rest, graphql, ws, rpc } — every wire from the same three objects
```

One resource, one CRUD verb, projected across four transports:

| CRUD verb | REST | GraphQL | JSON-RPC | Shared policy (from `permissions`) |
|---|---|---|---|---|
| list | `GET /invoices` | `invoices(filter,sort,page)` query | `invoice.list` | `DriveMemberPermission("read")` |
| retrieve | `GET /invoices/:id` | `invoice(id)` query | `invoice.get` | `DocumentPermission("read")` |
| create | `POST /invoices` | `createInvoice(input)` mutation | `invoice.create` | `CreatePermission` |
| update | `PUT /invoices/:id` | `updateInvoice(id,patch)` mutation | `invoice.update` | authenticated ∧ owner (write) |
| remove | `DELETE /invoices/:id` | `voidInvoice(id)` mutation | `invoice.remove` | authenticated ∧ owner (manage) |
| changes | — | `invoiceChanges` subscription | — | `DriveMemberPermission("read")` |

> **Honest limit (§19 open question).** Only the *factory* guarantees cross-transport consistency. A hand-written `RestView` and `GraphQLQuery` for the "same" invoice concept can still diverge — SOF *enables* consistency but does not *force* it the way SAF's single-projector model did. The recommended discipline is: use `DocumentResource` for any concept exposed on more than one wire; reserve hand-written primitives for genuinely single-transport, single-purpose endpoints.

### 12.9 Custom actions, folded in

Anything without a CRUD shape drops to a hand-written §9 primitive and is handed to the resource via `actions` — it inherits the same pipeline, projection, and permission composition, and is emitted onto every requested transport alongside the generated verbs. Sending an invoice is a write against the *authorized* document:

```ts
class SendInvoiceMutation extends GraphQLMutation<typeof SendInput, typeof InvoiceOutput, "reactor"> {
  readonly id = "invoice.send"; readonly fieldName = "sendInvoice"; readonly rootType = "Mutation" as const;
  readonly sdl = `type Mutation { sendInvoice(id: ID!): Invoice! }`;
  readonly inputSchema = SendInput; readonly outputSchema = InvoiceOutput; readonly requires = ["reactor"] as const;
  readonly permissionClasses = [and(new AuthenticatedPermission(), new ObjectOwnerPermission("write"))];
  getSubject(input: { id: string }) { return input.id; }        // typed input → object-authz sees the id
  getObjectAccess() { return "write" as const; }
  protected async handle(input: { id: string }, ctx: ExecutionContext<"reactor">, subject?: AuthorizedDocumentHandle) {
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, "main", [sendInvoiceAction({ id: input.id })]);
    return ctx.caps.reactor.get(subject!.fetchIdentifier);      // re-read, then closed-output projection
  }
}
const sendInvoice = new SendInvoiceMutation();
```

For a bulk void, the custom action carries `DocumentEachPermission("write", (ctx) => ids)` so **every** id is authorized fail-closed before any write (§7), and the handler uses `reactor.executeBatch` — no confused deputy on the batch.

The result is DRF's `ModelViewSet` ergonomic — declare a model, a serializer, and a permission map, get a full CRUD surface — with SAF's guarantees intact and none of SAF's projector magic: the primitives are ordinary §9 classes you can read, subclass, and test, and the factory simply builds them for you from one source of truth.

---

## 13. Routing, modules & registration

Layers 1 and 2 (§11–§12) produce `Endpoint` instances; this layer *collects* them, *backstops* their security invariants one last time, and *mounts* them onto the real Powerhouse seams. Three plain classes do the work — `Router` (fail-closed registry), `ApiModule` (a reflection-free provider bag), and `SwitchboardOO` (the app) — and a family of `TransportProjector`s drives the mounting. None of them scans, reflects, or resolves a runtime graph: registration is explicit, and the only "magic" is that `Router.build()` refuses to hand out an endpoint that could leak.

### 13.1 `Router` — registration plus the deny-by-default backstop

`Router.register()` accepts anything that reduces to endpoints — a bare `Endpoint`, a `RestController`, an `RpcService`, or a `DocumentResource` (which is expanded via its `emit*()` factories, §12). `build()` flattens the registry to `readonly Endpoint[]` and re-checks the three structural guarantees that the compiler and the `ExecutionPipeline` already enforce, so an `as any` cast or a hand-written primitive cannot slip past the type system.

> **Why a runtime backstop when omission is already a compile error?** Deny-by-default (§5) is defended in depth: `Endpoint.permissionClasses` is an *abstract* member (omitting it does not typecheck), the `ExecutionPipeline` throws `INTERNAL` on an empty policy list at request time, and `Router.build()` re-checks *at boot*. The compile error is the primary gate; `build()` catches the endpoint someone forced through with `[] as PermissionSpec[]` or a `// @ts-expect-error`. It fails the process at startup, never a request.

`build()` enforces, in order, the three SAF guarantees carried into OO form:

| Backstop | Rejects | Carries (SAF principle) |
| --- | --- | --- |
| **Non-empty policy** | any endpoint whose `permissionClasses` is `[]` | deny-by-default, layer 3 |
| **Drive-scoping guard** | any *list-capable* view (a `ListModelMixin`, a list action, or a collection-returning query) whose policy does not resolve to a `DriveMemberPermission` | drive-scoped lists close IDOR — no per-row object hook runs on a collection (§5, principle 7) |
| **Closed output** | any endpoint whose `outputSchema` (or `serializer.output`) is not a closed schema | closed-output field-leak guard (§8) |

The drive-scoping row is tied strictly to *list-capability*, not to "any query with a `read` binding." A single-object retrieve view is also `kind: "query"` over a `read` binding, but it is **not** list-capable — it runs a per-object hook via `getObject`/`checkObjectPermissions` (§12), so the object-level gate covers it and `build()` does not force `DriveMemberPermission` onto it. Only endpoints that return a *collection* (where no per-row hook fires) must carry the drive-scoped view permission.

```ts
class Router {
  private readonly entries: (DocumentResource<any, any> | Endpoint | RestController | RpcService)[] = [];
  constructor(private readonly opts: { corsAllowlist: readonly string[] }) {}

  register(entry: DocumentResource<any, any> | Endpoint | RestController | RpcService): this {
    this.entries.push(entry); return this;
  }

  build(): readonly Endpoint[] {
    const endpoints = this.entries.flatMap(flattenToEndpoints);   // resources → emit*(), controllers → views
    for (const e of endpoints) {
      // [1] non-empty policy — the last line of deny-by-default
      if (e.permissionClasses.length === 0)
        throw new InternalError(`Endpoint '${e.id}' declares no permissionClasses`);
      // [2] list-capable views MUST carry a drive-scoping permission (no per-row hook on a collection)
      if (isListCapable(e) && !policyContains(e.permissionClasses, DriveMemberPermission))
        throw new InternalError(`List endpoint '${e.id}' must carry DriveMemberPermission (drive-scoped IDOR guard)`);
      // [3] output must be a closed schema — nothing may fall through the serializer
      if (!isClosedSchema(e.outputSchema))
        throw new InternalError(`Endpoint '${e.id}' outputSchema is not closed (field-leak guard)`);
    }
    return endpoints;
  }
}
```

Note the honest boundaries `build()` does **not** fix: it cannot detect that a hand-written `RestView` and a hand-written `GraphQLQuery` for the "same" Invoice concept have *drifted* in policy or validation — only the `DocumentResource` factory (§12) guarantees they share one serializer and one `CrudPermissionMap`. That gap is the subject of an open question in §19.

### 13.2 `ApiModule` — a typed provider bag, not a runtime graph

`ApiModule.forRoot` / `forFeature` are the NestJS *dynamic-module* analog: a way to package providers, endpoints, resources and interceptors into a unit that a host composes. The resemblance stops at the ergonomics.

> **This is not `@Module`.** There is no decorator, no `imports`/`exports` scanning, no dependency graph resolved at bootstrap, and no request-scoped provider contagion. `ApiModuleDef` is a plain object; `forRoot` returns a value the app folds into its `Container` and registry. Providers are the reflection-free recipes from Appendix A (`useValue` / `useClass` / `useFactory` with an **explicit** `deps`/`inject` token list — never `design:paramtypes`). A missing dependency is a `Container.resolve` rejection you can read, not a mystery graph-assembly failure. `forRoot` contributes providers (host-level wiring); `forFeature` contributes only `endpoints`/`resources` (feature-level), exactly as Nest splits root vs feature modules — minus the runtime injector.

```ts
import { token, PUBSUB, AUTHZ } from "@powerhousedao/switchboard-api-oo";
import type { GraphQLManager } from "@powerhousedao/reactor-api";

// A local token for the host-owned GraphQLManager (the frozen core defines only
// REACTOR/DB/ANALYTICS/AUTHZ/PUBSUB — application tokens are declared where used).
const GRAPHQL_MANAGER = token<GraphQLManager>("graphqlManager");

export const InvoiceModule = ApiModule.forFeature({
  resources: [invoiceResource],                 // a DocumentResource<InvoiceState, InvoiceRow>
  endpoints: [new SendInvoiceEndpoint()],        // a custom @action-style RpcMethod / RestView
});

export const RootModule = ApiModule.forRoot({
  providers: [
    { token: PUBSUB, useValue: getPubSub() },                                    // the shared singleton (§ seams)
    { token: GRAPHQL_MANAGER, useValue: graphqlManager },                        // the host-constructed manager
    { token: AUTHZ,  useFactory: (gm: GraphQLManager) => gm.getAuthorizationService(), inject: [GRAPHQL_MANAGER] },
  ],
  interceptors: [new ObservabilityInterceptor()],
});
```

The `AUTHZ` factory now resolves: `GRAPHQL_MANAGER` is provided by `useValue` in the same bag, so its `inject` list points at a token the `Container` can satisfy.

### 13.3 `SwitchboardOO` — the app

`SwitchboardOO` holds the boot-time `Container` and the endpoint registry, and it is the only object that talks to projectors. `.use()` registers *app-wide* interceptors (the `APP_INTERCEPTOR` analog); `.register()` accepts endpoints, resources, controllers, services **and** `ApiModule`s (a module is unfolded into its providers + registry); `.project()` resolves the `Container` into a `Capabilities` bag, wraps it in a `ProjectionRuntime`, runs the same `Router.build()` backstops, and drives each projector against the host `ProjectionDeps`.

```ts
const app = new SwitchboardOO({ container, corsAllowlist: ["https://app.acme.example"] });

app.use(new LoggingInterceptor(), new ObservabilityInterceptor())   // outer-phase, app-wide (§10)
   .register(RootModule, InvoiceModule)
   .register(new TodoQuery(), new ChatSubscription());              // ad-hoc endpoints alongside modules

await app.project([new GraphQLProjector(), new RestProjector()], {
  httpAdapter, graphqlManager, wsServer, pubsub,
  authService: graphqlManager.getAuthorizationService(),
  subgraphArgs, corsAllowlist: ["https://app.acme.example"],        // REQUIRED — no reflect-any-origin default
});
```

> **`corsAllowlist` is not optional.** `GraphQLManager.init` calls `setupMiddleware({ bodyLimit: '50mb' })` with *no* `corsOptions`, and the Express adapter then does `cors(undefined)` — which reflects any `Origin`. Every SOF surface that mounts on that router inherits permissive CORS unless the host sets it. `SwitchboardOO` and `ProjectionDeps` both make `corsAllowlist` a required field so the permissive default is unreachable by construction.

### 13.4 `TransportProjector` — mount onto real seams, re-implement nothing

A projector's single job is to *mount each primitive's own wire adapter onto its seam*. It must **never** parse input, evaluate a permission, resolve a canonical id, or run business logic — every one of those lives inside the FIXED `ExecutionPipeline` (§5), reached through the adapter the primitive already exposes. A projector that "helpfully" pre-validates would be creating a second, unaudited gate.

For REST the wire adapter is the **locked** `RestView.toFetchHandler(rt)` (Appendix A): the primitive owns building the `ExecutionContext` via `ProjectionRuntime.makeContext`, the GET/`verifyBearer` edge (its doc-comment reads *"GET reads MUST verifyBearer directly"*), the call into `dispatch`, and the `Outcome`→`Response` rendering. The projector only *selects* the REST endpoints and *mounts* the handler with CORS — it does not rebuild any of that.

```ts
class RestProjector implements TransportProjector {
  readonly transport = "rest" as const;
  async project(endpoints: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void> {
    for (const view of endpoints.filter((e): e is RestView => e.transport === "rest")) {
      // The primitive OWNS the wire adapter and the GET/verifyBearer edge inside toFetchHandler(rt).
      // The projector adds nothing but path + CORS — there is exactly ONE place auth happens.
      deps.httpAdapter.mount(mountPath(view), withCors(view.toFetchHandler(rt), deps.corsAllowlist));
    }
  }
}
```

Because authentication, validation and authz all live inside `toFetchHandler` → `dispatch` → `ExecutionPipeline`, there is a single audited gate; the projector cannot become a second one.

Each projector binds to the exact seam its wire needs, and nothing more:

| Projector | Seam it mounts on | Note |
| --- | --- | --- |
| `GraphQLProjector` | `graphqlManager.registerSubgraphInstance(new GeneratedSubgraph(...))` | the only projector wired to a *live public* seam today |
| `RestProjector` | `httpAdapter.mount()` (buffered) / `mountNodeRoute()` (SSE) | mounts `RestView.toFetchHandler(rt)`; GET verifies via `verifyBearer` *inside* the handler, never `authenticateRequest` |
| `RpcProjector` | one `httpAdapter.mount()` per `RpcService`, dispatched by `params.method` | `ERROR_RPC` mapping |
| `WsProjector` | the single shared `wsServer` + `getPubSub()` singleton | subscriptions are refcounted through the shared global-subscription bridge (`ensureGlobalDocumentSubscription`), not by `getPubSub()` itself; `attach()` returns a disposer; no per-gateway server |
| `WebhookProjector` | `httpAdapter.mount()` (inbound, signature-verified) + egress with `urlAllowlist` (SSRF) | inbound extends `RestView`, POST-only |

> **`GraphQLProjector` reuses `BaseSubgraph`'s security helpers rather than re-deriving them.** `GeneratedSubgraph extends BaseSubgraph` (Appendix A), so canonical-id resolution runs through the inherited, per-request-memoized `resolveCanonicalDocumentId` — the projector does not re-implement slug→`CanonicalDocumentId`. The non-GraphQL projectors do not share that memo yet (§19 open question).

### 13.5 Package discovery — GraphQL is live, the rest awaits §16

Powerhouse discovers package contributions through sub-entrypoints: `PackageManager.loadSubgraphs` imports `<pkg>/subgraphs` (typed `SubgraphClass[]`) and `loadProcessors` imports `<pkg>/processors`. SOF piggybacks on both:

* **`<pkg>/subgraphs` (live).** A package exports a `GeneratedSubgraph` subclass; `GraphQLManager` constructs it and folds it into the federated supergraph. This is the *only* projection contributable today with no core edits.
* **`<pkg>/processors` (live).** The read-model `RelationalDbProcessor` subclasses that back `ReadBinding` list/retrieve (§10) are contributed here and driven by the reactor coordinator.

The package path is nominal: `PackageManager` types the export as `SubgraphClass` (`= typeof BaseSubgraph`) and does `new subgraph(SubgraphArgs)`. So the wrapper closes over its resource and assembles its own `ProjectionRuntime` from the injected `args` — through the **locked** `ProjectionRuntime` constructor `(caps, authorizer)`, not any invented static:

```ts
// <pkg>/subgraphs.ts  — the one package seam that works today
import type { SubgraphArgs } from "@powerhousedao/reactor-api/graphql/types";       // TYPE-only: used only in type position
import { ProjectionRuntime, type Capabilities, type DocumentAuthorizer } from "@powerhousedao/switchboard-api-oo";
import { invoiceResource } from "./invoice.resource";

// LOCAL example helpers (NOT part of the frozen core): build the runtime through the
// LOCKED ProjectionRuntime constructor from the fields SubgraphArgs already carries.
function runtimeFromArgs(args: SubgraphArgs): ProjectionRuntime {
  const caps: Capabilities = {
    reactor:   args.reactorClient,
    db:        args.relationalDb,
    analytics: args.analyticsStore,
    authz:     args.authorizationService,       // the single decision seam
    pubsub:    getPubSub(),
  };
  // A DocumentAuthorizer over caps.authz — canonical()/assert() delegate to the one seam,
  // reusing GeneratedSubgraph's inherited (BaseSubgraph) per-request canonical-id memo.
  const authorizer: DocumentAuthorizer = makeDocumentAuthorizer(caps.authz);
  return new ProjectionRuntime(caps, authorizer);   // ← the LOCKED (caps, authorizer) constructor
}

// MUST be `new C(SubgraphArgs)`-compatible: PackageManager types this as SubgraphClass
// (= typeof BaseSubgraph) and does `new subgraph(SubgraphArgs)`.
export default [
  class InvoiceSubgraph extends GeneratedSubgraph {
    constructor(args: SubgraphArgs) {
      super(args, invoiceResource.emitGraphQL(), "invoice", runtimeFromArgs(args));
    }
  },
];
```

> **On the runtime helper.** `runtimeFromArgs`/`makeDocumentAuthorizer` are illustrative *local* helpers, not members of the frozen core — the point is only that a package builds its `ProjectionRuntime` through the locked `new ProjectionRuntime(caps, authorizer)` API. If a first-class `ProjectionRuntime.fromSubgraphArgs(args)` factory proves worth standardizing, it belongs in Appendix A as an added frozen-core member, never as an undeclared static assumed at a call site.

> **The nominal constraint on package-contributed GraphQL.** In-process registration via `registerSubgraphInstance` is *structural* — any `ISubgraph`-shaped object works. But the package path is *nominal*: the class must be constructor-compatible with `new C(SubgraphArgs)`, so a package-contributed subgraph needs the thin zero-arg-config wrapper above. Also honest: `SubgraphArgs` is imported with `import type` (it is used only in type position; under `verbatimModuleSyntax`/`isolatedModules` a value import of a type-only symbol errors). Registration is **append-only** (no `unregister`), re-registering a name is a silent no-op, and `updateRouter` is debounced 1 s — a register-then-immediately-query test will race.

REST, RPC, WebSocket and webhook projection are **not** package-contributable yet. `GraphQLManager` keeps `httpAdapter`, `gatewayAdapter`, `wsServer` and the auth/drive middlewares in `private`/`#` fields, so no package can reach `mount()` or the shared `wsServer`. Enabling them requires the one-time host change in §16: public `getHttpAdapter()` / `getWsServer()` accessors on `GraphQLManager`, a `verifyBearer`-based auth path for GET, and an explicit CORS allowlist — the same accessors `getBasePath()` / `getAuthorizationService()` already model. Until §16 lands, non-GraphQL projectors run only when the host constructs `ProjectionDeps` and calls `app.project()` directly in `server.ts`.

### 13.6 Open/Closed — a new transport is a new projector

The payoff of routing all mounting through `TransportProjector` is that adding a wire touches no core code. `Endpoint`, `ExecutionPipeline`, `Router`, every permission, pipe and serializer stay byte-for-byte identical; you write one class implementing `TransportProjector`, mount each primitive's own wire adapter (`toFetchHandler` / `toResolver` / `attach`) onto the new seam, and hand it to `app.project([...projectors, new GrpcProjector()])`. A projector cannot weaken the FIXED pipeline — it can only choose *which* endpoints to mount and *how* to render their `Outcome` onto the wire — so "new transport" can never mean "new way to skip authorization." That is the OCP guarantee SAF gets from its projector functions, expressed here as a one-method interface.

---

## 14. Security model (secure by default)

Security in SOF is **structural** wherever the object model can make it so — a property of the class hierarchy and the fixed pipeline, not of author discipline. SOF inherits every guarantee SAF makes and re-expresses each one as an OO mechanism: an abstract member, a non-overridable template method, a permission object that funnels to one seam. This section enumerates each guarantee point-by-point, names the exact mechanism, and is honest about the one place where the object model *enables* rather than *forces* the guarantee.

> The guarantees below are carried verbatim from SAF §10. Where SAF's mechanism was a type-state builder or a data-first policy union, SOF's mechanism is a class member or a fixed pipeline stage. The security surface is identical; only the lever changes.

> **Boilerplate elided.** The examples in this section elide some required `Endpoint` members for brevity — `id` (abstract on `Endpoint`, *not* supplied by `GraphQLField`), and, where not shown, `inputSchema`/`outputSchema`/`sdl`. §5 and Appendix A make all of them mandatory abstract members; a class that truly omits them does not typecheck.

> **Transport-availability boundary (§12/§16).** Only GraphQL is package-contributable today. The private transport seams on `GraphQLManager` mean the REST (§14.8), RPC (§14.9) and WebSocket (§14.10) mechanisms below **cannot be mounted** until the one-time §16 host-wiring change lands (public `IHttpAdapter`/`wsServer` accessors + `verifyBearer` for GET reads + an explicit `corsAllowlist`). The protections shown for those transports are therefore **design requirements** the projectors MUST satisfy once mountable — not claims that they run in the shipping build. This is the same honest boundary carried in §12/§13.

### 14.1 Deny-by-default is a compile error, backstopped twice

`Endpoint.permissionClasses` (§7) is an **abstract member**. An endpoint that declares no authorization does not typecheck — there is no `DEFAULT_PERMISSION_CLASSES = [AllowAny]` (DRF) and no forgettable `@UseGuards` (NestJS). This is strictly stronger than both siblings.

```ts
class TodoQuery extends GraphQLQuery<typeof TodoArgs, typeof TodoOut> {
  readonly id = "Query.todo";
  readonly fieldName = "todo"; readonly rootType = "Query" as const;
  readonly inputSchema = TodoArgs; readonly outputSchema = TodoOut;
  readonly sdl = /* graphql */ `type Query { todo(id: ID!): Todo }`;
  // ❌ omitting `permissionClasses` → TS2515 "non-abstract class does not implement inherited abstract member"
  protected async handle(input, ctx) { /* ... */ }
}
```

Two runtime backstops catch `as any` bypasses: `ExecutionPipeline` throws `InternalError` (`INTERNAL`) if the normalized policy list is empty at dispatch time, and `Router.build()` (§13) re-checks **every** registered endpoint and refuses to return a route table with an unpoliced endpoint. The single sanctioned opt-out is the greppable `new AnonymousPermission()` (an alias of `AllowAny`) or the `@Public()` decorator sugar — deliberately loud, never implicit.

### 14.2 Authorization is a fixed, non-removable pipeline stage

`Endpoint.dispatch()` is `final` by convention (§5) and delegates to a single `ExecutionPipeline` body shared by every transport. Its stage order is hard-coded and cannot be reordered, removed, or bypassed by a subclass:

```
authenticate → throttle → input-validation → view-authz → object-authz → handle → closed-output
```

Subclasses override only `handle()` and the wire adapters (`toResolver`/`toFetchHandler`/`attach`), never the skeleton. `IInterceptor`s wrap the pipeline in an `"outer"` (pre-authz) or `"inner"` (post-authz) phase but cannot delete or reorder a FIXED stage — there is no `@UseGuards`-style opt-out and no plugin position that reaches `handle()` ahead of authz. Because every transport primitive extends `Endpoint`, every wire inherits the identical stage order for free.

### 14.3 Validation runs before object-authz; subjects are typed

FIXED stage 3 (input validation via `StandardSchemaPipe`) runs **before** FIXED stage 5 (object-level authz). Consequently `getSubject(input, ctx)` receives the *typed*, parsed input — an object-permission never keys off raw wire bytes. `Action.input` is `unknown` at the reactor boundary (§4), so this validation gate is genuinely load-bearing, not belt-and-suspenders: it is the only thing standing between wire bytes and the reducers.

### 14.4 Checked-id == fetched-id (no confused deputy)

Object authz resolves through `ctx.authorize.assert(access, idOrSlug, ctx)`, which returns an `AuthorizedDocumentHandle`. The handler MUST fetch the document by that handle's `fetchIdentifier` — the exact identifier the check authorized — closing IDOR at the row level:

```ts
class SendInvoiceMutation extends GraphQLMutation<typeof SendArgs, typeof InvoiceOut, "reactor"> {
  readonly id = "Mutation.sendInvoice";
  readonly fieldName = "sendInvoice"; readonly rootType = "Mutation" as const;
  // inputSchema / outputSchema / sdl elided for brevity (see §5)
  readonly requires = ["reactor"] as const;
  readonly permissionClasses = [AuthenticatedPermission, new DocumentPermission("write")];
  getSubject(input: InferOut<typeof SendArgs>) { return input.id; }        // TYPED input
  getObjectAccess() { return "write" as const; }

  protected async handle(input, ctx, subject /* AuthorizedDocumentHandle */) {
    // fetch the EXACT id authz approved — never input.id again
    const doc = await ctx.caps.reactor.getDocument(subject!.fetchIdentifier);
    await ctx.caps.reactor.execute(subject!.fetchIdentifier, [sendInvoiceAction({ id: doc.id })]);
    return this.serializer!.toRepresentation(doc, ctx);
  }
}
```

### 14.5 One authorization decision seam, no existence oracle

Every builtin permission funnels to the single `IAuthorizationService` seam through `DocumentAuthorizer` (§7): `AuthenticatedPermission` → presence of `ctx.user`; `DocumentPermission("read"|"write"|"manage")` → `canRead`/`canWrite`/`canManage`; `OperationPermission` → `canMutate`; `CreatePermission` → `canCreate`; `AdminPermission` → `isSupremeAdmin`. `isSupremeAdmin` denotes the **platform supreme-admin** decision and is the correct gate for internal/admin-only surfaces (for example the `ownerAddress` field guard in §14.7); it is **not** a stand-in for per-document roles — those go through `DocumentPermission`/`canRead`/`canWrite`/`canManage`. The **only** sanctioned `string → CanonicalDocumentId` conversion is `DocumentAuthorizer.canonical()`; slug aliasing therefore cannot become an existence oracle, and there is no second, unmemoized resolve path to leak timing.

### 14.6 Fail-closed everywhere

Anonymous callers are not rejected at the edge — they **reach** the pipeline, and authz denies them there (an anonymous `AuthenticatedPermission.hasPermission` returns `false` → `NotAuthenticated`). `BasePermission` hooks default to `true` (DRF-faithful, so single-hook permissions compose), because deny lives at the `Endpoint` level, not in the permission. Every builtin that touches state fails closed: `DriveMemberPermission` **denies on a missing or unvalidated `driveId`** rather than treating absence as "no scope required"; `authorize.assert` throws `PermissionDenied`/`NotAuthenticated` on an unresolved handle; id-resolution failure maps to `FORBIDDEN`, never `NOT_FOUND` — no existence oracle.

### 14.7 Output is projected to a closed allowlist + field guards

FIXED stage 6 runs `Serializer.toRepresentation`, which **explicitly picks the declared `outputSchema` keys** — it does not trust a validator to strip unknowns. A `SELECT *` read model cannot leak `ownerAddress` regardless of validator. Per-field `fieldGuards` add object-level redaction applied by the fixed stage itself (structural, not a forgettable interceptor). `Router.build()` rejects any serializer whose `output` is not a closed schema.

`fieldGuards` are **synchronous** — their contract type is `(ctx: ExecutionContext) => boolean`, so a guard cannot itself `await` the async `IAuthorizationService` seam. Any authz-derived decision a guard depends on is therefore resolved **before** serialization: an inner (post-authz) interceptor awaits `authz.isSupremeAdmin` once and publishes the boolean onto the sanctioned `ctx.ext` accretion, and the guard reads that already-resolved value. The guard thus redacts on a real supreme-admin decision — never on mere authentication, so under any policy an ordinary authenticated user is redacted, not exempted.

```ts
// Resolved once by an inner interceptor (post-authz, before FIXED stage 6);
// the synchronous fieldGuard only READS the decision, it never awaits authz.
type AdminExt = { isSupremeAdmin: boolean };

const InvoiceSerializer = DocumentSerializer.fromDocumentModel(InvoiceModel, {
  fields: "__all__",
  fieldGuards: {
    // ownerAddress is internal — shown ONLY to the platform supreme-admin,
    // redacted for every other caller (ordinary authenticated users included).
    ownerAddress: (ctx) => (ctx.ext as AdminExt).isSupremeAdmin === true,
  },
});
```

### 14.8 Collection reads are drive-scoped (closes list IDOR)

No per-row `hasObjectPermission` hook runs on a collection — DRF's original footgun. `GenericView.getQuery` therefore **requires a validated `driveId`** and throws `VALIDATION` without one, and every list-capable view MUST carry `DriveMemberPermission` at the *view* level (`Router.build()` enforces this against `CrudPermissionMap.list`). `ctx.driveId` originates from the client `Drive-Id` header; the GraphQL drive-middleware only checks shard ownership (→ 421), not per-user authz, so without this rule any authenticated user could set `Drive-Id` to another tenant's drive and enumerate it.

```ts
class InvoiceList extends ListModelMixin(GenericView<InvoiceRow>) {
  readonly method = "GET" as const; readonly path = "/invoices";
  readonly serializer = InvoiceSerializer;
  readonly permissionClasses = [AuthenticatedPermission, new DriveMemberPermission("read")]; // drive-scoped
}
```

### 14.9 Bulk operations authorize every item

`DocumentEachPermission(access, subjects)` resolves and checks **every** id fail-closed (as an object-level check) before the handler performs any write, so a bulk void/update cannot become a confused deputy. `CustomPermission` remains available but is documented as "you enforce per-item authorization yourself" — `DocumentEachPermission` is the blessed pattern.

> **Honest note on the selector's input.** Unlike `getSubject(input, ctx)`, which the `Endpoint` contract hands the *typed* validated input directly (§5, §14.3), `DocumentEachPermission`'s frozen selector signature is `(ctx: ExecutionContext) => readonly string[]` — it receives **only** `ctx`, never the parsed input, and `ExecutionContext` has no `input` member. To keep §14.3's guarantee that object-authz keys off typed input (never raw wire bytes), the FIXED validation stage publishes the parsed input onto the sanctioned `ctx.ext` accretion before object-authz runs, and the selector reads *that*. It MUST NOT read `ctx.switchToRpc()?.params` (or any raw transport body), which is unvalidated `unknown` and would reopen exactly the untyped-subject hole §14.3 closes.

```ts
type BulkVoidExt = { input: InferOut<typeof BulkArgs> }; // published by the FIXED validation stage

class BulkVoidInvoices extends RpcMethod<typeof BulkArgs, typeof BulkOut, "reactor"> {
  readonly id = "invoice.bulkVoid"; readonly kind = "mutation" as const;
  readonly inputSchema = BulkArgs; readonly outputSchema = BulkOut;
  readonly requires = ["reactor"] as const;
  readonly permissionClasses = [
    AuthenticatedPermission,
    // TYPED ids off the sanctioned ctx.ext accretion — NEVER raw switchToRpc().params
    new DocumentEachPermission("write", (ctx) => (ctx.ext as BulkVoidExt).input.ids),
  ];
  protected async handle(input, ctx) { /* every id already authorized fail-closed */ }
}
```

### 14.10 Subscriptions are authorized and bounded

`GraphQLSubscription` and `WebSocketGateway` run the **full FIXED preamble** (authenticate → throttle → validate → view-authz → object-authz) *before* yielding the first event, and per-event checks still fire. Both attach to the **one** shared `WebSocketServer` / `getPubSub()` singleton through refcounted disposers, so a subscription cannot spin up its own server or leak listeners, and a subscriber already known-unauthorized for a drive is short-circuited before amplifying the single fan-out into an authz-DB DoS.

```ts
class ChatMessages extends GraphQLSubscription<typeof ChatArgs, typeof MsgOut> {
  readonly id = "Subscription.chatMessages";
  readonly fieldName = "chatMessages"; readonly rootType = "Subscription" as const;
  // inputSchema / outputSchema / sdl elided for brevity (see §5)
  readonly permissionClasses = [AuthenticatedPermission, new DocumentPermission("read")];
  getSubject(input: InferOut<typeof ChatArgs>) { return input.chatId; } // authorized before first yield
  protected async *handle(input, ctx, subject) { /* bounded async iterable off the shared pubsub */ }
}
```

### 14.11 Transport-edge protections

Each edge carries the SAF protections, honestly bounded to the real seams (§12). Except for GraphQL, these edges are not yet mountable — they become live only after the §16 host wiring (see the boundary note at the top of this section):

| Edge | Mechanism | Real-seam note |
| --- | --- | --- |
| GET reads | `BearerAuthenticator` calls `verifyBearer(authorization)` directly | `AuthService.authenticateRequest` short-circuits GET/OPTIONS to an empty context — a REST/RPC GET MUST call `verifyBearer`, not rely on middleware |
| Non-GraphQL wires | own auth/drive resolution, **never** the GraphQL drive-middleware | `createDriveFetchMiddleware` parses the GraphQL body (`operationName`/`query`) and 421s a non-GraphQL body |
| Outbound egress | `OutboundWebhook.urlAllowlist` (host allowlist, no private/link-local IPs) | SSRF guard is per-webhook and required |
| CORS | `ProjectionDeps.corsAllowlist` is **required** — no reflect-any-origin | the core seam calls `setupMiddleware` with no `corsOptions` and defaults to reflect-origin; closing it is host wiring (§16) |

### 14.12 Honest limitation: SOF *enables* consistency but does not *force* it

This is the one place SOF is weaker than SAF, and it must be stated plainly.

> A **hand-written** `RestView` and a **hand-written** `GraphQLQuery` for the *same* logical concept are two independent classes. Nothing in the type system forces them to share a serializer, a permission set, or a subject selector — they can silently diverge in policy, validation, or redaction. SAF's data-first `defineResource` made divergence structurally impossible (one `OperationDef`, projected). SOF only makes divergence *avoidable*: consistency is guaranteed **only** when both primitives are emitted by a single `DocumentResource` / `DocumentModelViewSet` (§12) from one shared `DocumentSerializer` + `CrudPermissionMap`, or when both delegate to one shared service. The factory-emitted primitives cannot drift; two hand-authored ones can. The mitigation is a CI/lint rule flagging two endpoints with the same logical id across transports that do not originate from a shared resource (§19), but that is convention, not the compiler.

### 14.13 Threat checklist

| Threat | Mitigation | Where |
| --- | --- | --- |
| Missing authz on a transport | one `ExecutionPipeline` body; FIXED view/object-authz stages | §5, §14.2 |
| Forgot to authorize | abstract `permissionClasses` compile error + empty-list `INTERNAL` + `Router.build()` | §14.1 |
| `@UseGuards`-style bypass | `dispatch()` final; interceptors wrap but cannot reorder/remove a FIXED stage | §14.2 |
| Object check on untyped input | validation FIXED-stage 3 runs before object-authz stage 5 | §14.3 |
| IDOR via row id (confused deputy) | `authorize.assert` → `AuthorizedDocumentHandle.fetchIdentifier` reused by handler | §14.4 |
| Existence oracle via slug | single `DocumentAuthorizer.canonical()`, fail-closed | §14.5 |
| Anonymous privilege escalation | anonymous reaches pipeline; authz denies; `BasePermission` deny at Endpoint level | §14.6 |
| Missing `driveId` treated as unscoped | `DriveMemberPermission` denies on missing/unvalidated `driveId` | §14.6, §14.8 |
| Column/field leak (`ownerAddress`) | closed `output` pick + supreme-admin `fieldGuards` (async decision pre-resolved on `ctx.ext`) in FIXED stage 6; `Router.build()` rejects open schemas | §14.7 |
| IDOR via `Drive-Id` on `list` | mandatory `DriveMemberPermission` + drive-scoped `getQuery` | §14.8 |
| Bulk confused deputy | `DocumentEachPermission` per-item fail-closed; typed ids off `ctx.ext`, not raw params | §14.9 |
| Subscription DoS / listener leak | FIXED preamble before yield; refcounted shared `WebSocketServer`/`getPubSub()` | §14.10 |
| Bearer skipped on GET | `BearerAuthenticator` → `verifyBearer` directly (not `authenticateRequest`) | §14.11 |
| GraphQL drive-middleware reused on REST/RPC | non-GraphQL wires do their own drive resolution | §14.11 |
| Webhook SSRF | `OutboundWebhook.urlAllowlist`: host allowlist, no private/link-local IPs | §14.11 |
| Reflect-any CORS | required `corsAllowlist` plumbed to the core `setupMiddleware` (host change) | §14.11, §16 |
| Cross-transport policy drift | `DocumentResource` shared serializer + permission set (**enabled, not forced**) | §14.12 |
| Unvalidated wire bytes → reducers | `StandardSchemaPipe` FIXED stage (`Action.input` is `unknown`) | §14.3 |

---

## 15. Testing & validation

The OO inversion pays its largest dividend here. Because every security-critical decision lives in a **plain object** — a permission, a serializer, a pipe, an interceptor, an authenticator, a throttle — each one is unit-testable in complete isolation, with no bootstrap graph, no DI container scan, no HTTP server, and no reflect-metadata. This is the testability-as-extensibility enabler promised in §2: the same properties that let a third party subclass `BasePermission` or `Serializer` let them (and us) test the subclass against the frozen contract without standing up a reactor. What follows is the required test surface: (15.1) strategy-object unit tests, (15.2) endpoint tests over a plain `Container`, (15.3) `ExecutionPipeline` conformance, (15.4) the golden-SDL snapshot suite, (15.5) cross-transport consistency, (15.6) namespace hashing.

> **Honest scope.** SOF *enables* isolated testing; it does not, for hand-written primitives, *force* the cross-transport consistency it can verify only for factory output (§12, §15.5). And the reactor-browser Playwright suite failing locally (missing browser install) is a pre-existing, unrelated harness issue — none of the suites below depend on it.

### 15.1 Every strategy object is a plain object

No strategy object takes a runtime graph in its constructor. A permission is `new`-ed and its two hooks called directly; a serializer's `toRepresentation` is called with a fake row and a fake `ExecutionContext`; a pipe's `transform` is called with raw bytes. The context is a plain object literal — there is no `REQUEST` scope to satisfy and no provider to resolve.

```ts
import { describe, it, expect } from "vitest";
import { ObjectOwnerPermission, AnonymousPermission, AuthenticatedPermission, or, and }
  from "@powerhousedao/switchboard-api-oo";
import { fakeCtx, fakeHandle, fakeEndpoint } from "@powerhousedao/switchboard-api-oo/test";

it("ObjectOwnerPermission denies a non-owner at the object hook", async () => {
  const perm = new ObjectOwnerPermission("write");
  const ctx = fakeCtx({ user: { address: "0xBOB", chainId: 1, networkId: "eip155" } });
  const handle = fakeHandle({ ownerAddress: "0xALICE" });
  expect(await perm.hasPermission(ctx, fakeEndpoint())).toBe(true);      // view gate open
  expect(await perm.hasObjectPermission(ctx, fakeEndpoint(), handle)).toBe(false); // object gate closed
});

it("the §7 headline composition is anonymous-OR-(auth-AND-owner)", async () => {
  const policy = or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission()));
  const anon = fakeCtx({ user: undefined });
  // OrPermission reproduces DRF's object-level short-circuit: the AllowAny arm satisfies BOTH hooks.
  expect(await policy.hasPermission(anon, fakeEndpoint())).toBe(true);                       // view gate
  expect(await policy.hasObjectPermission(anon, fakeEndpoint(), fakeHandle({ ownerAddress: "0xALICE" })))
    .toBe(true); // object gate short-circuits on the AllowAny arm — a non-owner is still admitted anonymously
});
```

The second assertion is the load-bearing one: `hasPermission` alone only exercises the view gate, so the OR's *object-level* short-circuit — `(a.hasPermission && a.hasObjectPermission) || (b…)`, the DRF behavior ported in §7.3 — is only actually demonstrated by driving `hasObjectPermission` and watching the `AnonymousPermission` arm satisfy it even though the owner arm would deny.

The same shape covers the other families: a `StandardSchemaPipe` is tested by asserting it returns the parsed value or throws `ValidationError` (never a raw Zod error — the closed model (Appendix A §3)); a `LoggingInterceptor`/`CacheInterceptor` is tested with a fake `Next<O>` and an assertion on phase (`"outer"` vs `"inner"`); a `BearerAuthenticator` is tested with a fabricated `Request` and a stub `verifyBearer`; an `AnonRateThrottle` by driving `allowRequest` past its rate and asserting `wait()`.

| Object | Unit-under-test | Fake needed |
| --- | --- | --- |
| `IPermission` | `hasPermission` / `hasObjectPermission` | `ExecutionContext`, `AuthorizedDocumentHandle` |
| `Serializer` | `toRepresentation` / `toInternalValue` | one row, `ExecutionContext` (for `fieldGuards`) |
| `IPipe` | `transform` | raw value + `ArgMeta` |
| `IInterceptor` | `intercept(ctx, next)` | `Next<O>` spy |
| `IAuthenticator` | `authenticate(request)` | `Request`, stubbed `verifyBearer` |
| `IThrottle` | `allowRequest` / `wait` | `ExecutionContext` |

### 15.2 Endpoints over a plain `Container` of `useValue` capabilities

An endpoint's `handle()` is only reached through `dispatch()`, so an endpoint test constructs a `Container` whose capability tokens are `useValue` fakes, calls `toCapabilities()`, and builds an `ExecutionContext` via `ProjectionRuntime.makeContext`. No transport, no `IHttpAdapter`, no `GraphQLManager`.

```ts
import { Container, REACTOR, DB, ANALYTICS, AUTHZ, PUBSUB, ProjectionRuntime }
  from "@powerhousedao/switchboard-api-oo";
import {
  fakeReactor, fakeDb, fakeAnalytics, fakePubSub,
  fakeAuthz, fakeAuthorizer, rawFor,
} from "@powerhousedao/switchboard-api-oo/test";
import { SendInvoiceMutation } from "@acme/invoice-api";

it("sendInvoice authorizes and writes the exact document it fetched (checked==fetched)", async () => {
  const reactor = fakeReactor();
  // toCapabilities() eagerly assembles the FULL Capabilities bag — reactor, db, analytics, authz, pubsub
  // are all non-optional keys — so EVERY capability token must resolve, even the ones this endpoint's
  // `requires` list will not narrow ctx.caps down to. Stub the unused ones so the bag can be built.
  const container = new Container()
    .provide({ token: REACTOR,   useValue: reactor })
    .provide({ token: DB,        useValue: fakeDb() })
    .provide({ token: ANALYTICS, useValue: fakeAnalytics() })
    .provide({ token: AUTHZ,     useValue: fakeAuthz({ write: ["inv1"] }) })  // IAuthorizationService seam
    .provide({ token: PUBSUB,    useValue: fakePubSub() });

  // ProjectionRuntime's 2nd arg is a DocumentAuthorizer (svc / canonical() / assert()) — a DIFFERENT
  // seam from the IAuthorizationService behind the AUTHZ token. fakeAuthorizer wraps a fake
  // IAuthorizationService in that DocumentAuthorizer contract; do NOT reuse fakeAuthz() here.
  const rt = new ProjectionRuntime(
    await container.toCapabilities(),
    fakeAuthorizer({ write: ["inv1"] }),
  );
  const ep = new SendInvoiceMutation();

  const out = await ep.dispatch(rawFor("graphql", { id: "inv1" }),
    await rt.makeContext(rawFor("graphql", { id: "inv1" }), "graphql", ep.requires));

  expect(reactor.executed).toEqual([{ id: "inv1", actions: [{ type: "SEND_INVOICE" }] }]);
  expect(out).not.toHaveProperty("ownerAddress");   // closed-output pick (fieldGuards redaction, §15.5)
});
```

Two seams are deliberately kept distinct in this fixture. `fakeAuthz(...)` produces the `IAuthorizationService` that sits behind the `AUTHZ` token and lands in `ctx.caps.authz`; `fakeAuthorizer(...)` produces the `DocumentAuthorizer` (`.svc` / `.canonical()` / `.assert()`) that the runtime hangs on `ctx.authorize`. Conflating them by passing `fakeAuthz(...)` into `ProjectionRuntime` would not typecheck against the locked constructor `constructor(caps: Capabilities, authorizer: DocumentAuthorizer)`.

Two failure modes are asserted the same way: an endpoint whose `permissionClasses` do not admit the caller yields `PermissionDenied`/`NotAuthenticated`; a subject whose `authorize.assert` returns a handle with a `fetchIdentifier` different from what the handler fetches is a bug the test catches because the fake reactor records the fetched id.

> **Deny-by-default is also a *compile*-time test.** A `expectTypeOf`/`@ts-expect-error` type-test asserting that an `Endpoint` subclass omitting `permissionClasses` does **not** typecheck is a required part of the suite — the abstract member is the first of the three deny layers (§7), and it must stay a hard type error, not a lint.

### 15.3 `ExecutionPipeline` conformance suite

Because `dispatch()` is FINAL and the pipeline is the one non-removable skeleton (§5), a single **conformance suite** runs against every registered endpoint and asserts the invariant order actually fired. The suite instruments the fakes to record a trace and checks it against the fixed sequence.

```ts
import { assertPipelineConformance } from "@powerhousedao/switchboard-api-oo/test";

it.each(router.build())("each endpoint honors the FIXED pipeline: %s", async (ep) => {
  const trace = await assertPipelineConformance(ep, rt);
  expect(trace.stages).toEqual([
    "authenticate", "throttle", "input-validation", "view-authz", "object-authz",
    "handle", "closed-output",
  ]);
  expect(trace.inputValidationBefore("object-authz")).toBe(true); // typed input for object checks (§5)
  expect(trace.emptyPolicyDenied).toBe(true);                     // [] policy → INTERNAL deny backstop
  expect(trace.checkedId).toEqual(trace.fetchedId);               // checked==fetched, IDOR closed
});
```

Three conformance guarantees are non-negotiable and each has its own assertion: **every FIXED stage fires** (a subclass cannot delete one), **deny-by-default denials** (an empty policy list is denied at runtime even though it is already a compile error, and an interceptor cannot short-circuit past view/object authz), and **checked-id == fetched-id** (the handler receives the `AuthorizedDocumentHandle` whose `fetchIdentifier` it must fetch, so an authorized-A-fetch-B substitution fails the trace).

### 15.4 Golden-SDL snapshot suite for `GeneratedSubgraph`

Standard-Schema → GraphQL-SDL generation is the single riskiest component (§19 open question): federation directives, nullability, and custom scalars must **byte-match** the reactor's shared value types, or cross-subgraph merge silently breaks. It is guarded by a golden-SDL snapshot: build the `GeneratedSubgraph`, read its `typeDefs`, and compare against a committed `.graphql` golden file. This suite **gates every projector release**.

```ts
import { GeneratedSubgraph } from "@powerhousedao/switchboard-api-oo";
import { readFileSync } from "node:fs";

it("InvoiceSubgraph SDL byte-matches the golden file", () => {
  const sg = new GeneratedSubgraph(fakeSubgraphArgs(), invoiceFields, "invoice", rt);
  const golden = readFileSync(new URL("./__golden__/invoice.graphql", import.meta.url), "utf8");
  expect(sg.typeDefs).toBe(golden);          // exact, not normalized — directive & scalar drift must fail
});
```

The golden file itself is asserted for the properties that matter: `@key`/`@shareable` federation directives present and correctly placed, every non-null `!` matching the reactor value type's nullability, and custom scalars (e.g. `DateTime`, `EthereumAddress`) referencing the shared scalar definitions rather than re-declaring them. A `nullability`/`scalar` diff fails the byte comparison — deliberately, because a normalized comparison would let exactly the drift we fear pass.

### 15.5 Cross-transport consistency test

For factory output this is a *provable* invariant, and the suite proves it: a `DocumentResource`'s `emitAll()` primitives must share **one** serializer instance **and** **one** permission map. The test emits all transports and asserts identity on *both* halves, so the generated REST/GraphQL/WS/RPC primitives cannot drift in redaction *or* policy.

The test is only meaningful if the resource actually spans wires. `DocumentResourceConfig.transports` **defaults to `["graphql"]`**, so `invoiceResource` must be constructed with every transport enabled or the emitted set collapses to GraphQL and the cross-transport assertion is vacuous:

```ts
// Built ONCE from a shared serializer + a shared CrudPermissionMap, and — crucially — opted into
// all four wires (the default ["graphql"] would make the cross-transport set below vacuous).
const invoiceCrudPermissions: CrudPermissionMap = invoicePolicy;   // the ONE permission map
const invoiceResource = new DocumentResource<InvoiceState, InvoiceRow>({
  name: "invoice", version: "1.0.0",
  documentModel: invoiceModel,
  serializer: invoiceSerializer,             // the ONE serializer instance
  read: invoiceRead, write: invoiceWrite,
  permissions: invoiceCrudPermissions,
  transports: ["graphql", "rest", "ws", "rpc"],
});

it("emitAll shares one serializer AND one permission map across transports", () => {
  const all = invoiceResource.emitAll();
  const primitives = [
    ...(all.graphql ?? []), ...(all.rest?.views ?? []),
    ...(all.ws ?? []), ...(all.rpc?.methods ?? []),
  ];

  // (1) redaction — every emitted primitive points at the SAME serializer instance,
  //     so ownerAddress redaction is guaranteed identical on every wire.
  expect(new Set(primitives.map((e) => e.serializer)).size).toBe(1);

  // (2) policy — every primitive's permissionClasses is one of the arrays IN the single shared
  //     CrudPermissionMap, never a per-transport copy. This is the half a serializer-only check
  //     misses: a defect that let redaction converge while policy silently diverged fails HERE.
  const sharedPolicies = new Set(Object.values(invoiceCrudPermissions));
  for (const e of primitives) expect(sharedPolicies.has(e.permissionClasses)).toBe(true);
});
```

Asserting only serializer-instance identity would half-cover the invariant: it proves redaction converges but says nothing about authorization, so a bug that handed one transport a divergent policy array while every wire still shared the serializer would pass. Assertion (2) closes that gap by proving each emitted primitive's `permissionClasses` is *identity-shared* from the one `CrudPermissionMap` the resource was configured with, never a copy that could drift.

> **The honest boundary (§12).** This test can only be written for `DocumentResource` output. Two *hand-written* primitives for the "same" Invoice concept — a `RestView` and a `GraphQLQuery` authored separately — can still diverge; SOF offers no runtime that forces them to converge. The §19 open question of a CI lint flagging same-logical-id endpoints not originating from a shared resource is the mitigation, not this test.

### 15.6 Namespace-hashing test for read models

`RelationalDbProcessor.getNamespace` returns raw `${name}_${driveId}` by default, which overruns Postgres' 63-byte identifier cap and collides/truncates (§4 real-seam gotcha). Every generated read-model class **must** override `getNamespace` to route through `hashNamespace`, and a test asserts it — both the length bound and stability.

```ts
import { InvoiceReadModel } from "@acme/invoice-api";

it("InvoiceReadModel namespaces stay under the Postgres 63-byte cap and are stable", () => {
  const driveId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const ns = InvoiceReadModel.getNamespace(driveId);
  expect(ns.length).toBeLessThanOrEqual(63);
  expect(ns).toBe(InvoiceReadModel.getNamespace(driveId));   // deterministic (fnv1a→base26)
  expect(ns).not.toBe(InvoiceReadModel.getNamespace("00000000-0000-0000-0000-000000000000")); // no collision
});
```

Together these six suites make the SOF security guarantees continuously verifiable rather than merely designed: the strategy objects prove their own hooks (15.1–15.2), the pipeline proves its invariant order and deny-by-default (15.3), the projector proves its SDL does not drift (15.4), the factory proves its cross-transport serializer *and* policy identity (15.5), and the read models prove they will not silently truncate in production (15.6).

---

## 16. Required core changes to reactor-api

Everything in §§7–15 assembles above a boundary SOF does not yet own. GraphQL is the *only* transport a contributed package can reach today: a package exports classes through `<pkg>/subgraphs`, `PackageManager.loadSubgraphs` discovers them, and `GraphQLManager.registerSubgraphInstance` mounts them (§13). There is no equivalent seam for REST, RPC, WebSocket, or webhook primitives, because the objects those primitives must attach to are *private* on `GraphQLManager`:

```ts
// packages/reactor-api/src/graphql/graphql-manager.ts (verified)
class GraphQLManager {
  private readonly httpAdapter: IHttpAdapter;      // line 140 — the REST/RPC/webhook mount seam
  private readonly wsServer: WebSocketServer;      // shared WS server; setMaxListeners(0) at line 160
  #authMiddleware: AuthFetchMiddleware;            // line 114 — private #
  #driveMiddleware: DriveFetchMiddleware;          // line 115 — private #
  // already-public accessors — the pattern to follow:
  getBasePath(): string;                           // line 417
  getAuthorizationService(): IAuthorizationService;
}
```

> **Honest boundary (unchanged from §11/§12).** Until the wiring below lands, `RestProjector`, `RpcProjector`, `WsProjector`, and `WebhookProjector` cannot mount — only `GraphQLProjector` works end-to-end. This is a stated limitation, not a defect: `GeneratedSubgraph` rides the existing `registerSubgraphInstance` seam, so the GraphQL half of a `DocumentResource` ships today; the non-GraphQL half waits on §16.

These edits are **additive, one-time plumbing** — the same posture as SAF §13. They expose interfaces the host already holds; they do not touch dispatch, authorization, or any per-feature code. Once landed, every future SOF primitive mounts through them with zero further core changes. That is the OCP guarantee: the core opens *once*, and SOF extends against the opened interfaces forever after.

### 16.1 Expose the mount seams (or hand `ProjectionDeps` in)

There are two acceptable shapes. Both terminate at the frozen `ProjectionDeps` (Appendix A) that every `TransportProjector.project` consumes.

**Option A — public accessors on `GraphQLManager`**, mirroring `getBasePath()`/`getAuthorizationService()`. Only two fields are actually private and need a new accessor — `httpAdapter` and `wsServer`:

```ts
// additive to GraphQLManager — read-only, no behavior change
getHttpAdapter(): IHttpAdapter { return this.httpAdapter; }
getWsServer(): WebSocketServer { return this.wsServer; }   // the ONE shared server (§14)
```

`PubSub` needs no accessor: `getPubSub()` is already a **public module-level singleton export** (`reactor/pubsub.ts:11`), importable directly by `server.ts` or the projector runtime. `SwitchboardOO` then assembles `ProjectionDeps` — pulling the two private seams from the manager, the authorization seam from the existing `getAuthorizationService()`, and `pubsub` from the module import:

```ts
import { getPubSub } from "@powerhousedao/reactor-api/reactor/pubsub";

const deps: ProjectionDeps = {
  httpAdapter:    gqlManager.getHttpAdapter(),
  graphqlManager: gqlManager,
  wsServer:       gqlManager.getWsServer(),
  pubsub:         getPubSub(),                        // module singleton — already public
  authService:    gqlManager.getAuthorizationService(),  // IAuthorizationService
  subgraphArgs,                       // the same bag registerSubgraph injects
  corsAllowlist:  ["https://app.acme.example"],  // REQUIRED — see §16.3
};
await switchboard.project([new GraphQLProjector(), new RestProjector()], deps);
```

**Option B — `server.ts` constructs `ProjectionDeps` directly** and hands it to `SwitchboardOO.project`. `server.ts` already holds the `IHttpAdapter`, the shared `WebSocketServer`, and the `IAuthorizationService` (the authorization decision seam, returned by `getAuthorizationService()`, `authorization.service.ts`) at construction, so it can populate those fields of `ProjectionDeps` without widening `GraphQLManager`'s surface at all. It additionally imports the module-level `getPubSub()` and supplies `subgraphArgs` and `graphqlManager` from what it already constructs — everything `ProjectionDeps` requires. (Note that `server.ts` also holds the *authentication* `AuthService` — `auth.service.ts`, owner of `verifyBearer`/`authenticateRequest`, §16.2 — separately; that service backs `BearerAuthenticator` and is distinct from the `IAuthorizationService` that fills `ProjectionDeps.authService`.) Option B keeps `GraphQLManager` encapsulated; Option A is the smaller diff and matches the existing accessor precedent. Either satisfies the contract — projectors only ever see `ProjectionDeps`.

### 16.2 Expose `verifyBearer` for non-GraphQL GET auth

The GraphQL surface is POST-only, and `AuthService.authenticateRequest` **short-circuits GET and OPTIONS to an empty context** (`auth.service.ts:51`). A `RestView` with `method: "GET"` routed through `createAuthFetchMiddleware` would therefore run *unauthenticated* — no token is ever verified. The host already ships the correct primitive for this:

```ts
// auth.service.ts:66 — explicitly documented "Use this from non-GraphQL"
verifyBearer(authorization: string | undefined): Promise<AuthContext>;
```

`BearerAuthenticator` (Appendix A) calls `verifyBearer` directly rather than `authenticateRequest`, so a GET read is authenticated on the FIXED pipeline stage (§5) exactly like a POST. The one-time change is simply to keep `verifyBearer` public and stable; SOF must never fall back to `authenticateRequest` for a wire that exposes GET.

> **Why this is load-bearing.** `ExecutionContext.user` is `undefined ⇒ anonymous`, and authz fails closed — so a silently-unauthenticated GET does not *error*, it just arrives anonymous. That is safe-by-accident, not safe-by-design: a GET whose `permissionClasses` include an `ObjectOwnerPermission` or a `DocumentPermission` check evaluates that check against an *empty* `ctx.user`, and a handler that scopes rows by `ctx.user` cannot scope at all — those decisions misfire the moment the identity they depend on is missing. `verifyBearer` closes that gap by populating the identity the object-level and per-user checks are written against.

### 16.3 Set explicit `corsOptions` (close reflect-any-origin)

`GraphQLManager.init` calls `httpAdapter.setupMiddleware({ bodyLimit: '50mb' })` with **no `corsOptions`** (`graphql-manager.ts:195`), and the Express adapter does `this.#router.use(cors(corsOptions))` (`adapter-http-express.ts:73`). With `corsOptions` undefined, the `cors` package reflects the request `Origin` (effectively `*`). Every new transport mounted on the same router inherits that permissive default. The `ProjectionDeps.corsAllowlist` is therefore **required, not optional** — there is no reflect-any fallback in SOF:

```ts
// IHttpAdapter.setupMiddleware({ corsOptions?, bodyLimit? }) — gateway/types.ts
deps.httpAdapter.setupMiddleware({
  corsOptions: { origin: deps.corsAllowlist as string[], credentials: true },
  bodyLimit: "50mb",
});
```

An empty `corsAllowlist` means same-origin only — never `origin: true`. `Router.build()` and `SwitchboardOO` refuse to project without an explicit allowlist.

### 16.4 Do NOT reuse the drive middleware for non-GraphQL wires

`createDriveFetchMiddleware` is **GraphQL-body-shaped**: `isCacheBypassOperation` does `await request.clone().json()` and reads `body.operationName` / `body.query` (`drive-middleware.ts:72–81`), returning **421 Misdirected Request** for a shard it has not cached. A REST/RPC/webhook `FetchHandler` sends JSON with neither field — the cache-bypass check silently fails to `wrongShardResponse` for any `Drive-Id` not already cached, and a non-JSON body throws and is swallowed to `false`.

> **The rule.** Non-GraphQL projectors authenticate through `BearerAuthenticator` (which calls `verifyBearer` directly and is GET-safe, §16.2) for GET reads and through the `authenticateRequest`-based `createAuthFetchMiddleware` for POST writes — never `authenticateRequest` for a GET, since it short-circuits to an empty context. They **never** compose `createDriveFetchMiddleware`. These are two distinct mechanisms: `createAuthFetchMiddleware` wraps `authenticateRequest` (POST-only bearer verification); `BearerAuthenticator` is a separate authenticator that calls `verifyBearer` — one is not composed "via" the other. Drive-shard scoping for REST/RPC lives inside the primitive instead — `GenericView.getQuery` requires a *validated* `driveId` and list-capable views carry `DriveMemberPermission` (§12, §14), which is stronger than a body-sniffing 421 and works for any wire shape.

### 16.5 Summary of the one-time diff

| Change | File / seam | SOF consumer | Mirrors SAF §13 |
|---|---|---|---|
| Public `getHttpAdapter()`/`getWsServer()` (Option A) or `server.ts` builds `ProjectionDeps` (Option B); `pubsub` from the already-public module-level `getPubSub()` | `graphql-manager.ts:140,160` / `server.ts` / `pubsub.ts:11` | `ProjectionDeps.httpAdapter`, `.wsServer`, `.pubsub` | §13.1 |
| Keep `verifyBearer` public + GET-safe | `auth.service.ts:66` | `BearerAuthenticator` | §13.1 (auth accessors) |
| Thread explicit `corsOptions` from `corsAllowlist` | `graphql-manager.ts:195` → `setupMiddleware` | `ProjectionDeps.corsAllowlist` | §13.3 |
| Non-GraphQL wires bypass drive middleware | `drive-middleware.ts:72` | `Rest/Rpc/WebhookProjector` | (new; SOF-specific) |

Each item exposes an interface `reactor-api` already depends on internally (or, for `pubsub`, already exports publicly). None changes GraphQL behavior, none is per-feature, and all four together are a single reviewable PR. Whether SOF owns that PR or it lands as a separate core change first is the open question tracked in §19; the answer does not alter the contract above — projectors bind to `ProjectionDeps` regardless of who wires it.

---

## 17. Packaging, codegen & migration

SOF ships as a single package, `@powerhousedao/switchboard-api-oo`, and is consumed at three *authoring altitudes* that lower to the same runtime: **plain classes** (the source of truth and the CI/type-test path), **optional decorator sugar**, and **factory generation** (`DocumentResource`). This section fixes the package layout, states the decorator stance operationally, specifies scaffolding, and gives the migration path off a hand-written `BaseSubgraph`.

### 17.1 Package layout — tree-shakeable subpaths

The package is layered so that a consumer who only writes a `GraphQLQuery` never pulls the REST/RPC/WS projectors, the DRF generics, or the decorator sugar into their bundle. Each layer is an ESM subpath export with no side effects (`"sideEffects": false`), so unused layers are dropped by SWC/esbuild/Rollup.

| Subpath | Ships | Depends on |
| --- | --- | --- |
| `@powerhousedao/switchboard-api-oo/core` | Kernel: `Endpoint`, `ExecutionPipeline`, `ExecutionContext`, `ApiError`/`ApiErrorCode`, `Container`/`Token`, `CapabilityInjector`, validation boundary | Powerhouse type-only imports |
| `.../permissions` | `BasePermission`, builtins, `AndPermission`/`OrPermission`/`NotPermission`, `and`/`or`/`not`/`P` (§7) | `core` |
| `.../primitives` | L1: `RestView`/`RestController`, `GraphQLField`/`GraphQLQuery`/`GraphQLMutation`/`GraphQLSubscription`/`GeneratedSubgraph`, `WebSocketGateway`, `RpcMethod`/`RpcService`, `InboundWebhook`/`OutboundWebhook` | `core`, `permissions` |
| `.../generics` | L2 DRF batteries: `Serializer`/`DocumentSerializer`, `GenericView`, the five CRUD mixins, paginators/filters, `DocumentModelViewSet`, `DocumentResource` factory | `primitives` |
| `.../projectors` | L3 host wiring: `ProjectionRuntime`, `GraphQLProjector`/`RestProjector`/`WsProjector`/`RpcProjector`/`WebhookProjector`, `Router`, `ApiModule`, `SwitchboardOO` | `primitives` |
| `.../decorators` | Optional Stage-3 sugar (`@Controller`, `@Query`, `@Permissions`, …) | `core` |
| `.../codegen` | Scaffolding templates (build-time only; never bundled at runtime) | — |

> **Type-only up-references (no cycle).** The L1 primitive signatures reference `ProjectionRuntime`/`ProjectionDeps`, which live in the L3 `projectors` layer — `RestView.toFetchHandler(rt: ProjectionRuntime)`, `GraphQLField.toResolver(rt: ProjectionRuntime)`, `WebSocketGateway.attach(rt: ProjectionRuntime, deps: ProjectionDeps)`. These are **type-only** references: they appear only in signatures, are erased at build, and emit no runtime `import`, so the dependency arrows stay acyclic and there is no tree-shaking hazard. (If a stricter build ever needs the arrows acyclic at the *type* level too, relocate the `ProjectionRuntime`/`ProjectionDeps` declarations down into `core`, which both `primitives` and `projectors` may import.)

A consumer package (Invoice) contributes exactly as a subgraph package does today — the nominal `<pkg>/subgraphs` discovery path — because **only GraphQL is package-contributable until the §16 host wiring lands** (see the honest-boundary note below):

```
@acme/invoice-api/
  subgraphs/index.ts    -> export { InvoiceSubgraph }   // extends GeneratedSubgraph; own constructor(args: SubgraphArgs) → new C(SubgraphArgs)-compatible
  processors/index.ts   -> export { InvoiceReadModel }   // RelationalDbProcessor<InvoiceDb> over table "invoice"
  invoice.resource.ts   -> the DocumentResource config (one serializer + one CrudPermissionMap)
```

> **Honest boundary.** The package (`<pkg>/subgraphs`) path is **nominal**: `GraphQLManager` does `new subgraph(SubgraphArgs)`, so a contributed class MUST be constructor-compatible with `new C(SubgraphArgs)` — a single required argument. `GeneratedSubgraph` *itself* is **not** that shape: its constructor is `constructor(args: SubgraphArgs, fields: readonly GraphQLField[], name: string, rt: ProjectionRuntime)` — four required arguments — so `new GeneratedSubgraph(subgraphArgs)` would leave `fields`/`name`/`rt` undefined and cannot be package-contributed directly. A package therefore contributes a **subclass** of `GeneratedSubgraph` whose own constructor is `constructor(args: SubgraphArgs)` and calls `super(args, fields, name, rt)`, binding the field set / subgraph name / `ProjectionRuntime` at construction. The generated `InvoiceSubgraph` wrapper (§17.3) is exactly that subclass; it — not a bare `GeneratedSubgraph` — is what satisfies the nominal seam. In-process registration is *structural* and looser: `GraphQLManager.registerSubgraphInstance` accepts anything matching the `ISubgraph` shape (`{ name, path?, resolvers, typeDefs, … }`), with no `BaseSubgraph`/`GeneratedSubgraph` inheritance required. `SwitchboardOO.register` is the app-level registry that *wraps* that seam; it accepts `DocumentResource | Endpoint | ApiModule | RestController | RpcService` and never a raw `ISubgraph`. REST/RPC/WS/webhook cannot be driven from inside a package because `GraphQLManager` keeps `httpAdapter`/`wsServer`/the drive & auth middlewares private; those transports are projected **once, in the host boot** through `ProjectionDeps`, which depends on the accessors specified in §16.

### 17.2 The decorator stance, operationally

Decorators are **optional Stage-3 (TC39/TS 5+) standard decorators**. The monorepo ships **zero `@nestjs/*`, zero `reflect-metadata`, and no `experimentalDecorators`/`emitDecoratorMetadata`** — and SOF adds none. Concretely:

- Using the sugar requires **no `tsconfig` change**. Stage-3 decorators are the default under TS 5 / SWC / esbuild; you do not enable `experimentalDecorators` and you do not import `reflect-metadata`.
- Decorators carry **only** routing/schema/permission metadata into the standard `context.metadata` object, and a class-decorator finalizer copies it onto the plain-class fields. They are **never** the DI mechanism and **never** the source of truth.
- There are **no parameter decorators** (Stage-3 cannot express them) and **no `design:paramtypes` type-DI** (Stage-3 cannot emit it). DI stays static: `Container` with explicit `deps` token lists at boot, `Pick<Capabilities, TCaps>` narrowing per request.
- **Plain classes are the CI/type-test path** and always compile under SWC/esbuild with no plugin. Decorated and undecorated forms produce *identical* `Endpoint` config.

Because the decorator set (Appendix A §12) carries no explicit id (there is no `@Id`), the class-decorator finalizer derives the abstract `Endpoint.id` **deterministically** for GraphQL fields as `${rootType}.${fieldName}` — so `@Resolver("Query")` + `@Query({ fieldName: "todo" })` yields exactly `"Query.todo"`. The plain form declares the same value literally, which is why the two lower to identical config. Plain (Todo):

```ts
import { GraphQLQuery } from "@powerhousedao/switchboard-api-oo/primitives";
import { AnonymousPermission } from "@powerhousedao/switchboard-api-oo/permissions";
import { z } from "zod";

export class TodoQuery extends GraphQLQuery<typeof In, typeof Out, "db"> {
  readonly id = "Query.todo";              // == `${rootType}.${fieldName}`, what the decorator finalizer derives
  readonly fieldName = "todo";
  readonly sdl = `type Todo { id: ID! title: String! done: Boolean! }
                  extend type Query { todo(id: ID!): Todo }`;
  readonly inputSchema = In;   readonly outputSchema = Out;
  readonly requires = ["db"] as const;
  readonly permissionClasses = [AnonymousPermission];   // deny-by-default: omitting this is a COMPILE error
  protected async handle(input: InferOut<typeof In>, ctx) {
    return ctx.caps.db /* … */;
  }
}
const In = z.object({ id: z.string() });
const Out = z.object({ id: z.string(), title: z.string(), done: z.boolean() });
```

Decorated sugar — same class, metadata folded into `context.metadata`, then onto the identical fields at construction (including the derived `id = "Query.todo"`):

```ts
import { Resolver, Query, Input, Output, Permissions, Requires } from "@powerhousedao/switchboard-api-oo/decorators";

@Resolver("Query")                                 // rootType = "Query"
export class TodoQuery extends GraphQLQuery<typeof In, typeof Out, "db"> {
  @Query({ fieldName: "todo", sdl: /* …same SDL… */ "" })   // fieldName = "todo" ⇒ id derived as "Query.todo"
  @Input(In) @Output(Out) @Requires("db")
  @Permissions(new AnonymousPermission())          // == plain permissionClasses; still greppable
  protected async handle(input: InferOut<typeof In>, ctx) { return ctx.caps.db /* … */; }
}
```

> **Open question (§19).** Because the sugar is permanently *less capable* than Nest (no `@Param`/`@Body` injection, no type-DI), v1 may ship plain-class + factory only and defer `.../decorators`, so we never signal Nest-parity we cannot deliver.

### 17.3 Codegen / scaffolding

`ph generate resource invoice` reads the `DocumentModelModule` for `@acme/invoice-model` and emits a `DocumentSerializer` (DTOs auto-derived, DRF `ModelSerializer`-style) plus a `DocumentResource` config wired to the read model — mirroring today's subgraph codegen templates. The `ownerAddress` field is scaffolded internal-only so it can never leak (closed-output guarantee):

```ts
// invoice.resource.ts (generated; edit in place)
export const invoiceSerializer = DocumentSerializer.fromDocumentModel(InvoiceModel, {
  fields: "__all__",
  writeOnly: ["ownerAddress"],                                 // never serialized outward
  fieldGuards: { counterparty: (ctx) => !!ctx.user },          // per-field output visibility
});

export const invoiceResource = new DocumentResource<InvoiceState, InvoiceRow>({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: InvoiceModel,
  serializer: invoiceSerializer,
  read: { source: InvoiceReadModel, table: "invoice",
          filterable: { status: { type: "string", ops: ["eq", "in"] } },
          sortable: ["createdAtUtc"], pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id" }) },
  write: { create: (dto, ctx) => ({ document: makeInvoiceDocument(dto) }),
           update: (patch) => [editInvoiceAction(patch)] },
  permissions: {                                               // ONE map shared by every emitted transport
    list:   [new DriveMemberPermission("read")],               // list-level drive scoping closes IDOR
    get:    [new DocumentPermission("read")],
    create: [new AuthenticatedPermission().and(new CreatePermission())],
    update: [new DocumentPermission("write")],
  },
  transports: ["graphql", "rest"],                             // default ["graphql"]
});
```

`invoiceResource.emitAll()` manufactures the concrete `GraphQLField[]` and `RestController` from that single serializer + permission set, so the primitives **cannot drift** — the DRF `ModelViewSet` ergonomic without SAF's projector magic. The scaffold also writes the `subgraphs`/`processors` barrels — the `subgraphs` barrel exports an `InvoiceSubgraph` that **subclasses `GeneratedSubgraph`** with a one-argument `constructor(args: SubgraphArgs)` calling `super(args, invoiceResource.emitGraphQL(), "invoice", rt)`, so it satisfies the nominal `new C(SubgraphArgs)` seam — and an empty `InvoiceReadModel` whose `getNamespace` is generated to call `hashNamespace(...)` (Postgres 63-char cap; the default raw namespace collides).

### 17.4 Migration from a hand-written `BaseSubgraph`

A hand-written subgraph and a `GeneratedSubgraph` are both `ISubgraph`s registered identically, so migration is incremental and **GraphQL-behavior-preserving**:

| Hand-written `BaseSubgraph` | SOF replacement |
| --- | --- |
| `typeDefs` string | `GraphQLField.sdl` fragments (one per field), reassembled by `GeneratedSubgraph` |
| `resolvers.Query.invoice` | a `GraphQLQuery` subclass (or `DocumentResource.emitGraphQL()`) |
| inline `assertCanRead(...)` calls | `permissionClasses` on the field; the FIXED pipeline runs authz |
| ad-hoc arg parsing | `inputSchema` + the `StandardSchemaPipe` FIXED stage |
| `reactorClient`/`relationalDb` from `SubgraphArgs` | `requires` + `ctx.caps` narrowing |

Steps:

1. Wrap the subgraph's read as a `ReadBinding` (or a `DocumentBinding`) and its mutations as a `WriteBinding`.
2. Move `typeDefs` into per-field `sdl` and express DTOs as a `DocumentSerializer`; **keep the subgraph `name`/`path` stable** so the federated schema is byte-compatible (verify against the golden-SDL snapshot — the riskiest projector surface, §19).
3. Register the generated subgraph *instead of* the hand-written class. In-process this goes through the structural seam `GraphQLManager.registerSubgraphInstance` (any `ISubgraph` shape); via the package `<pkg>/subgraphs` path it must be the `GeneratedSubgraph` **subclass** wrapper (one-arg `constructor(args: SubgraphArgs)`), never a bare `GeneratedSubgraph`. Registration is **append-only and debounced ~1s** — there is no unregister API, and re-registering the same name is a silent no-op, so swap by name at boot, never hot.
4. Once the §16 accessors exist, add `RestProjector`/`RpcProjector`/… in the host wiring to light up the other transports from the same `DocumentResource` for free.

> **Honest limitation.** Unlike SAF, SOF does **not force** cross-transport consistency for *hand-written* primitives — a hand-written `RestView` and `GraphQLQuery` for the "same" concept can diverge in policy or validation. Only the `DocumentResource` factory guarantees they share one serializer + permission map. A CI lint flagging same-logical-id endpoints across transports that do not originate from a shared resource is an open question (§19).

---

## 18. Design-principle mapping (SOLID + DI + GoF patterns)

SAF earns its coherence from a single define-once unit projected outward; SOF earns the *same* coherence from the opposite direction — a small set of plain-class roles, each with one job, composed by explicit wiring rather than reflection. This section is the load-bearing justification: it shows that the class taxonomy in Appendix A is not an arbitrary pile of base classes but a disciplined application of SOLID, static dependency injection, and named GoF / DRF / NestJS patterns. Every principle below is *structural* — enforced by the type system, the abstract members, and the FINAL `ExecutionPipeline` (§5) — not by convention.

> The whole point of the OO sibling is that the object graph itself carries the security invariants. If a principle here were only a naming convention, SOF would be strictly worse than SAF. It is not: `permissionClasses` is an abstract member (deny-by-default is a *compile* error), the pipeline stage order is a closed body no subclass can reorder, and `ctx.caps` is a `Pick` that will not typecheck if a handler reaches for an undeclared seam.

### 18.1 SOLID

**SRP — one class, one job.** Every role in the contract is a separate object with a single reason to change. This is the DRF/Nest role-separation carried to its conclusion:

| Role | Class(es) | Single responsibility |
| --- | --- | --- |
| Transport binding | `RestView` / `GraphQLQuery`·`Mutation`·`Subscription` / `WebSocketGateway` / `RpcMethod` / `InboundWebhook` (§11) | Adapt ONE wire to `Endpoint.dispatch` |
| Transport projection | `GraphQLProjector` / `RestProjector` / `WsProjector` / `RpcProjector` / `WebhookProjector` (§13) implementing `TransportProjector` | Adapt each primitive's wire + mount it; NEVER re-implement validation/authz/logic |
| Wire ⇄ shape | `Serializer` / `DocumentSerializer` (§8) | `toRepresentation` / `toInternalValue` only |
| Authorization decision | `BasePermission` subclasses (§7) | `hasPermission` / `hasObjectPermission` only |
| Input hardening | `IPipe` / `StandardSchemaPipe` (§9) | `transform(wire bytes) → typed value` |
| Paging | `SeekPaginator` / `OffsetPaginator` (§12) | `apply` + `envelope` |
| Filtering | `FilterBackend` / `compileFilter` (§12) | allowlist → parameterized SQL |
| Read source | `RelationalReadModelClass` (§12) | drive-scoped `IRelationalQueryBuilder` |
| Cross-cutting concern | `IInterceptor` (§10) | one around-advice (`logging`, `timeout`, `cache`) |
| Error rendering | `IExceptionFilter` (§11) | closed `ApiErrorCode` → one wire |

The `WriteBinding` (§12) splits `create` / `update` / `remove` the way SAF split the shared `branch` resolver from the create-only document factory: the reason `create` changes (new document construction) is different from the reason `update` changes (new action shape). `DocumentResource` does *not* violate SRP by emitting many primitives — its single job is manufacturing, and the manufactured primitives each keep their own single job. The projector row is the SRP twin of the Adapter pattern below: a `TransportProjector` may only adapt-and-mount — it funnels every call into `endpoint.dispatch` and re-implements no policy.

**OCP — extend by adding a class; core is closed.** Three orthogonal extension axes, none of which edits a core file:

```ts
// New transport → a new projector + an Endpoint subclass. Core untouched.
export class SseProjector implements TransportProjector {
  readonly transport = "rest" as const; // SSE rides the HTTP seam
  async project(endpoints: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps) { /* adapt + mount */ }
}

// New policy → a new BasePermission. Composes with every builtin.
export class InvoiceRegionPermission extends BasePermission {
  constructor(private readonly region: string) { super(); }
  async hasObjectPermission(ctx: ExecutionContext, _v: Endpoint, h: AuthorizedDocumentHandle) {
    return (await ctx.authorize.svc.canManage(h.canonical, ctx.user)) ?? false; // always-present seam
  }
}

// New concern → a new interceptor. Wraps, never reorders, a FIXED stage.
export class MetricsInterceptor implements IInterceptor {
  readonly name = "metrics"; readonly phase = "outer" as const;
  async intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O> {
    const t = performance.now();
    try { return await next(); } finally { ctx.log({ ms: performance.now() - t }); }
  }
}
```

The only OCP exception is the one-time §16 host wiring (public `IHttpAdapter` / `wsServer` accessors on `GraphQLManager`); that is per-*framework* plumbing, not per-*feature* editing, exactly as SAF's §13 host edits are.

> **Honest boundary.** OCP is fully realized *today* only for GraphQL, because only `<pkg>/subgraphs → registerSubgraph` is a public contribution seam (§13, §16). REST/RPC/WS/webhook projectors are closed-for-modification but cannot be *mounted* until the §16 accessors land. The pattern is correct; one core PR gates its reach.

**LSP — substitutable where it claims to be, split where it is not.** Every `TransportProjector` is honestly substitutable behind its interface: `GraphQLProjector`, `RestProjector`, `WsProjector`, `RpcProjector`, `WebhookProjector` differ only in wire adaptation and can be swapped freely by `SwitchboardOO.project`. The same holds for `IAuthenticator` (Chain of Responsibility, §7) and `IInterceptor`. But pagination is deliberately **two interfaces, not one leaky base**, precisely because `SeekPaginator` and `OffsetPaginator` are *not* Liskov-substitutable — a seek paginator requires an `orderBy` + `tieBreaker` sort input that an offset paginator neither needs nor accepts:

```ts
const invoices = keyset<InvoiceRow>({ orderBy: "createdAtUtc", tieBreaker: "id", default: 50, max: 200 });
const audit    = offset<InvoiceRow>({ default: 25, max: 100 });
// A caller cannot pass a seek cursor to `audit` — the shapes don't unify. No base class pretends they can.
```

Forcing both under one `Paginator` base would make `apply(qb, sort, page)` lie about what `sort` it accepts. Two named constructors surface the constraint at authoring time instead of as a runtime surprise (SAF makes the identical call in its §7.x).

**ISP — narrow the surface each collaborator sees.** `ctx.caps` is `Pick<Capabilities, TCaps>`, materialized from the endpoint's `requires` list. A handler that declared `requires: ["db", "authz"]` cannot even name `ctx.caps.reactor` — it is a compile error, not a runtime `undefined`:

```ts
class ListInvoices extends GenericView<InvoiceRow, "db" | "authz"> {
  readonly requires = ["db", "authz"] as const;
  protected async handle(input, ctx) {
    const qb = this.getQuery(ctx);       // ✅ ctx.caps.db present
    // ctx.caps.reactor  → ❌ does not typecheck: "reactor" ∉ Pick<Capabilities,"db"|"authz">
  }
}
```

Reads see `IRelationalQueryBuilder` — a **read-only** projection of Kysely — never the write-capable builder; `SearchFilter` / `ViewFilter` are the narrow reactor read surface. Every seam interface is small: `IPipe` and `IExceptionFilter` are one-method interfaces, `IThrottle` is two — each is a one-to-three-method interface. `IPermission` nominally lists five members, but four of them (`and` / `or` / `not`) are inherited from `BasePermission` and the fifth pair are the two decision hooks, so a test double subclasses `BasePermission` and overrides only `hasPermission` / `hasObjectPermission` — the composition operators come for free (the ISP testability win: a fake permission is a few lines).

**DIP — depend on capability interfaces, never on globals.** No handler imports `getPubSub()`, an Express app, or an Apollo instance. Every dependency arrives through `ctx.caps` (an interface bag) or through the boot-time `Container`. The single authorization decision seam, `IAuthorizationService`, is reached only through `ctx.authorize` (a `DocumentAuthorizer` whose `.svc` is always present) and — when the endpoint declared `requires: ["authz"]` — through `ctx.caps.authz`; a permission object never news-up an authorizer. The locked builtin `ObjectOwnerPermission(access?: "write" | "manage")` dispatches on its `access` argument; a *local* owner-check written the same way reaches the seam through `ctx.authorize.svc`, not a global:

```ts
// A user-authored permission (NOT the locked builtin) — reaches authz through the always-present seam.
export class WriteOwnerPermission extends BasePermission {
  async hasObjectPermission(ctx: ExecutionContext, _v: Endpoint, h: AuthorizedDocumentHandle) {
    return (await ctx.authorize.svc.canWrite(h.canonical, ctx.user)) ?? false; // seam, not global
  }
}
```

### 18.2 Dependency injection — static, reflection-free

SOF's DI is DIP made concrete without a runtime container graph. There are two clocks:

- **Boot time.** `Container` wires host providers with explicit `useValue` / `useClass` / `useFactory` recipes whose dependencies are an explicit `Token[]` list — never read from constructor `design:paramtypes` (the repo ships no `reflect-metadata`, no `emitDecoratorMetadata`; §17). `Container.toCapabilities()` assembles the `Capabilities` bag from the well-known tokens (`REACTOR`, `DB`, `ANALYTICS`, `AUTHZ`, `PUBSUB`).
- **Request time.** `CapabilityInjector.narrow(requires)` produces `ctx.caps = Pick<Capabilities, TCaps>`. There is *no* per-request container resolution, no REQUEST-scope contagion, no bootstrap-time resolution error class — `ctx` is a plain per-call object.

```ts
const container = new Container()
  .provide({ token: REACTOR, useValue: reactorClient })
  .provide({ token: AUTHZ,   useFactory: (r) => new AuthorizationService(r), inject: [REACTOR] });
const app = new SwitchboardOO({ container, corsAllowlist: ["https://app.acme.example"] });
```

### 18.3 GoF / DRF / NestJS patterns

| Pattern | SOF mechanism | DRF / Nest lineage |
| --- | --- | --- |
| Template Method | `Endpoint.dispatch` → FINAL `ExecutionPipeline.run` | `APIView.dispatch` / Nest guard→pipe→handler order |
| Composite | `And`/`Or`/`NotPermission` + `and`/`or`/`not` | DRF `&|~` `OperandHolder` metaclass |
| Strategy | `permissionClasses`, `throttleClasses`, `interceptors`, `authenticators`, `serializer`, `Paginator` slots | DRF pluggable `*_classes`; Nest providers |
| Chain of Responsibility | `authenticators` (first non-null wins); interceptor `outer`/`inner` phases | Passport strategies; Nest interceptor chain |
| Adapter | `Serializer` (shape ⇄ wire); `toResolver` / `toFetchHandler` / `attach` (endpoint → wire); `TransportProjector` (mount) | DRF `Serializer`; Nest per-transport binders |
| Factory / Registry | `DocumentResource.emit*`, `Router`, `Container` | DRF `ModelViewSet` + `Router`; Nest DI |
| Mixin | `ListModelMixin` … `DestroyModelMixin` | DRF `*ModelMixin` |
| Observer / PubSub | `GraphQLSubscription` / `WebSocketGateway` over `getPubSub` | Nest `@Subscription`; gateways |
| Facade | `ApiModule.forRoot` / `forFeature`; `SwitchboardOO` | Nest dynamic modules |

**Template Method.** `Endpoint.dispatch` is the classic template method: it delegates to the *one* `ExecutionPipeline` body that hard-codes `authenticate → throttle → input-validation → view-authz → object-authz → handle → closed-output`. Subclasses override the single primitive operation `handle()` (plus the wire adapter) and *nothing else*. This is where deny-by-default and validation-before-object-authz become impossible to skip — there is no `@UseGuards` you can forget, because the guard slot is not a slot, it is a fixed stage.

> **The `final` caveat, stated honestly (§19).** TypeScript has no `final`. The "never override `dispatch()` / `ExecutionPipeline`" invariant is enforced by a lint rule + convention, not the compiler. SAF captures its pipeline in a construction-time closure; whether SOF should do the same (at the cost of a less idiomatic class shape) is an open question.

**Composite.** Permissions form an expression tree. Leaves are builtins (`AllowAny`, `AuthenticatedPermission`, `DocumentPermission`, `ObjectOwnerPermission`, `DriveMemberPermission`, …); internal nodes are `AndPermission` / `OrPermission` / `NotPermission`. `OrPermission` reproduces DRF's object-level short-circuit — `(a.hasPermission && a.hasObjectPermission) || (b…)` — not a naive boolean of two independent calls. The headline composition:

```ts
// Invoice read: public link OR (authenticated AND owner). Reads at both view and object level.
readonly permissionClasses = [
  or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission())),
] as const;
```

**Strategy.** Almost every extensibility point is a strategy slot on the endpoint: swap `throttleClasses = [new AnonRateThrottle("30/min")]`, add a `CacheInterceptor`, choose a `SeekPaginator`, hand in a different `Serializer` — all without touching `handle()` or the pipeline.

**Chain of Responsibility.** `authenticators` runs in order, first non-null `Identity` wins, falling through to anonymous (fail-open into the pipeline, where authz then fails *closed*). Interceptor `outer` phases wrap pre-authz concerns (rate-limit, logging), `inner` phases wrap post-authz concerns (cache, redaction) — the phase label is the chain position, replacing RxJS pipe-position with a Promise-based `next()` and no RxJS dependency.

**Adapter.** `Serializer` adapts stored/document shape ⇄ wire representation. The transport primitives are wire adapters over the shared `Endpoint`: `GraphQLField.toResolver`, `RestView.toFetchHandler`, `WebSocketGateway.attach`, `RpcService.toFetchHandler`; and each `TransportProjector` is the coarse-grained adapter that adapts and mounts those primitives onto the host seams. Critically, an adapter *may not* re-implement validation/authz/logic — it can only funnel to `endpoint.dispatch`. That is what stops the hand-written REST and GraphQL versions of "the same" endpoint from silently diverging in policy.

> **Where the guarantee stops.** Only the `DocumentResource` factory *forces* cross-transport consistency (one serializer + one `CrudPermissionMap`, so the emitted primitives cannot drift). Two hand-written primitives for the same concept can still diverge; §19 raises a lint/CI rule flagging same-logical-id endpoints that do not originate from a shared resource.

**Factory / Registry.** `DocumentResource` reads an `InvoiceReadModel` + `DocumentModelModule` and manufactures L1 primitives across transports (`emitRest` / `emitGraphQL` / `emitWs` / `emitRpc` / `emitAll`) from ONE shared config — the DRF `ModelViewSet` ergonomic without SAF's projector magic. `Router` is the DRF-router analog whose `build()` is also the security backstop (non-empty policy, list views carry `DriveMemberPermission`, closed output schema). `Container` is the provider registry.

```ts
const invoices = new DocumentResource<InvoiceState, InvoiceRow>({
  name: "invoice", version: "1.0.0", basePath: "/invoices",
  documentModel: invoiceModel,
  serializer: DocumentSerializer.fromDocumentModel(invoiceModel, { writeOnly: ["ownerAddress"] }), // never leaks
  read: { source: InvoiceReadModel, table: "invoice", filterable: {/*…*/}, sortable: ["createdAtUtc"],
          pagination: keyset({ orderBy: "createdAtUtc", tieBreaker: "id" }) },
  permissions: {
    list:   [new DriveMemberPermission("read")],           // closes list IDOR (Router.build enforces)
    get:    [or(new AnonymousPermission(), and(new AuthenticatedPermission(), new ObjectOwnerPermission()))],
    create: [new CreatePermission()],
    update: [new DocumentPermission("write")],
  },
  transports: ["graphql", "rest"],
});
new Router({ corsAllowlist }).register(invoices).build();
```

**Mixin.** TS has no multiple-inheritance diamond, so CRUD verbs are mixin *functions* (`ListModelMixin` … `DestroyModelMixin`), each adding one action + its `perform`-hook (`create_` / `update_`) onto a `GenericView`.

**Observer / PubSub.** `GraphQLSubscription` and `WebSocketGateway` are observers over the single in-process `getPubSub()` `PubSub`, attaching to the ONE shared `WebSocketServer` (refcounted disposers, no listener leak). The Chat example's `messageAdded` subscription runs the FIXED authz preamble *before* yielding, then streams.

**Facade.** `ApiModule.forRoot` / `forFeature` is the NestJS dynamic-module analog — a typed provider bag with no scanning — and `SwitchboardOO` is the app facade holding the `Container` + registry and driving projectors against the host.

### 18.4 DRF fidelity

`BasePermission` ports `rest_framework.permissions.BasePermission` with `hasPermission ← has_permission` and `hasObjectPermission ← has_object_permission` (invoked only when a subject is present, exactly as DRF calls `check_object_permissions` on `get_object`). Defaults return `true` — DRF-faithful — so single-hook permissions compose; deny lives at the `Endpoint`, not in the permission. `Endpoint.dispatch`/`ExecutionPipeline` ← `APIView.dispatch`/`initial`; `GenericView` ← `GenericAPIView` (`getQuery`←`get_queryset`, `getObject`←`get_object`); the five mixins ← DRF's `*ModelMixin`; `DocumentModelViewSet` ← `ModelViewSet`; `Serializer`/`DocumentSerializer.fromDocumentModel` ← `Serializer`/`ModelSerializer.get_fields`; `fieldGuards` ← field-level `read_only`/`write_only`; `Paginator` ← Cursor/LimitOffset; `Throttle` ← `SimpleRateThrottle`. **Deliberate divergences:** `permissionClasses` is abstract (DRF defaults to `[AllowAny]` — SOF is strictly stronger); list views carry `DriveMemberPermission` at view level (DRF never runs a per-row object check on collections — the IDOR footgun we close); throttle runs *before* input parse to shed load (DRF runs it after permissions); and settings-based global strategy resolution is replaced by explicit class-attribute slots + `Container` — nothing ambient.

### 18.5 NestJS fidelity

`IPermission` doubles as `CanActivate` (its `hasPermission` *is* `canActivate`); the FIXED view/object-authz stages are where Nest would call guards. `ExecutionContext` ← Nest `ExecutionContext`/`ArgumentsHost` with `getType()`/`switchToHttp()`/`switchToWs()`/`switchToRpc()`; `IPipe`/`StandardSchemaPipe` ← `PipeTransform`/`ValidationPipe`; `IInterceptor.intercept(ctx, next)` ← `NestInterceptor` around-advice (Promise-based, no RxJS); `IExceptionFilter` ← `ExceptionFilter`, but one filter per primitive mapping the ONE closed `ApiErrorCode` union (Nest has an open `HttpException` tree — we reject that drift). Transport primitives ← Nest per-transport decorators, `ApiModule.forRoot`/`forFeature` ← dynamic modules, `SiweAuthenticator`/`BearerAuthenticator` ← Passport strategies populating `ctx.user`. **The decorator stance:** the monorepo ships ZERO `@nestjs/*`, ZERO `reflect-metadata`, and NO `experimentalDecorators`. SOF's decorators (§17) are therefore OPTIONAL Stage-3 standard decorators that write only routing/schema/permission metadata into `context.metadata` and lower to identical plain-class config — never the DI mechanism, never the source of truth; there are no parameter decorators and no type-based DI. We pointedly reject Nest's opt-in-by-default `@UseGuards` (forgetting one is a *compile* error here), the reflect-metadata runtime, REQUEST-scope contagion, guard-before-pipe ordering that starves object-authz of typed input, same-service-many-transports drift, and the open exception hierarchy.

---

## 19. Known limitations & open questions

SOF is honest about the seams it stands on and the guarantees it can and cannot make. Where SAF closes a gap *structurally* (one projector, one pipeline, no author in the loop), SOF is class-first and therefore sometimes closes the same gap *by discipline* — abstract members, `build()` backstops, and lint — rather than by construction. This section states every such boundary and the open decisions attached to it.

### 19.1 Cross-transport consistency is enabled, not enforced, for hand-written primitives

SAF's structural guarantee is that a single `OperationDef` is projected to every wire, so the REST and GraphQL faces of one concept *cannot* diverge. SOF only reproduces that guarantee for primitives emitted by `DocumentResource` / `DocumentModelViewSet`, which share one `DocumentSerializer` and one `CrudPermissionMap` across `emitRest()`/`emitGraphQL()`/`emitWs()`/`emitRpc()`. A hand-written `RestView` and a hand-written `GraphQLQuery` for the "same" Todo are two independent classes and can silently drift in validation, policy, or logic:

```ts
class RestGetTodo extends RestView {
  readonly method = "GET" as const;
  readonly path = "/todos/:id";
  readonly permissionClasses = [new DocumentPermission("read")];   // reader
  readonly inputSchema = z.object({ id: z.string() });
  // ...
}
class GqlGetTodo extends GraphQLQuery {
  readonly fieldName = "todo";
  readonly permissionClasses = [new AllowAny()];                   // DRIFT: public!
  readonly inputSchema = z.object({ id: z.string().max(64) });     // DRIFT: stricter
  // ...
}
```

> **Honest boundary.** Nothing in the type system links these two classes. The `DocumentResource` factory is the *only* structural fix. **Open question:** should we ship a CI/lint rule that flags two endpoints sharing a logical id across transports that do **not** originate from a shared resource or service, forcing authors either to converge or to acknowledge the split?

### 19.2 The FINAL pipeline is a convention, not a compiler guarantee

`Endpoint.dispatch()` and `ExecutionPipeline.run()` carry the entire security skeleton (authenticate → throttle → input-validation → view-authz → object-authz → handler → closed-output). TypeScript has no `final` keyword, so "never override `dispatch()`/`run()`" is enforced by convention, an ESLint rule, and a `Router.build()` re-check — not the compiler. A determined subclass can still shadow `dispatch()`.

> **Open question.** Should we seal the pipeline the way SAF seals its middleware — capture the run closure at construction so a subclass structurally cannot re-enter it — at the cost of a less idiomatic class shape and harder subclass testing? The lint-plus-`build()` posture is pragmatic today; the closure posture is stronger.

### 19.3 Deny-by-default catches omission, not thoughtlessness

`Endpoint.permissionClasses` is an abstract member, so an endpoint that declares *no* authorization is a compile error, and an empty `[]` is rejected at runtime and again by `Router.build()`. That is strictly stronger than DRF's `DEFAULT_PERMISSION_CLASSES = [AllowAny]`. But it only forces a *decision*; it does not force a *good* one — an author can still write the greppable opt-out thoughtlessly:

```ts
readonly permissionClasses = [new AllowAny()];  // compiles; wide open
```

> **Open question.** SAF's `TAuth` type-state made the *builder* refuse to finish until authorization was proven non-trivial. Is there a type-level equivalent for the class path — e.g. a branded `RequiresExplicitPublic` marker the author must import and pass — so that going public is more deliberate than a bare `AllowAny`/`AnonymousPermission`? We keep the DRF-faithful class-list ergonomic for now, accepting the mild footgun.

### 19.4 Realtime and webhook fan-out is single-process

`getPubSub()` returns one in-process `graphql-subscriptions` `PubSub`, and there is a single shared `WebSocketServer` for the whole process (§11, §13). `GraphQLSubscription`, `WebSocketGateway`, and `OutboundWebhook` egress are therefore per-node. A horizontally scaled Switchboard needs an external broker (Redis/NATS) behind `getPubSub()`.

> **Open question.** Who owns that broker adapter — SOF or `reactor-api`? SOF cannot introduce it without a host change to how `pubsub` and `wsServer` are provisioned in `ProjectionDeps`.

### 19.5 Standard-Schema → GraphQL-SDL generation is the single riskiest component

`GeneratedSubgraph` derives its `sdl` from the same `Schema` the pipeline validates against. Federation directives, nullability, enums, and custom scalars (`DateTime`, `JSONObject`) must byte-match the reactor's shared value types or cross-subgraph composition breaks at gateway assembly. This is the one place a projector can produce a technically valid schema that federates incorrectly.

> **Open question.** Who owns the golden-SDL snapshot suite (including cross-subgraph composition), and does it gate every projector release? Until it does, `emitGraphQL()` output should be treated as review-required, not fire-and-forget.

### 19.6 Read-your-write staleness on relational lists

The `ReadBinding` substrate (`RelationalReadModelClass` → Kysely) is populated asynchronously off job-completion events (the reactor's `JOB_WRITE_READY`) with no consistency-token gating. A `create`/`update` returns the reactor's own strongly-consistent re-read, but a `list` issued immediately after a write may be momentarily stale. SOF deliberately does **not** pretend a token-gated relational read exists — the substrate cannot provide one.

### 19.7 Canonical-id memo off the GraphQL path

`DocumentAuthorizer.canonical()` is the only sanctioned slug→`CanonicalDocumentId` path. On the GraphQL path that resolution is memoized per-request inside `BaseSubgraph`. The non-GraphQL `DocumentAuthorizer` used by `RestProjector`/`RpcProjector` must share that same per-request memo, or REST/RPC pay an unmemoized resolve per authorized op.

> **Open question.** Where does the shared per-request memo live in `ProjectionRuntime.makeContext()` so every transport's `ctx.authorize` reuses it? It cannot hang off `BaseSubgraph` for the non-GraphQL wires.

### 19.8 Validation CPU on hot read paths

The FIXED input-validation stage (`StandardSchemaPipe`) runs `~standard.validate` on every request, and `Serializer.toRepresentation` re-parses output. That is CPU the current type-trusting reactor path avoids. For GraphQL specifically, Apollo has *already* validated arguments against SDL compiled from the same `Schema`, which suggests the `GraphQLProjector` *could* skip the redundant input parse for that transport. The transport discriminator lives on the context, not on `ProjectionDeps` (which has no `transport` member and is never in scope inside `ExecutionPipeline.run(raw, ctx)`), so any such branch keys off `ctx.transport`:

```ts
// GraphQL only: args pre-validated by Apollo against the derived SDL.
// SOUND ONLY once the golden-SDL fidelity gate (§19.5) is in place.
const input = ctx.transport === "graphql"
  ? (raw as InferOut<TIn>)                 // trust Apollo's SDL validation
  : await new StandardSchemaPipe(this.inputSchema)
      .transform(raw, { source: "args" } satisfies ArgMeta, ctx);
```

> **Honest boundary.** This is a *deferred* optimization, not a default, and it is coupled to the riskiest component in the whole framework. The skip trusts Apollo's validation of the SDL that §19.5 calls "the single riskiest component" — a Standard-Schema→SDL derivation that can validate yet federate/coerce incorrectly. And `Action.input` is `unknown`: the `StandardSchemaPipe` stage is "the ONLY thing standing between wire bytes and reducers." Skipping it therefore couples a load-bearing security gate to a not-yet-gated generator. The skip is sound **only once** the golden-SDL snapshot suite (including cross-subgraph composition) gates every projector release; until then `ctx.transport === "graphql"` input MUST still be parsed and the skip is review-required, off by default.

> **Honest boundary.** The output projection stays unconditional on **every** transport — it is not an optimization target, it is the field-leak guard (§8) that redacts `ownerAddress` and enforces the closed output schema.

### 19.9 Decorator sugar is permanently less capable than Nest

The monorepo ships zero `@nestjs/*`, zero `reflect-metadata`, and no `experimentalDecorators`. SOF's decorators are OPTIONAL Stage-3 standard decorators that write only routing/schema/permission metadata into `context.metadata` and lower to identical plain-class config. Stage-3 cannot express parameter decorators and cannot emit `design:paramtypes`, so there is no `@Param`/`@Body` argument injection and no type-based DI — ever. Note the class-level `@Resolver` is still required (it too lowers to plain-class config); method decorators alone are not sufficient:

```ts
@Resolver("Query")
class TodoResolver {
  @Query({ fieldName: "todo" })
  @Permissions(new DocumentPermission("read"))
  @Input(z.object({ id: z.string() }))
  todo(input: { id: string }, ctx: ExecutionContext) { /* ctx passed by pipeline, not injected */ }
  // ctx is bare ExecutionContext: no `@Requires("db")`, so ctx.caps carries no keys
  // ✗ impossible: todo(@Param("id") id: string) — Stage-3 has no param decorators
}
```

Plain classes remain the source of truth and the CI/type-test path. **Open question:** do we ship the decorator layer in v1 at all, or defer it and lead with plain-class + factory, to avoid signaling a Nest parity we cannot deliver?

### 19.10 Only GraphQL is contributable until the §16 host wiring lands

GraphQL is the only transport with a public contribution seam today (`<pkg>/subgraphs` → `registerSubgraph`). `RestProjector`, `RpcProjector`, `WsProjector`, and `WebhookProjector` require the one-time `reactor-api` change in §16: public `IHttpAdapter`/`wsServer` accessors on `GraphQLManager`, `verifyBearer` for GET reads, and an explicit `corsAllowlist` (no reflect-any-origin default). Registration is also append-only — there is no `unregister` API, `updateRouter` is debounced ~1s, and re-registering a name is a silent no-op.

> **Open question.** Does SOF own that `reactor-api` host change, or does it land as a separate core PR first? Until it merges, REST/RPC/WS/webhook primitives compile and unit-test against `ProjectionRuntime` but cannot mount on a live Switchboard.

---

## Appendix A — the frozen core contract (TypeScript)

The complete, internally-consistent SOF type surface every section above uses. It is the **naming authority**: every abstract base class, interface, builtin and signature is reproduced here verbatim, and real Powerhouse types are **imported, never re-declared**.

```ts
// ════════════════════════════════════════════════════════════════════════════
// @powerhousedao/switchboard-api-oo — SOF FROZEN CORE CONTRACT
// This is the naming authority. Real Powerhouse types are IMPORTED, never
// re-declared. No reflect-metadata, no design:paramtypes, no experimentalDecorators.
// ════════════════════════════════════════════════════════════════════════════
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { WebSocketServer } from "ws";
import type { PubSub } from "graphql-subscriptions";
import type { Action, PHDocument, DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { IReactorClient, JobInfo, SearchFilter, ViewFilter, PagedResults }
  from "@powerhousedao/reactor/client/types";
import type { IRelationalDb, IRelationalQueryBuilder, RelationalDbProcessor }
  from "@powerhousedao/shared/processors/relational/types";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IAuthorizationService, CanonicalDocumentId, AuthorizedDocumentHandle,
} from "@powerhousedao/reactor-api/services/authorization.service";
import type { FetchHandler, IHttpAdapter } from "@powerhousedao/reactor-api/graphql/gateway/types";
import { BaseSubgraph } from "@powerhousedao/reactor-api/graphql/base-subgraph";
import type { ISubgraph, SubgraphArgs } from "@powerhousedao/reactor-api/graphql/types";
import type { GraphQLManager } from "@powerhousedao/reactor-api";

// ════════════════════════════════════════════════════════════════════════════
// 1. VALIDATION BOUNDARY (identical contract to SAF; validator-agnostic)
// ════════════════════════════════════════════════════════════════════════════
export type Schema<In = unknown, Out = In> = StandardSchemaV1<In, Out>;
export type InferIn<S extends Schema>  = StandardSchemaV1.InferInput<S>;
export type InferOut<S extends Schema> = StandardSchemaV1.InferOutput<S>;

export async function validateInput<S extends Schema>(
  s: S, raw: unknown,
): Promise<{ ok: true; value: InferOut<S> } | { ok: false; issues: readonly StandardSchemaV1.Issue[] }> {
  const r = await s["~standard"].validate(raw);
  return "value" in r ? { ok: true, value: r.value as InferOut<S> } : { ok: false, issues: r.issues };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. CAPABILITIES — the typed DI surface (each key is a REAL Powerhouse interface)
// ════════════════════════════════════════════════════════════════════════════
export interface Capabilities {
  readonly reactor: IReactorClient;    // writes + small-N reads
  readonly db: IRelationalDb;          // read-only Kysely (scale reads)
  readonly analytics: IAnalyticsStore; // metrics
  readonly authz: IAuthorizationService; // the single authorization decision seam
  readonly pubsub: PubSub;             // getPubSub() singleton
}
export type CapabilityKey = keyof Capabilities;

// Boot-time DI: reflection-free provider recipes (Nest useValue/useFactory/useClass,
// but deps are an explicit token list — NEVER read from constructor design:paramtypes).
export type Token<T> = { readonly key: symbol; readonly _t?: T };
export function token<T>(name: string): Token<T> { return { key: Symbol(name) }; }
export type Provider<T> =
  | { token: Token<T>; useValue: T }
  | { token: Token<T>; useClass: { deps?: readonly Token<unknown>[]; new (...a: any[]): T } }
  | { token: Token<T>; useFactory: (...deps: any[]) => T | Promise<T>; inject?: readonly Token<unknown>[] };
export declare class Container {
  provide<T>(p: Provider<T>): this;
  resolve<T>(t: Token<T>): Promise<T>;
  /** Assemble the runtime Capabilities bag from the well-known capability tokens. */
  toCapabilities(): Promise<Capabilities>;
}
export const REACTOR   = token<IReactorClient>("reactor");
export const DB        = token<IRelationalDb>("db");
export const ANALYTICS = token<IAnalyticsStore>("analytics");
export const AUTHZ     = token<IAuthorizationService>("authz");
export const PUBSUB    = token<PubSub>("pubsub");

// Request-time capability narrowing: builds ctx.caps = Pick<Capabilities, TCaps>.
export declare class CapabilityInjector {
  constructor(caps: Capabilities);
  narrow<K extends CapabilityKey>(keys: readonly K[]): Pick<Capabilities, K>;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ERROR MODEL — one CLOSED code union drives every transport (no drift)
// ════════════════════════════════════════════════════════════════════════════
export type ApiErrorCode =
  | "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";
export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string,
              readonly details?: unknown, readonly retryable = false) { super(message); }
}
export class ValidationError  extends ApiError { constructor(m = "Invalid input", d?: unknown) { super("VALIDATION", m, d); } }
export class NotAuthenticated extends ApiError { constructor(m = "Authentication required") { super("UNAUTHENTICATED", m); } }
export class PermissionDenied extends ApiError { constructor(m = "Permission denied") { super("FORBIDDEN", m); } }
export class NotFound         extends ApiError { constructor(m = "Not found") { super("NOT_FOUND", m); } }
export class Conflict         extends ApiError { constructor(m = "Conflict") { super("CONFLICT", m); } }
export class Throttled        extends ApiError { constructor(readonly retryAfter: number) { super("RATE_LIMITED", "Too many requests", { retryAfter }, true); } }
export class InternalError    extends ApiError { constructor(m = "Internal error", d?: unknown) { super("INTERNAL", m, d); } }
export const ERROR_HTTP: Record<ApiErrorCode, number> = {
  VALIDATION: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, INTERNAL: 500 };
export const ERROR_RPC: Record<ApiErrorCode, number> = {
  VALIDATION: -32602, UNAUTHENTICATED: -32001, FORBIDDEN: -32003, NOT_FOUND: -32004, CONFLICT: -32009, RATE_LIMITED: -32029, INTERNAL: -32603 };
/** Per-transport error rendering (Nest ExceptionFilter analog). Each transport
 *  primitive owns one; every filter maps the SAME closed ApiErrorCode → its wire. */
export interface IExceptionFilter { catch(err: unknown, ctx: ExecutionContext): Outcome; }

// ════════════════════════════════════════════════════════════════════════════
// 4. EXECUTION CONTEXT — SAF OperationContext ⊕ Nest ExecutionContext
// ════════════════════════════════════════════════════════════════════════════
export type TransportKind = "graphql" | "rest" | "ws" | "rpc" | "webhook";
export interface Identity { readonly address: string; readonly chainId: number; readonly networkId: string; }
export abstract class ExecutionContext<TCaps extends CapabilityKey = never, TExt = {}> {
  abstract readonly transport: TransportKind;
  readonly wire!: string;                       // concrete channel label ("nats","sse")
  user?: Identity;                              // undefined ⇒ anonymous; authz fails closed
  readonly headers?: Headers;                   // absent on non-HTTP wires — guard before reading
  readonly driveId?: string;                    // VALIDATED (§6.9-analog), never `!`-dereferenced blindly
  readonly signal?: AbortSignal;
  readonly caps!: Pick<Capabilities, TCaps>;    // present IFF `requires` lists the key
  readonly authorize!: DocumentAuthorizer;      // the ONLY sanctioned string → CanonicalDocumentId path
  readonly ext!: TExt;                          // context-middleware accretions
  log(event: Record<string, unknown>): void {}
  getType(): TransportKind { return this.transport; }               // Nest getType()
  switchToHttp(): { request: Request } | undefined { return undefined; }
  switchToWs(): { socket: unknown; server: WebSocketServer } | undefined { return undefined; }
  switchToRpc(): { method: string; params: unknown } | undefined { return undefined; }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. AUTHORIZATION SEAM — single decision seam, fail-closed
// ════════════════════════════════════════════════════════════════════════════
export type Access = "read" | "write" | "manage";
export interface DocumentAuthorizer {
  readonly svc: IAuthorizationService;
  /** The only sanctioned slug→canonical conversion (so aliasing is not an existence oracle). */
  canonical(idOrSlug: string, ctx: ExecutionContext): Promise<CanonicalDocumentId>;
  /** Resolve → check → return the handle whose fetchIdentifier the handler MUST fetch
   *  (checked-id == fetched-id). Throws PermissionDenied/NotAuthenticated fail-closed. */
  assert(access: Access, idOrSlug: string, ctx: ExecutionContext): Promise<AuthorizedDocumentHandle>;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. PERMISSIONS — DRF permission objects that ARE NestJS guards (Composite)
//    Deny-by-default lives at the Endpoint level (abstract member), NOT here:
//    BasePermission defaults are DRF-faithful (true) so single-hook permissions
//    remain composable. hasObjectPermission runs only when a subject is present.
// ════════════════════════════════════════════════════════════════════════════
export interface IPermission {
  hasPermission(ctx: ExecutionContext, view: Endpoint): boolean | Promise<boolean>;
  hasObjectPermission(ctx: ExecutionContext, view: Endpoint, handle: AuthorizedDocumentHandle): boolean | Promise<boolean>;
  and(o: IPermission): IPermission;   // &
  or(o: IPermission): IPermission;    // |
  not(): IPermission;                 // ~
}
export abstract class BasePermission implements IPermission {
  hasPermission(_ctx: ExecutionContext, _v: Endpoint): boolean | Promise<boolean> { return true; }
  hasObjectPermission(_ctx: ExecutionContext, _v: Endpoint, _h: AuthorizedDocumentHandle): boolean | Promise<boolean> { return true; }
  and(o: IPermission): IPermission { return new AndPermission(this, o); }
  or(o: IPermission):  IPermission { return new OrPermission(this, o); }
  not():               IPermission { return new NotPermission(this); }
}
export declare class AndPermission extends BasePermission { constructor(a: IPermission, b: IPermission); }
export declare class OrPermission  extends BasePermission { constructor(a: IPermission, b: IPermission); } // DRF OR short-circuit at object level
export declare class NotPermission extends BasePermission { constructor(a: IPermission); }
export const and = (...ps: IPermission[]): IPermission => ps.reduce((a, b) => a.and(b));
export const or  = (...ps: IPermission[]): IPermission => ps.reduce((a, b) => a.or(b));
export const not = (p: IPermission): IPermission => p.not();
export const P = { all: and, any: or, not } as const;   // DRF permission_classes-style sugar

// Builtins — each maps 1:1 onto IAuthorizationService, fail-closed:
export declare class AllowAny extends BasePermission {}                       // == DRF AllowAny / SAF {public}
export declare class AnonymousPermission extends AllowAny {}                  // greppable opt-out alias
export declare class AuthenticatedPermission extends BasePermission {}        // == IsAuthenticated (ctx.user present)
export declare class AdminPermission extends BasePermission {}                // authz.isSupremeAdmin
export declare class CreatePermission extends BasePermission {}               // authz.canCreate (view-level)
export declare class DocumentPermission extends BasePermission { constructor(access: Access); } // canRead/Write/Manage (object)
export declare class ObjectOwnerPermission extends BasePermission { constructor(access?: "write" | "manage"); } // owner check (object)
export declare class OperationPermission extends BasePermission { constructor(operationType: string); }         // canMutate (object)
export declare class DriveMemberPermission extends BasePermission { constructor(access?: "read" | "write"); }   // drive-scoped view-level; closes list IDOR
export declare class DocumentEachPermission extends BasePermission {          // documentEach bulk authz (object; every id fail-closed)
  constructor(access: Access, subjects: (ctx: ExecutionContext) => readonly string[]); }
export declare class CustomPermission extends BasePermission { constructor(check: (ctx: ExecutionContext) => boolean | Promise<boolean>); }

// A permissionClasses entry may be a class (DRF style, instantiated once) or a
// pre-composed instance (for | / ~). The pipeline normalizes both.
export type PermissionSpec = IPermission | (new () => IPermission);

// ════════════════════════════════════════════════════════════════════════════
// 7. PIPES (validation), AUTHENTICATORS, THROTTLES, INTERCEPTORS, SERIALIZERS
// ════════════════════════════════════════════════════════════════════════════
export interface ArgMeta { readonly source: "body" | "query" | "param" | "args" | "message" | "rpc"; readonly key?: string; }
export interface IPipe<In = unknown, Out = unknown> { transform(value: In, meta: ArgMeta, ctx: ExecutionContext): Out | Promise<Out>; }
export declare class StandardSchemaPipe<S extends Schema> implements IPipe<unknown, InferOut<S>> {
  constructor(schema: S);                       // safeParse → typed value or throws ValidationError
  transform(value: unknown, meta: ArgMeta, ctx: ExecutionContext): Promise<InferOut<S>>;
}

export interface IAuthenticator {               // Chain of Responsibility; first non-null Identity wins
  authenticate(request: Request): Promise<Identity | null>;
  authenticateHeader?(request: Request): string | undefined;
}
export declare class BearerAuthenticator implements IAuthenticator {   // calls AuthService.verifyBearer (the non-GraphQL path; GET-safe)
  authenticate(request: Request): Promise<Identity | null>;
}
export declare class SiweAuthenticator implements IAuthenticator { authenticate(request: Request): Promise<Identity | null>; }
export declare class AnonymousAuthenticator implements IAuthenticator { authenticate(): Promise<null>; }

export interface IThrottle { allowRequest(ctx: ExecutionContext, view: Endpoint): Promise<boolean>; wait(): number; }
export declare class AnonRateThrottle implements IThrottle { constructor(rate: string); allowRequest(ctx: ExecutionContext, view: Endpoint): Promise<boolean>; wait(): number; }
export declare class UserRateThrottle implements IThrottle { constructor(rate: string); allowRequest(ctx: ExecutionContext, view: Endpoint): Promise<boolean>; wait(): number; }

export type Next<O> = () => Promise<O>;
export type InterceptorPhase = "outer" | "inner";  // outer = pre-authz (rate-limit/logging); inner = post-authz (cache/redaction)
export interface IInterceptor { readonly name: string; readonly phase: InterceptorPhase; intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>; }
export declare class LoggingInterceptor implements IInterceptor { readonly name: string; readonly phase: "outer"; intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>; }
export declare class TimeoutInterceptor implements IInterceptor { constructor(ms: number); readonly name: string; readonly phase: "outer"; intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>; }
export declare class CacheInterceptor implements IInterceptor { constructor(ttlMs: number); readonly name: string; readonly phase: "inner"; intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>; }
export declare class ObservabilityInterceptor implements IInterceptor { readonly name: string; readonly phase: "outer"; intercept<O>(ctx: ExecutionContext, next: Next<O>): Promise<O>; }

export interface ISerializer<TOut extends Schema, TCreate extends Schema = TOut, TUpdate extends Schema = TCreate, TFilter extends Schema = Schema> {
  readonly output: TOut; readonly create?: TCreate; readonly update?: TUpdate; readonly filter?: TFilter;
  readonly sortable?: readonly string[];
  /** per-field output visibility (== write_only / ClassSerializerInterceptor). */
  readonly fieldGuards?: Partial<Record<keyof InferOut<TOut> & string, (ctx: ExecutionContext) => boolean>>;
  /** CLOSED projection: parse through `output`, return exactly those keys, redact guarded fields. */
  toRepresentation(instance: unknown, ctx: ExecutionContext): Promise<InferOut<TOut>>;
  toInternalValue(data: unknown, mode: "create" | "update", ctx: ExecutionContext): Promise<InferOut<TCreate> | InferOut<TUpdate>>;
}
export abstract class Serializer<TOut extends Schema, TCreate extends Schema = TOut, TUpdate extends Schema = TCreate, TFilter extends Schema = Schema>
  implements ISerializer<TOut, TCreate, TUpdate, TFilter> {
  abstract readonly output: TOut; readonly create?: TCreate; readonly update?: TUpdate; readonly filter?: TFilter;
  readonly sortable?: readonly string[];
  readonly fieldGuards?: Partial<Record<keyof InferOut<TOut> & string, (ctx: ExecutionContext) => boolean>>;
  abstract toRepresentation(instance: unknown, ctx: ExecutionContext): Promise<InferOut<TOut>>;
  abstract toInternalValue(data: unknown, mode: "create" | "update", ctx: ExecutionContext): Promise<InferOut<TCreate> | InferOut<TUpdate>>;
  /** DRF perform_create / perform_update — map validated DTOs to reactor writes. */
  create_?(validated: InferOut<TCreate>, ctx: ExecutionContext<"reactor">): Promise<PHDocument>;
  update_?(handle: AuthorizedDocumentHandle, patch: InferOut<TUpdate>, ctx: ExecutionContext<"reactor">): Promise<Action[]>;
}

// ════════════════════════════════════════════════════════════════════════════
// 8. ENDPOINT — the Template-Method base every transport primitive extends.
//    dispatch() is FINAL; subclasses override handle() (+ wire adapters) only.
// ════════════════════════════════════════════════════════════════════════════
export type EndpointKind = "query" | "mutation" | "subscription";
export interface Outcome { readonly status: number; readonly body: unknown; readonly headers?: Record<string, string>; }
export interface RawRequest { readonly request?: Request; readonly transport: TransportKind; readonly raw: unknown; }

export abstract class Endpoint<
  TIn extends Schema = Schema, TOut extends Schema = Schema,
  TCaps extends CapabilityKey = never, TExt = {},
> {
  abstract readonly id: string;                 // unique; == RPC method name; used for registration
  abstract readonly kind: EndpointKind;
  abstract readonly transport: TransportKind;
  abstract readonly inputSchema: TIn;
  abstract readonly outputSchema: TOut;
  // DENY-BY-DEFAULT IS A COMPILE ERROR: abstract member — a subclass that omits
  // it does not typecheck. `[]` is denied at runtime by the pipeline and Router.build().
  abstract readonly permissionClasses: readonly PermissionSpec[];
  readonly requires: readonly TCaps[] = [];
  readonly authenticators: readonly IAuthenticator[] = [];
  readonly throttleClasses: readonly IThrottle[] = [];
  readonly interceptors: readonly IInterceptor[] = [];
  readonly serializer?: ISerializer<TOut, any, any, any>;
  /** Object-level subject: id/slug (from TYPED input) whose object-permission is checked. */
  getSubject?(input: InferOut<TIn>, ctx: ExecutionContext<TCaps, TExt>): string | undefined;
  getObjectAccess?(ctx: ExecutionContext<TCaps, TExt>): Access;

  /** THE ONLY business hook. `subject` is the authorized handle when getSubject fired. */
  protected abstract handle(
    input: InferOut<TIn>, ctx: ExecutionContext<TCaps, TExt>, subject?: AuthorizedDocumentHandle,
  ): Promise<InferOut<TOut>> | AsyncIterable<InferOut<TOut>>;

  /** FINAL — the invariant skeleton. Never override. */
  dispatch(raw: unknown, ctx: ExecutionContext<TCaps, TExt>): Promise<unknown> {
    return new ExecutionPipeline(this).run(raw, ctx as ExecutionContext);
  }
}
export type EndpointClass = new (...a: any[]) => Endpoint<any, any, any, any>;

// The fixed, non-removable pipeline. ONE body, shared by every transport.
export declare class ExecutionPipeline<E extends Endpoint<any, any, any, any>> {
  constructor(endpoint: E);
  // Order:  outer interceptors ⟩
  //   [FIXED 1] authenticate (CoR; fail-open → anonymous)
  //   [FIXED 2] throttle (shed load before parse; RATE_LIMITED)      ← DRF runs this after perms; we shed first (SAF outer-plugin intent)
  //   [FIXED 3] input validation (StandardSchemaPipe) → typed input  ← BEFORE authz so object checks see typed input
  //   [FIXED 4] view-level authz: every permission.hasPermission     (UNAUTHENTICATED | FORBIDDEN)
  //   [FIXED 5] object-level authz: getSubject → authorize.assert → handle; every permission.hasObjectPermission
  //     ⟩ inner interceptors ⟩ [HANDLER] handle(input, ctx, handle) ⟨ inner interceptors ⟨
  //   [FIXED 6] closed output projection (serializer/outputSchema)   (INTERNAL on mismatch — field-leak guard)
  //   ⟨ outer interceptors     catch → filter.catch(ApiError.code → wire)
  run(raw: unknown, ctx: ExecutionContext): Promise<unknown>;
}

// ════════════════════════════════════════════════════════════════════════════
// 9. TRANSPORT PRIMITIVES (L1) — each extends Endpoint, binds to a REAL seam.
// ════════════════════════════════════════════════════════════════════════════
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// --- REST: any HTTP method on the primitive → IHttpAdapter.mount -------------
export abstract class RestView<TIn extends Schema = Schema, TOut extends Schema = Schema, TCaps extends CapabilityKey = never>
  extends Endpoint<TIn, TOut, TCaps> {
  readonly transport = "rest" as const;
  abstract readonly method: HttpMethod;
  abstract readonly path: string;               // relative to controller basePath, e.g. "/todos/:id"
  readonly status: number = 200;
  readonly kind: EndpointKind = "query";        // set "mutation" for writes
  /** Buffered FetchHandler for IHttpAdapter.mount(); GET reads MUST verifyBearer directly. */
  toFetchHandler(rt: ProjectionRuntime): FetchHandler;
  protected filter(): IExceptionFilter;         // maps ApiError.code → ERROR_HTTP
}
export abstract class RestController { abstract readonly basePath: string; abstract readonly views: readonly RestView[]; }

// --- GraphQL: query / mutation / subscription → GeneratedSubgraph ------------
export abstract class GraphQLField<TIn extends Schema = Schema, TOut extends Schema = Schema, TCaps extends CapabilityKey = never>
  extends Endpoint<TIn, TOut, TCaps> {
  readonly transport = "graphql" as const;
  abstract readonly fieldName: string;          // "todo"
  abstract readonly rootType: "Query" | "Mutation" | "Subscription";
  abstract readonly sdl: string;                // typeDefs fragment for this field (+ its types)
  toResolver(rt: ProjectionRuntime): Record<string, Record<string, unknown>>;
}
export abstract class GraphQLQuery<I extends Schema = Schema, O extends Schema = Schema, C extends CapabilityKey = never> extends GraphQLField<I, O, C> { readonly rootType: "Query"; readonly kind: "query"; }
export abstract class GraphQLMutation<I extends Schema = Schema, O extends Schema = Schema, C extends CapabilityKey = never> extends GraphQLField<I, O, C> { readonly rootType: "Mutation"; readonly kind: "mutation"; }
export abstract class GraphQLSubscription<I extends Schema = Schema, O extends Schema = Schema, C extends CapabilityKey = never> extends GraphQLField<I, O, C> {
  readonly rootType: "Subscription"; readonly kind: "subscription";
  protected abstract handle(input: InferOut<I>, ctx: ExecutionContext<C>, subject?: AuthorizedDocumentHandle): AsyncIterable<InferOut<O>>;
}
/** Assemble GraphQLFields into ONE subgraph over the REAL BaseSubgraph seam. */
export declare class GeneratedSubgraph extends BaseSubgraph implements ISubgraph {
  constructor(args: SubgraphArgs, fields: readonly GraphQLField[], name: string, rt: ProjectionRuntime);
}

// --- WebSocket: shared server + getPubSub (one owner, no double-wiring) ------
export abstract class WebSocketGateway<TIn extends Schema = Schema, TOut extends Schema = Schema, TCaps extends CapabilityKey = never>
  extends Endpoint<TIn, TOut, TCaps> {
  readonly transport = "ws" as const;
  readonly kind = "subscription" as const;
  abstract readonly event: string;
  protected abstract handle(input: InferOut<TIn>, ctx: ExecutionContext<TCaps>, subject?: AuthorizedDocumentHandle): AsyncIterable<InferOut<TOut>>;
  /** Attach to the shared WebSocketServer + pubsub; returns a disposer. */
  attach(rt: ProjectionRuntime, deps: ProjectionDeps): () => void;
}

// --- RPC: JSON-RPC 2.0 method / service → one FetchHandler ------------------
export abstract class RpcMethod<TIn extends Schema = Schema, TOut extends Schema = Schema, TCaps extends CapabilityKey = never>
  extends Endpoint<TIn, TOut, TCaps> {
  readonly transport = "rpc" as const;
  get method(): string { return this.id; }
}
export abstract class RpcService {
  abstract readonly namespace: string;
  abstract readonly methods: readonly RpcMethod[];
  toFetchHandler(rt: ProjectionRuntime): FetchHandler;  // dispatch by params.method; ERROR_RPC on failure
}

// --- Webhooks: inbound (signature-verified) + outbound (SSRF-guarded) --------
export abstract class InboundWebhook<TIn extends Schema = Schema, TOut extends Schema = Schema, TCaps extends CapabilityKey = never>
  extends RestView<TIn, TOut, TCaps> {
  readonly transport = "webhook" as const;
  readonly method = "POST" as const;
  readonly kind = "mutation" as const;
  abstract verifySignature(request: Request, rawBody: string): Promise<boolean>; // fail-closed before dispatch
}
export abstract class OutboundWebhook<TPayload extends Schema = Schema> {
  abstract readonly event: string;
  abstract readonly urlAllowlist: readonly string[];   // SSRF guard: only these hosts, no private/link-local IPs
  readonly retries: number = 3;
  abstract deliver(payload: InferOut<TPayload>, ctx: ExecutionContext<"reactor">): Promise<void>;
}

// ════════════════════════════════════════════════════════════════════════════
// 10. GENERIC / BATTERIES (L2) — DRF generics + ModelSerializer, document-native
// ════════════════════════════════════════════════════════════════════════════
// Pagination — two honest, non-substitutable contracts (not one leaky base).
export interface Paginator<Row> { apply(qb: any, sort: unknown, page: PageRequest): any; envelope(rows: readonly Row[], page: PageRequest): PagedResults<Row>; }
export interface PageRequest { readonly cursor?: string; readonly limit?: number; readonly offset?: number; readonly page?: number; }
export declare class SeekPaginator<Row> implements Paginator<Row> { constructor(o: { orderBy: keyof Row & string; tieBreaker: keyof Row & string; default: number; max: number }); apply(qb: any, sort: unknown, page: PageRequest): any; envelope(rows: readonly Row[], page: PageRequest): PagedResults<Row>; }
export declare class OffsetPaginator<Row> implements Paginator<Row> { constructor(o: { default: number; max: number }); apply(qb: any, sort: unknown, page: PageRequest): any; envelope(rows: readonly Row[], page: PageRequest): PagedResults<Row>; }
export function keyset<Row>(o: { orderBy: keyof Row & string; tieBreaker: keyof Row & string; default?: number; max?: number }): SeekPaginator<Row>;
export function offset<Row>(o?: { default?: number; max?: number }): OffsetPaginator<Row>;

// Filtering — closed allowlist compiled to parameterized SQL (SAF §7.3 port).
export type FilterOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains" | "in";
export type FilterSet<Row> = Partial<Record<keyof Row & string, { type: "string" | "number" | "boolean" | "date"; ops: readonly FilterOp[] }>>;
export interface FilterBackend<Row> { compile(allow: FilterSet<Row>, input: unknown): (qb: any) => any; }
export declare function compileFilter<Row>(allow: FilterSet<Row>, input: unknown): (qb: any) => any;
export type OrderingBackend<Row> = readonly (keyof Row & string)[];

// Read substrate: scale (Kysely read model) vs small-N (reactor.find).
export interface RelationalReadModelClass<Row> {
  new (...a: any[]): RelationalDbProcessor<any>;
  query(driveId: string, db: IRelationalDb): IRelationalQueryBuilder<{ [table: string]: Row }>;
  getNamespace(driveId: string): string;    // MUST be overridden to hashNamespace() (Postgres 63-char cap)
}
export interface ReadBinding<Row> { source: RelationalReadModelClass<Row>; table: string; filterable: FilterSet<Row>; sortable: OrderingBackend<Row>; pagination: Paginator<Row>; }
export interface DocumentBinding { search: (ctx: ExecutionContext) => SearchFilter; view?: ViewFilter; }
export interface WriteBinding<TCreate extends Schema, TUpdate extends Schema> {
  create?(input: InferOut<TCreate>, ctx: ExecutionContext<"reactor">): { document: PHDocument; parent?: string } | { type: string; initialState?: unknown; parent?: string };
  update?(patch: InferOut<TUpdate>): Action[];
  remove?(): Action[];
  async?: boolean;                          // executeAsync → JobInfo
}

// DocumentSerializer == DRF ModelSerializer: DTOs auto-derived from the document model.
export abstract class DocumentSerializer<TState, TOut extends Schema = Schema, TCreate extends Schema = Schema, TUpdate extends Schema = Schema, TFilter extends Schema = Schema>
  extends Serializer<TOut, TCreate, TUpdate, TFilter> {
  abstract readonly documentModel: DocumentModelModule<TState>;
  static fromDocumentModel<S>(model: DocumentModelModule<S>, opts?: {
    fields?: "__all__" | (keyof S & string)[]; readOnly?: (keyof S & string)[]; writeOnly?: (keyof S & string)[];
    fieldGuards?: Partial<Record<string, (ctx: ExecutionContext) => boolean>>;
  }): DocumentSerializer<S>;
}

// GenericView == DRF GenericAPIView (drive-scoped read source + object lookup).
export abstract class GenericView<Row, TCaps extends CapabilityKey = "db" | "reactor" | "authz">
  extends RestView<Schema, Schema, TCaps> {
  abstract readonly serializer: ISerializer<any, any, any, any>;
  readonly read?: ReadBinding<Row>;
  readonly document?: DocumentBinding;
  protected getQuery(ctx: ExecutionContext<TCaps>): IRelationalQueryBuilder<{ [table: string]: Row }>; // DRIVE-SCOPED; throws VALIDATION if no driveId
  protected getObject(ctx: ExecutionContext<TCaps>, id: string): Promise<Row>;                          // fetch one → checkObjectPermissions
  protected abstract fetchOne(ctx: ExecutionContext<TCaps>, id: string): Promise<Row | null>;
}

// CRUD mixins — mixin FUNCTIONS (TS has no MI diamond). Each adds one action + perform hook.
export type Ctor<T = {}> = new (...a: any[]) => T;
export function ListModelMixin<Row, B extends Ctor<GenericView<Row>>>(Base: B): B & Ctor<{ list(ctx: ExecutionContext, input: unknown): Promise<PagedResults<unknown>> }>;
export function RetrieveModelMixin<Row, B extends Ctor<GenericView<Row>>>(Base: B): B & Ctor<{ retrieve(ctx: ExecutionContext, id: string): Promise<unknown> }>;
export function CreateModelMixin<B extends Ctor<GenericView<any>>>(Base: B): B & Ctor<{ create(ctx: ExecutionContext<"reactor" | "authz">, body: unknown): Promise<unknown> }>;
export function UpdateModelMixin<B extends Ctor<GenericView<any>>>(Base: B): B & Ctor<{ update(ctx: ExecutionContext<"reactor" | "authz">, id: string, patch: unknown): Promise<unknown> }>;
export function DestroyModelMixin<B extends Ctor<GenericView<any>>>(Base: B): B & Ctor<{ destroy(ctx: ExecutionContext<"reactor" | "authz">, id: string): Promise<void> }>;

export interface CrudPermissionMap {
  list: readonly PermissionSpec[];          // MUST include DriveMemberPermission (Router.build enforces)
  get: readonly PermissionSpec[];
  create?: readonly PermissionSpec[]; update?: readonly PermissionSpec[]; remove?: readonly PermissionSpec[]; changes?: readonly PermissionSpec[];
}

// DocumentModelViewSet == DRF ModelViewSet (subclass + branch by `action`).
export abstract class DocumentModelViewSet<TState, Row> {
  abstract readonly id: string;
  abstract readonly documentModel: DocumentModelModule<TState>;
  abstract readonly serializer: DocumentSerializer<TState, any, any, any, any>;
  abstract readonly permissions: CrudPermissionMap;
  readonly read?: ReadBinding<Row>; readonly document?: DocumentBinding; readonly write?: WriteBinding<Schema, Schema>;
  readonly actions?: readonly Endpoint[];   // DRF @action custom endpoints
  toResource(): DocumentResource<TState, Row>;
}

// DocumentResource == the factory: reads a document model, EMITS concrete L1
// primitives across one or many transports from ONE shared serializer + permission set.
export interface DocumentResourceConfig<TState, Row> {
  name: string; version: string; basePath?: string;
  documentModel: DocumentModelModule<TState>;
  serializer: DocumentSerializer<TState, any, any, any, any>;
  read: ReadBinding<Row> | DocumentBinding;
  write?: WriteBinding<Schema, Schema>;
  permissions: CrudPermissionMap;
  actions?: readonly Endpoint[];
  transports?: readonly TransportKind[];    // default ["graphql"]
}
export declare class DocumentResource<TState, Row> {
  constructor(cfg: DocumentResourceConfig<TState, Row>);
  emitRest(): RestController;
  emitGraphQL(): GraphQLField[];
  emitWs(): WebSocketGateway[];
  emitRpc(): RpcService;
  emitAll(): { rest?: RestController; graphql?: GraphQLField[]; ws?: WebSocketGateway[]; rpc?: RpcService };
}

// ════════════════════════════════════════════════════════════════════════════
// 11. ROUTING / MODULES / APP WIRING (L3) — registry + host projection
// ════════════════════════════════════════════════════════════════════════════
// The runtime a projector hands to a primitive: builds context + resolves capabilities.
export declare class ProjectionRuntime {
  constructor(caps: Capabilities, authorizer: DocumentAuthorizer);
  makeContext(source: RawRequest, transport: TransportKind, requires: readonly CapabilityKey[]): Promise<ExecutionContext>;
}
// Everything a projector needs from the host to mount onto real seams.
export interface ProjectionDeps {
  readonly httpAdapter: IHttpAdapter;        // §12 host wiring: public accessor required
  readonly graphqlManager: GraphQLManager;
  readonly wsServer: WebSocketServer;        // §12 host wiring: shared server accessor
  readonly pubsub: PubSub;
  readonly authService: IAuthorizationService;
  readonly subgraphArgs: SubgraphArgs;
  readonly corsAllowlist: readonly string[]; // REQUIRED — no reflect-any-origin default
}
// A projector adapts each primitive's wire and mounts it. It NEVER re-implements
// validation/authz/logic — it can only call endpoint.dispatch via the wire adapter.
export interface TransportProjector { readonly transport: TransportKind; project(endpoints: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }
export declare class GraphQLProjector implements TransportProjector { readonly transport: "graphql"; project(e: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }
export declare class RestProjector    implements TransportProjector { readonly transport: "rest";    project(e: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }
export declare class WsProjector      implements TransportProjector { readonly transport: "ws";      project(e: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }
export declare class RpcProjector     implements TransportProjector { readonly transport: "rpc";     project(e: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }
export declare class WebhookProjector implements TransportProjector { readonly transport: "webhook"; project(e: readonly Endpoint[], rt: ProjectionRuntime, deps: ProjectionDeps): Promise<void>; }

// Router — DRF-router analog: register resources/endpoints, then build() backstops security.
export declare class Router {
  constructor(opts: { corsAllowlist: readonly string[] });
  register(entry: DocumentResource<any, any> | Endpoint | RestController | RpcService): this;
  /** Fail-closed backstops: every endpoint has a non-empty policy; list-capable views carry a
   *  drive-scoping permission; every serializer output is a closed schema. Throws on violation. */
  build(): readonly Endpoint[];
}

// ApiModule — NestJS dynamic-module analog (forRoot/forFeature), a typed provider bag (no scanning).
export interface ApiModuleDef { providers?: readonly Provider<unknown>[]; endpoints?: readonly Endpoint[]; resources?: readonly DocumentResource<any, any>[]; interceptors?: readonly IInterceptor[]; }
export declare class ApiModule {
  static forRoot(def: ApiModuleDef): ApiModule;
  static forFeature(def: Pick<ApiModuleDef, "endpoints" | "resources">): ApiModule;
}

// SwitchboardOO — the app: holds the Container + registry, drives projectors against the host.
export declare class SwitchboardOO {
  constructor(opts: { container: Container; corsAllowlist: readonly string[] });
  use(...interceptors: IInterceptor[]): this;         // app-wide interceptors (== APP_INTERCEPTOR)
  register(...entries: (DocumentResource<any, any> | Endpoint | ApiModule | RestController | RpcService)[]): this;
  project(projectors: readonly TransportProjector[], deps: ProjectionDeps): Promise<void>;
}

// ════════════════════════════════════════════════════════════════════════════
// 12. DECORATORS — OPTIONAL Stage-3 sugar. NO reflect-metadata, NO param decorators,
//     NO type-based DI. They only write routing/schema/permission metadata into
//     `context.metadata` and lower to the plain-class config above at build time.
//     Plain classes are the source of truth and the CI/type-test path.
// ════════════════════════════════════════════════════════════════════════════
export declare function Controller(basePath: string): ClassDecorator;
export declare function Get(path?: string): MethodDecorator;
export declare function Post(path?: string): MethodDecorator;
export declare function Put(path?: string): MethodDecorator;
export declare function Patch(path?: string): MethodDecorator;
export declare function Delete(path?: string): MethodDecorator;
export declare function Resolver(typeName: string): ClassDecorator;
export declare function Query(opts?: { fieldName?: string; sdl?: string }): MethodDecorator;
export declare function Mutation(opts?: { fieldName?: string; sdl?: string }): MethodDecorator;
export declare function Subscription(opts?: { fieldName?: string; sdl?: string }): MethodDecorator;
export declare function RpcMethodDecorator(method?: string): MethodDecorator; // exported as @RpcMethod
export declare function Gateway(namespace: string): ClassDecorator;
export declare function Subscribe(event: string): MethodDecorator;
export declare function Webhook(event: string): MethodDecorator;
export declare function Input<S extends Schema>(schema: S): MethodDecorator;
export declare function Output<S extends Schema>(schema: S): MethodDecorator;
export declare function Permissions(...specs: PermissionSpec[]): MethodDecorator & ClassDecorator;
export declare function Public(): MethodDecorator & ClassDecorator;   // sugar for @Permissions(new AnonymousPermission())
export declare function Requires(...caps: CapabilityKey[]): MethodDecorator;
export declare function SubjectOf(select: (input: any, ctx: ExecutionContext) => string | undefined, access?: Access): MethodDecorator;
export declare function UseInterceptors(...interceptors: IInterceptor[]): MethodDecorator & ClassDecorator;
```
