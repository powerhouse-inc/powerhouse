## Swap to native fetch via typescript-generic-sdk — Step-by-step Plan

### Goal
- Replace `graphql-request` client usage with a generated SDK built on `typescript-generic-sdk` so we can inject our own `fetch` implementation and keep strong TypeScript types for operations.
- Preserve our runtime Zod validation at the boundary (MANDATORY), without hand-authoring `ReactorGraphQLClient` methods like `getDocument`.

---

### 0) Current state (for context)
- Operations live in `packages/reactor-api/src/graphql/reactor/operations.ts` (using `gql` from `graphql-tag`).
- Codegen only outputs schema/operation types and Zod schemas:
  - `generated/graphql.ts` via `typescript` + `typescript-operations` + `typescript-resolvers`
  - `generated/zod-schemas.ts` via `typescript-validation-schema`
- A hand-authored `ReactorGraphQLClient` in `reactor/client.ts` imports `GraphQLClient` and manually maps results to DTOs using Zod.

---

### Phase 1: Add Codegen inputs for documents and generate a generic SDK

1. Update `packages/reactor-api/codegen.ts`:
   - Add `documents` (so operations in `.ts` files are picked up) and explicitly exclude `generated/`:
   - Add a new output target for `generated/sdk.ts` using `@graphql-codegen/typescript-generic-sdk`.
   - Use `documentMode: "documentNode"` (so the SDK receives `DocumentNode`).

```ts
// packages/reactor-api/codegen.ts (changes only)
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/graphql/reactor/schema.graphql",
  documents: [
    "./src/graphql/reactor/**/*.ts", // NEW
    "!./src/graphql/reactor/generated/**/*", // exclude generated
  ],
  generates: {
    "./src/graphql/reactor/generated/graphql.ts": {
      plugins: ["typescript", "typescript-operations", "typescript-resolvers"],
      // existing config...
    },
    "./src/graphql/reactor/generated/sdk.ts": { // NEW
      plugins: ["typescript-generic-sdk"],
      config: {
        documentMode: "documentNode",
      },
    },
    "./src/graphql/reactor/generated/zod-schemas.ts": {
      plugins: ["typescript-validation-schema"],
      // existing config...
    },
  },
};

export default config;
```

2. Add dev dependency in `packages/reactor-api/package.json`:
   - `@graphql-codegen/typescript-generic-sdk`
   - If not already present, ensure `graphql` is present (peer dep of plugins) and `graphql-tag` is kept (we use `gql`).

```json
// packages/reactor-api/package.json (devDependencies excerpt)
{
  "devDependencies": {
    "@graphql-codegen/typescript-generic-sdk": "^5",
    // existing codegen plugins ...
  }
}
```

3. Run codegen to emit `generated/sdk.ts`:

```bash
pnpm --filter @powerhouse/reactor-api codegen
```

This will emit a `getSdk(requester)` factory with one typed function per operation, e.g. `GetDocument(variables)`.

---

### Phase 2: Implement a native fetch requester and an SDK factory

Create a requester that prints the `DocumentNode` and posts it via `fetch`. Inject `fetch` (required) and headers.

```ts
// packages/reactor-api/src/graphql/reactor/requester.ts
import { print } from "graphql";
import type { Requester } from "./generated/sdk";

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export function createFetchRequester(
  url: string,
  fetchImpl: FetchLike,
  baseHeaders: Record<string, string> = {},
): Requester {
  return async (document, variables, _options) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...baseHeaders,
      },
      body: JSON.stringify({ query: print(document), variables }),
    });
    if (!res.ok) {
      throw new Error(`GraphQL HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data;
  };
}
```

Add a small helper that builds the SDK bound to a URL/headers and enforces validation (see §3a):

```ts
// packages/reactor-api/src/graphql/reactor/sdk.factory.ts
import { getSdk } from "./generated/sdk";
import { type FetchLike } from "./requester";
import { createValidatingRequester } from "./requester.with-zod";

export function createReactorSdk(
  url: string,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
) {
  const requester = createValidatingRequester(url, fetchImpl, headers);
  return getSdk(requester);
}
```

Usage example (generated, typed function — no hand-authored `getDocument`):

```ts
import { createReactorSdk } from "./sdk.factory";

const sdk = createReactorSdk(url, fetchImpl, headers);
const res = await sdk.GetDocument({ identifier, view });
// res is fully typed from the `GetDocument` operation
```

---

### Phase 3: Centralize Zod validation

Validate responses centrally without hand-writing each method. The generic SDK supports a wrapper by composing the `Requester`. Add a validating requester that delegates to `createFetchRequester` and then validates `data` by operation name.

```ts
// packages/reactor-api/src/graphql/reactor/requester.with-zod.ts
import type { Requester } from "./generated/sdk";
import { createFetchRequester } from "./requester";
import {
  toDocumentModelResultPageDTO,
  toDocumentWithChildrenDTO,
  toPHDocumentResultPageDTO,
  toJobInfoDTO,
} from "./dtos";

export function createValidatingRequester(url: string, fetchImpl: FetchLike, headers?: Record<string, string>): Requester {
  const base = createFetchRequester(url, fetchImpl, headers);
  return async (document, variables, options) => {
    const data = await base(document, variables, options);
    // Switch on the operation name when needed
    const op = document.definitions.find((d: any) => d.name?.value)?.name.value;
    switch (op) {
      case "GetDocument":
        if (data.document) toDocumentWithChildrenDTO(data.document);
        break;
      case "GetDocumentModels":
        toDocumentModelResultPageDTO(data.documentModels);
        break;
      case "GetDocumentChildren":
      case "GetDocumentParents":
      case "FindDocuments":
        toPHDocumentResultPageDTO(
          data.documentChildren ?? data.documentParents ?? data.findDocuments
        );
        break;
      case "GetJobStatus":
        if (data.jobStatus) toJobInfoDTO(data.jobStatus);
        break;
      default:
        break;
    }
    return data;
  };
}
```

`createReactorSdk` must use `createValidatingRequester`.

---

### Phase 3a: Operation-first runtime validation (replace `dtos.ts`)

Instead of hand-maintaining `dtos.ts`, generate Zod schemas for each operation’s result and variables and validate the entire response. This removes the need for per-type DTO parse helpers and keeps validation aligned to what clients actually call.

1. Ensure `documents` is set in `codegen.ts` (see step 1). Then add a dedicated output that emits operation-level Zod schemas:

```ts
// packages/reactor-api/codegen.ts (add another generate target)
"./src/graphql/reactor/generated/operation-schemas.ts": {
  plugins: ["typescript-validation-schema"],
  config: {
    schema: "zod",
    // Use operation documents to emit result/variables schemas
    importFrom: "./graphql.js",
    // Keep scalar and strict settings consistent
    scalarSchemas: {
      JSONObject: "z.unknown()",
      DateTime: "z.union([z.string(), z.date()])",
    },
    scalars: {
      JSONObject: "any",
      DateTime: "string | Date",
    },
    strictScalars: true,
  },
}
```

2. Re-run codegen:

```bash
pnpm --filter @powerhouse/reactor-api codegen
```

You should now have Zod schemas for operation results/variables, typically named after operations (e.g., `GetDocumentQuerySchema`, `GetDocumentQueryVariablesSchema`).

3. Wire the validating requester to use the generated operation schemas instead of manual DTOs.

```ts
// packages/reactor-api/src/graphql/reactor/requester.with-zod.ts
import type { Requester } from "./generated/sdk";
import { createFetchRequester } from "./requester";
import {
  GetDocumentQuerySchema,
  GetDocumentQueryVariablesSchema,
  GetDocumentModelsQuerySchema,
  FindDocumentsQuerySchema,
  GetDocumentChildrenQuerySchema,
  GetDocumentParentsQuerySchema,
  GetJobStatusQuerySchema,
} from "./generated/operation-schemas";

export function createValidatingRequester(url: string, headers?: Record<string, string>): Requester {
  const base = createFetchRequester(url, /* fetchImpl required here in real code */, headers);
  return async (document, variables, options) => {
    // Validate variables when available
    const op = document.definitions.find((d: any) => d.name?.value)?.name.value;
    switch (op) {
      case "GetDocument":
        if (variables) GetDocumentQueryVariablesSchema().parse(variables);
        break;
      default:
        break;
    }

    const data = await base(document, variables, options);

    // Validate the full operation result
    switch (op) {
      case "GetDocument":
        GetDocumentQuerySchema().parse(data);
        break;
      case "GetDocumentModels":
        GetDocumentModelsQuerySchema().parse(data);
        break;
      case "GetDocumentChildren":
        GetDocumentChildrenQuerySchema().parse(data);
        break;
      case "GetDocumentParents":
        GetDocumentParentsQuerySchema().parse(data);
        break;
      case "FindDocuments":
        FindDocumentsQuerySchema().parse(data);
        break;
      case "GetJobStatus":
        GetJobStatusQuerySchema().parse(data);
        break;
      default:
        break;
    }
    return data;
  };
}
```

4. Migrate away from `dtos.ts`:
   - Replace imports of `toXxxDTO` helpers with the operation-level validation above.
   - If you still want DTO-shaped return values, add tiny adapters near call sites; otherwise, use the generated operation result types directly.
   - Once all call sites validate via operation schemas, delete `dtos.ts` (or reduce it to shared scalar helpers if any remain).

5. Tests:
   - Add unit tests asserting `GetDocumentQuerySchema().parse(badPayload)` throws.
   - Add tests for variable validation where applicable.

This approach ensures compile-time correctness (operation types) and runtime correctness (operation result/variables) without maintaining a parallel hand-written DTO layer.

---

### Phase 4: Remove `ReactorGraphQLClient`

- Remove `reactor/client.ts` and replace direct usages with the generated SDK (`createReactorSdk`).

---

### Phase 5: Update exports and consumers

1. Export the factory from `reactor/index.ts`:

```ts
// packages/reactor-api/src/graphql/reactor/index.ts
export * from "./sdk.factory";
```

---

### Phase 6: Clean-up and dependency changes
- Remove `graphql-request` from `packages/reactor-api` if no longer used.
- Keep `graphql` and `graphql-tag`.
- Ensure `@graphql-codegen/typescript-generic-sdk` is listed in devDependencies.

```bash
pnpm --filter @powerhouse/reactor-api remove graphql-request
pnpm --filter @powerhouse/reactor-api add -D @graphql-codegen/typescript-generic-sdk
```

---

### Phase 7: Testing plan
- Unit test `createFetchRequester` with a mock fetch to assert request shape and error handling.
- Integration test one query (e.g., `GetDocument`) against a test endpoint or mocked server.
- If using validating requester, add tests to ensure Zod rejects malformed payloads.

---

### Example: Calling getDocument via generated SDK

```ts
import { createReactorSdk } from "@powerhouse/reactor-api/src/graphql/reactor/sdk.factory";

const sdk = createReactorSdk(url, headers);
const { document } = await sdk.GetDocument({ identifier: "doc:123", view: { branch: "main" } });
// `document` is typed per the `GetDocument` operation
```

If you want a function named `getDocument` that returns DTOs, add a small adapter:

```ts
export async function getDocument(url: string, headers: Record<string, string>, identifier: string, view?: any) {
  const sdk = createReactorSdk(url, headers);
  const res = await sdk.GetDocument({ identifier, view });
  return res.document ? toDocumentWithChildrenDTO(res.document) : null;
}
```

This keeps generation for the operation typing and preserves DTO-level runtime validation.


