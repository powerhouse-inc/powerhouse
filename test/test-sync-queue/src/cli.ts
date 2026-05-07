#!/usr/bin/env node

import { httpsHooksPath } from "@powerhousedao/reactor-api/https-hooks";
import { Command } from "commander";
import { register } from "node:module";
import { StateWatcher } from "./state-watcher.js";
import { SyncDriver } from "./sync-driver.js";
import type { WatcherConfig } from "./types.js";

const DEFAULT_REGISTRY_URL = "https://registry.dev.vetra.io/";

interface CliOptions {
  url: string;
  branch: string;
  registry: string;
  drainQuietMs: string;
  stallTimeoutMs: string;
  maxPolls: string;
  jwtEnv?: string;
  ringBufferSize: string;
  verbose: boolean;
}

const program = new Command();

program
  .name("ph-test-sync-queue")
  .description(
    "Manually drive sync polling against a Powerhouse drive and watch inbox/queue for stalls.",
  )
  .requiredOption(
    "--url <driveUrl>",
    "Drive REST URL (returns { id, graphqlEndpoint })",
  )
  .option("--branch <branch>", "Drive branch", "main")
  .option(
    "--registry <url>",
    "Powerhouse package registry URL for dynamic document model loading",
    DEFAULT_REGISTRY_URL,
  )
  .option(
    "--drain-quiet-ms <ms>",
    "How long the system must be idle before declaring drained",
    "1000",
  )
  .option(
    "--stall-timeout-ms <ms>",
    "Time without progress events before declaring a stall",
    "30000",
  )
  .option(
    "--max-polls <n>",
    "Maximum number of poll cycles before exiting (0 = unbounded)",
    "0",
  )
  .option(
    "--jwt-env <name>",
    "Name of an environment variable holding a bearer token",
  )
  .option(
    "--ring-buffer-size <n>",
    "Number of recent events to keep for stall dump",
    "200",
  )
  .option("--verbose", "Print every observed event as it fires", false)
  .action(async (options: CliOptions) => {
    const watcherConfig: WatcherConfig = {
      drainQuietMs: parsePositiveInt(options.drainQuietMs, "--drain-quiet-ms"),
      stallTimeoutMs: parsePositiveInt(
        options.stallTimeoutMs,
        "--stall-timeout-ms",
      ),
      maxPolls: parseNonNegativeInt(options.maxPolls, "--max-polls"),
      ringBufferSize: parsePositiveInt(
        options.ringBufferSize,
        "--ring-buffer-size",
      ),
      verbose: options.verbose,
    };

    const jwt =
      options.jwtEnv !== undefined ? readJwtFromEnv(options.jwtEnv) : undefined;

    register(httpsHooksPath, import.meta.url);

    const driver = new SyncDriver({
      url: options.url,
      branch: options.branch,
      registryUrl: options.registry,
      jwt,
    });

    console.log(
      `initializing reactor for drive at ${options.url} (registry=${options.registry})`,
    );
    try {
      await driver.init();
    } catch (err) {
      console.error("init failed:", (err as Error).message);
      process.exit(1);
    }
    console.log(
      `connected. driveId=${driver.getDriveId()} remoteName=${driver.getRemoteName()}`,
    );

    const watcher = new StateWatcher(driver, watcherConfig);

    let stopping = false;
    const shutdown = async (signal: string) => {
      if (stopping) return;
      stopping = true;
      console.log(`\nreceived ${signal}, stopping...`);
      watcher.stop();
      await driver.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    try {
      await watcher.run();
    } catch (err) {
      console.error("watcher errored:", (err as Error).message);
      await driver.shutdown();
      process.exit(1);
    }

    await driver.shutdown();
    process.exit(0);
  });

function parsePositiveInt(value: string, flag: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) {
    console.error(`Error: ${flag} must be a positive integer`);
    process.exit(1);
  }
  return n;
}

function parseNonNegativeInt(value: string, flag: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0) {
    console.error(`Error: ${flag} must be zero or a positive integer`);
    process.exit(1);
  }
  return n;
}

function readJwtFromEnv(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    console.error(
      `Error: --jwt-env=${envVar} but environment variable is empty`,
    );
    process.exit(1);
  }
  return value;
}

program.parse();
