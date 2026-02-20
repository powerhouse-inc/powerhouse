#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { bold, blue, green, red, gray, yellow } from "colorette";
import type { Action } from "document-model";
import {
  GraphQLClient,
  DOCUMENT_MODEL_TYPE,
} from "@powerhousedao/load-test-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, "cli.ts");
const SWITCHBOARD_SERVER_PATH = path.resolve(
  __dirname,
  "../../../apps/switchboard/src/server.ts",
);

interface OrchestratorOptions {
  port: string;
  clients: string;
  duration: string;
  mutationInterval: string;
  logDir: string;
}

interface ChildState {
  label: string;
  proc: ChildProcess;
  exited: boolean;
  exitCode: number | null;
}

interface RunInfo {
  startedAt: string;
  port: number;
  clients: number;
  duration: number;
  mutationInterval: number;
  driveId?: string;
  documentId?: string;
  logDir: string;
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

function createTimestampedDir(baseDir: string): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "");
  const dir = path.resolve(baseDir, timestamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createLogStreams(runDir: string): {
  combined: fs.WriteStream;
  forProcess: (label: string) => {
    stream: fs.WriteStream;
    pipe: (proc: ChildProcess) => void;
  };
  close: () => void;
} {
  const combinedStream = fs.createWriteStream(
    path.join(runDir, "combined.log"),
    { flags: "a" },
  );
  const streams: fs.WriteStream[] = [combinedStream];

  return {
    combined: combinedStream,
    forProcess(label: string) {
      const stream = fs.createWriteStream(path.join(runDir, `${label}.log`), {
        flags: "a",
      });
      streams.push(stream);

      return {
        stream,
        pipe(proc: ChildProcess) {
          let stdoutBuf = "";
          proc.stdout?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            stream.write(text);

            stdoutBuf += text;
            const lines = stdoutBuf.split("\n");
            stdoutBuf = lines.pop() ?? "";
            for (const line of lines) {
              const clean = line.split("\r").pop()?.trim();
              if (clean) {
                combinedStream.write(`[${label}] ${clean}\n`);
              }
            }
          });

          proc.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            stream.write(text);

            const lines = text.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                combinedStream.write(`[${label}] [stderr] ${trimmed}\n`);
              }
            }
          });
        },
      };
    },
    close() {
      for (const s of streams) {
        s.end();
      }
    },
  };
}

async function waitForSwitchboard(
  url: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  const client = new GraphQLClient(url);

  while (Date.now() - start < timeoutMs) {
    const connected = await client.testConnection();
    if (connected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Switchboard did not become ready at ${url} within ${timeoutMs}ms`,
  );
}

async function createDocument(
  client: GraphQLClient,
): Promise<{ driveId: string; documentId: string }> {
  const drives = await client.findDrives();
  let driveId: string;

  if (drives.length === 0) {
    console.log(blue("No drives found, creating one..."));
    const drive = await client.createEmptyDocument("powerhouse/document-drive");
    driveId = drive.id;
  } else {
    driveId = drives[0].id;
  }

  console.log(blue(`Using drive: ${driveId}`));

  const doc = await client.createEmptyDocument(DOCUMENT_MODEL_TYPE, driveId);
  const documentName =
    doc.name ||
    `TestDoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const addFileAction = createAddFileAction(
    doc.id,
    documentName,
    DOCUMENT_MODEL_TYPE,
  );
  await client.mutateDocument(driveId, [addFileAction]);

  return { driveId, documentId: doc.id };
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

function printSummary(children: ChildState[], runDir: string): void {
  const clients = children.filter((c) => c.label.startsWith("client-"));
  const switchboard = children.find((c) => c.label === "switchboard");

  const total = clients.length;
  const clean = clients.filter((c) => c.exitCode === 0).length;
  const crashed = clients.filter(
    (c) => c.exitCode !== null && c.exitCode !== 0,
  ).length;
  const stillRunning = clients.filter((c) => !c.exited).length;

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
  for (const child of clients) {
    const status =
      child.exitCode === 0
        ? green("OK")
        : child.exitCode !== null
          ? red(`exit ${child.exitCode}`)
          : yellow("running");
    console.log(`  ${child.label}: ${status}`);
  }
  if (switchboard) {
    const sbStatus = switchboard.exited
      ? switchboard.exitCode === 0
        ? green("stopped")
        : red(`exit ${switchboard.exitCode}`)
      : yellow("running");
    console.log(`  switchboard: ${sbStatus}`);
  }
  console.log();
  console.log(`  Logs: ${runDir}`);
  console.log(bold(blue("========================================")));
}

const program = new Command();

program
  .name("ph-sync-orchestrator")
  .description(
    "Multi-client sync test orchestrator with switchboard management",
  )
  .option("--port <port>", "Switchboard port", "4001")
  .option("--clients <n>", "Number of concurrent client processes", "3")
  .option("--duration <ms>", "Test duration in milliseconds", "60000")
  .option(
    "--mutation-interval <ms>",
    "Mutation interval passed to each child in milliseconds",
    "2000",
  )
  .option("--log-dir <path>", "Base directory for log output", "./logs")
  .action(async (options: OrchestratorOptions) => {
    const port = parseInt(options.port, 10);
    const clientCount = parseInt(options.clients, 10);
    const duration = parseInt(options.duration, 10);
    const mutationInterval = parseInt(options.mutationInterval, 10);

    if (isNaN(port) || port <= 0) {
      console.error("Error: --port must be a positive number");
      process.exit(1);
    }
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

    const url = `http://localhost:${port}/graphql`;

    // Step 1: Create timestamped log directory
    const runDir = createTimestampedDir(options.logDir);
    const switchboardDataDir = path.join(runDir, "switchboard-data");
    fs.mkdirSync(switchboardDataDir, { recursive: true });

    const logs = createLogStreams(runDir);

    const runInfo: RunInfo = {
      startedAt: new Date().toISOString(),
      port,
      clients: clientCount,
      duration,
      mutationInterval,
      logDir: runDir,
    };

    console.log(bold(blue("=== Sync Orchestrator ===")));
    console.log(`  Port:              ${port}`);
    console.log(`  Clients:           ${clientCount}`);
    console.log(`  Duration:          ${duration / 1000}s`);
    console.log(`  Mutation interval: ${mutationInterval}ms`);
    console.log(`  Logs:              ${runDir}`);
    console.log();

    // Step 2: Spawn switchboard
    console.log(blue("Starting switchboard..."));

    const allChildren: ChildState[] = [];

    const switchboardProc = spawn("tsx", [SWITCHBOARD_SERVER_PATH], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: switchboardDataDir,
      env: {
        ...process.env,
        PORT: String(port),
      },
    });

    const sbState: ChildState = {
      label: "switchboard",
      proc: switchboardProc,
      exited: false,
      exitCode: null,
    };

    switchboardProc.on("exit", (code) => {
      sbState.exited = true;
      sbState.exitCode = code;
    });

    const sbLog = logs.forProcess("switchboard");
    sbLog.pipe(switchboardProc);
    allChildren.push(sbState);

    // Step 3: Wait for switchboard to be ready
    try {
      await waitForSwitchboard(url, 30_000);
    } catch (error) {
      console.error(
        red("Switchboard failed to start:"),
        error instanceof Error ? error.message : error,
      );
      switchboardProc.kill("SIGTERM");
      logs.close();
      process.exit(1);
    }

    console.log(green("Switchboard ready at ") + url);

    // Step 4: Create drive + document via GraphQL
    console.log(blue("Creating shared document..."));

    const client = new GraphQLClient(url);
    let driveId: string;
    let documentId: string;

    try {
      const result = await createDocument(client);
      driveId = result.driveId;
      documentId = result.documentId;
    } catch (error) {
      console.error(
        red("Failed to create document:"),
        error instanceof Error ? error.message : error,
      );
      switchboardProc.kill("SIGTERM");
      logs.close();
      process.exit(1);
    }

    runInfo.driveId = driveId;
    runInfo.documentId = documentId;

    fs.writeFileSync(
      path.join(runDir, "run-info.json"),
      JSON.stringify(runInfo, null, 2),
    );

    console.log(green(`Document created: ${documentId}`));
    console.log(gray(`Drive: ${driveId}`));
    console.log();

    // Step 5: Spawn N test-connect client child processes
    console.log(
      bold(blue(`Spawning ${clientCount} clients for ${duration / 1000}s...`)),
    );

    for (let i = 0; i < clientCount; i++) {
      const label = `client-${i}`;
      const args = [
        CLI_PATH,
        "--url",
        url,
        "--drive-id",
        driveId,
        "--document-id",
        documentId,
        "--duration",
        String(duration),
        "--mutation-interval",
        String(mutationInterval),
        "--verbose",
      ];

      const proc = spawn("tsx", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const state: ChildState = {
        label,
        proc,
        exited: false,
        exitCode: null,
      };

      proc.on("exit", (code) => {
        state.exited = true;
        state.exitCode = code;
      });

      const clientLog = logs.forProcess(label);
      clientLog.pipe(proc);

      // Also print stderr to console for visibility
      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          console.error(gray(`[${label}] `) + red(text));
        }
      });

      allChildren.push(state);
    }

    // Step 6: Heartbeat timer
    const startTime = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const total = Math.round(duration / 1000);
      const clientChildren = allChildren.filter((c) =>
        c.label.startsWith("client-"),
      );
      const active = clientChildren.filter((c) => !c.exited).length;
      const crashed = clientChildren.filter(
        (c) => c.exited && c.exitCode !== 0,
      ).length;

      const status = `Orchestrator [${elapsed}s / ${total}s] | Active: ${active}/${clientCount} | Crashed: ${crashed} | SB: ${sbState.exited ? "down" : "up"}`;
      process.stdout.write("\r" + " ".repeat(120) + "\r");
      process.stdout.write(blue(status));
    }, 1000);

    // Step 7: SIGINT / SIGTERM handling
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;

      clearInterval(heartbeat);
      process.stdout.write("\n");
      console.log(yellow(`Received ${signal}, shutting down...`));

      // Kill clients first
      const clientChildren = allChildren.filter((c) =>
        c.label.startsWith("client-"),
      );
      for (const child of clientChildren) {
        if (!child.exited) {
          child.proc.kill("SIGTERM");
        }
      }

      await Promise.all(clientChildren.map((c) => waitForExit(c, 10_000)));

      // Then kill switchboard
      if (!sbState.exited) {
        switchboardProc.kill("SIGTERM");
      }

      await waitForExit(sbState, 10_000);

      printSummary(allChildren, runDir);
      logs.close();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    // Step 8: Wait for all clients to finish
    const clientChildren = allChildren.filter((c) =>
      c.label.startsWith("client-"),
    );
    await Promise.all(
      clientChildren.map((c) => waitForExit(c, duration + 30_000)),
    );

    clearInterval(heartbeat);
    process.stdout.write("\r" + " ".repeat(120) + "\r");

    // Step 9: Kill switchboard and clean up
    if (!sbState.exited) {
      console.log(blue("Stopping switchboard..."));
      switchboardProc.kill("SIGTERM");
      await waitForExit(sbState, 10_000);
    }

    printSummary(allChildren, runDir);
    logs.close();

    const crashedClients = clientChildren.filter(
      (c) => c.exitCode !== null && c.exitCode !== 0,
    );
    process.exit(crashedClients.length > 0 ? 1 : 0);
  });

program.parse();
