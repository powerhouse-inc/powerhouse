#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bold, blue, green, red, gray } from "colorette";
import {
  GraphQLClient,
  DOCUMENT_MODEL_TYPE,
} from "@powerhousedao/load-test-client";
import type { Action } from "@powerhousedao/shared/document-model";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, "cli.ts");
const SWITCHBOARD_SERVER_PATH = path.resolve(
  __dirname,
  "../../../apps/switchboard/src/server.mts",
);

const PORT = 4001;
const CLIENT_COUNT = 4;
const DURATION = 15_000;
const MUTATION_INTERVAL = 1_000;
const DRAIN_MS = 30_000;

const VALID_DRIVE_TYPES = [
  "powerhouse/document-drive",
  "powerhouse/reactor-drive",
] as const;
type DriveType = (typeof VALID_DRIVE_TYPES)[number];
const DEFAULT_DRIVE_TYPE: DriveType = "powerhouse/document-drive";

function parseDriveType(argv: string[]): DriveType {
  const idx = argv.indexOf("--drive-type");
  if (idx === -1) return DEFAULT_DRIVE_TYPE;

  const value = argv[idx + 1];
  if (!value) {
    throw new Error(
      `--drive-type requires a value. Expected one of: ${VALID_DRIVE_TYPES.join(", ")}`,
    );
  }
  if (!VALID_DRIVE_TYPES.includes(value as DriveType)) {
    throw new Error(
      `Invalid --drive-type: ${value}. Expected one of: ${VALID_DRIVE_TYPES.join(", ")}`,
    );
  }
  return value as DriveType;
}

interface ChildState {
  label: string;
  proc: ChildProcess;
  exited: boolean;
  exitCode: number | null;
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
  const readyUrl = new URL("/ready", url).toString();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(readyUrl);
      if (res.ok) {
        return;
      }
    } catch {
      // server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Switchboard did not become ready at ${readyUrl} within ${timeoutMs}ms`,
  );
}

async function createDocument(
  client: GraphQLClient,
  driveType: DriveType,
): Promise<{ driveId: string; documentId: string }> {
  const drives = await client.findDrives(driveType);
  let driveId: string;

  if (drives.length === 0) {
    const drive = await client.createEmptyDocument(driveType);
    driveId = drive.id;
  } else {
    driveId = drives[0].id;
  }

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

async function main(): Promise<void> {
  const driveType = parseDriveType(process.argv.slice(2));

  const url = `http://localhost:${PORT}/graphql`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-integration-"));
  const runDir = path.join(tmpDir, "logs");
  const stateDir = path.join(tmpDir, "state");
  const switchboardDataDir = path.join(tmpDir, "switchboard-data");

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(switchboardDataDir, { recursive: true });

  const logs = createLogStreams(runDir);

  const totalDuration = DURATION + DRAIN_MS;
  console.log(bold(blue("=== Sync Integration Test ===")));
  console.log(`  Drive:    ${driveType}`);
  console.log(`  Clients:  ${CLIENT_COUNT}`);
  console.log(`  Duration: ${DURATION / 1000}s (+ ${DRAIN_MS / 1000}s drain)`);
  console.log(`  Rate:     1 op/sec`);
  console.log(`  Logs:     ${runDir}`);
  console.log();

  // Step 1: Start switchboard
  console.log(blue("Starting switchboard...") + " ");

  // This suite exercises the sync protocol, not on-disk durability. Forcing
  // switchboard to use in-memory PGLite keeps AtomicNodeFs's per-query
  // full-tree snapshot serialization out of the hot path so the test isn't
  // gated on filesystem throughput.
  const switchboardProc = spawn("tsx", [SWITCHBOARD_SERVER_PATH], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: switchboardDataDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      PH_PGLITE_IN_MEMORY: "1",
      PH_DEFAULT_DRIVE_TYPE: driveType,
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

  // Print switchboard output to console for diagnostics
  switchboardProc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      console.log(gray(`  [switchboard] ${text}`));
    }
  });
  switchboardProc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      console.error(gray(`  [switchboard] `) + red(text));
    }
  });

  // Step 2: Wait for ready
  try {
    await waitForSwitchboard(url, 30_000);
  } catch (error) {
    console.error(
      red("Switchboard failed to start:"),
      error instanceof Error ? error.message : error,
    );
    if (sbState.exited) {
      console.error(red(`  Switchboard exited with code ${sbState.exitCode}`));
    }
    switchboardProc.kill("SIGTERM");
    logs.close();
    process.exit(1);
  }

  console.log(green("ready"));

  // Step 3: Create shared document
  process.stdout.write(blue("Creating document...") + " ");

  const gqlClient = new GraphQLClient(url);
  let driveId: string;
  let documentId: string;

  try {
    const result = await createDocument(gqlClient, driveType);
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

  console.log(green("done") + gray(` (${documentId})`));

  // Step 4: Spawn clients
  console.log(blue(`Spawning ${CLIENT_COUNT} clients...`));

  const clientStates: ChildState[] = [];

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const label = `client-${i}`;
    const stateOutputPath = path.join(stateDir, `${label}.json`);

    const args = [
      CLI_PATH,
      "--url",
      url,
      "--drive-id",
      driveId,
      "--document-id",
      documentId,
      "--duration",
      String(DURATION),
      "--mutation-interval",
      String(MUTATION_INTERVAL),
      "--drain",
      String(DRAIN_MS),
      "--state-output",
      stateOutputPath,
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

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(gray(`  [${label}] `) + red(text));
      }
    });

    clientStates.push(state);
  }

  // Step 5: Wait for all clients to finish
  console.log(blue("Waiting for clients to finish..."));

  const clientTimeout = totalDuration + 60_000;
  await Promise.all(clientStates.map((c) => waitForExit(c, clientTimeout)));

  console.log();

  // Step 6: Check results
  let passed = true;

  // Check 1: All exit codes === 0
  const cleanExits = clientStates.filter((c) => c.exitCode === 0).length;
  if (cleanExits === CLIENT_COUNT) {
    console.log(
      green(
        `[PASS] All clients exited cleanly (${cleanExits}/${CLIENT_COUNT})`,
      ),
    );
  } else {
    passed = false;
    console.log(
      red(`[FAIL] Client exits: ${cleanExits}/${CLIENT_COUNT} clean`),
    );
    for (const c of clientStates) {
      if (c.exitCode !== 0) {
        console.log(red(`  ${c.label}: exit ${c.exitCode}`));
      }
    }
  }

  // Check 2: Zero dead letters
  const combinedLogPath = path.join(runDir, "combined.log");
  let deadLetterCount = 0;
  try {
    const combinedLog = fs.readFileSync(combinedLogPath, "utf-8");
    const matches = combinedLog.match(/DEAD LETTER/g);
    deadLetterCount = matches ? matches.length : 0;
  } catch {
    // Log file may not exist if everything failed early
  }

  if (deadLetterCount === 0) {
    console.log(green("[PASS] Zero dead letters"));
  } else {
    passed = false;
    console.log(red(`[FAIL] ${deadLetterCount} dead letter(s) found`));
  }

  // Check 3: All client states converged
  const states: Array<{ label: string; data: unknown }> = [];
  for (const c of clientStates) {
    const stateFile = path.join(stateDir, `${c.label}.json`);
    try {
      const raw = fs.readFileSync(stateFile, "utf-8");
      states.push({ label: c.label, data: JSON.parse(raw) });
    } catch {
      states.push({ label: c.label, data: null });
    }
  }

  const validStates = states.filter((s) => s.data !== null);
  if (validStates.length === 0) {
    passed = false;
    console.log(red("[FAIL] No state files found"));
  } else if (validStates.length < CLIENT_COUNT) {
    passed = false;
    const missing = states
      .filter((s) => s.data === null)
      .map((s) => s.label)
      .join(", ");
    console.log(red(`[FAIL] Missing state files for: ${missing}`));
  } else {
    // Compare all states against the first
    const referenceJson = JSON.stringify(
      (validStates[0].data as Record<string, unknown>).state,
    );
    let allMatch = true;

    for (let i = 1; i < validStates.length; i++) {
      const currentJson = JSON.stringify(
        (validStates[i].data as Record<string, unknown>).state,
      );
      if (currentJson !== referenceJson) {
        allMatch = false;
        console.log(
          red(
            `[FAIL] State mismatch: ${validStates[0].label} != ${validStates[i].label}`,
          ),
        );
      }
    }

    if (allMatch) {
      console.log(green("[PASS] All client states converged"));
    } else {
      passed = false;
    }
  }

  // Step 7: Kill switchboard and clean up
  if (!sbState.exited) {
    switchboardProc.kill("SIGTERM");
    await waitForExit(sbState, 10_000);
  }

  logs.close();

  console.log();
  if (passed) {
    console.log(bold(green("RESULT: PASS")));
  } else {
    console.log(bold(red("RESULT: FAIL")));
    console.log(gray(`  Logs: ${runDir}`));
  }

  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(
    red("Integration test crashed:"),
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
