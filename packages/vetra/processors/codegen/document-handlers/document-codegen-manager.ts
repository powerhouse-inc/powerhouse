import { afterPendingInstalls, installsPending } from "@powerhousedao/codegen";
import {
  type CodegenState,
  type CodegenStatusRegistry,
  getCodegenStatusRegistry,
} from "@powerhousedao/shared/processors";
import type { Project } from "ts-morph";
import type { QueuedStrand } from "../interactive-manager.js";
import { InteractiveManager } from "../interactive-manager.js";
import { logger } from "../logger.js";
import { filesWrittenSince } from "../written-files.js";
import type { BaseDocumentGen } from "./base-document-gen.js";
import type { CodegenInput, CodegenJob, Config } from "./types.js";

const DEFAULT_DEBOUNCE_TIME = 1000; // wait 1 second between codegen calls
const MODULE_NOT_FOUND_CODES = new Set([
  "ERR_MODULE_NOT_FOUND",
  "MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
]);
const MODULE_NOT_FOUND_MESSAGE =
  /Cannot find (module|package)|Failed to resolve (import|entry)|Failed to load url/;

/** Whether a document belongs to what this manager generates from. */
export type DocumentScope = (documentId: string) => Promise<boolean>;

/**
 * Manager class responsible for routing documents to the correct generator
 * and managing generator registration and instantiation
 */
export class DocumentCodegenManager {
  project: Project;
  private generators = new Map<string, BaseDocumentGen>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  // One job at a time, so none runs while another job's install relinks node_modules.
  private jobs: Promise<void> = Promise.resolve();
  private queuedJobs = new Map<string, CodegenInput>();
  private runningJobs = 0;
  /** The wait before retrying a module-resolution failure when no install is queued. */
  retryDelayMs = 3000;
  private interactiveManager: InteractiveManager;
  private isInScope: DocumentScope = () => Promise.resolve(true);
  readonly status: CodegenStatusRegistry;

  constructor(
    private config: Config,
    project: Project,
    interactiveMode = false,
    status: CodegenStatusRegistry = getCodegenStatusRegistry(),
  ) {
    this.project = project;
    this.interactiveManager = new InteractiveManager(interactiveMode);
    this.status = status;
  }

  /**
   * Limit generation to the documents `isInScope` accepts, checked when the
   * debounce fires
   */
  setScope(isInScope: DocumentScope): void {
    this.isInScope = isInScope;
  }

  /**
   * Register a generator class for a specific document type
   */
  registerGenerator(
    documentType: string,
    generatorClass: new (config: Config, project: Project) => BaseDocumentGen,
  ): void {
    if (this.generators.has(documentType)) {
      logger.warn(
        `⚠️ Generator for document type "${documentType}" is already registered. Overwriting.`,
      );
    }

    this.generators.set(
      documentType,
      new generatorClass(this.config, this.project),
    );
    logger.debug(`✅ Registered generator for document type: ${documentType}`);
  }

  /**
   * Register a generator class that supports multiple document types
   */
  registerMultiTypeGenerator(
    generatorClass: new (config: Config, project: Project) => BaseDocumentGen,
  ): void {
    const generator = new generatorClass(this.config, this.project);
    const supportedTypes = generator.getSupportedDocumentTypes();

    for (const documentType of supportedTypes) {
      if (this.generators.has(documentType)) {
        logger.warn(
          `⚠️ Generator for document type "${documentType}" is already registered. Overwriting.`,
        );
      }
      this.generators.set(documentType, generator);
    }

    logger.debug(
      `✅ Registered multi-type generator for document types: ${supportedTypes.join(", ")}`,
    );
  }

  /**
   * Get a generator instance for the given document type
   * Public method to allow external access for validation
   */
  public getGenerator(documentType: string): BaseDocumentGen | undefined {
    return this.generators.get(documentType);
  }

  /**
   * Get all registered document types
   */
  getRegisteredDocumentTypes(): string[] {
    return Array.from(this.generators.keys());
  }

  /**
   * Check if a document type is supported
   */
  isDocumentTypeSupported(documentType: string): boolean {
    return this.generators.has(documentType);
  }

  /**
   * Route a document to the appropriate generator and handle the generation
   * Handles both interactive and non-interactive modes with queue-based processing
   */
  routeAndGenerate(strand: CodegenInput): Promise<void> {
    const documentType = strand.documentType;

    if (!documentType) {
      logger.error("❌ Document type is missing from strand state");
      throw new Error("Document type is missing from strand state");
    }

    const generator = this.getGenerator(documentType);

    if (!generator) {
      logger.warn(`⚠️ No generator found for document type: ${documentType}`);
      logger.warn(
        `ℹ️ Supported document types: ${this.getRegisteredDocumentTypes().join(", ")}`,
      );
      throw new Error(`Unsupported document type: ${documentType}`);
    }

    // Scope and validation are checked when the debounce fires, on the
    // document's final state.
    this.status.set({
      documentId: strand.documentId,
      documentType,
      state: "queued",
      message: this.interactiveManager.isInteractive()
        ? "Waiting for confirmation in the terminal running Vetra"
        : "Waiting for the document's changes to settle",
    });
    // Different flow for interactive vs non-interactive mode
    if (this.interactiveManager.isInteractive()) {
      // Interactive mode: queue strands and use debounce timer to trigger batch processing
      logger.debug(
        `>>> Queueing strand for interactive processing: ${documentType}:${strand.documentId}`,
      );

      // Add strand to queue (will replace any existing strand for same document)
      this.interactiveManager.queueStrand(strand);

      // Clear any existing debounce timer for interactive processing
      const existingTimer = this.debounceTimers.get("interactive");
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set up debounce timer for batch interactive processing
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const debounceTimer = setTimeout(async () => {
        try {
          const rejected = new Set<CodegenInput>();
          for (const { strand } of this.interactiveManager.getQueuedStrands()) {
            if (!(await this.accepts(strand))) rejected.add(strand);
          }
          this.interactiveManager.discardWhere((queued) =>
            rejected.has(queued),
          );
          await this.interactiveManager.processQueueWithConfirmation(
            async (queuedStrands: QueuedStrand[]) => {
              await this.processQueuedStrands(queuedStrands);
            },
            (cancelled) => {
              for (const { strand } of cancelled) {
                this.setStatus(strand, "skipped", "Cancelled in the terminal");
              }
            },
          );
        } catch (error) {
          logger.error(
            "❌ Error during interactive batch processing: @error",
            error,
          );
        } finally {
          // Clean up the timer reference
          this.debounceTimers.delete("interactive");
        }
      }, DEFAULT_DEBOUNCE_TIME);

      // Store the timer reference using 'interactive' key
      this.debounceTimers.set("interactive", debounceTimer);
    } else {
      // Non-interactive mode: use debouncing per document instance
      // Create unique key for this specific document instance
      const timerKey = `${documentType}:${strand.documentId}`;

      // Clear any existing debounce timer for this document instance
      const existingTimer = this.debounceTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set up new debounced generation (no interactive confirmation)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const debounceTimer = setTimeout(async () => {
        try {
          if (!(await this.accepts(strand))) return;
          logger.debug(
            `🔄 Routing document type "${documentType}" to generator (debounced)`,
          );
          await this.enqueueJob(strand);
        } finally {
          // Clean up the timer reference
          this.debounceTimers.delete(timerKey);
        }
      }, DEFAULT_DEBOUNCE_TIME);

      // Store the timer reference
      this.debounceTimers.set(timerKey, debounceTimer);
    }
    return Promise.resolve();
  }

  /** In scope first, so documents out of scope are never validated or logged. */
  private async accepts(strand: CodegenInput): Promise<boolean> {
    const generator = this.getGenerator(strand.documentType);
    if (!generator) return false;
    if (!(await this.isInScope(strand.documentId))) {
      logger.debug(
        `Document ${strand.documentId} is not in the Vetra drive, skipping codegen`,
      );
      this.status.delete(strand.documentId);
      this.queuedJobs.delete(strand.documentId);
      return false;
    }
    const reason = generator.skipReason(strand);
    if (reason !== undefined) {
      this.setStatus(strand, "skipped", reason);
      this.queuedJobs.delete(strand.documentId);
      return false;
    }
    return true;
  }

  /** Queues a job; one already queued for the document runs the latest strand. */
  private enqueueJob(strand: CodegenInput): Promise<void> {
    const { documentId } = strand;
    const alreadyQueued = this.queuedJobs.has(documentId);
    this.queuedJobs.set(documentId, strand);
    if (this.runningJobs > 0) {
      this.setStatus(
        strand,
        "queued",
        "Waiting for codegen of other documents to finish",
      );
    }
    if (alreadyQueued) return this.jobs;
    this.jobs = this.jobs.then(async () => {
      const latest = this.queuedJobs.get(documentId);
      this.queuedJobs.delete(documentId);
      const generator = latest && this.getGenerator(latest.documentType);
      if (!latest || !generator) return;
      this.runningJobs++;
      try {
        await this.runJob(latest, generator);
      } finally {
        this.runningJobs--;
      }
    });
    return this.jobs;
  }

  /** Runs a job after pending installs, once more after a module-resolution failure. */
  private async runJob(
    strand: CodegenInput,
    generator: BaseDocumentGen,
  ): Promise<void> {
    await this.afterInstalls(
      strand,
      "Waiting for a dependency install to finish",
    );
    const error = await this.attempt(strand, generator);
    if (error === undefined) return;
    if (!isModuleResolutionError(error)) {
      this.setStatus(strand, "failed", errorMessage(error));
      return;
    }
    logger.warn(
      `Codegen for ${strand.documentType} ${strand.documentId} could not resolve a module; retrying once installs finish: ${errorMessage(error)}`,
    );
    const waited = await this.afterInstalls(
      strand,
      `Retrying once dependency installs finish, after: ${errorMessage(error)}`,
    );
    if (!waited) {
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    }
    const retryError = await this.attempt(strand, generator);
    if (retryError !== undefined) {
      this.setStatus(
        strand,
        "failed",
        `${errorMessage(retryError)} (also after a retry; if an install is running, run it to the end, then change the document again)`,
      );
    }
  }

  /** Waits for queued installs, saying so; resolves to whether any was queued. */
  private async afterInstalls(
    strand: CodegenInput,
    message: string,
  ): Promise<boolean> {
    if (!installsPending()) return false;
    this.setStatus(strand, "waiting-for-install", message);
    await afterPendingInstalls();
    return true;
  }

  /** Generates once; records done or skipped, or resolves to the error. */
  private async attempt(
    strand: CodegenInput,
    generator: BaseDocumentGen,
  ): Promise<unknown> {
    const startedAt = Date.now();
    const job: CodegenJob = {
      waitingForInstall: (message) =>
        this.setStatus(strand, "waiting-for-install", message),
      running: () => this.setStatus(strand, "running"),
    };
    job.running();
    try {
      const result = await generator.generate(strand, job);
      if (result) {
        this.setStatus(strand, "skipped", result.skipped);
        return;
      }
      const files = await filesWrittenSince(
        this.config.CURRENT_WORKING_DIR,
        startedAt,
      );
      this.setStatus(strand, "done", undefined, files);
      logger.debug(
        `✅ Successfully generated code for document type: ${strand.documentType}`,
      );
      return undefined;
    } catch (error) {
      logger.error(
        `❌ Error generating code for document type "${strand.documentType}":`,
        error,
      );
      return error ?? new Error("Codegen failed");
    }
  }

  private setStatus(
    strand: CodegenInput,
    state: CodegenState,
    message?: string,
    files?: string[],
  ): void {
    this.status.set({
      documentId: strand.documentId,
      documentType: strand.documentType,
      name: this.getGenerator(strand.documentType)?.moduleName(strand),
      state,
      message,
      files,
    });
  }

  /**
   * Process multiple strands in priority order (document-model types first)
   */
  private async processQueuedStrands(
    queuedStrands: QueuedStrand[],
  ): Promise<void> {
    logger.debug(`🔄 Processing ${queuedStrands.length} queued strand(s)`);

    // Sort by priority (document-model first to ensure dependencies exist)
    const documentModelStrands = queuedStrands.filter(
      (qs: QueuedStrand) =>
        qs.strand.documentType === "powerhouse/document-model",
    );
    const otherStrands = queuedStrands.filter(
      (qs: QueuedStrand) =>
        qs.strand.documentType !== "powerhouse/document-model",
    );

    // Process document models first
    for (const queuedStrand of documentModelStrands) {
      await this.processStrand(queuedStrand.strand);
    }

    // Then process other document types
    for (const queuedStrand of otherStrands) {
      await this.processStrand(queuedStrand.strand);
    }

    logger.debug(
      `✅ Successfully processed all ${queuedStrands.length} queued strand(s)`,
    );
  }

  /**
   * Process a single strand (used internally by processQueuedStrands)
   */
  private async processStrand(strand: CodegenInput): Promise<void> {
    const documentType = strand.documentType;
    const generator = this.getGenerator(documentType);

    if (!generator) {
      logger.warn(`⚠️ No generator found for document type: ${documentType}`);
      return;
    }

    logger.debug(`🔄 Generating code for document type: ${documentType}`);
    await this.enqueueJob(strand);
  }

  /**
   * Clear all registered generators
   */
  clearGenerators(): void {
    this.generators.clear();
    logger.debug("🧹 Cleared all registered generators");
  }

  /**
   * Get statistics about registered generators
   */
  getStats(): { totalGenerators: number; supportedTypes: string[] } {
    return {
      totalGenerators: this.generators.size,
      supportedTypes: this.getRegisteredDocumentTypes(),
    };
  }

  /**
   * Set interactive mode for code generation
   */
  setInteractiveMode(enabled: boolean): void {
    this.interactiveManager.setInteractiveMode(enabled);
  }

  /**
   * Check if interactive mode is enabled
   */
  isInteractiveMode(): boolean {
    return this.interactiveManager.isInteractive();
  }

  /**
   * Check if the manager is currently processing an interactive confirmation
   */
  isProcessingInteractive(): boolean {
    return this.interactiveManager.isProcessing();
  }
}

function isModuleResolutionError(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code && MODULE_NOT_FOUND_CODES.has(code)) return true;
    if (MODULE_NOT_FOUND_MESSAGE.test(cause.message)) return true;
  }
  return false;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}
