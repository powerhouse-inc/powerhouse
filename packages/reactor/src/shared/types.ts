/**
 * Basic Operation type for the queue
 * This is a simplified version that includes the essential fields needed for queuing
 */
export type Operation = {
  /** Position of the operation in the history */
  index: number;
  /** Timestamp of when the operation was added */
  timestampUtcMs: string;
  /** Hash of the resulting document data after the operation */
  hash: string;
  /** The number of operations skipped with this Operation */
  skip: number;
  /** The type/name of the operation */
  type: string;
  /** The input data for the operation */
  input: any;
  /** Error message for a failed action */
  error?: string;
  /** Unique operation id */
  id?: string;
};
