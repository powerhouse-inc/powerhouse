# Interface

```tsx
/**
 * Describes the status of a.
 */
type ShutdownStatus = {
  /**
   * True if and only if the system has been shutdown.
   * 
   * This value is meant to be polled to determine if the system has been shutdown.
   * 
   * In the case of a browser process, the `kill` method should be able to synchronously set this to true.
   * 
   * In the case of a server process, a graceful shutdown period should be allowed for the system to finish its work.
   */
  get isShutdown(): boolean;
}

/**
 * Enum that determines deletion propagation.
 */
enum PropagationMode {
  None = "none",
  Cascade = "cascade"
}

/**
 * Enum that describes the type of relationship change.
 */
enum RelationshipChangeType {
  Added = "added",
  Removed = "removed"
}

/**
 * Describes the current state of a job.
 */
type JobInfo = {
  id: string;
  status: JobStatus;
  error?: string;
}

/**
 * The status of a job.
 */
enum JobStatus {
  Success = "success",
  Error = "error",
  Pending = "pending",
}

/**
 * Describe the view of a set of documents. That is, what pieces of the
 * documents are populated.
 */
type ViewFilter = {
  branch?: string;
  scopes?: string[];
  revision?: number;
  headerOnly?: boolean;
}

/**
 * Describes filter options for searching documents.
 */
type SearchFilter = {
  type?: string;
  parentId?: string;
  ids?: string[];
  slugs?: string[];
}

/**
 * Describes the options for paging.
 */
type PagingOptions = {
  cursor: string;
  limit: number;
}

/**
 * The paged result.
 */
type PagedResults<T> = {
  results: T[];
  options: PagingOptions;

  next?: () => Promise<PagedResults<T>>;
  nextCursor?: string;
}

```