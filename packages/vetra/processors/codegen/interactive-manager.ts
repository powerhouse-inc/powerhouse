import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { createInterface } from "readline";
import { logger } from "./logger.js";

export interface QueuedStrand {
  strand: InternalTransmitterUpdate<DocumentModelDocument>;
  timestamp: number;
}

/**
 * InteractiveManager handles user interaction for code generation confirmation
 * Supports both individual strand processing and queue-based batch processing
 */
export class InteractiveManager {
  private isInteractiveMode: boolean;
  private processingConfirmation = false;
  private strandQueue = new Map<string, QueuedStrand>();

  constructor(interactiveMode: boolean = false) {
    this.isInteractiveMode = interactiveMode;
  }

  private getDocumentKey(documentType: string, documentId: string): string {
    return `${documentType}:${documentId}`;
  }

  /**
   * Add a strand to the queue, replacing any existing strand for the same document
   */
  public queueStrand(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): void {
    const documentKey = this.getDocumentKey(
      strand.documentType,
      strand.documentId,
    );

    this.strandQueue.set(documentKey, {
      strand,
      timestamp: Date.now(),
    });

    logger.debug(
      `>>> Queued strand for ${documentKey}, queue size: ${this.strandQueue.size}`,
    );
  }

  /**
   * Get all queued strands
   */
  public getQueuedStrands(): QueuedStrand[] {
    return Array.from(this.strandQueue.values());
  }

  /**
   * Clear and return all queued strands
   */
  public clearQueue(): QueuedStrand[] {
    const queuedStrands = Array.from(this.strandQueue.values());
    this.strandQueue.clear();
    return queuedStrands;
  }

  /**
   * Get the current queue size
   */
  public getQueueSize(): number {
    return this.strandQueue.size;
  }

  private async promptUserConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log("\n" + "=".repeat(50));
      console.log("🔄 Code generation ready to run.");
      console.log("=".repeat(50));

      process.stdout.write(
        "Do you want to proceed with code generation? (y/n): \n\n",
      );

      rl.on("line", (answer: string) => {
        rl.close();
        console.log(""); // Add blank line after user input
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }

  /**
   * Process generation with user confirmation (legacy single-strand method)
   * This method assumes interactive mode is already enabled (checked by caller)
   */
  public async processWithConfirmation<T>(
    documentType: string,
    generator: () => Promise<T>,
  ): Promise<T | null> {
    if (this.processingConfirmation) {
      logger.debug("Already processing confirmation, skipping");
      return null;
    }

    this.processingConfirmation = true;

    try {
      // Always prompt user since this method only called in interactive mode
      const shouldProceed = await this.promptUserConfirmation();

      if (!shouldProceed) {
        logger.info(`❌ Code generation cancelled by user for ${documentType}`);
        return null;
      }

      logger.info(`✅ User approved code generation for ${documentType}`);

      const result = await generator();
      return result;
    } catch (error) {
      logger.error(
        `❌ Error during interactive code generation for ${documentType}:`,
        error,
      );
      throw error;
    } finally {
      this.processingConfirmation = false;
    }
  }

  /**
   * Process all queued strands with a single user confirmation
   * This is the main method for queue-based interactive processing
   */
  public async processQueueWithConfirmation(
    processor: (strands: QueuedStrand[]) => Promise<void>,
  ): Promise<void> {
    if (this.processingConfirmation) {
      logger.debug(
        "Already processing confirmation, skipping queue processing",
      );
      return;
    }

    // Check if there are any strands to process
    let queuedStrands = this.getQueuedStrands();
    if (queuedStrands.length === 0) {
      logger.debug("No strands in queue to process");
      return;
    }

    this.processingConfirmation = true;

    try {
      // Prompt user for confirmation
      const shouldProceed = await this.promptUserConfirmation();

      if (!shouldProceed) {
        logger.info("❌ Code generation cancelled by user");
        // Clear the queue since user cancelled
        this.clearQueue();
        return;
      }

      // Get and clear the final queue state right before processing
      // (in case new strands were added while waiting for user input)
      queuedStrands = this.clearQueue();
      if (queuedStrands.length === 0) {
        logger.info("ℹ️ No documents to process");
        return;
      }

      logger.info(
        `✅ User approved code generation for ${queuedStrands.length} document(s)`,
      );

      // Process all queued strands
      await processor(queuedStrands);
      logger.info("✅ Code generation completed");
    } catch (error) {
      logger.error("❌ Error during interactive queue processing:", error);
      throw error;
    } finally {
      this.processingConfirmation = false;
    }
  }

  public setInteractiveMode(enabled: boolean): void {
    this.isInteractiveMode = enabled;
    logger.debug(`Interactive mode set to: ${enabled}`);
  }

  public isInteractive(): boolean {
    return this.isInteractiveMode;
  }

  public isProcessing(): boolean {
    return this.processingConfirmation;
  }
}
