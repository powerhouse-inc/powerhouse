# Implementing a subgraph

Contents:

- The files
- Schema
- Resolvers
- Reading and writing documents
- Authorization
- Serving a processor's tables

## The files

`subgraphs/<id>/index.ts` holds the class Switchboard loads:

```ts
export class InvoiceApiSubgraph extends BaseSubgraph {
  name = "invoice-api";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
```

- `name` is the route (`/graphql/invoice-api`) and the name the server checks against core and document-model subgraphs. Keep it a string literal.
- `schema.ts` exports `schema`; `resolvers.ts` exports `getResolvers(subgraph)`. Put shared code in `lib.ts` or new files in the folder.
- `onSetup` runs before the subgraph serves; use `this.readClient` there, not the request clients.

## Schema

Write the SDL in the `gql` template in `schema.ts`.

- Don't interpolate (`${...}`) into the template. The type check that `ph generate subgraph` runs skips a schema with substitutions, so conflicts show only when Switchboard loads it.
- Don't define a type or root field that a core subgraph or a document model's subgraph already defines. The supergraph leaves the subgraph out, and `ph generate subgraph --dir <id>` names the claims.
- Prefix every type with the subgraph's name. The scaffold puts its fields under one root field, `Query.<camelName>`, of type `<PascalName>SubgraphQueries`; add query fields there.
- Put mutations on `type Mutation`, with prefixed field names, e.g. `invoiceApiMarkPaid`. Only a mutation may write; see "Reading and writing documents".

```ts
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  type InvoiceApiSubgraphQueries {
    openInvoices(driveId: String!): [InvoiceApiInvoice!]!
  }

  type InvoiceApiInvoice {
    documentId: String!
    total: Float!
  }

  type Query {
    invoiceApi: InvoiceApiSubgraphQueries!
  }

  type Mutation {
    invoiceApiMarkPaid(documentId: String!): Boolean!
  }
`;
```

## Resolvers

`getResolvers(subgraph)` returns the resolver map. The namespace root field returns an empty object, and its type's fields do the work. A resolver gets `(parent, args, ctx)`; type `ctx` as `Context` from `@powerhousedao/reactor-api`.

`ctx` holds:

- `clients.read`: always present.
- `clients.write`: present while a mutation executes. Reading it in a query or subscription throws `WriteClientUnavailableError`.
- `user`: `{ address, chainId, networkId, appKey }` for an authenticated caller, otherwise undefined.
- `headers`: the request headers.

`subgraph.reactorClient` is deprecated. Use `ctx.clients.read` in resolvers and `ctx.clients.write` in mutations.

## Reading and writing documents

- Read one document: `ctx.clients.read.get(identifier)`; several: `ctx.clients.read.getMany(ids)`.
- Write: `ctx.clients.write.execute(documentId, "main", actions)` in a `Mutation` field. Build actions with the creators in the model's barrel: `import { actions } from "document-models/invoice"`.
- `execute` returns a handle. Await `handle.written` for the operations to be in the log, `handle.readable` for read models to hold them, or `handle.document()` for the updated document. A job that failed rejects with `JobFailedError`.

```ts
import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { actions } from "document-models/invoice";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => ({
  Query: {
    invoiceApi: () => ({}),
  },
  Mutation: {
    invoiceApiMarkPaid: async (
      _parent: unknown,
      args: { documentId: string },
      ctx: Context,
    ) => {
      const handle = await subgraph.assertCanWrite(args.documentId, ctx);
      const write = await ctx.clients.write.execute(
        handle.fetchIdentifier,
        "main",
        [actions.markPaid({})],
      );
      await write.readable;
      return true;
    },
  },
});
```

## Authorization

Check access before you read or write a document the caller names:

- `subgraph.assertCanRead(identifier, ctx)`, `assertCanWrite(identifier, ctx)`, `assertCanExecuteOperation(identifier, operationType, ctx)`: resolve a slug, throw when the caller is denied, and return a handle. Fetch with `handle.fetchIdentifier`, never with the argument.
- `subgraph.assertCanCreate(ctx)`: before creating a top-level document.
- `subgraph.filterReadableDocumentIds(ids, ctx)`: the ids (or slugs) the caller may read, in their order, for filtering ids read from your own tables. `subgraph.canReadDocument(id, ctx)` is the single-id check for ids the reactor returned.

## Serving a processor's tables

A relational processor's static `query(driveId, db)` returns a read-only query builder over that drive's namespace. Pass `subgraph.relationalDb`. The processor must run in `switchboard`.

```ts
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { InvoiceIndex } from "processors/invoice-index";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => ({
  Query: {
    invoiceApi: () => ({}),
  },
  InvoiceApiSubgraphQueries: {
    openInvoices: async (_parent: unknown, args: { driveId: string }) =>
      InvoiceIndex.query(args.driveId, subgraph.relationalDb)
        .selectFrom("invoice")
        .select(["document_id as documentId", "total"])
        .execute(),
  },
});
```

The query builder answers rows from the processor's own tables; it does not check document permissions. Check the drive with `assertCanRead(args.driveId, ctx)` first when the data is not public. A processor's namespace holds rows from every drive, so a query by `driveId` alone returns them all: to scope rows to one drive, read the drive with `ctx.clients.read.get(args.driveId)` (type it as `DocumentDriveDocument` from `@powerhousedao/shared/document-drive`) and keep rows whose `document_id` is a file node in `state.global.nodes`.
