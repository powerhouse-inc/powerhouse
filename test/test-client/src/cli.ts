#!/usr/bin/env node

import { Command } from "commander";
import { TestScheduler } from "./scheduler/scheduler.js";
import type { LoadTestConfig } from "./types.js";

interface CliOptions {
  url: string;
  duration: string;
  documentInterval: string;
  mutationInterval: string;
  verbose: boolean;
  singleDocument: boolean;
  queryMode: boolean;
  documentId?: string;
}

const program = new Command();

program
  .name("ph-load-test")
  .description("Load testing CLI for Powerhouse Switchboard Reactor")
  .requiredOption("--url <url>", "Switchboard GraphQL endpoint URL")
  .option("--duration <ms>", "Test duration in milliseconds", "60000")
  .option(
    "--document-interval <ms>",
    "Interval for creating new documents in milliseconds",
    "10000",
  )
  .option(
    "--mutation-interval <ms>",
    "Interval for sending mutations per document in milliseconds",
    "5000",
  )
  .option(
    "--single-document",
    "Create only one document, then apply operations to it",
    false,
  )
  .option(
    "--query-mode",
    "Query existing documents instead of creating new ones",
    false,
  )
  .option(
    "--document-id <id>",
    "Target an existing document ID (skip document creation)",
  )
  .option("--verbose", "Enable verbose logging", false)
  .action(async (options: CliOptions) => {
    const config: LoadTestConfig = {
      url: options.url,
      duration: parseInt(options.duration, 10),
      documentInterval: parseInt(options.documentInterval, 10),
      mutationInterval: parseInt(options.mutationInterval, 10),
      verbose: options.verbose,
      singleDocument: options.singleDocument,
      queryMode: options.queryMode,
      documentId: options.documentId,
    };

    // Validate config
    if (isNaN(config.duration) || config.duration <= 0) {
      console.error("Error: --duration must be a positive number");
      process.exit(1);
    }
    if (isNaN(config.documentInterval) || config.documentInterval <= 0) {
      console.error("Error: --document-interval must be a positive number");
      process.exit(1);
    }
    if (isNaN(config.mutationInterval) || config.mutationInterval <= 0) {
      console.error("Error: --mutation-interval must be a positive number");
      process.exit(1);
    }

    const scheduler = new TestScheduler(config);

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\nReceived SIGINT, stopping...");
      await scheduler.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nReceived SIGTERM, stopping...");
      await scheduler.stop();
      process.exit(0);
    });

    try {
      await scheduler.start();
    } catch (error) {
      console.error(
        "Load test failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

program.parse();
