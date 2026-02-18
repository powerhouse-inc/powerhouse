#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Command } from "commander";
import { bold, blue, green, red, gray, yellow } from "colorette";
import type { Action } from "document-model";
import { GraphQLClient } from "./client/graphql-client.js";
import { DOCUMENT_MODEL_TYPE } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, "cli.ts");

interface OrchestratorOptions {
  url: string;
  clients: string;
  duration: string;
  mutationInterval: string;
  verbose: boolean;
}

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

async function createDocument(
  client: GraphQLClient,
  url: string,
): Promise<string> {
  console.log(blue("Connecting to"), url);

  const connected = await client.testConnection();
  if (!connected) {
    throw new Error(`Failed to connect to ${url}`);
  }

  const drives = await client.findDrives();
  if (drives.length === 0) {
    throw new Error("No drives found. Please create a drive first.");
  }

  const drive = drives[0];
  console.log(blue(`Using drive: ${drive.id}`));

  const doc = await client.createEmptyDocument(DOCUMENT_MODEL_TYPE, drive.id);
  const documentName =
    doc.name ||
    `TestDoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const addFileAction = createAddFileAction(
    doc.id,
    documentName,
    DOCUMENT_MODEL_TYPE,
  );
  await client.mutateDocument(drive.id, [addFileAction]);

  return doc.id;
}

interface ChildState {
  index: number;
  proc: ChildProcess;
  exited: boolean;
  exitCode: number | null;
}

function spawnClients(
  count: number,
  url: string,
  documentId: string,
  duration: string,
  mutationInterval: string,
  verbose: boolean,
): ChildState[] {
  const children: ChildState[] = [];

  for (let i = 0; i < count; i++) {
    const args = [
      CLI_PATH,
      "--url",
      url,
      "--document-id",
      documentId,
      "--duration",
      duration,
      "--mutation-interval",
      mutationInterval,
    ];

    const proc = spawn("tsx", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const state: ChildState = { index: i, proc, exited: false, exitCode: null };

    const prefix = gray(`[client-${i}] `);

    // Buffer stdout and only forward \n-terminated lines (skip \r progress bars)
    let stdoutBuf = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      // Keep the last incomplete segment in the buffer
      stdoutBuf = lines.pop() ?? "";
      if (verbose) {
        for (const line of lines) {
          // Strip any \r-based progress fragments: take the last \r segment
          const clean = line.split("\r").pop()?.trim();
          if (clean) {
            console.log(prefix + clean);
          }
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(prefix + red(text));
      }
    });

    proc.on("exit", (code) => {
      state.exited = true;
      state.exitCode = code;
    });

    children.push(state);
  }

  return children;
}

function waitForExit(child: ChildState, timeoutMs: number): Promise<void> {
  if (child.exited) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolve();
    }, timeoutMs);
    child.proc.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const program = new Command();

program
  .name("ph-orchestrator")
  .description("Multi-client concurrent load test orchestrator")
  .requiredOption("--url <url>", "Switchboard GraphQL endpoint URL")
  .option("--clients <n>", "Number of concurrent client processes", "3")
  .option("--duration <ms>", "Test duration in milliseconds", "60000")
  .option(
    "--mutation-interval <ms>",
    "Mutation interval passed to each child in milliseconds",
    "2000",
  )
  .option("--verbose", "Forward child output with [client-N] prefix", false)
  .action(async (options: OrchestratorOptions) => {
    const clientCount = parseInt(options.clients, 10);
    const duration = parseInt(options.duration, 10);
    const mutationInterval = parseInt(options.mutationInterval, 10);

    if (isNaN(clientCount) || clientCount <= 0) {
      console.error("Error: --clients must be a positive number");
      process.exit(1);
    }
    if (isNaN(duration) || duration <= 0) {
      console.error("Error: --duration must be a positive number");
      process.exit(1);
    }
    if (isNaN(mutationInterval) || mutationInterval <= 0) {
      console.error("Error: --mutation-interval must be a positive number");
      process.exit(1);
    }

    // Step 1: Create the shared document
    console.log(bold(blue("=== Orchestrator: Creating shared document ===")));
    const client = new GraphQLClient(options.url);
    let documentId: string;

    try {
      documentId = await createDocument(client, options.url);
    } catch (error) {
      console.error(
        red("Failed to create document:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }

    console.log(green(`Document created: ${documentId}`));
    console.log();

    // Step 2: Spawn N children
    console.log(
      bold(
        blue(
          `=== Orchestrator: Spawning ${clientCount} clients for ${duration / 1000}s ===`,
        ),
      ),
    );

    const children = spawnClients(
      clientCount,
      options.url,
      documentId,
      options.duration,
      options.mutationInterval,
      options.verbose,
    );

    // Step 3: Heartbeat timer
    const startTime = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const total = Math.round(duration / 1000);
      const active = children.filter((c) => !c.exited).length;
      const crashed = children.filter(
        (c) => c.exited && c.exitCode !== 0,
      ).length;

      const status = `Orchestrator [${elapsed}s / ${total}s] | Active clients: ${active}/${clientCount} | Crashed: ${crashed}`;
      process.stdout.write("\r" + " ".repeat(100) + "\r");
      process.stdout.write(blue(status));
    }, 1000);

    // Step 4: SIGINT / SIGTERM handling
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;

      clearInterval(heartbeat);
      process.stdout.write("\n");
      console.log(yellow(`Received ${signal}, shutting down children...`));

      for (const child of children) {
        if (!child.exited) {
          child.proc.kill("SIGTERM");
        }
      }

      await Promise.all(children.map((c) => waitForExit(c, 10_000)));
      printSummary(children);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Step 5: Wait for all children to finish
    await Promise.all(children.map((c) => waitForExit(c, duration + 30_000)));
    clearInterval(heartbeat);
    process.stdout.write("\r" + " ".repeat(100) + "\r");

    printSummary(children);

    const crashed = children.filter(
      (c) => c.exitCode !== null && c.exitCode !== 0,
    );
    process.exit(crashed.length > 0 ? 1 : 0);
  });

function printSummary(children: ChildState[]): void {
  const total = children.length;
  const clean = children.filter((c) => c.exitCode === 0).length;
  const crashed = children.filter(
    (c) => c.exitCode !== null && c.exitCode !== 0,
  ).length;
  const stillRunning = children.filter((c) => !c.exited).length;

  console.log();
  console.log(bold(blue("========================================")));
  console.log(bold(blue("       ORCHESTRATOR SUMMARY             ")));
  console.log(bold(blue("========================================")));
  console.log(`  Total clients:    ${total}`);
  console.log(`  Clean exits:      ${green(String(clean))}`);
  if (crashed > 0) {
    console.log(`  Crashed:          ${red(String(crashed))}`);
  } else {
    console.log(`  Crashed:          ${green("0")}`);
  }
  if (stillRunning > 0) {
    console.log(`  Still running:    ${yellow(String(stillRunning))}`);
  }
  for (const child of children) {
    const status =
      child.exitCode === 0
        ? green("OK")
        : child.exitCode !== null
          ? red(`exit ${child.exitCode}`)
          : yellow("running");
    console.log(`  client-${child.index}: ${status}`);
  }
  console.log(bold(blue("========================================")));
}

program.parse();
