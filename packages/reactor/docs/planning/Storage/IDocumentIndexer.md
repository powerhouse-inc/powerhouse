# IDocumentIndexer

### Summary

- Listens for Operations updates from the event bus.
- Indexes relationships between documents.
- Forms a graph of documents and relationships.
- Generally just needs to listen to the System Stream.

### Eventual Consistency

The `IDocumentIndexer` must ensure that is has the lastest operation information. It may be the case that the system crashed or shutdown after operations were applied, but before the `IDocumentIndexer` was able to process the operations. In this case, the `IOperationStore` would have operations that have not yet been indexed.

The indexer stores the last operation id it has processed synchronously in memory and also lazily updates the `IndexerState` table.

#### Case 1: At Runtime

If the document indexer receives an event for an operation that has a later id than the last operation it has processed, it must catch up to the latest operation by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const lastOperationId = await this.operationStore.getLastOperationId();
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

for (const operation of operations) {
  this.indexOperation(operation);
}
```

#### Case 2: At Startup

Before any operation events have fired, the document indexer must ensure that it has the latest operation information. This can be done by querying the `IOperationStore` for all operations with an id greater than the last operation it knows about.

```tsx
const operations = await this.operationStore.getSinceId(lastOperationId + 1);

for (const operation of operations) {
  this.indexOperation(operation);
}
```

### Dependencies

- [IOperationStore](../Reactor/Interfaces/IOperationStore.md)

### Interface

```tsx
interface DocumentRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface IDocumentGraph {
  get all(): string[];

  /**
   * Traverses the graph using breadth-first or depth-first search.
   * 
   * @param startDocumentId - The ID of the starting document.
   * @param strategy - The traversal strategy: 'breadth-first' or 'depth-first'.
   * @param visitor - Function called for each visited document.
   * 
   * @returns Array of document IDs in traversal order.
   */
  traverse(
    startDocumentId: string, 
    strategy: 'breadth-first' | 'depth-first',
    visitor?: (documentId: string) => void
  ): string[];

  /**
   * Aggregates the graph into a single value by combining parent and child values.
   * Similar to Array.reduce, but for hierarchical graph structures.
   * 
   * @param reducer - Function that combines a parent value with a child value.
   * @param initialValue - The initial value for the aggregation.
   * @param rootDocumentId - The root document to start aggregation from (optional, uses first root if not provided).
   * 
   * @returns The aggregated result.
   */
  aggregate<T>(
    reducer: (parentValue: T, childDocumentId: string, parentDocumentId?: string) => T,
    initialValue: T,
    rootDocumentId?: string
  ): T;
}

interface IDocumentIndexer {
  /**
   * Retrieves all relationships between two documents.
   * 
   * @param a - The ID of the first document.
   * @param b - The ID of the second document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The relationships between the two documents.
   */
  getUndirectedRelationships(a: string, b: string, types?: string[]): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships from a document to another document.
   * 
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The relationships from the document to the other document.
   */
  getDirectedRelationships(sourceId: string, targetId: string, types?: string[]): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships from a document.
   */
  /**
   * Retrieves all relationships from a document.
   * 
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The relationships from the document.
   */
  getOutgoing(documentId: string, types?: string[]): Promise<DocumentRelationship[]>;

  /**
   * Retrieves all relationships into a document.
   * 
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The relationships into the document.
   */
  getIncoming(documentId: string, types?: string[]): Promise<DocumentRelationship[]>;
  
  /**
   * Finds a path between two documents.
   * 
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The path between the two documents, or null if no path exists.
   */
  findPath(sourceId: string, targetId: string, types?: string[]): Promise<string[] | null>;

  /**
   * Finds the ancestor graph of a document.
   * 
   * @param documentId - The ID of the document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns The ancestor graph of the document.
   */
  findAncestors(documentId: string, types?: string[]): Promise<IDocumentGraph>;

  /**
   * Checks if a relationship exists between two documents.
   * 
   * @param sourceId - The ID of the source document.
   * @param targetId - The ID of the target document.
   * @param types - The types of relationships to check for, or all if not provided
   * 
   * @returns True if a relationship exists, false otherwise.
   */
  hasRelationship(sourceId: string, targetId: string, types?: string[]): Promise<boolean>;

  /**
   * Retrieves all possible relationship types.
   */
  getRelationshipTypes(): Promise<string[]>;
}
```

### Schema

```prisma

model Document {
  id           String @id

  // Outgoing relationships from this document
  outgoing     DocumentRelationship[] @relation("SourceDocument")

  // Incoming relationships to this document  
  incoming     DocumentRelationship[] @relation("TargetDocument")
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model DocumentRelationship {
  id              String @id @default(cuid())
  
  sourceId        String
  targetId        String
  relationshipType String // e.g., "parent-child", "references", "depends-on", etc.
  metadata        Json?  // Additional metadata about the relationship
  weight          Float? // Optional weight for weighted relationships

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  source          Document @relation("SourceDocument", fields: [sourceId], references: [id])
  target          Document @relation("TargetDocument", fields: [targetId], references: [id])
  
  // Prevent duplicate relationships of the same type between the same documents
  @@unique([sourceId, targetId, relationshipType])
  @@index([sourceId])
  @@index([targetId])
  @@index([relationshipType])
}
```
