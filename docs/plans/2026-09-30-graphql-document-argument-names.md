# Plan: GraphQL document argument names

Date: 2026-09-30
Status: proposal, not started

## Overview

The reactor subgraph names a document reference `identifier`,
`documentIdentifier`, `parentIdentifier`, `sourceIdentifier`, `documentId` or
`parentId`. None of these names says what it accepts. This plan renames each
argument so the name says what it accepts, keeps every old name working, and
fixes the write paths where a slug passes the gate but the write goes wrong.

Naming rule: keep the prefix and replace the suffix.

```
id only          <prefix>Id           parentId
slug only        <prefix>Slug         (no field today)
id or slug       <prefix>IdOrSlug     idOrSlug, documentIdOrSlug, sourceIdOrSlug
list of either   <prefix>IdsOrSlugs   idsOrSlugs
```

## Current behaviour

A document reference goes through two layers. The first is the subgraph gate,
`assertCanRead`/`assertCanWrite`/`assertCanExecuteOperation` in
`base-subgraph.ts`. The second is the data call in `resolvers.ts`.

The gate resolves a slug only on the checked path: a non-admin caller under
`DOCUMENT_PERMISSIONS`. Under `OPEN`, or for a supreme admin,
`#resolveForCheck` returns null and the raw string goes through as
`fetchIdentifier`. The data call then decides:

- `IReactorClient.get`, the relationship reads, `getOperations`,
  `evaluateActions` and `execute` resolve slugs themselves, through
  `getByIdOrSlug`, `resolveIdOrSlug` or `resolveWriteTarget`.
- `reactor.addRelationship`/`updateRelationship`/`removeRelationship`
  (`core/reactor.ts:950-1050`) and `reactor.deleteDocument`
  (`core/reactor.ts:582`) take the string as the job's `documentId`, and as the
  action's `sourceId`/`targetId`.
- `ReactorClient.create(document, parentIdentifier)`
  (`client/reactor-client.ts:853-866`) and `DriveClient.addFile`
  (`client/drive-client.ts:162,179`) write the string into the parent job and
  into the `ADD_RELATIONSHIP` action. The child job has already run by then.

A slug therefore works on some fields for every caller. On others it works
only on the checked path. On a few it never works end to end: it fails after
the child is created, or it stores a dangling edge.

`SearchFilterInput.identifiers` is declared on the reactor subgraph and on
every per-model subgraph, and nothing reads it: `findDocuments`
(`resolvers.ts:500-503`), the `documentChanges` filter (`subgraph.ts:1202-1205`)
and the per-model `findDocuments` (`document-model-subgraph.ts:356`) all ignore
it. Nothing in the monorepo or in recipes sends it.

## Mapping

"Today" is what works end to end. "Checked" is a non-admin caller under
`DOCUMENT_PERMISSIONS`; "skipped" is `OPEN` or a supreme admin. Every "new" row
accepts id or slug for every caller once stage 1 lands.

### Reactor subgraph

| Field | Old | New | Today | Where it resolves or does not |
|---|---|---|---|---|
| `document` | `identifier` | `idOrSlug` | both | `resolvers.ts:182` → `reactor-client.ts:325` |
| `documentOutgoingRelationships` | `sourceIdentifier` | `sourceIdOrSlug` | both | `resolvers.ts:254` → `reactor-client.ts:480` |
| `documentIncomingRelationships` | `targetIdentifier` | `targetIdOrSlug` | both | `resolvers.ts:314` → `reactor-client.ts:525` |
| `documentOutgoingRelationshipEdges` | `sourceIdentifier` | `sourceIdOrSlug` | both | `resolvers.ts:356` → `reactor-client.ts:571` |
| `documentIncomingRelationshipEdges` | `targetIdentifier` | `targetIdOrSlug` | both | `resolvers.ts:398` → `reactor-client.ts:608` |
| `documentOperations` | `OperationsFilterInput.documentId` | `OperationsFilterInput.documentIdOrSlug` | both | `resolvers.ts:631` → `reactor-client.ts:385` |
| `evaluateActions` | `documentIdentifier` | `documentIdOrSlug` | both | `resolvers.ts:687` → `reactor-client.ts:699` |
| `execute`, `executeAsync` | `documentIdentifier` | `documentIdOrSlug` | both | `resolvers.ts:969,1011` → `resolveWriteTarget`, `reactor-client.ts:2135` |
| `renameDocument`, `setPreferredEditor` | `documentIdentifier` | `documentIdOrSlug` | both | `resolvers.ts:1134,1172` → `execute` |
| `mutateDocument`, `mutateDocumentAsync` | `documentIdentifier` | unchanged | both | field already deprecated; no new argument |
| `createDocument`, `createEmptyDocument` | `parentIdentifier` | `parentIdOrSlug` | id only | the gate and the type check resolve it (`subgraph.ts:656-664`, `resolvers.ts:736`), but the write uses the raw string (`reactor-client.ts:858,864`, `drive-client.ts:162,179`) |
| `addRelationship`, `updateRelationship`, `removeRelationship` | `sourceIdentifier` | `sourceIdOrSlug` | checked: both; skipped: id only | `subgraph.ts:889,909,929` → `core/reactor.ts:950` |
| same | `targetIdentifier` | `targetIdOrSlug` | id only | a slug is stored as the edge target (`core/reactor.ts:971`) |
| `moveRelationship` | `sourceParentIdentifier`, `targetParentIdentifier` | `sourceParentIdOrSlug`, `targetParentIdOrSlug` | checked: both; skipped: id only | `subgraph.ts:949-954` → `core/reactor.ts:950,1022` |
| same | `targetIdentifier` | `targetIdOrSlug` | id only | the edge read resolves it (`reactor-client.ts:2111`); the remove and the add do not |
| `deleteDocument` | `identifier` | `idOrSlug` | checked: both; skipped: id only | `resolvers.ts:1384` (`removeNode` node id), `resolvers.ts:1386` → `core/reactor.ts:582` |
| `deleteDocuments` | `identifiers` | `idsOrSlugs` | checked: both; skipped: id only | `subgraph.ts:1015-1017` → `reactor-client.ts:1604` |
| `findDocuments`, `documentChanges` | `SearchFilterInput.parentId` | unchanged | id only | the indexer lookup (`core/reactor.ts:1142`) and the equality check (`adapters.ts:658`); the name is already accurate |
| same | `SearchFilterInput.identifiers` | deprecated, no replacement | ignored | see Current behaviour |

### Per-model subgraphs (`generateNewApiSchema`)

| Field | Old | New | Today | Where |
|---|---|---|---|---|
| `<Model>.document` | `identifier` | `idOrSlug` | both | `document-model-subgraph.ts:305` → `resolvers.document` |
| `<Model>.documentOutgoingRelationships` | `sourceIdentifier` | `sourceIdOrSlug` | both | `document-model-subgraph.ts:378` |
| `<Model>.documentIncomingRelationships` | `targetIdentifier` | `targetIdOrSlug` | both | `document-model-subgraph.ts:411` |
| `<Model>.createDocument`, `createEmptyDocument` | `parentIdentifier` | `parentIdOrSlug` | checked: both; skipped: id only | `document-model-subgraph.ts:447,517` → `create` |
| `<Model>.<op>`, `<op>Async` | `docId: PHID!` | `documentIdOrSlug: String` | both | `document-model-subgraph.ts:554-561,599-606`; `PHID` is `z.string()` |
| `<Model>.findDocuments` | `identifiers` | deprecated, no replacement | ignored | `document-model-subgraph.ts:356` |

### Auth subgraph

| Field | Old | New | Today | Where |
|---|---|---|---|---|
| `documentAccess`, `documentProtection`, `canExecuteOperation`, the grant, protection and ownership mutations | `documentId` | `documentIdOrSlug` | both | `withCanonicalDocumentId` (`base-subgraph.ts:137`), called unconditionally in `auth/subgraph.ts:46-297` |

### Out of scope

- Sync-protocol ids (`OperationContext.documentId`, `RemoteFilterInput.documentId`,
  `SyncRefusalInput.documentId`, `syncHolds(documentId:)`). The protocol makes
  them canonical, so they are id only and already named correctly.
- Output fields (`PHDocument.id`, `DocumentRelationship.sourceId`,
  `DocumentChangeContext.parentId`). Output fields hold ids.
- The legacy per-model API (`generateLegacyApiSchema`: `getDocument(docId,
  driveId)`, `<Model>_<op>(driveId, docId)`). Nothing serves it:
  `document-model-subgraph.ts:147` passes `useNewApi: true`. Deleting it, and
  `common/utils/vetra-gql.ts`, which still calls it, is a separate change.
- `IReactorClient` TypeScript parameter names.

## Compatibility

### Mechanism

Each renamed argument gets a nullable sibling with the new name. The old
argument becomes nullable and `@deprecated`.

```graphql
document(
  idOrSlug: String
  identifier: String @deprecated(reason: "Use idOrSlug.")
  view: ViewFilterInput
): DocumentWithChildren

input OperationsFilterInput {
  documentIdOrSlug: String
  documentId: String @deprecated(reason: "Use documentIdOrSlug.")
  branch: String
  # ...unchanged
}

input SearchFilterInput {
  type: String
  parentId: String
  identifiers: [String!] @deprecated(reason: "Ignored. Filter by type or parentId.")
}
```

What was verified against the stack in use:

- graphql-js 16.12.0 accepts `@deprecated` on `ARGUMENT_DEFINITION` and
  `INPUT_FIELD_DEFINITION`. It rejects deprecating a required one: "Required
  argument Query.a(x:) cannot be deprecated." The old `String!` therefore has
  to become `String`.
- On the default gateway, `@apollo/subgraph` 2.15.0 and Apollo composition
  2.14.4 keep argument and input-field deprecations. A composed supergraph's
  API schema reports `deprecationReason` on both.
- `@oneOf` is not viable. graphql-js 16.12 supports it on input objects, but
  composition fails with `[r] Unknown directive "@oneOf".`. It would also turn
  a scalar argument into an input object, which is a shape change and not a
  rename.

### The rule

"Given" means present and non-null. Exactly one of the pair must be given, or
the field fails with `BAD_USER_INPUT`. The rule holds even when both carry the
same value: a caller sending both gains nothing, because an old server rejects
the new name anyway.

```ts
// packages/reactor-api/src/graphql/argument-aliases.ts
export class ArgumentAliasError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "BAD_USER_INPUT" } });
  }
}

export function requireOneOf<T>(
  args: Record<string, unknown>,
  name: string,
  deprecatedName: string,
): T {
  const current = args[name] ?? undefined;
  const deprecated = args[deprecatedName] ?? undefined;
  if (current !== undefined && deprecated !== undefined) {
    throw new ArgumentAliasError(`Pass ${name} or ${deprecatedName}, not both.`);
  }
  if (current === undefined && deprecated === undefined) {
    throw new ArgumentAliasError(`${name} is required.`);
  }
  return (current ?? deprecated) as T;
}

export function optionalOneOf<T>(
  args: Record<string, unknown>,
  name: string,
  deprecatedName: string,
): T | undefined {
  const current = args[name] ?? undefined;
  const deprecated = args[deprecatedName] ?? undefined;
  if (current !== undefined && deprecated !== undefined) {
    throw new ArgumentAliasError(`Pass ${name} or ${deprecatedName}, not both.`);
  }
  return (current ?? deprecated) as T | undefined;
}
```

`requireOneOf` covers arguments that were `String!`. `optionalOneOf` covers
`parentIdentifier`, which was already nullable.

Normalization runs first in each `subgraph.ts` and `document-model-subgraph.ts`
resolver, before the gate, because the gate reads the argument. After it,
`resolvers.ts` sees only the new names:

```ts
document: async (_parent, args, ctx: Context) => {
  const idOrSlug = requireOneOf<string>(args, "idOrSlug", "identifier");
  const handle = await this.assertCanRead(idOrSlug, ctx);
  return resolvers.document(
    this.reactorClient,
    { idOrSlug: handle.fetchIdentifier, view: args.view },
    this.viewSubject(ctx),
  );
},
```

Observable differences for existing callers:

- Omitting a formerly required argument used to fail validation for the whole
  request. It now fails that field during execution, with `BAD_USER_INPUT` and
  a `path`. No working caller omits one.
- Introspection shows those arguments as nullable.

### Codegen'd clients in this repo

Both configs, `packages/reactor-api/codegen.ts` and
`packages/reactor-browser/codegen.ts`, read the SDL files. Deprecated arguments
stay in their input. Regenerate with `pnpm codegen` in each package and never
hand-edit `gen/`.

- The `typescript` plugin makes schema argument types optional
  (`QueryDocumentArgs.identifier?: InputMaybe<string>`) and adds the new names.
- `typescript-resolvers` resolver signatures change the same way. `subgraph.ts`
  typechecks only once normalization is in place, so both land in the same
  commit.
- `typescript-validation-schema` regenerates `OperationsFilterInputSchema`
  with an optional `documentId`.
- Operation variable types and the `getSdk` signatures do not change, because
  they come from `operations.graphql`, which stage 2 leaves alone. The
  requester, `requester.with-zod.ts` and reactor-browser's SDK are type-stable
  across stage 2.

### Codegen consumers outside the repo

- SDL-based codegen sees no break. Operation variable types are unchanged, and
  an existing `$x: String!` variable is valid in a nullable argument position.
  Schema argument and input types only widen.
- Introspection-based codegen breaks at build time. graphql-js
  `getIntrospectionQuery` defaults to `inputValueDeprecation: false`, so it
  leaves out deprecated arguments and input fields. An operation that still
  uses `identifier` then fails codegen validation with "Unknown argument". The
  wire is unaffected. The fix is on the consumer side: enable deprecated input
  values in the introspection options, or move to the new names. Skipping
  `@deprecated` would avoid this, but it would take away the only signal
  tooling shows. This plan accepts that trade.

### Mixed versions

- An old Connect, reactor-browser, renown or recipe against a new switchboard
  keeps working through the old names.
- A new client against an old switchboard fails on any new name with "Unknown
  argument". For that reason the in-repo callers that run against remote
  switchboards (stage 5) switch one release after the server change (stage 2),
  and only once the oldest switchboard those clients support includes stage 2.
- Server-local callers (the playground prefill) and same-version test harnesses
  can switch in the same release as stage 2.
- The fallback in `renown/src/switchboard.ts:147-155`, which targets
  switchboards without `execute`, keeps the old names for good. It exists only
  to reach old servers.

### What cannot be done without a break

- Removing the deprecated names. This is the only wire break, and it is
  deferred, not avoided. See Removal.
- Introspection-based codegen consumers need a configuration change or a
  migration, as described above. This is a build-time break, not a wire break.

## Stages

Each stage is one commit unless noted, can be reverted on its own, and leaves
`main` green.

### 1. Resolve write targets for every caller

Behaviour fix only; the schema does not change. Every write path that takes a
document reference resolves it the way `resolveWriteTarget` already does. A
string that no slug maps to is taken as an id, so documents still in flight
keep working. A string that is both an id and another document's slug is
refused as ambiguous by `resolveIdOrSlug`. Extract the body of
`resolveWriteTarget`, without the `CREATE_DOCUMENT` check, into one helper
that it and the call sites below share. The semantics stay the same.

```ts
// packages/reactor/src/client/reactor-client.ts
private async resolveReference(identifier: string, branch: string, signal?: AbortSignal): Promise<string> {
  const view = { branch };
  const bySlug = await this.documentView.resolveSlug(identifier, view, undefined, signal);
  if (bySlug === undefined || bySlug === identifier) {
    return identifier;
  }
  return this.documentView.resolveIdOrSlug(identifier, view, undefined, signal);
}

private async resolveWriteTarget(identifier: string, branch: string, actions: readonly Action[], signal?: AbortSignal): Promise<string> {
  if (actions.some((action) => action.type === "CREATE_DOCUMENT")) {
    return identifier;
  }
  return this.resolveReference(identifier, branch, signal);
}
```

Call sites:

- `create`: the parent id used in the parent job and the signed action.
- `createEmpty`: the parent it passes on.
- `addRelationship`, `updateRelationship`, `removeRelationship`: source and
  target.
- `moveRelationship`: all three references.
- `deleteDocument`: once, before the cascade root reaches
  `getOrphanedChildren([identifier])`, relationship removal and the delete job.
- `DriveClient.addFile`: the drive id.
- `DriveClient.removeNode`: the drive id and the node id.

In `resolvers.deleteDocument`, pass the resolved id to `removeNode` instead of
`args.identifier`.

Tests (`packages/reactor/test/client/`):

- A slug parent for `create` and for `addFile` links the child.
- Slug source and target for `addRelationship` store an edge between the
  canonical ids.
- A slug for `deleteDocument` deletes the document.

Also add a reactor-api test that covers the same paths under `OPEN`, where the
gate is skipped.

### 2. Reactor subgraph: new names

- Change `schema.graphql` as shown under Mechanism, for every row of the
  reactor table.
- Add `argument-aliases.ts`.
- Normalize at the top of each `subgraph.ts` resolver.
- Rename the `resolvers.ts` argument keys to the new names.
- Update the internal `resolvers.*` callers:
  - `subgraph.ts`: `PHDocument.operations` (:233-248) builds `filter.documentId`,
    and `createDocument`/`createEmptyDocument` (:657, :704) call
    `resolvers.document({ identifier })`.
  - `document-model-subgraph.ts`: `resolvers.document({ idOrSlug })`.
- Regenerate both `gen/` outputs. `operations.graphql` does not change.
- Update the resolver-level tests that call `resolvers.*` directly
  (`reactor-resolvers.test.ts`, `execute-resolvers.test.ts`,
  `reactor-evaluate-actions.test.ts`) to use the new keys.
- Leave the subgraph-level tests (`reactor-subgraph-permissions.test.ts`,
  `reactor-mutations-read-gate.integration.test.ts`,
  `permissions-integration.test.ts`) on the old names. They are now the
  compatibility coverage.
- Add `argument-aliases.test.ts` and `reactor-argument-names.test.ts` (see
  Tests).

### 3. Per-model subgraphs: new names

Same mechanism, applied in `generateNewApiSchema` and
`document-model-subgraph.ts`. `docId: PHID!` becomes `docId: PHID
@deprecated(...)` alongside `documentIdOrSlug: String`.

- Update `create-schema-prefix.test.ts` and `document-drive-subgraph.test.ts`
  where they snapshot the SDL.
- Leave `document-model-subgraph-permissions.test.ts` on the old names.
- Add `document-model-argument-names.test.ts`.

### 4. Auth subgraph: new names

`documentId` becomes `documentIdOrSlug`, with `documentId` deprecated, in
`auth/schema.graphql`. `withCanonicalDocumentId` takes the result of
`requireOneOf`. No code in the monorepo sends these fields over the wire. The
auth resolver tests call the service or the resolvers directly. The only
callers to migrate are the docs in stage 6.

### 5. Switch in-repo callers (release after stage 2)

Stages 5a and 5b can land together in the release that contains stages 2-4.
Stages 5c-5e wait for the next release.

- **5a. Server-local:** the playground prefill (`playground.ts`, pinned in
  `playground.test.ts:17-46`).
- **5b. Same-version harnesses.** Before scheduling a harness here, confirm it
  boots the in-tree switchboard and not a published one. `test/package-e2e`
  installs packed tarballs, and `test/vetra-e2e` may do the same. A harness
  that runs a published switchboard moves to 5c instead.
  - `test/test-client/src/client/queries.ts`
  - `test/lb-loadtest/src/run.ts`
  - `test/test-fusion/e2e/*.spec.ts`
  - `test/package-e2e/tests/**`
  - `test/vetra-e2e/tests/*.spec.ts`
  - `test/workflow-piece-e2e/scripts/lib/graphql.ts`
  - `apps/switchboard-lb/test/integration/mixed-load.js`
  - `scripts/profiling/docs-create.ts` and `scripts/profiling/docs-reset.ts`
  - `tools/registry-audit/create-query-worker.ts`
  - `packages/workflow/test/ui/reactor-steps.spec.ts:80` (`docId`)
- **5c. `operations.graphql`:** move every operation to the new names and
  regenerate both `gen/` outputs. Variable names follow the arguments
  (`$idOrSlug`). The `getSdk` variable types change here: this is the one
  in-repo type change callers see. Update the callers in the same commit:
  - `reactor-api/test/reactor-client.test.ts`
  - reactor-browser `graphql-client/graphql-reactor-client.ts`,
    `graphql/mutators.ts`, `graphql/fetchers.ts`,
    `graphql/graphql-client-document-cache.ts`,
    `hooks/init-graphql-reactor-client.ts`
  - reactor-browser `remote-controller/remote-client.ts`
  - reactor-browser `graphql/adapters.ts:91-98`, the variables parser keyed on
    `documentIdentifier`
  - `test/switchboard/src/*`
  - the reactor-browser tests that pin variable names
    (`graphql-reactor-client.{read,write}.test.ts`,
    `remote-client.test.ts`, `remote-controller.test.ts:500`,
    `graphql-client-document-cache.test.tsx:240`)
- **5d. Hand-written documents in reactor-browser:**
  - `graphql-client/operations.ts:69-100`
  - `graphql/batch-queries.ts:61-137`
  - `utils/switchboard.ts:238-283` (the per-model prefill), pinned in
    `switchboard.test.tsx:117-139` and `test/switchboard/src/explorer-prefill.test.ts`
- **5e. renown:** `src/switchboard.ts:117-143,538,551`; the legacy fallback at
  :147-155 stays. Update the tests `test/switchboard.test.ts:53,356,377,716` and
  `test/signin.test.ts:42`.

### 6. Docs

The docs name only the new arguments and never mention the old ones. Edit:

- `03-Build/04-WorkWithData/02-UsingTheAPI.mdx:357,422,459`
- `03-Build/04-WorkWithData/03-UsingSubgraphs.md:218,291-317,347`
- `04-Reference/03-GraphQLData/07-SubgraphMigrationGuide.md:31-36,70-371,493-495,591`
- `03-Build/03-BuildingUserExperiences/07-Authorization/02-DocumentPermissions.md:561-648`,
  plus the auth `documentId` examples at :227-548
- `07-Authorization/05-EnforcingAuthorizationInSubgraphs.md:201-205`

Then run `pnpm generate:llm-docs` in `apps/academy` to regenerate
`llms-full.txt` and `static/llms-full.txt`.

`ACADEMY_LLM_COMPLETE.md` and `static/ACADEMY_LLM_COMPLETE.md` have no
generator and are stale, so this plan deletes them in a separate commit rather
than editing generated output by hand. Its `README.md:15-18` claim goes with
them. The legacy-API examples in `02-DocumentPermissions.md:828-1320` and
`06-RelationalDbProcessor.md:417-498` document an API nobody serves. Rewriting
them against the new API is a separate commit in this stage.

### 7. Recipes

In the recipes repo, update:

- `anonymous-subscriptions/src/reactor.ts:64,83` and `src/demo.ts:98`
  (inline literals)
- `subscription-cli`, whose `parentId` is unchanged

Land the recipes change after the catalog carries the release that contains
stage 2.

## Tests

Build the test schema once from the real `schema.graphql` and the real
resolvers, with a stub `IReactorClient`. Run every pair through `graphql()` so
that validation and coercion are exercised, not just the helper.

```ts
// packages/reactor-api/test/reactor-argument-names.test.ts
const PAIRS = [
  { field: "document", kind: "query", current: "idOrSlug", deprecated: "identifier" },
  { field: "execute", kind: "mutation", current: "documentIdOrSlug", deprecated: "documentIdentifier" },
  { field: "createDocument", kind: "mutation", current: "parentIdOrSlug", deprecated: "parentIdentifier", optional: true },
  // one row per argument in the mapping table, input fields included
] as const;

describe.each(PAIRS)("$field($current | $deprecated)", (pair) => {
  it("accepts the deprecated name", ...);   // stub receives the value
  it("accepts the new name", ...);          // stub receives the same value
  it("refuses both with BAD_USER_INPUT", ...);
  it("refuses neither with BAD_USER_INPUT", ...); // skipped for optional pairs; asserts no parent instead
});

it("keeps deprecations in the composed API schema", ...); // LocalCompose; deprecationReason on each old name
it("rejects nothing an older client sends", ...);          // fixtures/operations.pre-rename.graphql validates and executes
```

The last test pins the compatibility requirement directly: every operation in
the `operations.graphql` from before this plan, stored as a fixture, must
validate and execute against the new schema.

Stage 3 gets the same table for the per-model subgraph, built from one fixture
model. Stage 4 gets it for the auth subgraph. Stage 1's tests are listed under
stage 1.

## Removal

Remove a deprecated name when all of these hold:

1. No file in the monorepo or in recipes sends it. Enforce this with a test
   that parses every `.graphql` file and every `gql` literal in `packages/`,
   `apps/`, `test/` and `scripts/` and fails on a deprecated argument. The
   renown fallback is the one allow-listed exception.
2. The oldest Connect, reactor-browser and renown release the switchboard
   supports is at least the release that contains stage 5.
3. One full release has shipped with the deprecation in place, and the release
   notes of that release announce the removal.

The removal is a breaking change to the wire. It makes `idOrSlug` and the other
new names `String!` again. It lands in its own commit, and deletes the helpers,
the old-name test rows and the fixture test.

## Decisions

- Stage 1 fixes resolution instead of naming some arguments `...Id`. Renaming
  `sourceIdentifier` or `deleteDocument(identifier:)` to an id name would take
  away slug support that checked callers have today and that tests pin
  (`reactor-subgraph-permissions.test.ts:2036-2180`). `parentIdentifier` and
  `targetIdentifier` never worked with a slug, so making them accept one
  breaks no caller.
- The rule rejects both names even when they carry the same value. Accepting
  equal values would buy no cross-version benefit and would add a case to
  test.
- `SearchFilterInput.identifiers` is deprecated, not given a replacement.
  Nothing sends it, and adding `ids`/`slugs` filtering is a feature, not a
  rename.
- The auth subgraph is in scope because its `documentId` accepts slugs, which
  is the same mislabel this plan fixes.
