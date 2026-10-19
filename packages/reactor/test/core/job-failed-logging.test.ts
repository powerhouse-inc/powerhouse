import type { ILogger } from "document-model";
import { describe, expect, it } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { JobFailedEvent } from "../../src/events/types.js";
import {
  EventBusAggregateError,
  ReactorEventTypes,
} from "../../src/events/types.js";
import { SimpleJobExecutorManager } from "../../src/executor/simple-job-executor-manager.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { NullDocumentModelResolver } from "../../src/registry/document-model-resolver.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import {
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobExecutor,
  createMockLogger,
  createMockOperationStore,
  createMockReactorFeatures,
  createTestJob,
  createTestRegistry,
} from "../factories.js";

/**
 * Builds a logger that records every error() call, optionally throwing from
 * each one the way a logger over a closed stdout does (write EPIPE).
 */
function createRecordingLogger(failWith?: Error): {
  logger: ILogger;
  errorCalls: unknown[][];
} {
  const errorCalls: unknown[][] = [];
  const logger: ILogger = {
    level: "error",
    verbose: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => {
      errorCalls.push(args);
      if (failWith) {
        throw failWith;
      }
    },
    errorHandler: () => {},
    child: () => logger,
  };
  return { logger, errorCalls };
}

/**
 * Builds a Reactor around the given logger and event bus, so the JOB_FAILED
 * logging subscriber the constructor wires up can be exercised directly.
 */
function createReactor(logger: ILogger, eventBus: EventBus): Reactor {
  const queue = new InMemoryQueue(eventBus, new NullDocumentModelResolver());
  const jobTracker = new InMemoryJobTracker(eventBus);
  const executorManager = new SimpleJobExecutorManager(
    () => createMockJobExecutor(),
    eventBus,
    queue,
    jobTracker,
    createMockLogger(),
    new NullDocumentModelResolver(),
  );
  return new Reactor(
    logger,
    createTestRegistry(),
    queue,
    jobTracker,
    new ReadModelCoordinator(eventBus, [], []),
    createMockReactorFeatures(),
    createMockDocumentView(),
    createMockDocumentIndexer(),
    createMockOperationStore(),
    eventBus,
    executorManager,
  );
}

describe("Reactor JOB_FAILED logging subscriber", () => {
  it("logs the job id, document id, and error message, never the job payload", async () => {
    const { logger, errorCalls } = createRecordingLogger();
    const eventBus = new EventBus();
    createReactor(logger, eventBus);

    const job = createTestJob({ id: "job-1", documentId: "doc-1" });
    const event: JobFailedEvent = {
      jobId: job.id,
      error: new Error("The operation was aborted due to timeout"),
      job,
    };
    await eventBus.emit(ReactorEventTypes.JOB_FAILED, event);

    expect(errorCalls).toEqual([
      [
        "Job @JobId for document @DocumentId failed with @Message",
        "job-1",
        "doc-1",
        "The operation was aborted due to timeout",
      ],
    ]);
  });

  it("logs a placeholder document id when the event carries no job", async () => {
    const { logger, errorCalls } = createRecordingLogger();
    const eventBus = new EventBus();
    createReactor(logger, eventBus);

    const event: JobFailedEvent = {
      jobId: "job-2",
      error: new Error("Job failed"),
    };
    await eventBus.emit(ReactorEventTypes.JOB_FAILED, event);

    expect(errorCalls).toEqual([
      [
        "Job @JobId for document @DocumentId failed with @Message",
        "job-2",
        "unknown",
        "Job failed",
      ],
    ]);
  });

  it("contains a logger whose write fails: the bus aggregates the error and later subscribers still run", async () => {
    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    const { logger, errorCalls } = createRecordingLogger(epipe);
    const eventBus = new EventBus();
    createReactor(logger, eventBus);

    const laterSubscriberEvents: JobFailedEvent[] = [];
    eventBus.subscribe(
      ReactorEventTypes.JOB_FAILED,
      (_type: number, data: JobFailedEvent) => {
        laterSubscriberEvents.push(data);
      },
    );

    const job = createTestJob({ id: "job-3", documentId: "doc-3" });
    const event: JobFailedEvent = {
      jobId: job.id,
      error: new Error("boom"),
      job,
    };

    // The bus contract: a throwing subscriber is caught, the remaining
    // subscribers still run, and emit rejects with the aggregate. Every
    // JOB_FAILED emit site swallows that rejection with .catch, so a failing
    // log write never propagates further than this.
    const emitError: unknown = await eventBus
      .emit(ReactorEventTypes.JOB_FAILED, event)
      .then(() => undefined)
      .catch((error: unknown) => error);
    expect(emitError).toBeInstanceOf(EventBusAggregateError);
    expect((emitError as EventBusAggregateError).errors).toEqual([epipe]);

    expect(errorCalls).toHaveLength(1);
    expect(laterSubscriberEvents).toEqual([event]);
  });
});
