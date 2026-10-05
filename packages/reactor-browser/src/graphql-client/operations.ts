import { gql } from "graphql-tag";
import {
  PhDocumentFieldsFragmentDoc,
  type ActionInput,
  type PhDocumentFieldsFragment,
  type Scalars,
} from "../graphql/gen/schema.js";
import type { RemoteOperation } from "../remote-controller/types.js";

/**
 * The operation selection of `GetDocumentOperations`, lifted into a fragment so
 * the write path can reuse `remoteOperationToLocal` on the items it selects.
 */
export const ReactorOperationFieldsFragmentDoc = gql`
  fragment ReactorOperationFields on ReactorOperation {
    index
    timestampUtcMs
    hash
    skip
    error
    deniedReason
    id
    action {
      id
      type
      timestampUtcMs
      input
      scope
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
`;

/**
 * `mutateDocument` plus the operations the mutation produced.
 *
 * The generated `MutateDocument` only selects the document fields, but
 * `dispatchActions` reads per-action failures out of `result.operations[scope]`
 * (`src/actions/dispatch.ts`), so the reducer-level errors would be lost.
 *
 * The operations filter keeps the extra selection to the operations this call
 * could have appended rather than the whole history. All three of its fields
 * matter:
 * - `sinceRevision` is the lowest head revision across the targeted scopes, so
 *   it is only a safe window when the selection is scope-limited as well;
 * - `scopes` limits the response to the scopes the pushed actions target,
 *   without it the server walks every scope of the document
 *   (`packages/reactor/src/core/reactor.ts` `getOperations`);
 * - `branch` selects the branch the operations are read from, and is the same
 *   variable the mutation writes to. It used to be two - the write went through
 *   a `view`, the filter took its own `branch` - and they had to be kept equal
 *   by hand or the operations came from `main` while the actions were applied
 *   elsewhere. One variable cannot disagree with itself.
 */
export const MutateDocumentWithOperationsDocument = gql`
  mutation MutateDocumentWithOperations(
    $documentIdentifier: String!
    $actions: [ActionInput!]!
    $sinceRevision: Int
    $scopes: [String!]
    $branch: String
  ) {
    mutateDocument: execute(
      documentIdentifier: $documentIdentifier
      actions: $actions
      branch: $branch
    ) {
      ...PHDocumentFields
      operations(
        filter: {
          sinceRevision: $sinceRevision
          scopes: $scopes
          branch: $branch
        }
      ) {
        items {
          ...ReactorOperationFields
        }
      }
    }
  }
  ${PhDocumentFieldsFragmentDoc}
  ${ReactorOperationFieldsFragmentDoc}
`;

export type MutateDocumentWithOperationsVariables = {
  documentIdentifier: Scalars["String"]["input"];
  actions: ReadonlyArray<ActionInput>;
  sinceRevision?: Scalars["Int"]["input"];
  scopes?: ReadonlyArray<Scalars["String"]["input"]>;
  branch?: Scalars["String"]["input"];
};

export type MutateDocumentWithOperationsResult = {
  readonly mutateDocument: PhDocumentFieldsFragment & {
    readonly operations?: {
      readonly items: ReadonlyArray<RemoteOperation>;
    } | null;
  };
};

/**
 * The atomic batch mutation, the wire form of `IReactor.executeBatch`.
 *
 * Hand-authored rather than generated for the same reason the mutation above
 * is: one request carries a list of jobs, each a signed `ExecutionJobInput`
 * mirroring the reactor's `ExecutionJobPlan`, and the result pairs each plan key
 * with the completed `JobInfo` that applied it, so the client can rebuild the
 * `{ jobs }` record `IReactor.executeBatch` returns. The mutation is synchronous
 * server-side, so every returned job is already complete.
 */
export const ExecuteBatchDocument = gql`
  mutation ExecuteBatch($jobs: [ExecutionJobInput!]!) {
    executeBatch(jobs: $jobs) {
      jobs {
        key
        job {
          id
          status
          error
          createdAt
          completedAt
        }
      }
    }
  }
`;

/** One job of an {@link ExecuteBatchVariables} request, a signed plan entry. */
export type ExecuteBatchJobInput = {
  key: Scalars["String"]["input"];
  documentIdOrSlug: Scalars["String"]["input"];
  scope: Scalars["String"]["input"];
  branch?: Scalars["String"]["input"];
  actions: ReadonlyArray<ActionInput>;
  dependsOn: ReadonlyArray<Scalars["String"]["input"]>;
};

export type ExecuteBatchVariables = {
  jobs: ReadonlyArray<ExecuteBatchJobInput>;
};

/** The `JobInfo` selection of {@link ExecuteBatchDocument}. */
export type ExecuteBatchJobInfo = {
  readonly id: string;
  readonly status: string;
  readonly error?: string | null;
  readonly createdAt: string | Date;
  readonly completedAt?: string | Date | null;
};

export type ExecuteBatchResult = {
  readonly executeBatch: {
    readonly jobs: ReadonlyArray<{
      readonly key: string;
      readonly job: ExecuteBatchJobInfo;
    }>;
  };
};
