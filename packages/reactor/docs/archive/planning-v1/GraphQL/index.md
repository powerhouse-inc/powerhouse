# GraphQL API

The Reactor GraphQL API is a thin wrapper over `IReactorClient`. Each resolver
delegates directly to a corresponding client method, allowing the GraphQL layer
to remain stateless and simple. Authentication and authorization are expected to
be handled outside of this interface.

## Complete Schema

```graphql
# Scalar types
scalar JSONObject
scalar DateTime

# Input types
input PagingInput {
  limit: Int
  offset: Int
  cursor: String
}

input ViewFilterInput {
  branch: String
  scopes: [String!]
}

input SearchFilterInput {
  type: String
  parentId: String
  identifiers: [String!]
}

# Enums
enum PropagationMode {
  CASCADE
  ORPHAN
}

enum DocumentChangeType {
  CREATED
  DELETED
  UPDATED
  PARENT_ADDED
  PARENT_REMOVED
  CHILD_ADDED
  CHILD_REMOVED
}

# Object types
type DocumentModelState {
  id: String!
  name: String!
  namespace: String
  version: String
  specification: JSONObject
}

type DocumentModelResultPage {
  items: [DocumentModelState!]!
  totalCount: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  cursor: String
}

type PHDocument {
  id: String!
  slug: String
  name: String!
  documentType: String!
  state: JSONObject!
  revision: Int!
  created: DateTime!
  lastModified: DateTime!
  parentId: String
}

// TODO: Add Action type with JSONObject as input.

type PHDocumentResultPage {
  items: [PHDocument!]!
  totalCount: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  cursor: String
}

type DocumentWithChildren {
  document: PHDocument!
  childIds: [String!]!
}

type MoveChildrenResult {
  source: PHDocument!
  target: PHDocument!
}

type JobInfo {
  id: String!
  status: String!
  result: JSONObject
  error: String
  createdAt: DateTime!
  completedAt: DateTime
}

type DocumentChangeEvent {
  type: DocumentChangeType!
  documents: [PHDocument!]!
  context: DocumentChangeContext
}

type DocumentChangeContext {
  parentId: String
  childId: String
}

type Query {
  # Get document models for a namespace
  documentModels(
    namespace: String
    paging: PagingInput
  ): DocumentModelResultPage!

  # Get a specific document by ID or slug
  document(identifier: String!, view: ViewFilterInput): DocumentWithChildren

  # Get children of a document
  documentChildren(
    parentIdentifier: String!
    view: ViewFilterInput
    paging: PagingInput
  ): PHDocumentResultPage!

  # Get parents of a document
  documentParents(
    childIdentifier: String!
    view: ViewFilterInput
    paging: PagingInput
  ): PHDocumentResultPage!

  # Find documents by search criteria
  findDocuments(
    search: SearchFilterInput!
    view: ViewFilterInput
    paging: PagingInput
  ): PHDocumentResultPage!

  # Get job status
  jobStatus(jobId: String!): JobInfo
}

type Mutation {
  # Create a new document
  createDocument(document: JSONObject!, parentIdentifier: String): PHDocument!

  # Create an empty document of specified type
  createEmptyDocument(
    documentType: String!
    parentIdentifier: String
  ): PHDocument!

  # Apply actions to a document (synchronous)
  mutateDocument(
    documentIdentifier: String!
    actions: [JSONObject!]!
    view: ViewFilterInput
  ): PHDocument!

  # Submit actions to a document (asynchronous)
  mutateDocumentAsync(
    documentIdentifier: String!
    actions: [JSONObject!]!
    view: ViewFilterInput
  ): String!

  # Rename a document
  renameDocument(
    documentIdentifier: String!
    name: String!
    view: ViewFilterInput
  ): PHDocument!

  # Add children to a document
  addChildren(
    parentIdentifier: String!
    documentIdentifiers: [String!]!
    view: ViewFilterInput
  ): PHDocument!

  # Remove children from a document
  removeChildren(
    parentIdentifier: String!
    documentIdentifiers: [String!]!
    view: ViewFilterInput
  ): PHDocument!

  # Move children between documents
  moveChildren(
    sourceParentIdentifier: String!
    targetParentIdentifier: String!
    documentIdentifiers: [String!]!
    view: ViewFilterInput
  ): MoveChildrenResult!

  # Delete a single document
  deleteDocument(identifier: String!, propagate: PropagationMode): Boolean!

  # Delete multiple documents
  deleteDocuments(identifiers: [String!]!, propagate: PropagationMode): Boolean!
}

type Subscription {
  # Subscribe to document changes
  documentChanges(
    search: SearchFilterInput!
    view: ViewFilterInput
  ): DocumentChangeEvent!

  # Subscribe to job changes
  jobChanges(jobId: String!): JobChangeEvent!
}
```

## Resolver Mapping

### Query Resolvers

- `documentModels` → `IReactorClient.getDocumentModels`
- `document` → `IReactorClient.get`
- `documentChildren` → `IReactorClient.getChildren`
- `documentParents` → `IReactorClient.getParents`
- `findDocuments` → `IReactorClient.find`
- `jobStatus` → `IReactorClient.getJobStatus`

### Mutation Resolvers

- `createDocument` → `IReactorClient.create`
- `createEmptyDocument` → `IReactorClient.createEmpty`
- `mutateDocument` → `IReactorClient.mutate`
- `mutateDocumentAsync` → `IReactorClient.mutateAsync`
- `renameDocument` → `IReactorClient.rename`
- `addChildren` → `IReactorClient.addChildren`
- `removeChildren` → `IReactorClient.removeChildren`
- `moveChildren` → `IReactorClient.moveChildren`
- `deleteDocument` → `IReactorClient.deleteDocument`
- `deleteDocuments` → `IReactorClient.deleteDocuments`

### Subscription Resolvers

- `documentChanges` → `IReactorClient.subscribe`

## Usage Examples

### 1. Getting Document Models for Namespace "@ph-sky"

```graphql
query GetPhSkyDocumentModels {
  documentModels(namespace: "@ph-sky") {
    items {
      id
      name
      namespace
      version
      specification
    }
    totalCount
    hasNextPage
    hasPreviousPage
  }
}
```

**Variables:**

```json
{}
```

**Response:**

```json
{
  "data": {
    "documentModels": {
      "items": [
        {
          "id": "document-drive",
          "name": "Document Drive",
          "namespace": "@ph-sky",
          "version": "1.0.0",
          "specification": {
            /* model specification */
          }
        }
      ],
      "totalCount": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

### 2. Creating a Document of Type "document-drive"

```graphql
mutation CreateDocumentDrive($document: JSONObject!, $parentId: String) {
  createDocument(document: $document, parentIdentifier: $parentId) {
    id
    slug
    name
    documentType
    state
    revision
    created
    lastModified
    parentId
  }
}
```

**Variables:**

```json
{
  "document": {
    "name": "My Document Drive",
    "documentType": "document-drive",
    "state": {
      "name": "My Document Drive",
      "icon": "📁",
      "nodes": []
    }
  },
  "parentId": "parent-document-id"
}
```

**Alternative - Create Empty Document:**

```graphql
mutation CreateEmptyDocumentDrive($parentId: String) {
  createEmptyDocument(
    documentType: "document-drive"
    parentIdentifier: $parentId
  ) {
    id
    slug
    name
    documentType
    state
    revision
    created
    lastModified
    parentId
  }
}
```

### 3. Getting All Child Documents with Paging

```graphql
query GetChildDocuments(
  $parentId: String!
  $paging: PagingInput
  $view: ViewFilterInput
) {
  documentChildren(parentIdentifier: $parentId, paging: $paging, view: $view) {
    items {
      id
      slug
      name
      documentType
      state
      revision
      created
      lastModified
      parentId
    }
    totalCount
    hasNextPage
    hasPreviousPage
    cursor
  }
}
```

**Variables:**

```json
{
  "parentId": "parent-document-id",
  "paging": {
    "limit": 10,
    "offset": 0
  },
  "view": {
    "scopes": ["global"]
  }
}
```

**For next page:**

```json
{
  "parentId": "parent-document-id",
  "paging": {
    "limit": 10,
    "cursor": "next-page-cursor"
  },
  "view": {
    "scopes": ["global"]
  }
}
```

### 4. Submitting a Mutation (Asynchronous)

```graphql
mutation SubmitDocumentMutation(
  $docId: String!
  $actions: [JSONObject!]!
  $view: ViewFilterInput
) {
  mutateDocumentAsync(
    documentIdentifier: $docId
    actions: $actions
    view: $view
  )
}
```

**Variables:**

```json
{
  "docId": "document-id-or-slug",
  "actions": [
    {
      "type": "SET_NAME",
      "input": {
        "name": "Updated Document Name"
      },
      "index": 0,
      "skip": 0
    }
  ],
  "view": {
    "branch": "main",
    "scopes": ["global"]
  }
}
```

### 5. Checking Job Status

After submitting an async mutation, use the returned job id to check the job status:

```graphql
query CheckJobStatus($jobId: String!) {
  jobStatus(jobId: $jobId) {
    id
    status
    result
    error
    createdAt
    completedAt
  }
}
```

**Variables:**

```json
{
  "jobId": "job-id-from-async-mutation"
}
```

### 6. Subscribing to Document Changes

```graphql
subscription WatchDocumentChanges(
  $search: SearchFilterInput!
  $view: ViewFilterInput
) {
  documentChanges(search: $search, view: $view) {
    type
    documents {
      id
      name
      documentType
      revision
      lastModified
    }
    context {
      parentId
      childId
    }
  }
}
```

**Variables:**

```json
{
  "search": {
    "parentId": "parent-document-id"
  },
  "view": {
    "scopes": ["global"]
  }
}
```

## Error Handling

All resolvers forward errors from the underlying `IReactorClient` methods as GraphQL errors. Common error scenarios include:

- **Document not found**: When requesting a document that doesn't exist
- **Invalid actions**: When submitting malformed actions
- **Permission denied**: When attempting unauthorized actions
- **Validation errors**: When document state validation fails

Example error response:

```json
{
  "errors": [
    {
      "message": "Document not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["document"],
      "extensions": {
        "code": "DOCUMENT_NOT_FOUND",
        "identifier": "non-existent-id"
      }
    }
  ],
  "data": {
    "document": null
  }
}
```

## Synchronization Operations

The Reactor GraphQL API includes operations for network-based synchronization between reactor instances via the GqlChannel implementation.

### Schema Types

#### SyncEnvelope Types

```graphql
# Synchronization types
type Operation {
  index: Int!
  timestampUtcMs: String!
  hash: String!
  skip: Int!
  error: String
  id: String
  action: Action!
}

type OperationContext {
  documentId: String!
  documentType: String!
  scope: String!
  branch: String!
  # Note: resultingState is intentionally excluded from sync operations
  # It is ephemeral and recalculated locally by each reactor
}

type OperationWithContext {
  operation: Operation!
  context: OperationContext!
}

type ChannelMeta {
  id: String!
}

type RemoteCursor {
  remoteName: String!
  cursorOrdinal: Int!
  lastSyncedAtUtcMs: String
}

enum SyncEnvelopeType {
  OPERATIONS
  ACK
}

type SyncEnvelope {
  type: SyncEnvelopeType!
  channelMeta: ChannelMeta!
  operations: [OperationWithContext!]
  cursor: RemoteCursor
}
```

#### Input Types

```graphql
input OperationInput {
  index: Int!
  timestampUtcMs: String!
  hash: String!
  skip: Int!
  error: String
  id: String
  action: JSONObject!
}

input OperationContextInput {
  documentId: String!
  documentType: String!
  scope: String!
  branch: String!
  # Note: resultingState is intentionally excluded from sync operations
  # It is ephemeral and recalculated locally by each reactor
}

input OperationWithContextInput {
  operation: OperationInput!
  context: OperationContextInput!
}

input ChannelMetaInput {
  id: String!
}

input RemoteCursorInput {
  remoteName: String!
  cursorOrdinal: Int!
  lastSyncedAtUtcMs: String
}

input SyncEnvelopeInput {
  type: SyncEnvelopeType!
  channelMeta: ChannelMetaInput!
  operations: [OperationWithContextInput!]
  cursor: RemoteCursorInput
}
```

### Operations

#### Query: pollSyncEnvelopes

Polls for pending sync envelopes from a channel. Used by GqlChannel to retrieve operations from a remote reactor.

```graphql
query PollSyncEnvelopes($channelId: String!, $cursorOrdinal: Int!) {
  pollSyncEnvelopes(channelId: $channelId, cursorOrdinal: $cursorOrdinal) {
    type
    channelMeta {
      id
    }
    operations {
      operation {
        index
        timestampUtcMs
        hash
        skip
        error
        id
        action
      }
      context {
        documentId
        documentType
        scope
        branch
      }
    }
    cursor {
      remoteName
      cursorOrdinal
      lastSyncedAtUtcMs
    }
  }
}
```

**Variables:**
```json
{
  "channelId": "550e8400-e29b-41d4-a716-446655440000",
  "cursorOrdinal": 42
}
```

**Response:**
```json
{
  "data": {
    "pollSyncEnvelopes": [
      {
        "type": "OPERATIONS",
        "channelMeta": {
          "id": "550e8400-e29b-41d4-a716-446655440000"
        },
        "operations": [
          {
            "operation": {
              "index": 43,
              "timestampUtcMs": "1699564800000",
              "hash": "abc123...",
              "skip": 0,
              "error": null,
              "id": "op-123",
              "action": { /* action data */ }
            },
            "context": {
              "documentId": "doc-456",
              "documentType": "budget",
              "scope": "global",
              "branch": "main"
            }
          }
        ],
        "cursor": {
          "remoteName": "production-reactor",
          "cursorOrdinal": 43,
          "lastSyncedAtUtcMs": "1699564800000"
        }
      }
    ]
  }
}
```

#### Mutation: pushSyncEnvelope

Pushes a sync envelope to the reactor. Used by GqlChannel to send operations to a remote reactor.

```graphql
mutation PushSyncEnvelope($envelope: SyncEnvelopeInput!) {
  pushSyncEnvelope(envelope: $envelope)
}
```

**Variables:**
```json
{
  "envelope": {
    "type": "OPERATIONS",
    "channelMeta": {
      "id": "550e8400-e29b-41d4-a716-446655440000"
    },
    "operations": [
      {
        "operation": {
          "index": 44,
          "timestampUtcMs": "1699565000000",
          "hash": "def456...",
          "skip": 0,
          "id": "op-124",
          "action": { /* action data */ }
        },
        "context": {
          "documentId": "doc-456",
          "documentType": "budget",
          "scope": "global",
          "branch": "main"
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "data": {
    "pushSyncEnvelope": true
  }
}
```

### Usage with GqlChannel

These operations are automatically used by `GqlChannel` for network synchronization. See [GqlChannel Documentation](../Synchronization/gql-channel.md) for implementation details.

**Server-side:** Implement resolvers to serve operations from `IOperationStore`

**Client-side:** `GqlChannel` automatically polls and pushes via these operations

### Resolver Integration

The resolver functions require integration with the reactor package's `IOperationStore` and `ISyncManager`. Current implementation in reactor-api includes stub resolvers that document the required integration points.

For full implementation details, see:
- [Synchronization Specification](../Synchronization/index.md)
- [GqlChannel Implementation](../Synchronization/gql-channel.md)
- [Resolver Source Code](../../../../reactor-api/src/graphql/reactor/resolvers.ts)
