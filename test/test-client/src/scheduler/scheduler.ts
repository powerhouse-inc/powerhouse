import { GraphQLClient } from "../client/graphql-client.js";
import { MetricsCollector } from "../metrics/collector.js";
import { Reporter } from "../metrics/reporter.js";
import { createTestDocument, generateOperations } from "../operations/generator.js";
import type {
  DocumentResult,
  DriveInfo,
  LoadTestConfig,
  OperationResult,
  TestDocument,
} from "../types.js";
import { DOCUMENT_DRIVE_TYPE, DOCUMENT_MODEL_TYPE } from "../types.js";

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

    // Start document creation timer
    this.documentTimer = setInterval(
      () => this.createDocument(),
      this.config.documentInterval * 1000,
    );

    // Create first document immediately
    await this.createDocument();

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

    // Alternate between document types
    const documentTypes = [DOCUMENT_MODEL_TYPE, DOCUMENT_DRIVE_TYPE];
    const documentType =
      documentTypes[this.documents.size % documentTypes.length];

    // Pick a random drive as parent
    const drive = this.drives[Math.floor(Math.random() * this.drives.length)];

    const startTime = Date.now();
    let result: DocumentResult;

    try {
      const doc = await this.client.createEmptyDocument(documentType, drive.id);

      const testDoc = createTestDocument(doc.id, documentType, drive.id);
      this.documents.set(doc.id, testDoc);

      result = {
        documentId: doc.id,
        documentType,
        startTime,
        endTime: Date.now(),
        success: true,
        latencyMs: Date.now() - startTime,
      };

      this.reporter.printVerbose(
        `Created ${documentType} document: ${doc.id}`,
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

      this.reporter.printVerbose(
        `Failed to create document: ${result.error}`,
        this.config.verbose,
      );
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

      this.reporter.printVerbose(
        `Mutation failed for ${doc.id}: ${result.error}`,
        this.config.verbose,
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
