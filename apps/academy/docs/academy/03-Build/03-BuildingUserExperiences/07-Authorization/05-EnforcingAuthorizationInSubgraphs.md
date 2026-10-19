# Enforcing authorization in subgraphs

Authorize each custom resolver before it reads or writes data. A `BaseSubgraph<Context>` instance has host services with full Reactor access. The active host policy decides what the caller may do. Call the public helpers on `subgraph` in typed resolvers or in a `schema.graphql` resolver factory.

## Guard a single document

```typescript
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class DocumentNamesSubgraph extends BaseSubgraph<Context> {
  static override readonly subgraphName = "document-names";

  static override getSchema(schema: SchemaBuilder<DocumentNamesSubgraph>) {
    return [
      schema.query("authorizedDocumentName", {
        args: { identifier: ph.String({ required: true }) },
        returns: ph.String({ required: true }),
        resolve: async ({ args, subgraph, request }) => {
          const handle = await subgraph.assertCanRead(args.identifier, request);
          const document = await subgraph.reactorClient.get(
            handle.fetchIdentifier,
            { subject: subgraph.viewSubject(request) },
          );
          return document.header.name;
        },
      }),
    ];
  }
}
```

The assertion resolves a slug to a canonical id when the policy requires a check. Fetch with `handle.fetchIdentifier` to keep the read bound to the document you authorized. Do not reuse the raw input after authorization.

The verified caller is `request.user`, including the address and app key. Read identity from this context, not from arguments or headers. The GraphQL context does not carry a reactor client.

## Choose the public helper

| Helper                                                          | Purpose                                                                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `assertCanRead(identifier, request)`                            | Authorize a single read and return an authorized handle.                                                       |
| `assertCanWrite(identifier, request)`                           | Authorize a write and return an authorized handle.                                                             |
| `assertCanExecuteOperation(identifier, operationType, request)` | Authorize a specific operation and return an authorized handle.                                                |
| `assertCanCreate(request)`                                      | Authorize creation with no parent. For a child document, authorize a write on its parent instead.              |
| `resolveCanonicalDocumentId(identifier, request)`               | Resolve an id or slug to a `CanonicalDocumentId`, memoized per request. A resolution failure throws Forbidden. |
| `canReadDocument(canonicalId, request)`                         | Test host read permission for an id already known to be canonical. It does not resolve slugs.                  |
| `viewSubject(request)`                                          | Return the caller's address and app key as the Reactor read subject.                                           |
| `servesDocument(identifier, request)`                           | Test the Reactor's serving decision. Returns false if the decision fails.                                      |
| `servesDocumentOrThrows(identifier, request, view?)`            | Test serving for a branch or scopes. Decision failures throw.                                                  |
| `listsDocument(identifier, request, view?)`                     | Apply the Reactor read gate and the host permission layer, as a document listing does.                         |
| `attachmentsFor(request)`                                       | Return an attachment client authorized as this request's caller.                                               |

The helpers are public, so schema fragments can call them through public capability interfaces. A fragment cannot access a class's protected members. See [Subgraph classes](../../../04-Reference/03-GraphQLData/08-SubgraphClasses.md).

## Filter collections

For a list, include only ids for which `await subgraph.listsDocument(id, request)` is true. Do not throw on the first withheld document or expose its id. The [search example](../../04-WorkWithData/03-UsingSubgraphs.md) applies this check to the drive and each result.

A processor read model needs an authorization strategy for each row. Carry its source document id into the row and check it before returning data. A check on the drive alone does not authorize every document in it.

## Apply the active policy

| Policy                 | Configuration                                               | Result                                                         |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `OPEN`                 | `AUTH_ENABLED=false`                                        | Host permission checks allow anonymous callers.                |
| `ADMIN_ONLY`           | `AUTH_ENABLED=true`, document permissions disabled          | Only addresses in `ADMINS` pass host permission checks.        |
| `DOCUMENT_PERMISSIONS` | `AUTH_ENABLED=true` and `DOCUMENT_PERMISSIONS_ENABLED=true` | Document grants and inheritance decide host permission checks. |

Call the helpers under each policy. Pass `{ subject: subgraph.viewSubject(request) }` to every Reactor read so documents that the Reactor withholds stay withheld. Use `listsDocument` for lists. It applies both the Reactor read gate and the host permission check.

`onSetup` and `onDisconnect` are overrides that call `super`. Teardown tolerates partial setup and is not a process-exit hook. Authorization in a hook does not replace request-time checks in a resolver.

See [Reactor API authorization](./04-Authorization.md), [Document permissions](./02-DocumentPermissions.md), and [Attachment service](../../../04-Reference/01-Reactor/09-AttachmentService.md#inside-the-switchboard).
