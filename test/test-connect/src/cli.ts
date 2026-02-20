#!/usr/bin/env node

import { Command } from "commander";
import { ConnectTestScheduler } from "./scheduler.js";
import type { ConnectTestConfig } from "./types.js";

interface CliOptions {
  url: string;
  driveId: string;
  documentId: string;
  duration: string;
  mutationInterval: string;
  verbose: boolean;
}

const program = new Command();

program
  .name("ph-load-test-connect")
  .description("Load testing CLI that simulates Connect sync to a Switchboard")
  .requiredOption("--url <url>", "Switchboard GraphQL endpoint URL")
  .requiredOption("--drive-id <id>", "Remote drive ID to sync")
  .requiredOption("--document-id <id>", "Document ID to target with actions")
  .option("--duration <ms>", "Test duration in milliseconds", "60000")
  .option(
    "--mutation-interval <ms>",
    "Interval between action batches in milliseconds",
    "5000",
  )
  .option("--verbose", "Enable verbose logging", false)
  .action(async (options: CliOptions) => {
    const config: ConnectTestConfig = {
      url: options.url,
      driveId: options.driveId,
      documentId: options.documentId,
      duration: parseInt(options.duration, 10),
      mutationInterval: parseInt(options.mutationInterval, 10),
      verbose: options.verbose,
    };

    if (isNaN(config.duration) || config.duration <= 0) {
      console.error("Error: --duration must be a positive number");
      process.exit(1);
    }
    if (isNaN(config.mutationInterval) || config.mutationInterval <= 0) {
      console.error("Error: --mutation-interval must be a positive number");
      process.exit(1);
    }

    const scheduler = new ConnectTestScheduler(config);

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
      process.exit(0);
    } catch (error) {
      console.error(
        "Load test failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });

program.parse();
