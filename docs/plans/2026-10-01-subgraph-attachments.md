# Plan: Caller-bound attachments for subgraphs

Date: 2026-10-01
Status: draft for implementation, not started. Written for agents
implementing from `main`. Paths are relative to `packages/reactor-api/src`
unless stated.

## Overview

A subgraph gets no attachment client. `SubgraphArgs` (`graphql/types.ts:54-80`)
carries the reactor client, the relational database, sync, authorization and
the GraphQL manager, but nothing for attachments. Processors get a client
through the host module (`server.ts:1162`); subgraphs do not receive that
module. A subgraph that stores or serves a file today builds a remote client
pointed at its own switchboard and pays an HTTP round trip to itself, with a
URL it has to guess and a token that is the host's, not the caller's.

The in-process `IAttachmentService` does no authorization: `documentId` only
selects a remote fetch. Handing subgraphs that service, or a client over it,
next to `IAttachmentAccessService` would make every resolver responsible for
calling the gate, and one that forgot would serve any attachment to any
caller.

This plan gives subgraphs a client bound to the request's caller. The gate
lives in an `IAttachmentService` decorator, so the existing
`createAttachmentClient` composes over it unchanged and a resolver cannot
reach bytes without naming the caller.

## Decisions

1. **The gate decorates `IAttachmentService`, not `IAttachmentClient`.** The
   client reaches the service through three calls: every download variant
   through `service.get` (`reactor-attachments/src/client.ts:537`), share
   links through `service.getDownloadTarget` (`client.ts:640`), and uploads
   through `service.reserve` (`client.ts:434`). `IAttachmentService` has one
   more method, `stat` (`reactor-attachments/src/interfaces.ts:25-97`), which
   the client never calls but the decorator gates all the same. `documentId`
   and `ref` are present at that layer. The client implementation is not
   exported, so a client decorator would re-implement about ten methods.
2. **Uploads require an authenticated caller, nothing more.** Document
   mutation is checked separately when the document action is dispatched.
   The rule matches the HTTP write routes exactly, including their behaviour
   when auth is off (see [Write rule](#write-rule)).
3. **A denied read is `AttachmentNotFound`.** The HTTP routes answer 404,
   never 403, so a denial does not confirm that a hash exists.
4. **The class lives in `reactor-api`.** `reactor-api` already depends on
   `reactor-attachments`; `reactor-attachments` stays unaware of
   authorization. No interface moves down and no cycle is introduced.
5. **Subgraphs get a provider, never the raw service.** One provider is built
   per host; `BaseSubgraph.attachmentsFor(ctx)` binds it to the caller per
   request.
6. **The caller decision joins `IAttachmentAccessService`.** Whether a caller
   may use attachments at all, and whether it may read through a document,
   then live in one interface, and a variant with different policy (the
   workflow runtime, stage 2) is one class.
7. **`GraphQLManager` and `setupGraphQLManager` take an options object.**
   They take 18 and 19 positional arguments today, and `authorizationService`
   is typed optional but throws when absent (`graphql-manager.ts:282-285`).
   A 19th positional would repeat that.

## Design

### Access interface

`services/attachment-access.service.ts`:

```ts
export type AttachmentCallerResult =
  | { kind: "admitted" }
  | { kind: "unauthenticated" };

export interface AttachmentCallerRequest {
  intent: "read" | "write";
  userAddress?: string;
  appKey?: string;
}

export interface IAttachmentAccessService {
  canReadAttachment(
    request: AttachmentAccessRequest,
  ): Promise<AttachmentAccessResult>;
  /** Whether this caller may use attachments at all, before any document decides. */
  admitCaller(request: AttachmentCallerRequest): Promise<AttachmentCallerResult>;
}
```

`AttachmentAccessResult` is not widened. The routes test its kinds with `if`
chains (`apps/switchboard/src/attachments/routes.ts:628-631`, `:730-734`),
so a new kind would fall through to the allowed path there.

`AttachmentAccessService` gains an optional trailing options parameter,
after `scopeGate?` (`services/attachment-access.service.ts:122`). Defaults
keep existing call sites unchanged: writes fail closed, and reads keep
today's behaviour, where the routes' `requireAuth` runs first.

```ts
export interface AttachmentAccessServiceOptions {
  /** Refuse writes from a caller with no address. Default `true`. */
  refuseAnonymousWrites?: boolean;
  /** Refuse reads from a caller with no address. Default `false`. */
  refuseAnonymousReads?: boolean;
}
```

#### Caller rule

`requireAuth` (`apps/switchboard/src/attachments/auth.ts:65-110`) runs before
every attachment route. With no `AuthService` it admits everyone (`:70-72`);
`authEnabled` always builds one (`server.ts:918-940`), so that case is auth
off. Otherwise it refuses an anonymous caller when the host requires an
authenticated caller, or when auth is enabled and the route is not
anonymous-capable (`:95-104`). The write routes are not anonymous-capable;
the read routes are. The mount forces the floor on every route and ignores
the GraphQL exempt paths (`mount-auth.ts:37`).

The in-process rule is the same:

```ts
// _setupAPI, where attachmentAccess is built (server.ts:1275)
const floor = requireAuthFetchMiddleware !== undefined;
refuseAnonymousWrites: authEnabled || floor,
refuseAnonymousReads: floor,
```

The read floor matters because the GraphQL chain admits anonymous callers on
exempt paths (`graphql/gateway/require-auth-middleware.ts:51-56`), where the
attachment routes would not.

`requireAuthFetchMiddleware !== undefined` is how `_setupAPI` already derives
the floor (`server.ts:1367`). `authEnabled` is a local of
`_setupCommonInfrastructure` (`server.ts:714`) that is neither returned nor
passed on, and `AuthService.config` is private, so it is added to that
function's return value and threaded into `_setupAPI` at both call sites.

`admitCaller` returns `unauthenticated` when the option for its intent is set
and `userAddress` is absent, and `admitted` otherwise.

### Authorized service

New file `services/authorized-attachment.service.ts`:

```ts
/** The reference index is not maintained in this composition. */
export class AttachmentAccessUnavailable extends Error {}

/** The access decision itself failed; the cause is logged, not surfaced. */
export class AttachmentAccessFailed extends Error {}

/** An `IAttachmentService` whose reads and writes are decided for one subject. */
export class AuthorizedAttachmentService implements IAttachmentService {
  constructor(
    private readonly inner: IAttachmentService,
    private readonly access: IAttachmentAccessService,
    private readonly subject: AuthSubject,
    private readonly logger: ILogger,
  ) {}
}

export interface IAttachmentClientProvider {
  forSubject(subject: AuthSubject): IAttachmentClient;
}

export class AttachmentClientProvider implements IAttachmentClientProvider {
  constructor(
    private readonly service: IAttachmentService,
    private readonly access: IAttachmentAccessService,
  ) {}

  forSubject(subject: AuthSubject): IAttachmentClient {
    return createAttachmentClient(
      new AuthorizedAttachmentService(this.service, this.access, subject),
    );
  }
}
```

`AuthSubject` is `{ address?, key? }` from `@powerhousedao/shared/document-model`
(`packages/shared/document-model/auth.ts:471`), the shape `callerSubject`
returns (`graphql/base-subgraph.ts:33`).

| Method | Decision | On allow |
|---|---|---|
| `get(ref, opts)` | `admitCaller({ intent: "read", ... })`, then `canReadAttachment({ documentId, attachmentRef: ref, userAddress: subject.address, appKey: subject.key })` | `inner.get(decision.ref, { documentId: decision.documentId, signal })` |
| `stat(ref, opts)` | same | `inner.stat(decision.ref, { documentId: decision.documentId, ... })` |
| `getDownloadTarget(ref, opts)` | same | delegate with the canonical values |
| `reserve(options)` | `admitCaller({ intent: "write", ... })`, then the metadata check below | delegate; the returned handle is not wrapped |

- A read whose `documentId` is missing, blank or longer than the routes
  accept (`apps/switchboard/src/attachments/routes.ts:527-542`) throws
  `AttachmentNotFound` without consulting `access`. That includes the bare
  `AbortSignal` form of `get`; `documentId` is read off the options only
  when they are a plain object.
- `denied` throws `AttachmentNotFound`; `projection-unavailable` throws
  `AttachmentAccessUnavailable`.
- An exception from `access` is logged and rethrown as
  `AttachmentAccessFailed` with the original as `cause`. It stays distinct
  from a denial, as `canReadDocument` intends
  (`services/attachment-access.service.ts:182-189`), but its message does not
  reach the GraphQL client; the routes likewise log and answer
  "Internal error" (`routes.ts:624-626`).
- `unauthenticated` throws `AuthenticationRequiredError`
  (`graphql/errors.ts:18`), the route's 401.
- `reserve` refuses options without `clientHash` (upload-first). An
  upload-first handle can send repeatedly, even after the reservation
  expires, where the route's PUT re-reads the reservation each time
  (`reactor-attachments/src/storage/kysely/reservation-store.ts:57-69`).
  The client only reserves hash-first.
- `reserve` validates `mimeType`, `fileName` and `extension` with the rules
  the route applies in `parseReserveOptions` (`routes.ts:89-149`).
  `reserveHashFirst` checks only hash and size
  (`reactor-attachments/src/attachment-service.ts:87-140`), and a CR or LF
  in a stored MIME type makes the download route's `setHeader` throw
  (`routes.ts:324`). The rules move into an exported
  `validateReserveMetadata` in `reactor-attachments`; moving the route onto
  it is a follow-up.
- `AttachmentAlreadyExists` from `inner.reserve` passes through. Hash-first
  dedup reports an existing ref to any caller the write rule admits, exactly
  as the HTTP reserve route does.
- No supreme-admin bypass, matching `canReadAttachment` and the routes.
- Client `preprocess` hashes locally and never reaches the service.

### Subgraph surface

`graphql/types.ts`, `SubgraphArgs`:

```ts
/**
 * Attachments as the request's caller may use them. Bind per request with
 * `BaseSubgraph.attachmentsFor(ctx)`.
 */
attachments?: IAttachmentClientProvider;
```

`graphql/base-subgraph.ts`:

```ts
/** An attachment client bound to this request's caller, memoized per request. */
attachmentsFor(ctx: Context): IAttachmentClient;
```

It calls `forSubject(callerSubject(ctx.user))` and memoizes in a `WeakMap`
keyed on `ctx`, the pattern `#canonicalIdMemo` uses (`base-subgraph.ts:62-70`).
With no provider set it throws an `Error` naming the missing capability.

`GraphQLManager` stores the provider and passes it in both `SubgraphArgs`
literals (`graphql-manager.ts:516-528`, `:754-769`). It does not expose it:
every subgraph holds the manager. Subgraphs the host constructs itself get it
from `API.attachmentClientProvider`, beside `attachments` and
`attachmentAccess` on `API` (`types.ts:56-59`).

The gate stops a resolver that forgets to check, not one that lies about its
caller: `forSubject` accepts any subject. Subgraphs are host code that
already holds a trusted `reactorClient`.

## Implementation plan

One PR. Stage 2 is a separate PR after it merges.

### Stage 0: options objects

One commit, no behaviour change.

- `graphql-manager.ts:263-282`: `constructor(options: GraphQLManagerOptions)`.
  `authorizationService` becomes required in the type and the runtime throw
  goes away.
- `server.ts:439-461`: `setupGraphQLManager(options)`; its call at `:1295`.
- Call sites: `server.ts:463`, `test/graphql-manager.test.ts:238`,
  `test/drive-info-read-gate.integration.test.ts:94`,
  `test/drive-info-authorization.e2e.test.ts:172`.

### Stage 1: caller-bound attachments

- *1a, serial: foundation.* One commit every track imports. It must compile
  with tests included (`tsconfig.json` includes `**/*`):
  - `AttachmentCallerRequest`, `AttachmentCallerResult` and `admitCaller` on
    `IAttachmentAccessService`; `AttachmentAccessServiceOptions` and the
    optional trailing constructor parameter; a stub `admitCaller` on
    `AttachmentAccessService` that throws `not implemented`;
  - `admitCaller` on the uncast switchboard fakes that the interface change
    breaks: `apps/switchboard/test/attachments/routes.test.ts:35`,
    `routes-integration.test.ts:27`, `download-target.test.ts:90-94`;
  - `AttachmentAccessUnavailable`, `AttachmentAccessFailed`,
    `IAttachmentClientProvider`, and the `AuthorizedAttachmentService` and
    `AttachmentClientProvider` classes whose methods throw `not implemented`.
    Constructors do not throw, so `server.ts` still boots in track C's tests;
  - the `validateReserveMetadata` signature in `reactor-attachments`, its
    body throwing `not implemented`, exported from the package root;
  - `SubgraphArgs.attachments?` and `API.attachmentClientProvider`;
  - exports from `packages/reactor-api/index.mts`.

  It passes `pnpm tsc --build` in `reactor-attachments`, `reactor-api` and
  `apps/switchboard` before 1b starts. A type missed here makes two tracks
  edit the same file.
- *1b, parallel: four tracks.*

  | Track | Owns | Tests alone by |
  |---|---|---|
  | A, authorized service | `services/authorized-attachment.service.ts`; `validateReserveMetadata` in `reactor-attachments` and its tests; new `test/authorized-attachment-service.test.ts` | fake `IAttachmentService` and `IAttachmentAccessService` |
  | B, access policy | `services/attachment-access.service.ts` (`admitCaller`, options), `test/attachment-access.test.ts` | the existing access fixtures |
  | C, wiring | `graphql/base-subgraph.ts`, `graphql/graphql-manager.ts`, `server.ts`, `types.ts`, `apps/switchboard/src/server.mts:1016`, `:1095`, new `test/base-subgraph-attachments.test.ts`, `test/graphql-manager.test.ts` | a fake provider |
  | D, docs | `apps/academy/docs/academy/04-Reference/01-Reactor/09-AttachmentService.md` (`:66` and `:169` say subgraphs already get `context.attachments`; they do not), and every Academy page listing subgraph capabilities or the `assertCanRead*` helpers | review only |

  Track A rebuilds the `reactor-attachments` dist before running
  `reactor-api` tests; they consume the built output.

  Track C threads `authEnabled` from `_setupCommonInfrastructure` into
  `_setupAPI`, passes both options where `attachmentAccess` is built
  (`server.ts:1276`), builds the provider after it from
  `attachments.service`, and sets `API.attachmentClientProvider`. The
  switchboard subgraphs read it from `api`. The reactor-drive object literal
  in `server.mts` (`~:1122`) is not a `BaseSubgraph` and is left alone.
- *1c, serial: integration.*
  - Extend `test/attachment-read-gate.integration.test.ts`. It builds no
    attachment service today; add an `AttachmentBuilder` service beside its
    `AttachmentAccessService`, then call `forSubject(...)` as:
    - a reader, a non-reader, and a reader of a document that does not
      reference the ref;
    - an anonymous reader with the floor on (refused) and off (decided by
      the document);
    - an anonymous uploader with auth on and off.
  - A parity test: every reserve metadata case `parseReserveOptions` answers
    400 is refused by the decorator.
  - `verify` agent: build, typecheck, lint and test `reactor-attachments`,
    `reactor-api` and `switchboard` as CI does, rebuilding stale dists first.
  - Adversarial review at high effort with one question: can a resolver
    holding `attachmentsFor(ctx)` read bytes the HTTP route would refuse
    the same caller, or write where the route would refuse?

### Tests

`test/authorized-attachment-service.test.ts`:

- allowed `get` and `stat` forward the canonical `documentId` and the
  normalized ref, not the caller's strings;
- `denied` throws `AttachmentNotFound` and makes no inner call;
- `projection-unavailable` throws `AttachmentAccessUnavailable`;
- a missing, blank or oversized `documentId`, and the bare `AbortSignal`
  form, refuse without calling `access`;
- an exception from `access` is logged and becomes `AttachmentAccessFailed`
  carrying it as `cause`;
- the subject's address and key reach `access` as `userAddress`/`appKey`;
- `unauthenticated` throws `AuthenticationRequiredError` for a read and for
  `reserve`, with no inner call;
- `reserve` without `clientHash` and with invalid metadata refuses with no
  inner call; `AttachmentAlreadyExists` passes through;
- `getDownloadTarget` is decided before it delegates.

`test/attachment-access.test.ts`: `admitCaller` for each intent, with and
without an address, with each option on and off, and the defaults.

`test/base-subgraph-attachments.test.ts`: `attachmentsFor` returns the same
client for one `ctx` and different clients for two; an anonymous `ctx` binds
the empty subject; no provider throws.

`test/graphql-manager.test.ts`: `registerSubgraph` and the document-model
subgraph path both pass `attachments` in `SubgraphArgs`.

### Parallel execution

Stage 0 and 1a are serial, one agent each, and land before anything else
starts. Tracks A–D run concurrently, each agent in its own worktree branched
from the 1a commit; each owns its files outright. Integration, verification
and review run in sequence after the tracks merge.

**Budget.** Eight agent runs: stage 0, 1a, four tracks, integration with
`verify`, and review. The tracks need no database; only the integration test
does.

### Stage 2: workflow runtime (follow-up PR)

The workflow port wraps `host.attachments` with its own reference check
(`packages/reactor-workflow/src/reactor/service.ts:677-686`), supplied by
`attachmentRefCheck` (`apps/switchboard/src/workflow-runtime.mts:232-262`).
A workflow step has no caller, so the check is the reference alone.

- `ReferenceOnlyAttachmentAccessService implements IAttachmentAccessService`:
  `canReadAttachment` resolves the canonical id and checks
  `references.hasReference`; `admitCaller` returns `admitted`.
- `server.mts:998` passes
  `createAttachmentClient(new AuthorizedAttachmentService(service, referenceOnly, {}, logger))`.
- The port's own read check and `canReadAttachmentRef` are removed.

This variant is never exposed on `SubgraphArgs`.

### Conventions for implementing agents

- `pnpm` only; `pnpm tsc --build`, never a global `tsc`. Lint and format are
  oxlint and oxfmt; the pre-commit hook may rewrite staged files.
- Rebuild `packages/shared` and `packages/reactor` dists before running
  downstream tests.
- Granular try/catch around the single await that can fail. Comments terse
  and rare.
- Commit per logical change with a body that says why. Never amend, rebase
  or force-push.
- A red test stays red until its cause is fixed. No retries.
- Record every deviation in the PR body with file:line and the reason. Do
  not edit this plan to match the code.

## Limits

- `getShareLink` through an in-process client fails: only
  `RemoteAttachmentStore` implements `getDownloadTarget`
  (`reactor-attachments/src/attachment-service.ts:71-83`). Minting a
  filesystem download target needs the switchboard's URL signer and request
  base URL. Out of scope.
- The reserve route keeps its own metadata parsing until it moves onto
  `validateReserveMetadata`.
- The HTTP stat and download routes keep their own grant logic. Signed URLs
  are a grant that does not go through `canReadAttachment`, so only part of
  the route could use this class.
- Processors keep the trusted client (`server.ts:1162`). A processor acts
  for no caller.
