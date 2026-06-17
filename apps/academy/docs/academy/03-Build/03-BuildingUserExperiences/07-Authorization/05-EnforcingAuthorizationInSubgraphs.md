# Enforcing Authorization in Subgraphs

:::warning Work in Progress
This documentation is still being written and may be incomplete.
:::

The other pages in this section explain how an **operator** configures
authorization for a Reactor ([Reactor API Authorization](./04-Authorization.md))
and how grants are managed ([Document Permissions](./02-DocumentPermissions.md)).
This page is for **builders**: when you write a [custom subgraph](../../04-WorkWithData/03-UsingSubgraphs.md),
your resolvers run with full access to the Reactor, so **you** are responsible for
enforcing authorization on the data they read and write.

## Why your resolvers must enforce authorization

The Reactor's built-in subgraphs (`r`, `auth`, `document-drive`, the document-model
subgraphs) already guard every resolver. A custom subgraph you generate with
`ph generate subgraph` does **not** — the generated resolvers call the Reactor
client directly and will happily return data regardless of who is asking.

Consider the search resolver from the [Using subgraphs](../../04-WorkWithData/03-UsingSubgraphs.md)
tutorial:

```typescript
searchTodos: async (parent, args: { driveId: string; searchTerm: string }) => {
  const children = await reactorClient.getOutgoingRelationships(
    args.driveId,
    "child",
  );
  // ...returns every matching document id, with no permission check
};
```

If the Reactor is configured with document permissions, this resolver leaks the
existence — and ids — of documents the caller is not allowed to read. The
enforcement helpers on `BaseSubgraph` exist to close exactly this gap.

## The model you are enforcing against

Authorization is decided by a single service selected once at boot by the
Reactor's [policy](./04-Authorization.md#how-authorization-works). You do **not**
branch on the policy yourself — you call the same helpers in every resolver and
the active policy decides the outcome:

| Policy                   | When                                          | What the helpers do                                                       |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| **OPEN**                 | `AUTH_ENABLED=false`                          | Every check passes for everyone, including anonymous callers.             |
| **ADMIN_ONLY**           | `AUTH_ENABLED=true`, document permissions off | Only addresses in `ADMINS` pass any check.                                |
| **DOCUMENT_PERMISSIONS** | `DOCUMENT_PERMISSIONS_ENABLED=true`           | Full per-document protection + READ/WRITE/ADMIN grants, with inheritance. |

Because the policy is resolved centrally, the right approach is to **write one
enforcement path** and let it behave correctly under all three policies. Calling
a helper is always safe: under OPEN it is effectively a no-op, and under the
stricter policies it fails closed.

## Where the helpers live

The helpers are public methods on `BaseSubgraph`. The scaffold produced by
`ph generate subgraph` hands you the subgraph instance as the `subgraph`
parameter of `getResolvers`, so call them directly as `subgraph.assertCanRead(...)`:

```typescript
// subgraphs/search-todos/resolvers.ts
import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import type { Context } from "@powerhousedao/reactor-api";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactorClient;

  return {
    Query: {
      document: async (
        _parent: unknown,
        args: { identifier: string },
        ctx: Context,
      ) => {
        const handle = await subgraph.assertCanRead(args.identifier, ctx);
        return reactor.get(handle.fetchIdentifier);
      },
    },
  };
};
```

:::tip Class-field resolvers work too
If you define resolvers inside your subgraph class instead of in `getResolvers`,
call the helpers on `this` (`this.assertCanRead(...)`). That is the style the
Reactor's built-in subgraphs use. Both forms reach the same public methods.
:::

The caller's verified identity is on the request `Context` as `ctx.user`:

```typescript
ctx.user?.address; // the verified Ethereum address, or undefined for anonymous callers
```

You never read identity from headers or arguments — `ctx.user` is the only
trustworthy source, and it is `undefined` until the [authentication flow](./01-RenownAuthenticationFlow.md)
has verified a token.

## Identifiers: slugs, canonical ids, and the handle

Resolvers usually receive an **identifier** that may be either a document id or a
slug. Permission rows, however, are keyed on the **canonical document id**. If
you authorized a slug but then fetched by that same slug through a different code
path, a caller could alias one document's slug onto another and slip past the
check.

The identifier-accepting asserts solve this for you. Each returns an
`AuthorizedDocumentHandle` whose `fetchIdentifier` is **always safe to fetch
with** — it is the canonical id when a check ran, or the original identifier when
the check was skipped for a policy-wide caller (OPEN or a supreme admin):

```typescript
const handle = await subgraph.assertCanRead(args.identifier, ctx); // throws if denied
const doc = await subgraph.reactorClient.get(handle.fetchIdentifier); // never args.identifier
```

**Rule of thumb:** after any `assertCan*` that takes an identifier, perform the
data fetch with `handle.fetchIdentifier`, never with the original argument.

## The helper reference

All of the following are public methods on `BaseSubgraph`, called on the
`subgraph` instance (or `this` from a class-field resolver):

| Helper                                             | Use when                                                                   | On failure         |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| `assertCanRead(identifier, ctx)`                   | Reading one document the caller named (id or slug).                        | throws `Forbidden` |
| `assertCanWrite(identifier, ctx)`                  | Mutating one document the caller named.                                    | throws `Forbidden` |
| `assertCanExecuteOperation(identifier, type, ctx)` | Executing a specific operation type on a document.                         | throws `Forbidden` |
| `assertCanCreate(ctx)`                             | Creating a new top-level document (no parent to check write against).      | throws `Forbidden` |
| `canReadDocument(canonicalId, ctx)`                | Filtering a list — a non-throwing read check on an id from the data layer. | returns `boolean`  |
| `authorizationService.isSupremeAdmin(address)`     | Short-circuiting per-item filtering for policy-wide callers.               | returns `boolean`  |

Each `assertCan*` that takes an `identifier` returns an `AuthorizedDocumentHandle`;
use its `fetchIdentifier` for the subsequent fetch. There are also lower-level
`*Canonical` variants (`assertCanReadCanonical`, etc.) used by the built-in
subgraphs when an id has already been resolved by the data layer; prefer the
identifier-accepting variants in your own code.

The supporting types are exported from `@powerhousedao/reactor-api` when you need
to name them — `Context`, `CanonicalDocumentId`, `AuthorizationPolicy`,
`AuthorizedDocumentHandle`, and `IAuthorizationService`.

## Patterns

### Guard a single-document read

```typescript
document: async (_parent, args: { identifier: string }, ctx: Context) => {
  const handle = await subgraph.assertCanRead(args.identifier, ctx);
  return subgraph.reactorClient.get(handle.fetchIdentifier);
};
```

### Guard a write

```typescript
renameDocument: async (
  _parent,
  args: { identifier: string; name: string },
  ctx: Context,
) => {
  const handle = await subgraph.assertCanWrite(args.identifier, ctx);
  return doRename(handle.fetchIdentifier, args.name);
};
```

### Guard a specific operation type

When a write should be allowed only for callers permitted to run a _particular_
operation (operation-level grants):

```typescript
addTodoItem: async (
  _parent,
  args: { docId: string; input: AddTodoItemInput },
  ctx: Context,
) => {
  const handle = await subgraph.assertCanExecuteOperation(
    args.docId,
    "ADD_TODO_ITEM",
    ctx,
  );
  return applyOperation(handle.fetchIdentifier, "ADD_TODO_ITEM", args.input);
};
```

### Guard document creation

If you are creating a document **under a parent**, the meaningful check is write
access on that parent, so resolve and assert against it. Only use
`assertCanCreate` for a genuinely top-level document with no parent:

```typescript
createTodoList: async (
  _parent,
  args: { parentIdentifier?: string; name: string },
  ctx: Context,
) => {
  if (args.parentIdentifier) {
    const handle = await subgraph.assertCanWrite(args.parentIdentifier, ctx);
    return createUnder(handle.fetchIdentifier, args.name);
  }
  subgraph.assertCanCreate(ctx); // throws if the caller may not create documents
  return createTopLevel(args.name);
};
```

### Filter a list of documents

A resolver that returns _many_ documents must not throw on the first forbidden
one — it must drop the documents the caller cannot read and return the rest.
Supreme admins (and OPEN) see everything, so skip the per-item work for them:

```typescript
import type { CanonicalDocumentId } from "@powerhousedao/reactor-api";

searchTodos: async (
  _parent,
  args: { driveId: string; searchTerm: string },
  ctx: Context,
) => {
  const matches = await runSearch(args.driveId, args.searchTerm); // returns document ids

  // Policy-wide callers see everything; skip the per-item check.
  if (subgraph.authorizationService.isSupremeAdmin(ctx.user?.address)) {
    return matches;
  }

  const visible: string[] = [];
  for (const id of matches) {
    // canReadDocument is non-throwing; ids returned by the Reactor are already canonical
    if (await subgraph.canReadDocument(id as CanonicalDocumentId, ctx)) {
      visible.push(id);
    }
  }
  return visible;
};
```

This is the same shape the built-in `findDocuments` and relationship resolvers
use. Filtering on read also means you never leak the _existence_ of a protected
document through a list endpoint.

## Best practices

1. **Fail closed.** Authorize _before_ you fetch or mutate, and let a denial throw.
   Never fetch first and filter the response shape afterwards.
2. **Fetch with `handle.fetchIdentifier`.** Never re-use the raw identifier the
   caller passed in after an `assertCan*` check.
3. **Trust only `ctx.user`.** Do not read identity from arguments or headers.
4. **Filter lists, don't throw on them.** Use `canReadDocument` + `isSupremeAdmin`
   for collection resolvers; reserve the throwing asserts for single-target
   resolvers.
5. **Pick the tightest check.** Read endpoints use `assertCanRead`; mutations use
   `assertCanWrite`; operation-restricted mutations use `assertCanExecuteOperation`.
6. **Write the check unconditionally.** Don't special-case OPEN or ADMIN_ONLY in
   your resolver — the helpers already collapse to the correct behavior per policy.

:::tip Built-in subgraphs are covered by CI
Inside the `reactor-api` package, a default-deny test
(`test/authorization-coverage.test.ts`) fails CI if any resolver on the built-in
subgraphs references neither the authorization service nor a reviewed exemption.
Custom subgraphs in your own project are **not** covered by that test — the
responsibility for the patterns above is yours.
:::

## Next steps

- **Configure the Reactor**: [Reactor API Authorization](./04-Authorization.md)
- **Manage grants**: [Document Permissions](./02-DocumentPermissions.md)
- **Authentication flow**: [Renown authentication](./01-RenownAuthenticationFlow.md)
- **Build a subgraph**: [Using subgraphs](../../04-WorkWithData/03-UsingSubgraphs.md)
