#!/usr/bin/env node
/**
 * Log analysis script for sync stress test results.
 * Usage: npx tsx src/analyze-logs.ts <log-dir>
 * Example: npx tsx src/analyze-logs.ts logs/2026-02-19T20-44-39
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const LOG_DIR = process.argv[2];
if (!LOG_DIR) {
  console.error("Usage: npx tsx src/analyze-logs.ts <log-dir>");
  process.exit(1);
}

const absLogDir = path.resolve(LOG_DIR);

// ── Types ──

interface GqlEvent {
  timestamp: string;
  channelId: string;
  operation: string;
  direction: "request" | "response";
  client: string;
  status?: number;
  hasErrors?: boolean;
  ackOrdinal?: number;
  envelopeCount?: number;
  deadLetterCount?: number;
  pushOpCount?: number;
}

interface DeadLetter {
  timestamp: string;
  client: string;
  documentId: string;
  jobId: string;
  branch: string;
  operationCount: number;
  error: string;
  errorCategory: string;
}

interface ReshuffleEvent {
  timestamp: string;
  client: string;
  attempt: number;
}

interface ClientTimeline {
  firstActivity: string;
  lastActivity: string;
  gqlRequests: number;
  gqlResponses: number;
  polls: number;
  pushes: number;
  touches: number;
  pushSuccesses: number;
  pushFailures: number;
  deadLetters: number;
  reshuffles: number;
  opsExecutedLocally: number;
  opsPushed: number;
  opsReceived: number;
  maxAckOrdinal: number;
  pollDeadLettersReported: number;
}

// ── Parsers ──

function parseTimestamp(line: string): string | null {
  const m = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{2})\]/);
  return m ? m[1] : null;
}

function parseGqlEvent(line: string, client: string): GqlEvent | null {
  // Request: [14:09:39.45] [reactor] GQL request <channelId> <Operation> <url> vars=<json>
  const reqMatch = line.match(
    /\[(\d{2}:\d{2}:\d{2}\.\d{2})\].*GQL request (\S+) (\S+) (\S+) vars=(.*)/,
  );
  if (reqMatch) {
    const evt: GqlEvent = {
      timestamp: reqMatch[1],
      channelId: reqMatch[2],
      operation: reqMatch[3],
      direction: "request",
      client,
    };
    if (evt.operation === "PushSyncEnvelopes") {
      // Count operations in push payload
      const varsStr = reqMatch[5];
      const opMatches = varsStr.match(/"operation":\{/g);
      evt.pushOpCount = opMatches ? opMatches.length : 0;
    }
    return evt;
  }

  // Response: [14:09:39.47] [reactor] GQL response <channelId> <Operation> status=<N> data=<json> errors=<json|none>
  const resMatch = line.match(
    /\[(\d{2}:\d{2}:\d{2}\.\d{2})\].*GQL response (\S+) (\S+) status=(\d+) data=(.*?) errors=(.*)/,
  );
  if (resMatch) {
    const evt: GqlEvent = {
      timestamp: resMatch[1],
      channelId: resMatch[2],
      operation: resMatch[3],
      direction: "response",
      client,
      status: parseInt(resMatch[4], 10),
      hasErrors: resMatch[6] !== "none",
    };

    if (evt.operation === "PollSyncEnvelopes") {
      const dataStr = resMatch[5];
      // Extract ackOrdinal
      const ackMatch = dataStr.match(/"ackOrdinal":(\d+)/);
      evt.ackOrdinal = ackMatch ? parseInt(ackMatch[1], 10) : 0;
      // Count envelopes
      const envMatches = dataStr.match(/"type":"OPERATIONS"/g);
      evt.envelopeCount = envMatches ? envMatches.length : 0;
      // Count dead letters in poll response
      const dlMatch = dataStr.match(/"deadLetters":\[([^\]]*)\]/);
      if (dlMatch && dlMatch[1].trim().length > 0) {
        const dlItems = dlMatch[1].match(/"type"/g);
        evt.deadLetterCount = dlItems ? dlItems.length : 0;
      } else {
        evt.deadLetterCount = 0;
      }
    }
    return evt;
  }

  return null;
}

function parseDeadLetter(line: string, client: string): DeadLetter | null {
  const m = line.match(
    /\[SYNC\] DEAD LETTER: documentId=(\S+) jobId=(\S*) branch=(\S*) operations=(\d+) error=(.*)/,
  );
  if (!m) return null;

  const error = m[5];
  let errorCategory = "unknown";
  if (error.includes("Excessive reshuffle")) {
    errorCategory = "excessive-reshuffle";
  } else if (error.includes("Job failed after")) {
    errorCategory = "job-retry-exhausted";
  } else if (error.includes("GraphQL errors")) {
    errorCategory = "graphql-push-error";
  } else if (error.includes("ChannelError[outbox]")) {
    errorCategory = "outbox-error";
  } else if (error.includes("ChannelError[inbox]")) {
    errorCategory = "inbox-error";
  }

  const ts = parseTimestamp(line);

  return {
    timestamp: ts ?? "",
    client,
    documentId: m[1],
    jobId: m[2] || "(empty)",
    branch: m[3] || "(empty)",
    operationCount: parseInt(m[4], 10),
    error,
    errorCategory,
  };
}

function parseReshuffle(line: string, client: string): ReshuffleEvent | null {
  const m = line.match(/\[Attempt (\d+)\] Excessive reshuffle/);
  if (!m) return null;
  const ts = parseTimestamp(line);
  return {
    timestamp: ts ?? "",
    client,
    attempt: parseInt(m[1], 10),
  };
}

function parseLocalOps(line: string): number {
  const m = line.match(/Executed (\d+) ops locally/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Main analysis ──

async function processClientLog(
  filePath: string,
  client: string,
): Promise<{
  gqlEvents: GqlEvent[];
  deadLetters: DeadLetter[];
  reshuffles: ReshuffleEvent[];
  timeline: ClientTimeline;
}> {
  const gqlEvents: GqlEvent[] = [];
  const deadLetters: DeadLetter[] = [];
  const reshuffles: ReshuffleEvent[] = [];
  const timeline: ClientTimeline = {
    firstActivity: "",
    lastActivity: "",
    gqlRequests: 0,
    gqlResponses: 0,
    polls: 0,
    pushes: 0,
    touches: 0,
    pushSuccesses: 0,
    pushFailures: 0,
    deadLetters: 0,
    reshuffles: 0,
    opsExecutedLocally: 0,
    opsPushed: 0,
    opsReceived: 0,
    maxAckOrdinal: 0,
    pollDeadLettersReported: 0,
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const ts = parseTimestamp(line);
    if (ts) {
      if (!timeline.firstActivity) timeline.firstActivity = ts;
      timeline.lastActivity = ts;
    }

    const gql = parseGqlEvent(line, client);
    if (gql) {
      gqlEvents.push(gql);
      if (gql.direction === "request") {
        timeline.gqlRequests++;
        if (gql.operation === "PollSyncEnvelopes") timeline.polls++;
        if (gql.operation === "PushSyncEnvelopes") {
          timeline.pushes++;
          timeline.opsPushed += gql.pushOpCount ?? 0;
        }
        if (gql.operation === "TouchChannel") timeline.touches++;
      } else {
        timeline.gqlResponses++;
        if (gql.operation === "PushSyncEnvelopes") {
          if (gql.hasErrors) timeline.pushFailures++;
          else timeline.pushSuccesses++;
        }
        if (gql.operation === "PollSyncEnvelopes") {
          if (
            gql.ackOrdinal !== undefined &&
            gql.ackOrdinal > timeline.maxAckOrdinal
          ) {
            timeline.maxAckOrdinal = gql.ackOrdinal;
          }
          timeline.opsReceived += gql.envelopeCount ?? 0;
          timeline.pollDeadLettersReported += gql.deadLetterCount ?? 0;
        }
      }
      continue;
    }

    const dl = parseDeadLetter(line, client);
    if (dl) {
      deadLetters.push(dl);
      timeline.deadLetters++;
      continue;
    }

    const rs = parseReshuffle(line, client);
    if (rs) {
      reshuffles.push(rs);
      timeline.reshuffles++;
      continue;
    }

    const localOps = parseLocalOps(line);
    if (localOps > 0) {
      timeline.opsExecutedLocally += localOps;
    }
  }

  return { gqlEvents, deadLetters, reshuffles, timeline };
}

interface SwitchboardStats {
  totalLines: number;
  errorLines: number;
  reshuffleLines: number;
  deadLetterLogLines: number;
  jobFailedLines: number;
  channelRegistrations: number;
  firstTimestamp: string;
  lastTimestamp: string;
  errorSamples: string[];
}

async function processSwitchboardLog(
  filePath: string,
): Promise<SwitchboardStats> {
  const stats: SwitchboardStats = {
    totalLines: 0,
    errorLines: 0,
    reshuffleLines: 0,
    deadLetterLogLines: 0,
    jobFailedLines: 0,
    channelRegistrations: 0,
    firstTimestamp: "",
    lastTimestamp: "",
    errorSamples: [],
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    stats.totalLines++;

    const ts = parseTimestamp(line);
    if (ts) {
      if (!stats.firstTimestamp) stats.firstTimestamp = ts;
      stats.lastTimestamp = ts;
    }

    if (
      line.includes("error") ||
      line.includes("Error") ||
      line.includes("ERROR")
    ) {
      stats.errorLines++;
      if (stats.errorSamples.length < 20) {
        // Truncate long lines
        stats.errorSamples.push(
          line.length > 300 ? line.slice(0, 300) + "..." : line,
        );
      }
    }

    if (line.includes("Excessive reshuffle")) stats.reshuffleLines++;
    if (line.includes("Dead letter") || line.includes("dead letter"))
      stats.deadLetterLogLines++;
    if (line.includes("Job failed") || line.includes("job failed"))
      stats.jobFailedLines++;
    if (line.includes("touchChannel") || line.includes("TouchChannel"))
      stats.channelRegistrations++;
  }

  return stats;
}

// ── Timeline bucketing ──

function bucketBySecond(
  events: Array<{ timestamp: string; client: string }>,
): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const evt of events) {
    // Round to second
    const sec = evt.timestamp.slice(0, 8); // HH:MM:SS
    buckets.set(sec, (buckets.get(sec) ?? 0) + 1);
  }
  return buckets;
}

function printTimeline(
  title: string,
  buckets: Map<string, number>,
  maxBarWidth = 60,
): void {
  if (buckets.size === 0) {
    console.log(`\n${title}: (none)`);
    return;
  }

  const sorted = [...buckets.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const maxCount = Math.max(...sorted.map(([, v]) => v));

  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  for (const [sec, count] of sorted) {
    const barLen = Math.max(1, Math.round((count / maxCount) * maxBarWidth));
    const bar = "#".repeat(barLen);
    console.log(`  ${sec} | ${bar} ${count}`);
  }
}

// ── Report ──

async function main() {
  console.log("=".repeat(72));
  console.log("  SYNC STRESS TEST LOG ANALYSIS");
  console.log(`  Log directory: ${absLogDir}`);
  console.log("=".repeat(72));

  // Read run-info
  const runInfoPath = path.join(absLogDir, "run-info.json");
  if (fs.existsSync(runInfoPath)) {
    const runInfo = JSON.parse(fs.readFileSync(runInfoPath, "utf-8")) as {
      startedAt: string;
      port: number;
      clients: number;
      duration: number;
      mutationInterval: number;
      driveId: string;
      documentId: string;
    };
    console.log(`\n  Started:           ${runInfo.startedAt}`);
    console.log(`  Port:              ${runInfo.port}`);
    console.log(`  Clients:           ${runInfo.clients}`);
    console.log(`  Duration:          ${runInfo.duration / 1000}s`);
    console.log(`  Mutation interval: ${runInfo.mutationInterval}ms`);
    console.log(`  Drive ID:          ${runInfo.driveId}`);
    console.log(`  Document ID:       ${runInfo.documentId}`);
  }

  // Process client logs
  const clientFiles = fs
    .readdirSync(absLogDir)
    .filter((f) => f.startsWith("client-") && f.endsWith(".log"))
    .sort();

  const allGqlEvents: GqlEvent[] = [];
  const allDeadLetters: DeadLetter[] = [];
  const allReshuffles: ReshuffleEvent[] = [];
  const clientTimelines: Map<string, ClientTimeline> = new Map();

  for (const file of clientFiles) {
    const client = file.replace(".log", "");
    const result = await processClientLog(path.join(absLogDir, file), client);
    allGqlEvents.push(...result.gqlEvents);
    allDeadLetters.push(...result.deadLetters);
    allReshuffles.push(...result.reshuffles);
    clientTimelines.set(client, result.timeline);
  }

  // ── Section 1: Per-client summary ──
  console.log("\n" + "=".repeat(72));
  console.log("  1. PER-CLIENT SUMMARY");
  console.log("=".repeat(72));

  const header = [
    "Client",
    "GQL Req",
    "Polls",
    "Pushes",
    "Push OK",
    "Push Fail",
    "Dead Ltrs",
    "Reshuffles",
    "Local Ops",
    "Ops Pushed",
    "Max Ack",
  ];
  console.log("\n  " + header.map((h) => h.padEnd(11)).join(""));
  console.log("  " + "-".repeat(header.length * 11));

  for (const [client, tl] of clientTimelines) {
    const row = [
      client,
      String(tl.gqlRequests),
      String(tl.polls),
      String(tl.pushes),
      String(tl.pushSuccesses),
      String(tl.pushFailures),
      String(tl.deadLetters),
      String(tl.reshuffles),
      String(tl.opsExecutedLocally),
      String(tl.opsPushed),
      String(tl.maxAckOrdinal),
    ];
    console.log("  " + row.map((v) => v.padEnd(11)).join(""));
  }

  // Totals
  const totals = {
    gqlRequests: 0,
    polls: 0,
    pushes: 0,
    pushSuccesses: 0,
    pushFailures: 0,
    deadLetters: 0,
    reshuffles: 0,
    opsExecutedLocally: 0,
    opsPushed: 0,
  };
  for (const tl of clientTimelines.values()) {
    totals.gqlRequests += tl.gqlRequests;
    totals.polls += tl.polls;
    totals.pushes += tl.pushes;
    totals.pushSuccesses += tl.pushSuccesses;
    totals.pushFailures += tl.pushFailures;
    totals.deadLetters += tl.deadLetters;
    totals.reshuffles += tl.reshuffles;
    totals.opsExecutedLocally += tl.opsExecutedLocally;
    totals.opsPushed += tl.opsPushed;
  }
  console.log("  " + "-".repeat(header.length * 11));
  const totalRow = [
    "TOTAL",
    String(totals.gqlRequests),
    String(totals.polls),
    String(totals.pushes),
    String(totals.pushSuccesses),
    String(totals.pushFailures),
    String(totals.deadLetters),
    String(totals.reshuffles),
    String(totals.opsExecutedLocally),
    String(totals.opsPushed),
    "",
  ];
  console.log("  " + totalRow.map((v) => v.padEnd(11)).join(""));

  // ── Section 2: Dead letter analysis ──
  console.log("\n" + "=".repeat(72));
  console.log("  2. DEAD LETTER ANALYSIS");
  console.log("=".repeat(72));

  console.log(`\n  Total dead letters: ${allDeadLetters.length}`);

  // Group by error category
  const dlByCategory = new Map<string, DeadLetter[]>();
  for (const dl of allDeadLetters) {
    const existing = dlByCategory.get(dl.errorCategory) ?? [];
    existing.push(dl);
    dlByCategory.set(dl.errorCategory, existing);
  }

  console.log("\n  By error category:");
  for (const [category, dls] of dlByCategory) {
    const clients = [...new Set(dls.map((d) => d.client))];
    console.log(
      `    ${category}: ${dls.length} (clients: ${clients.join(", ")})`,
    );
  }

  // Group by client
  console.log("\n  By client:");
  const dlByClient = new Map<string, DeadLetter[]>();
  for (const dl of allDeadLetters) {
    const existing = dlByClient.get(dl.client) ?? [];
    existing.push(dl);
    dlByClient.set(dl.client, existing);
  }
  for (const [client, dls] of dlByClient) {
    const categories = new Map<string, number>();
    for (const dl of dls) {
      categories.set(
        dl.errorCategory,
        (categories.get(dl.errorCategory) ?? 0) + 1,
      );
    }
    const breakdown = [...categories.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`    ${client}: ${dls.length} (${breakdown})`);
  }

  // Dead letters with jobId populated (outbox failures with traceable context)
  const traceable = allDeadLetters.filter((dl) => dl.jobId !== "(empty)");
  console.log(
    `\n  Traceable dead letters (with jobId): ${traceable.length}/${allDeadLetters.length}`,
  );
  if (traceable.length > 0) {
    console.log("  Sample traceable dead letters:");
    for (const dl of traceable.slice(0, 5)) {
      console.log(
        `    [${dl.timestamp}] ${dl.client} jobId=${dl.jobId} ops=${dl.operationCount} branch=${dl.branch}`,
      );
      // Truncate error to 120 chars
      const errShort =
        dl.error.length > 120 ? dl.error.slice(0, 120) + "..." : dl.error;
      console.log(`      error: ${errShort}`);
    }
  }

  // Untraceable (empty jobId) - these lost context
  const untraceable = allDeadLetters.filter((dl) => dl.jobId === "(empty)");
  if (untraceable.length > 0) {
    console.log(
      `\n  Untraceable dead letters (empty jobId): ${untraceable.length}`,
    );
    console.log("  Sample:");
    for (const dl of untraceable.slice(0, 3)) {
      const errShort =
        dl.error.length > 200 ? dl.error.slice(0, 200) + "..." : dl.error;
      console.log(`    [${dl.timestamp}] ${dl.client}: ${errShort}`);
    }
  }

  // ── Section 3: Reshuffle escalation ──
  console.log("\n" + "=".repeat(72));
  console.log("  3. RESHUFFLE ANALYSIS");
  console.log("=".repeat(72));

  console.log(`\n  Total reshuffle events: ${allReshuffles.length}`);

  // Group by client
  const rsByClient = new Map<string, ReshuffleEvent[]>();
  for (const rs of allReshuffles) {
    const existing = rsByClient.get(rs.client) ?? [];
    existing.push(rs);
    rsByClient.set(rs.client, existing);
  }
  for (const [client, events] of rsByClient) {
    const maxAttempt = Math.max(...events.map((e) => e.attempt));
    const attempts = new Map<number, number>();
    for (const e of events) {
      attempts.set(e.attempt, (attempts.get(e.attempt) ?? 0) + 1);
    }
    const attemptBreakdown = [...attempts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([a, c]) => `attempt ${a}: ${c}x`)
      .join(", ");
    console.log(
      `  ${client}: ${events.length} reshuffles, maxAttempt=${maxAttempt} (${attemptBreakdown})`,
    );
  }

  // Timeline of reshuffles by second
  printTimeline(
    "  Reshuffles per second (all clients)",
    bucketBySecond(allReshuffles),
  );

  // ── Section 4: Push success/failure timeline ──
  console.log("\n" + "=".repeat(72));
  console.log("  4. PUSH TIMELINE");
  console.log("=".repeat(72));

  const pushResponses = allGqlEvents.filter(
    (e) => e.direction === "response" && e.operation === "PushSyncEnvelopes",
  );
  const pushSuccesses = pushResponses.filter((e) => !e.hasErrors);
  const pushFailures = pushResponses.filter((e) => e.hasErrors);

  console.log(`\n  Total push responses: ${pushResponses.length}`);
  console.log(`  Successes: ${pushSuccesses.length}`);
  console.log(`  Failures: ${pushFailures.length}`);
  console.log(
    `  Failure rate: ${pushResponses.length > 0 ? ((pushFailures.length / pushResponses.length) * 100).toFixed(1) : 0}%`,
  );

  printTimeline("  Push successes per second", bucketBySecond(pushSuccesses));
  printTimeline("  Push failures per second", bucketBySecond(pushFailures));

  // ── Section 5: Dead letter timeline ──
  console.log("\n" + "=".repeat(72));
  console.log("  5. DEAD LETTER TIMELINE");
  console.log("=".repeat(72));

  printTimeline(
    "  Dead letters per second (all clients)",
    bucketBySecond(allDeadLetters),
  );

  // ── Section 6: Poll ack ordinal progression ──
  console.log("\n" + "=".repeat(72));
  console.log("  6. SYNC PROGRESS (ACK ORDINAL OVER TIME)");
  console.log("=".repeat(72));

  for (const [client, _tl] of clientTimelines) {
    const clientPolls = allGqlEvents.filter(
      (e) =>
        e.client === client &&
        e.direction === "response" &&
        e.operation === "PollSyncEnvelopes" &&
        e.ackOrdinal !== undefined,
    );
    if (clientPolls.length === 0) continue;

    // Sample every ~5th poll to keep output manageable
    const step = Math.max(1, Math.floor(clientPolls.length / 15));
    const samples = clientPolls.filter(
      (_, i) => i % step === 0 || i === clientPolls.length - 1,
    );
    const maxAck = Math.max(...clientPolls.map((p) => p.ackOrdinal ?? 0));

    console.log(
      `\n  ${client} (${clientPolls.length} polls, max ack=${maxAck}):`,
    );
    for (const poll of samples) {
      const ack = poll.ackOrdinal ?? 0;
      const barLen = maxAck > 0 ? Math.round((ack / maxAck) * 40) : 0;
      const bar = "=".repeat(barLen);
      const envs = poll.envelopeCount ?? 0;
      console.log(
        `    ${poll.timestamp} | ${bar}${" ".repeat(40 - barLen)} ack=${ack} envs=${envs}`,
      );
    }
  }

  // ── Section 7: Switchboard server analysis ──
  console.log("\n" + "=".repeat(72));
  console.log("  7. SWITCHBOARD SERVER ANALYSIS");
  console.log("=".repeat(72));

  const sbLogPath = path.join(absLogDir, "switchboard.log");
  if (fs.existsSync(sbLogPath)) {
    const sbStats = await processSwitchboardLog(sbLogPath);
    console.log(`\n  Total lines: ${sbStats.totalLines}`);
    console.log(
      `  Time range: ${sbStats.firstTimestamp} - ${sbStats.lastTimestamp}`,
    );
    console.log(`  Error-related lines: ${sbStats.errorLines}`);
    console.log(`  Reshuffle lines: ${sbStats.reshuffleLines}`);
    console.log(`  Dead letter log lines: ${sbStats.deadLetterLogLines}`);
    console.log(`  Job failed lines: ${sbStats.jobFailedLines}`);

    if (sbStats.errorSamples.length > 0) {
      console.log(`\n  Error samples (first ${sbStats.errorSamples.length}):`);
      for (const sample of sbStats.errorSamples) {
        console.log(`    ${sample}`);
      }
    }
  } else {
    console.log("\n  (switchboard.log not found)");
  }

  // ── Section 8: Key findings ──
  console.log("\n" + "=".repeat(72));
  console.log("  8. KEY FINDINGS");
  console.log("=".repeat(72));

  const findings: string[] = [];

  // Finding: untraceable dead letters
  if (untraceable.length > 0) {
    findings.push(
      `${untraceable.length}/${allDeadLetters.length} dead letters have empty jobId/branch/operations. ` +
        `These are inbox-side failures where the SyncOperation metadata was lost before reaching the dead letter mailbox. ` +
        `The error chain is: ChannelError[outbox] -> ChannelError[inbox] -> Job failed after 4 attempts.`,
    );
  }

  // Finding: push failure rate
  if (pushFailures.length > 0) {
    findings.push(
      `Push failure rate: ${((pushFailures.length / pushResponses.length) * 100).toFixed(1)}% ` +
        `(${pushFailures.length}/${pushResponses.length}). ` +
        `Failed pushes become outbox dead letters with full context (jobId, operations, branch).`,
    );
  }

  // Finding: reshuffle exhaustion
  const maxAttemptGlobal =
    allReshuffles.length > 0
      ? Math.max(...allReshuffles.map((r) => r.attempt))
      : 0;
  if (maxAttemptGlobal > 0) {
    findings.push(
      `Reshuffles reached attempt ${maxAttemptGlobal} before exhaustion. ` +
        `${allReshuffles.length} total reshuffle events across all clients. ` +
        `Each "Excessive reshuffle" means >1000 conflicting operations during an inbox apply.`,
    );
  }

  // Finding: asymmetric client behavior
  const dlCounts = [...clientTimelines.entries()].map(([c, t]) => ({
    client: c,
    deadLetters: t.deadLetters,
    pushFailures: t.pushFailures,
  }));
  const affectedClients = dlCounts.filter(
    (c) => c.deadLetters > 0 || c.pushFailures > 0,
  );
  const unaffectedClients = dlCounts.filter(
    (c) => c.deadLetters === 0 && c.pushFailures === 0,
  );
  if (affectedClients.length > 0 && unaffectedClients.length > 0) {
    findings.push(
      `Asymmetric failure: ${affectedClients.length} clients experienced failures while ` +
        `${unaffectedClients.length} clients (${unaffectedClients.map((c) => c.client).join(", ")}) had zero dead letters or push failures. ` +
        `This suggests a timing-dependent race where earlier-arriving pushes succeed and later ones conflict.`,
    );
  }

  // Finding: ack ordinal divergence
  const maxAcks = [...clientTimelines.entries()].map(([c, t]) => ({
    client: c,
    maxAck: t.maxAckOrdinal,
  }));
  const ackValues = maxAcks.map((a) => a.maxAck);
  const minAck = Math.min(...ackValues);
  const maxAck = Math.max(...ackValues);
  if (maxAck > 0 && maxAck - minAck > 10) {
    findings.push(
      `Ack ordinal divergence: clients range from ${minAck} to ${maxAck}. ` +
        `Clients with lower ack ordinals are falling behind in applying incoming operations.`,
    );
  }

  for (let i = 0; i < findings.length; i++) {
    console.log(`\n  ${i + 1}. ${findings[i]}`);
  }

  console.log("\n" + "=".repeat(72));
  console.log("  END OF ANALYSIS");
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
