import type { ReactorModule } from "@powerhousedao/reactor";
import { ConsoleLogger } from "@powerhousedao/reactor";
import {
  MetricsCollector,
  Reporter,
  generateOperations,
  createTestDocument,
  DOCUMENT_MODEL_TYPE,
} from "@powerhousedao/load-test-client";
import type {
  OperationResult,
  TestDocument,
} from "@powerhousedao/load-test-client";
import { createReactorWithSync, waitForDocument } from "./reactor-setup.js";
import type { ConnectTestConfig } from "./types.js";

export class ConnectTestScheduler {
  private config: ConnectTestConfig;
  private metrics: MetricsCollector;
  private reporter: Reporter;

  private module: ReactorModule | undefined;
  private document: TestDocument | undefined;
  private isRunning = false;
  private startTime = 0;

  private mutationTimer: NodeJS.Timeout | null = null;
  private progressTimer: NodeJS.Timeout | null = null;
  private done: (() => void) | null = null;

  constructor(config: ConnectTestConfig) {
    this.config = config;
    this.metrics = new MetricsCollector();
    this.reporter = new Reporter();
  }

  async start(): Promise<void> {
    this.reporter.printInfo(
      `Creating local reactor with sync to ${this.config.url}...`,
    );

    const logger = new ConsoleLogger(["reactor"]);
    logger.level = this.config.verbose ? "verbose" : "info";

    this.module = await createReactorWithSync(this.config, logger);

    this.reporter.printInfo(
      `Waiting for document ${this.config.documentId} to sync from remote...`,
    );

    await waitForDocument(
      this.module,
      this.config.documentId,
      undefined,
      this.config.verbose,
    );

    this.reporter.printInfo("Document synced. Starting load test...");

    this.document = createTestDocument(
      this.config.documentId,
      DOCUMENT_MODEL_TYPE,
    );

    this.isRunning = true;
    this.startTime = Date.now();
    this.metrics.setStartTime(this.startTime);

    this.reporter.printInfo(
      `Starting load test for ${this.config.duration / 1000}s...`,
    );
    console.log();

    this.mutationTimer = setInterval(
      () => void this.executeActions(),
      this.config.mutationInterval,
    );

    this.progressTimer = setInterval(() => this.updateProgress(), 500);

    return new Promise<void>((resolve) => {
      this.done = resolve;
      setTimeout(() => void this.stop(), this.config.duration);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.mutationTimer) clearInterval(this.mutationTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);

    const stats = this.metrics.getStatistics();
    const durationSeconds = (Date.now() - this.startTime) / 1000;

    this.reporter.printSummary(stats, durationSeconds);

    if (this.module) {
      this.module.reactor.kill();
    }

    this.done?.();
  }

  private async executeActions(): Promise<void> {
    if (!this.isRunning || !this.module || !this.document) return;

    const operations = generateOperations(this.document);
    const startTime = Date.now();

    let result: OperationResult;

    try {
      await this.module.reactor.execute(
        this.config.documentId,
        "main",
        operations,
      );

      this.document.operationCount += operations.length;

      result = {
        operationType: operations.map((o) => o.type).join(","),
        documentId: this.config.documentId,
        startTime,
        endTime: Date.now(),
        success: true,
        latencyMs: Date.now() - startTime,
        operationCount: operations.length,
      };

      this.reporter.printVerbose(
        `Executed ${operations.length} ops locally: ${operations.map((o) => o.type).join(", ")}`,
        this.config.verbose,
      );
    } catch (error) {
      result = {
        operationType: operations.map((o) => o.type).join(","),
        documentId: this.config.documentId,
        startTime,
        endTime: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
        operationCount: operations.length,
      };

      this.reporter.printError(`Execute failed: ${result.error}`);
    }

    this.metrics.recordOperation(result);
  }

  private updateProgress(): void {
    if (!this.isRunning) return;

    const elapsed = (Date.now() - this.startTime) / 1000;
    const progress = this.metrics.getCurrentProgress();

    this.reporter.printProgress(
      elapsed,
      this.config.duration,
      progress.totalOps,
      progress.errors,
      progress.avgLatency,
    );
  }
}
