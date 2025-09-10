# GraphQL Code Generator – Technical Spec

## Goal

Ensure type-safe, stable, and validated communication across the system’s GraphQL layer, enabling both compile-time and runtime guarantees.

## Concrete Break Example: Sync Path

Today, mapping between GraphQL payloads and domain `Operation` is manual and performed in multiple places, making it fragile to shape drift.
What broke:

- The PullResponder query omitted `actionId` in `operations`, yet the domain `Operation.action.id` expects it. This allowed compilation but produced `undefined` at runtime.
- In the DriveSubgraph resolver, we spread GraphQL op fields into domain `Operation`, accidentally placing `type` at the operation root and duplicating `scope/branch` at the wrong level, rather than under `action`.
- Tests didn’t fail because:
  - The GraphQL query/mutation strings were not type-checked against the schema (no codegen).
  - No runtime decoding/validation existed at the boundaries.
  - Unit tests didn’t assert on the exact DTO↔domain mapping or required fields like `actionId`.

## Solution

We will use **The Guild’s GraphQL Code Generator** ecosystem with the following stack:

- **@graphql-codegen/client-preset**
  Generates typed `DocumentNode`s, operations, and helpers. Ensures compile-time safety for fragments and operations.

- **@graphql-codegen/typescript** + **@graphql-codegen/typescript-operations**
  Provides TypeScript definitions for schema types and operations.

- **Fetcher Plugin** (choose based on client needs):
  - **`typescript-graphql-request`** → Lightweight, auto-typed SDK for Node/Browser clients.
  - **`typescript-react-apollo`** → If integrating directly with Apollo Client.

- **Runtime Validation Plugin**:
  - **`typescript-validation-schema` (Zod)** → Generates Zod parsers to validate GraphQL responses, dropping unknown fields.

This will help us achieve the following:

1. **Typed Operations**: All GraphQL queries and mutations will have generated TypeScript types.
2. **Runtime Validation**: Data returned from the subgraph will be validated, dropping unknown fields.
3. **Single Source of Truth**: Shared fragments (e.g., `OperationFields`) will enforce field requirements across clients.
4. **SDK Integration**: Client code will consume a generated, strongly-typed SDK instead of writing ad-hoc queries.

## Example

```ts
// packages/sync/strands.example.ts
// One place: the typed GraphQL document, DTOs + validation, and the consumer call.

import { GraphQLClient } from "graphql-request";
import { z } from "zod";

// Typed document is created by the client preset (generated helpers)
import { graphql } from "@/generated/gql";
import type { StrandsQuery } from "@/generated/graphql";

// 1) GraphQL operation (typed DocumentNode via client preset)
export const StrandsDocument = graphql(/* GraphQL */ `
  query Strands($listenerId: ID!) {
    system {
      sync {
        strands(listenerId: $listenerId) {
          driveId
          documentId
          documentType
          scope
          branch
          operations {
            id
            actionId
            timestampUtcMs
            skip
            type
            input
            hash
            index
            context {
              signer {
                user {
                  address
                  networkId
                  chainId
                }
                app {
                  name
                  key
                }
                signatures
              }
            }
          }
        }
      }
    }
  }
`);

// 2) DTOs + runtime validation (unknown fields dropped)
const SignerDTO = z
  .object({
    user: z
      .object({
        address: z.string(),
        networkId: z.string(),
        chainId: z.string(),
      })
      .partial({})
      .nullable()
      .optional(),
    app: z.object({ name: z.string(), key: z.string() }).nullable().optional(),
    signatures: z.array(z.string()),
  })
  .strip();

const OperationDTO = z
  .object({
    id: z.number().int(),
    actionId: z.string(),
    timestampUtcMs: z.union([z.string(), z.number(), z.date()]),
    skip: z.number().int(),
    type: z.string(),
    input: z.unknown(),
    hash: z.string(),
    index: z.number().int(),
    context: z.object({ signer: SignerDTO }),
  })
  .strip();

const StrandDTO = z
  .object({
    driveId: z.string(),
    documentId: z.string(),
    documentType: z.string(),
    scope: z.string(),
    branch: z.string(),
    operations: z.array(OperationDTO),
  })
  .strip();

export type TSigner = z.infer<typeof SignerDTO>;
export type TOperation = z.infer<typeof OperationDTO>;
export type TStrand = z.infer<typeof StrandDTO>;

export function toStrandsDTO(q: StrandsQuery): TStrand[] {
  const strands = q.system.sync.strands ?? [];
  return z.array(StrandDTO).parse(strands);
}

// 3) Consumer code (replaces requestGraphql<PullStrandsGraphQL>)
export async function fetchStrands(
  url: string,
  headers: Record<string, string>,
  listenerId: string,
): Promise<TStrand[]> {
  const client = new GraphQLClient(url, { headers });
  const q = await client.request(StrandsDocument, { listenerId });
  return toStrandsDTO(q);
}

// Example usage
const strands = await fetchStrands(url, headers, listenerId);
// strands: TStrand[] (typed) and runtime-validated via Zod
```
