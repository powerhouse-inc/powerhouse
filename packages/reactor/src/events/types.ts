import type { Job } from "../queue/types.js";
import type { OperationWithContext } from "#storage/interfaces.js";

/**
 * Describes a function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

/**
 * A subscriber is a function that is called when an event is emitted.
 *
 * It is passed the event type and the data.
 * It can return a promise or a value.
 * If it returns a promise, the event bus will wait for the promise to resolve before calling the next subscriber.
 * If it throws an error, the event bus will reject with an aggregate error of all errors.
 *
 * @param type - The type of event to emit.
 * @param data - The data to pass to the subscriber.
 */
export type Subscriber = (type: number, data: any) => void | Promise<void>;

/**
 * Custom error class that aggregates multiple errors from event subscribers.
 */
export class EventBusAggregateError extends Error {
  public readonly errors: any[];

  constructor(errors: unknown[]) {
    const message = `EventBus emit failed with ${errors.length} error(s): ${errors
      .map((e) => {
        if (e && typeof e === "object" && "message" in e) {
          return (e as Error).message;
        }
        return String(e);
      })
      .join("; ")}`;
    super(message);

    this.name = "EventBusAggregateError";
    this.errors = errors;
  }
}

/**
 * Event types for operation-related events.
 */
export const OperationEventTypes = {
  OPERATION_WRITTEN: 10001,
  OPERATIONS_READY: 10002,
  JOB_FAILED: 10003,
} as const;

/**
 * Event emitted when operations are written to IOperationStore.
 * Contains the operations directly to avoid round-trip queries.
 */
export type OperationWrittenEvent = {
  jobId: string;
  operations: OperationWithContext[];
  jobMeta?: Record<string, unknown>;
};

/**
 * Event emitted after all read models have finished processing operations.
 * This event fires after OPERATION_WRITTEN and guarantees that:
 * - All read models (DocumentView, DocumentIndexer, etc.) have indexed the operations
 * - All consistency trackers have been updated with the new operation indices
 * - Queries without consistency tokens will now see the updated data
 *
 * This event is useful for:
 * - Test synchronization (knowing when read models are ready)
 * - Observability (measuring read model latency)
 * - Event-driven workflows (triggering downstream processes)
 */
export type OperationsReadyEvent = {
  jobId: string;
  operations: OperationWithContext[];
};

/**
 * Event emitted when a job fails with an unrecoverable error.
 * This event allows the JobAwaiter and other subscribers to react to job failures
 * without polling.
 */
export type JobFailedEvent = {
  jobId: string;
  error: Error;
  job?: Job;
};
