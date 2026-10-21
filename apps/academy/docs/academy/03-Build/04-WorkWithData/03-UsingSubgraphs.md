# Using subgraphs

Create a subgraph that searches to-do document names within a drive. It returns only document ids that the caller may list.

Run these steps in the to-do list package from the previous chapters. The example depends on its `powerhouse/todo-list` document type.

## Generate the subgraph

Run this command in your package:

```bash
ph generate subgraph --name search-todos
```


The command creates `subgraphs/search-todos/index.ts` and `schema.ts`, adds the class to `subgraphs/index.ts` with a `SubgraphCheck` assertion, and adds the subgraph to `powerhouse.manifest.json` once the subgraph check passes. Keep the class exported through these entries. The host and tooling discover subgraphs through these entries.

## Declare the schema and resolvers

Replace the generated class in `subgraphs/search-todos/index.ts` with this one. This example does not use the generated `schema.ts`, so you can delete it. Keep it if you want a place for shared `ph` types.

```typescript
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class SearchTodosSubgraph extends BaseSubgraph<Context> {
  static override readonly subgraphName = "search-todos";

  static override getSchema(schema: SchemaBuilder<SearchTodosSubgraph>) {
    return [
      schema.query("searchTodos", {
        args: {
          driveId: ph.String({ required: true }),
          searchTerm: ph.String({ required: true }),
        },
        returns: ph.list(ph.String({ required: true }), { required: true }),
        resolve: ({ args, subgraph, request }) =>
          subgraph.search(args.driveId, args.searchTerm, request),
      }),
    ];
  }

  async search(
    driveId: string,
    searchTerm: string,
    request: Context,
  ): Promise<string[]> {
    if (!(await this.listsDocument(driveId, request))) return [];
    const children = await this.reactorClient.getOutgoingRelationships(
      driveId,
      "child",
    );
    const matches: string[] = [];
    for (const document of children.results) {
      if (document.header.documentType !== "powerhouse/todo-list") continue;
      if (!(await this.listsDocument(document.header.id, request))) continue;
      if (document.header.name.includes(searchTerm))
        matches.push(document.header.id);
    }
    return matches;
  }
}
```

`SchemaBuilder<SearchTodosSubgraph>` gives each resolver the concrete instance as `subgraph` and the request context as `request`. The host provides `reactorClient`, `relationalDb`, and the authorization services on that instance. The request context does not carry a reactor client.

The static `subgraphName` is a lowercase kebab-case route segment and the manifest id. Keep it stable to preserve the URL. Resolvers access instance state through `subgraph`. Inside `getSchema`, `this` refers to the class, so state captured through it is shared across instances.

`getSchema` returns typed entries or one `schema.graphql({ typeDefs, resolverCoordinates, resolvers: (subgraph) => ... })` result. It must be deterministic and have no side effects. See [Subgraph classes](../../04-Reference/03-GraphQLData/08-SubgraphClasses.md) for SDL, inheritance, and fragments.

## Build and query

Run the package checks, then start the Reactor:

```bash
ph model check
ph build
ph reactor
```

In another terminal, run `ph connect` and open `http://localhost:3000`. Use **Add Drive** to add `http://localhost:4001/d/powerhouse`. Create a to-do list document named `Test tasks` in it. At `http://localhost:4001/graphql`, run this query with `powerhouse` as `driveId`:

```graphql
query SearchTodos($driveId: String!, $searchTerm: String!) {
  searchTodos(driveId: $driveId, searchTerm: $searchTerm)
}
```

Use `"Test"` for `searchTerm`. The response contains the matching document's id when the caller can list it. The custom subgraph is also available at `/graphql/search-todos`.

The supergraph at `/graphql` combines registered subgraphs. A root field belongs to one subgraph, so give reusable [fragments](../../04-Reference/03-GraphQLData/08-SubgraphClasses.md#inheritance-and-fragments) a field-name or namespace parameter.

## Add host resources

Register HTTP routes and webhook families in `override async onSetup()`, after `await super.onSetup()`. Release resources in `override async onDisconnect()` and call `super.onDisconnect()`. Teardown must tolerate partial setup because the host calls it after failed setup. It also runs for package replacement or removal, or when another package takes over the same subgraph name. It is not a process-exit hook.

See [Hosting HTTP routes](./07-HostingHttpRoutes.md), [Receiving webhooks](./08-ReceivingWebhooks.md), and [Enforcing authorization in subgraphs](../03-BuildingUserExperiences/07-Authorization/05-EnforcingAuthorizationInSubgraphs.md). For attachments, use `subgraph.attachmentsFor(request)`.

To upgrade an existing package, run `ph migrate` and follow the [migration guide](../../04-Reference/03-GraphQLData/07-SubgraphMigrationGuide.md).
