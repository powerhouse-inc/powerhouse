import type { Action } from "document-model";
import { GraphQLClient } from "../client/graphql-client.js";
import { MetricsCollector } from "../metrics/collector.js";
import { Reporter } from "../metrics/reporter.js";
import {
  createTestDocument,
  generateOperations,
} from "../operations/generator.js";
import type {
  DocumentResult,
  DriveInfo,
  LoadTestConfig,
  OperationResult,
  TestDocument,
} from "../types.js";
import { DOCUMENT_MODEL_TYPE } from "../types.js";

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createAddFileAction(
  documentId: string,
  documentName: string,
  documentType: string,
): Action {
  return {
    id: generateId(),
    type: "ADD_FILE",
    timestampUtcMs: new Date().toISOString(),
    input: {
      id: documentId,
      name: documentName,
      documentType,
    },
    scope: "global",
  };
}

export class TestScheduler {
  private client: GraphQLClient;
  private metrics: MetricsCollector;
  private reporter: Reporter;
  private config: LoadTestConfig;

  private documents: Map<string, TestDocument> = new Map();
  private drives: DriveInfo[] = [];
  private isRunning = false;
  private startTime = 0;

  private documentTimer: NodeJS.Timeout | null = null;
  private mutationTimer: NodeJS.Timeout | null = null;
  private progressTimer: NodeJS.Timeout | null = null;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.client = new GraphQLClient(config.url);
    this.metrics = new MetricsCollector();
    this.reporter = new Reporter();
  }

  async start(): Promise<void> {
    this.reporter.printInfo(`Connecting to ${this.config.url}...`);

    // Test connection
    const connected = await this.client.testConnection();
    if (!connected) {
      this.reporter.printError(`Failed to connect to ${this.config.url}`);
      throw new Error("Connection failed");
    }

    // Find available drives
    this.drives = await this.client.findDrives();
    if (this.drives.length === 0) {
      this.reporter.printError("No drives found. Please create a drive first.");
      throw new Error("No drives available");
    }

    this.reporter.printInfo(`Found ${this.drives.length} drive(s)`);
    this.reporter.printInfo(
      `Starting load test for ${this.config.duration}s...`,
    );
    console.log();

    this.isRunning = true;
    this.startTime = Date.now();
    this.metrics.setStartTime(this.startTime);

    // Create first document immediately
    await this.createDocument();

    // Start document creation timer (unless single-document mode)
    if (!this.config.singleDocument) {
      this.documentTimer = setInterval(
        () => this.createDocument(),
        this.config.documentInterval * 1000,
      );
    }

    // Start mutation timer
    this.mutationTimer = setInterval(
      () => this.sendMutations(),
      this.config.mutationInterval * 1000,
    );

    // Start progress update timer
    this.progressTimer = setInterval(() => this.updateProgress(), 500);

    // Set up stop timer
    setTimeout(() => this.stop(), this.config.duration * 1000);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.documentTimer) clearInterval(this.documentTimer);
    if (this.mutationTimer) clearInterval(this.mutationTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);

    const stats = this.metrics.getStatistics();
    const durationSeconds = (Date.now() - this.startTime) / 1000;

    this.reporter.printSummary(stats, durationSeconds);
  }

  private async createDocument(): Promise<void> {
    if (!this.isRunning) return;

    const documentType = DOCUMENT_MODEL_TYPE;
    const drive = this.drives[Math.floor(Math.random() * this.drives.length)];

    const startTime = Date.now();
    let result: DocumentResult;

    try {
      // Step 1: Create empty document using the high-level API
      const createdDoc = await this.client.createEmptyDocument(
        documentType,
        drive.id,
      );
      const documentId = createdDoc.id;
      // createEmptyDocument returns empty name, so generate a valid one for ADD_FILE
      const documentName =
        createdDoc.name ||
        `TestDoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Step 2: Add the document to the drive's file tree
      const addFileAction = createAddFileAction(
        documentId,
        documentName,
        documentType,
      );
      await this.client.mutateDocument(drive.id, [addFileAction]);

      const testDoc = createTestDocument(documentId, documentType, drive.id);
      this.documents.set(documentId, testDoc);

      result = {
        documentId,
        documentType,
        startTime,
        endTime: Date.now(),
        success: true,
        latencyMs: Date.now() - startTime,
      };

      this.reporter.printVerbose(
        `Created ${documentType} document: ${documentId} in drive ${drive.id}`,
        this.config.verbose,
      );
    } catch (error) {
      result = {
        documentId: "",
        documentType,
        startTime,
        endTime: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };

      // Always log errors
      this.reporter.printError(`Document creation failed: ${result.error}`);
    }

    this.metrics.recordDocumentCreation(result);
  }

  private async sendMutations(): Promise<void> {
    if (!this.isRunning || this.documents.size === 0) return;

    // Send mutations to all documents
    const mutationPromises = Array.from(this.documents.values()).map((doc) =>
      this.sendMutationToDocument(doc),
    );

    await Promise.allSettled(mutationPromises);
  }

  private async sendMutationToDocument(doc: TestDocument): Promise<void> {
    const operations = generateOperations(doc);
    const startTime = Date.now();

    let result: OperationResult;

    try {
      await this.client.mutateDocument(doc.id, operations);

      doc.operationCount += operations.length;

      result = {
        operationType: operations.map((o) => o.type).join(","),
        documentId: doc.id,
        startTime,
        endTime: Date.now(),
        success: true,
        latencyMs: Date.now() - startTime,
        operationCount: operations.length,
      };

      this.reporter.printVerbose(
        `Sent ${operations.length} ops to ${doc.id}: ${operations.map((o) => o.type).join(", ")}`,
        this.config.verbose,
      );
    } catch (error) {
      result = {
        operationType: operations.map((o) => o.type).join(","),
        documentId: doc.id,
        startTime,
        endTime: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
        operationCount: operations.length,
      };

      // Always log errors
      this.reporter.printError(
        `Mutation failed for ${doc.id}: ${result.error}`,
      );
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
