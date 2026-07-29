---
toc_max_heading_level: 3
---

# Subgraphs and attachments

A Switchboard serves more than the reactor's document API. Your project's own
subgraphs sit next to it, and attachments come from a service the app supplies.
The light client reaches both through the configuration it already has: one URL,
one token provider.

## Typed subgraphs

A subgraph is served at `<graphql base>/<name>`. For a Switchboard on
`http://localhost:4001/graphql`, the `renown-read-model` subgraph is at
`http://localhost:4001/graphql/renown-read-model`.

`client.subgraph(name, getSdk)` derives that URL from the client's `url`, keeps
one transport per name, and hands the SDK the same auth middleware every reactor
call goes through.

```tsx
"use client";

import { useSwitchboardClient } from "@powerhousedao/reactor-browser/graphql-client";
import { getRenownReadModelSdk } from "@/lib/renown-read-model-sdk";

const UNKNOWN_ADDRESS = "0x0000000000000000000000000000000000000000";

export function Probe() {
  const client = useSwitchboardClient();

  async function probe() {
    if (!client) return;
    const sdk = client.subgraph("renown-read-model", getRenownReadModelSdk);
    const { renownUsers } = await sdk.RenownUsers([UNKNOWN_ADDRESS]);
    return renownUsers;
  }

  return (
    <button disabled={!client} onClick={() => void probe()}>
      Probe subgraph
    </button>
  );
}
```

`subgraph` gives you transport, auth and typing. Results are not cached, produce
no change events and never reach `useDocument`. Cache them with whatever the app
already uses for server state.

The registry caches the transport per name, but reuses the SDK only when the same
factory function is passed again. Two callers with two different generated SDKs
each get their own, rather than the first caller's methods under the second
caller's type.

:::info
The root supergraph federates every subgraph, so a field a subgraph defines is
usually reachable at the base URL too. If you need to prove a request went to the
subgraph's own endpoint, query `_service { sdl }`: the root has no `_service`
field.
:::

### Generate the SDK

Point `graphql-codegen` at the subgraph's endpoint and use the same three plugins
`@powerhousedao/reactor-browser` generates its own SDK with:

```ts
// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "http://localhost:4001/graphql/renown-read-model",
  documents: ["src/**/*.graphql"],
  generates: {
    "./src/graphql/renown-read-model.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
      config: {
        scalars: {
          JSONObject: "NonNullable<unknown>",
          DateTime: "string | Date",
        },
        skipTypename: true,
        maybeValue: "T | null | undefined",
        gqlImport: "graphql-tag#gql",
      },
    },
  },
};

export default config;
```

The `typescript-graphql-request` plugin emits
`getSdk(client: GraphQLClient, withWrapper?: SdkFunctionWrapper)`, which is
exactly the `SubgraphSdkFactory<TSdk>` signature `subgraph` expects. Pass the
generated function straight in.

```typescript
export type SubgraphSdkFactory<TSdk> = (
  client: GraphQLClient,
  withWrapper?: SdkFunctionWrapper,
) => TSdk;
```

`SdkFunctionWrapper` is re-exported from `@powerhousedao/reactor-browser`, so a
hand-written SDK can name the type without depending on `graphql-request`
directly. An SDK the client builds is always called with the auth wrapper: apply
it to every operation, exactly as the generated code does.

### One-off documents

For an operation not worth generating an SDK for, use `client.request`. It runs
against the Switchboard's own endpoint, through the same transport and auth.

```ts
const DOCUMENT_MODEL_IDS = `
  query DocumentModelIds {
    documentModels {
      items {
        id
      }
    }
  }
`;

type DocumentModelIds = {
  documentModels: { items: { id: string }[] };
};

const { documentModels } =
  await client.request<DocumentModelIds>(DOCUMENT_MODEL_IDS);
```

A document a code generator typed carries its own result type, so the type
argument is only needed for hand-written documents and strings. The operation
name and type are read off the document; override them through the third
argument, which also takes an `AbortSignal`.

## Attachments

Attachments are configured at the same point as everything else, but the app
constructs the service. Which storage it talks to is the app's business, and
`@powerhousedao/reactor-browser` does not depend on the attachment
implementation.

```tsx
<GraphQLReactorProvider
  url={switchboardUrl}
  attachmentService={attachmentService}
>
  <YourApp />
</GraphQLReactorProvider>
```

The provider publishes it into the `window.ph.attachmentService` slot Connect
publishes it into, so `useAttachmentService` and the editors below find it. Leave
the prop out and the slot stays empty, exactly as it is without this provider.

This prop is a wiring seam, and that is all it has been proven to be: the service
an app passes in reaches `useAttachmentService` below the provider. No attachment
has been read over the light client end to end.

It is published from its own effect, keyed on the prop, so an app that builds the
service asynchronously can pass it in later. Passing a new service does not
rebuild the client or the document cache.

Build the service with `createRemoteAttachmentService` from
`@powerhousedao/reactor-attachments/client`, pointed at the same Switchboard.
Import the `/client` subpath, not the package root: the root entry also exports
the Kysely, S3 and filesystem backends, so a browser bundler has to resolve
`kysely`, `@aws-sdk/client-s3` and `node:fs` and fails before any app code runs -
the same failure class the light client's own
[Bundling](/academy/Reference/ReactorBrowserClient/OverviewAndQuickstart#bundling)
section describes, and it has the same shape of fix: import the browser subpath. See
[Attachment service](/academy/Reference/Reactor/AttachmentService) for the
service and client APIs, the reserve-send-read flow, and the `attachment://v1:`
ref format.
