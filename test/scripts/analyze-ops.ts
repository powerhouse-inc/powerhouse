import { readFileSync } from "fs";
import { basename } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OpRow = {
  documentType: string;
  documentId: string;
  scope: string;
  branch: string;
  index: number;
  skip: number;
  id: string;
  jobId: string;
  opId: string;
  prevOpId: string;
  writeTimestampUtcMs: string;
  timestampUtcMs: string;
  action: { id: string; type: string; input?: unknown } | null;
  error: string | null;
  hash: string;
};

type GroupKey = string; // "reactorName|documentId|scope|branch"
type StreamKey = string; // "documentId|scope|branch"

const STRICT_ORDER_ACTION_TYPES = new Set([
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
]);

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

function cleanValue(raw: string): string {
  let v = raw.trim();
  // Strip extra triple-quoting on timestamps: """value""" -> value
  while (v.startsWith('"""') && v.endsWith('"""')) {
    v = v.slice(3, -3);
  }
  return v;
}

function parseAction(
  raw: string,
): { id: string; type: string; input?: unknown } | null {
  const v = raw.trim();
  if (v === "" || v === "NULL") return null;

  try {
    let parsed: unknown = JSON.parse(v);
    // Handle double-stringified JSON
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const id = typeof obj.id === "string" ? obj.id : "";
      const type = typeof obj.type === "string" ? obj.type : "";
      return {
        id,
        type,
        ...(obj.input !== undefined ? { input: obj.input } : {}),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

function parseCSV(content: string): OpRow[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const colIndex = (name: string): number => {
    const idx = header.indexOf(name.toLowerCase());
    if (idx === -1) {
      const camelToSnake = name.replace(/([A-Z])/g, "_$1").toLowerCase();
      const snakeIdx = header.indexOf(camelToSnake);
      if (snakeIdx === -1) {
        throw new Error(
          `Column "${name}" not found. Available: ${header.join(", ")}`,
        );
      }
      return snakeIdx;
    }
    return idx;
  };

  const cols = {
    documentType: colIndex("documentType"),
    documentId: colIndex("documentId"),
    scope: colIndex("scope"),
    branch: colIndex("branch"),
    index: colIndex("index"),
    skip: colIndex("skip"),
    id: colIndex("id"),
    jobId: colIndex("jobId"),
    opId: colIndex("opId"),
    prevOpId: colIndex("prevOpId"),
    writeTimestampUtcMs: colIndex("writeTimestampUtcMs"),
    timestampUtcMs: colIndex("timestampUtcMs"),
    action: colIndex("action"),
    error: colIndex("error"),
    hash: colIndex("hash"),
  };

  const rows: OpRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const get = (col: number): string => cleanValue(fields[col] ?? "");
    const nullable = (col: number): string | null => {
      const v = get(col);
      return v === "NULL" || v === "" ? null : v;
    };

    rows.push({
      documentType: get(cols.documentType),
      documentId: get(cols.documentId),
      scope: get(cols.scope),
      branch: get(cols.branch),
      index: parseInt(get(cols.index), 10),
      skip: parseInt(get(cols.skip), 10),
      id: get(cols.id),
      jobId: get(cols.jobId),
      opId: get(cols.opId),
      prevOpId: get(cols.prevOpId),
      writeTimestampUtcMs: get(cols.writeTimestampUtcMs),
      timestampUtcMs: get(cols.timestampUtcMs),
      action: parseAction(fields[cols.action] ?? ""),
      error: nullable(cols.error),
      hash: get(cols.hash),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// GC Filter (mirrors gcGlobalEntries from convergence test)
// ---------------------------------------------------------------------------

function gcFilter(entries: OpRow[]): OpRow[] {
  const sorted = entries.slice().sort((a, b) => a.index - b.index);

  return sorted.filter((entry) => {
    for (const later of sorted) {
      if (later.index <= entry.index || later.skip <= 0) {
        continue;
      }
      if (later.index - later.skip <= entry.index) {
        return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupByReactorAndStream(
  reactorName: string,
  rows: OpRow[],
): Map<GroupKey, OpRow[]> {
  const groups = new Map<GroupKey, OpRow[]>();
  for (const row of rows) {
    const key = `${reactorName}|${row.documentId}|${row.scope}|${row.branch}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  return groups;
}

function streamKey(row: OpRow): StreamKey {
  return `${row.documentId}|${row.scope}|${row.branch}`;
}

function allStreamKeys(allGroups: Map<GroupKey, OpRow[]>): Set<StreamKey> {
  const keys = new Set<StreamKey>();
  for (const gk of allGroups.keys()) {
    const parts = gk.split("|");
    keys.add(`${parts[1]}|${parts[2]}|${parts[3]}`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Analysis Pass 1: Pairwise GC'd Stream Divergence
// ---------------------------------------------------------------------------

function analyzeStreamDivergence(
  reactorNames: string[],
  allGroups: Map<GroupKey, OpRow[]>,
  sk: StreamKey,
): string[] {
  const lines: string[] = [];
  const [docId, scope, branch] = sk.split("|");

  lines.push(`[GC'd Stream Comparison]`);

  // Gather GC'd streams per reactor
  const gcStreams = new Map<string, OpRow[]>();
  const rawCounts = new Map<string, number>();

  for (const name of reactorNames) {
    const key = `${name}|${sk}`;
    const raw = allGroups.get(key) ?? [];
    rawCounts.set(name, raw.length);
    const gc = gcFilter(raw);
    gcStreams.set(name, gc);
    const gcRemoved = raw.length - gc.length;
    lines.push(
      `  ${name}: ${gc.length} ops (raw: ${raw.length}, gc'd: ${gcRemoved})`,
    );
  }

  lines.push("");
  lines.push("  Pairwise comparison:");

  type PairResult = {
    a: string;
    b: string;
    match: boolean;
    divergePos: number;
  };
  const pairResults: PairResult[] = [];

  for (let i = 0; i < reactorNames.length; i++) {
    for (let j = i + 1; j < reactorNames.length; j++) {
      const nameA = reactorNames[i];
      const nameB = reactorNames[j];
      const streamA = gcStreams.get(nameA) ?? [];
      const streamB = gcStreams.get(nameB) ?? [];

      let divergePos = -1;
      const maxLen = Math.max(streamA.length, streamB.length);
      for (let pos = 0; pos < maxLen; pos++) {
        const opA = streamA[pos];
        const opB = streamB[pos];
        if (!opA || !opB) {
          divergePos = pos;
          break;
        }
        if (opA.opId !== opB.opId || opA.action?.id !== opB.action?.id) {
          divergePos = pos;
          break;
        }
      }

      if (divergePos === -1) {
        lines.push(`    ${nameA} vs ${nameB}: MATCH (${streamA.length} ops)`);
        pairResults.push({ a: nameA, b: nameB, match: true, divergePos: -1 });
      } else {
        lines.push(
          `    ${nameA} vs ${nameB}: DIVERGE at position ${divergePos}`,
        );
        pairResults.push({
          a: nameA,
          b: nameB,
          match: false,
          divergePos,
        });
      }
    }
  }

  // Print detailed divergence for each diverging pair
  for (const pair of pairResults) {
    if (pair.match) continue;
    const streamA = gcStreams.get(pair.a) ?? [];
    const streamB = gcStreams.get(pair.b) ?? [];
    const pos = pair.divergePos;
    const contextBefore = 3;
    const contextAfter = 3;
    const start = Math.max(0, pos - contextBefore);
    const end = Math.min(
      Math.max(streamA.length, streamB.length),
      pos + contextAfter + 1,
    );

    lines.push("");
    lines.push(`  ${pair.a} vs ${pair.b} DIVERGENCE at position ${pos}:`);

    for (let p = start; p < end; p++) {
      const opA = streamA[p];
      const opB = streamB[p];

      if (p === pos) {
        lines.push(`  > pos ${p}: ${pair.a}: ${formatOpBrief(opA)}`);
        lines.push(`  >          ${pair.b}: ${formatOpBrief(opB)}`);
      } else {
        const aStr = formatOpBrief(opA);
        const bStr = formatOpBrief(opB);
        if (aStr === bStr) {
          lines.push(`    pos ${p}: ${aStr} (both agree)`);
        } else {
          lines.push(`    pos ${p}: ${pair.a}: ${aStr}`);
          lines.push(`             ${pair.b}: ${bStr}`);
        }
      }
    }
  }

  return lines;
}

function formatOpBrief(op: OpRow | undefined): string {
  if (!op) return "(missing)";
  const actionType = op.action?.type ?? "?";
  const actionId = op.action?.id
    ? `action-id=${op.action.id.slice(0, 8)}`
    : "no-action";
  const ts = formatTimestamp(op.timestampUtcMs);
  return `${actionType} ${actionId} ts=${ts}`;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.slice(0, 20);
    return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
  } catch {
    return ts.slice(0, 20);
  }
}

// ---------------------------------------------------------------------------
// Analysis Pass 2: Timestamp Collision Analysis
// ---------------------------------------------------------------------------

function analyzeTimestampCollisions(
  reactorNames: string[],
  allGroups: Map<GroupKey, OpRow[]>,
  sk: StreamKey,
): string[] {
  const lines: string[] = [];
  lines.push("[Timestamp Collisions]");

  // Collect all ops across reactors for this stream
  const allOps: { reactor: string; op: OpRow }[] = [];
  for (const name of reactorNames) {
    const key = `${name}|${sk}`;
    const rows = allGroups.get(key) ?? [];
    const gc = gcFilter(rows);
    for (const op of gc) {
      allOps.push({ reactor: name, op });
    }
  }

  // Group by timestamp
  const byTimestamp = new Map<string, { reactor: string; op: OpRow }[]>();
  for (const entry of allOps) {
    const ts = entry.op.timestampUtcMs;
    const arr = byTimestamp.get(ts) ?? [];
    arr.push(entry);
    byTimestamp.set(ts, arr);
  }

  // Deduplicate: within same timestamp group, only keep unique opIds
  let found = false;
  const sortedTimestamps = [...byTimestamp.keys()].sort();
  for (const ts of sortedTimestamps) {
    const entries = byTimestamp.get(ts)!;
    // Get unique opIds at this timestamp
    const uniqueOpIds = new Set(entries.map((e) => e.op.opId));
    if (uniqueOpIds.size <= 1) continue;

    found = true;
    lines.push(`  Timestamp ${ts} (${uniqueOpIds.size} unique ops):`);

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.op.opId)) continue;
      seen.add(entry.op.opId);

      const logicalIdx = entry.op.index - entry.op.skip;
      const isStrict = STRICT_ORDER_ACTION_TYPES.has(
        entry.op.action?.type ?? "",
      );
      lines.push(
        `    action-id=${(entry.op.action?.id ?? "?").slice(0, 8)} ` +
          `logicalIdx=${logicalIdx} ` +
          `opId=${entry.op.opId.slice(0, 8)} ` +
          `type=${entry.op.action?.type ?? "?"} ` +
          `${isStrict ? "(STRICT_ORDER)" : ""}`,
      );
    }

    // Show expected tiebreaker resolution
    const uniqueEntries = [...uniqueOpIds].map(
      (opId) => entries.find((e) => e.op.opId === opId)!,
    );
    const sorted = uniqueEntries.slice().sort((a, b) => {
      const aOp = a.op;
      const bOp = b.op;

      const shouldPrioritizeLogicalIndex =
        STRICT_ORDER_ACTION_TYPES.has(aOp.action?.type ?? "") ||
        STRICT_ORDER_ACTION_TYPES.has(bOp.action?.type ?? "");
      const logicalIndexDiff = aOp.index - aOp.skip - (bOp.index - bOp.skip);

      if (shouldPrioritizeLogicalIndex) {
        if (logicalIndexDiff !== 0) return logicalIndexDiff;
      }

      const actionIdDiff = (aOp.action?.id ?? "").localeCompare(
        bOp.action?.id ?? "",
      );
      if (actionIdDiff !== 0) return actionIdDiff;

      if (!shouldPrioritizeLogicalIndex && logicalIndexDiff !== 0) {
        return logicalIndexDiff;
      }

      return aOp.id.localeCompare(bOp.id);
    });

    const winner = sorted[0].op;
    const loser = sorted[1]?.op;
    if (loser) {
      const reason = determineTiebreakerReason(winner, loser);
      lines.push(`    Tiebreaker: ${reason}`);
    }
  }

  if (!found) {
    lines.push("  None found.");
  }

  return lines;
}

function determineTiebreakerReason(a: OpRow, b: OpRow): string {
  const aStrict = STRICT_ORDER_ACTION_TYPES.has(a.action?.type ?? "");
  const bStrict = STRICT_ORDER_ACTION_TYPES.has(b.action?.type ?? "");

  if (aStrict || bStrict) {
    const logDiff = a.index - a.skip - (b.index - b.skip);
    if (logDiff !== 0) {
      return `STRICT_ORDER logical index -> ${a.index - a.skip} vs ${b.index - b.skip}`;
    }
  }

  const aidA = a.action?.id ?? "";
  const aidB = b.action?.id ?? "";
  if (aidA !== aidB) {
    const cmp = aidA.localeCompare(aidB);
    return `action ID -> ${aidA.slice(0, 8)} ${cmp < 0 ? "<" : ">"} ${aidB.slice(0, 8)} -> first wins`;
  }

  const logDiff = a.index - a.skip - (b.index - b.skip);
  if (logDiff !== 0) {
    return `logical index -> ${a.index - a.skip} vs ${b.index - b.skip}`;
  }

  return `operation ID -> ${a.id.slice(0, 8)} vs ${b.id.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Analysis Pass 3: Hash Chain Integrity
// ---------------------------------------------------------------------------

function analyzeHashChain(
  reactorNames: string[],
  allGroups: Map<GroupKey, OpRow[]>,
  sk: StreamKey,
): string[] {
  const lines: string[] = [];
  lines.push("[Hash Chain Issues]");

  let found = false;

  for (const name of reactorNames) {
    const key = `${name}|${sk}`;
    const raw = (allGroups.get(key) ?? [])
      .slice()
      .sort((a, b) => a.index - b.index);

    for (let i = 1; i < raw.length; i++) {
      const prev = raw[i - 1];
      const curr = raw[i];

      if (
        curr.prevOpId &&
        curr.prevOpId !== "NULL" &&
        curr.prevOpId !== prev.opId
      ) {
        found = true;
        lines.push(
          `  ${name}: Broken link at index ${curr.index}: ` +
            `prevOpId=${curr.prevOpId.slice(0, 8)} != previous opId=${prev.opId.slice(0, 8)}`,
        );
      }
    }
  }

  if (!found) {
    lines.push("  None found.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Analysis Pass 4: Missing Operations
// ---------------------------------------------------------------------------

function analyzeMissingOps(
  reactorNames: string[],
  allGroups: Map<GroupKey, OpRow[]>,
  sk: StreamKey,
): string[] {
  const lines: string[] = [];
  lines.push("[Missing Operations]");

  // Collect unique (opId, timestampUtcMs) per reactor
  const perReactor = new Map<string, Set<string>>();
  const allPairs = new Map<string, { opId: string; ts: string }>();

  for (const name of reactorNames) {
    const key = `${name}|${sk}`;
    const rows = allGroups.get(key) ?? [];
    const pairSet = new Set<string>();
    for (const row of rows) {
      const pairKey = `${row.opId}|${row.timestampUtcMs}`;
      pairSet.add(pairKey);
      allPairs.set(pairKey, { opId: row.opId, ts: row.timestampUtcMs });
    }
    perReactor.set(name, pairSet);
  }

  let found = false;
  for (const [pairKey, info] of allPairs) {
    const presentIn: string[] = [];
    const missingFrom: string[] = [];
    for (const name of reactorNames) {
      if (perReactor.get(name)!.has(pairKey)) {
        presentIn.push(name);
      } else {
        missingFrom.push(name);
      }
    }

    if (missingFrom.length > 0) {
      found = true;
      lines.push(
        `  opId=${info.opId.slice(0, 8)} ts=${formatTimestamp(info.ts)}:` +
          ` present in [${presentIn.join(", ")}]` +
          ` missing from [${missingFrom.join(", ")}]`,
      );
    }
  }

  if (!found) {
    lines.push("  None found.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Analysis Pass 5: Duplicate Index Detection
// ---------------------------------------------------------------------------

function analyzeDuplicateIndices(
  reactorNames: string[],
  allGroups: Map<GroupKey, OpRow[]>,
  sk: StreamKey,
): string[] {
  const lines: string[] = [];
  lines.push("[Duplicate Indices]");

  let found = false;

  for (const name of reactorNames) {
    const key = `${name}|${sk}`;
    const rows = allGroups.get(key) ?? [];

    // Group by opId
    const byOpId = new Map<string, OpRow[]>();
    for (const row of rows) {
      const arr = byOpId.get(row.opId) ?? [];
      arr.push(row);
      byOpId.set(row.opId, arr);
    }

    for (const [opId, ops] of byOpId) {
      if (ops.length <= 1) continue;
      found = true;
      const indices = ops.map((o) => o.index);
      const skips = ops.map((o) => o.skip);
      lines.push(
        `  ${name}: opId ${opId.slice(0, 8)} at indices [${indices.join(", ")}] skip=[${skips.join(", ")}]`,
      );
      lines.push("  (expected: GC should remove older copies)");
    }
  }

  if (!found) {
    lines.push("  None found.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: npx tsx analyze-ops.ts <reactor-a.csv> <reactor-b.csv> [reactor-c.csv ...]",
    );
    process.exit(1);
  }

  // Parse all files
  const reactors: { name: string; rows: OpRow[] }[] = [];
  for (const filePath of args) {
    const content = readFileSync(filePath, "utf-8");
    const rows = parseCSV(content);
    const name = basename(filePath);
    reactors.push({ name, rows });
  }

  // Build combined groups
  const allGroups = new Map<GroupKey, OpRow[]>();
  const reactorNames: string[] = [];
  for (const r of reactors) {
    reactorNames.push(r.name);
    const groups = groupByReactorAndStream(r.name, r.rows);
    for (const [k, v] of groups) {
      allGroups.set(k, v);
    }
  }

  // Print header
  console.log("=== Operation Dump Analyzer ===");
  const fileSummaries = reactors
    .map((r) => `${r.name} (${r.rows.length} rows)`)
    .join(", ");
  console.log(`Files: ${fileSummaries}`);
  console.log("");

  // Process each unique stream
  const streams = allStreamKeys(allGroups);
  for (const sk of streams) {
    const [docId, scope, branch] = sk.split("|");

    // Find document type from any row
    let docType = "";
    for (const [gk, rows] of allGroups) {
      if (gk.endsWith(sk) && rows.length > 0) {
        docType = rows[0].documentType;
        break;
      }
    }

    console.log(
      `--- Document: ${docId.slice(0, 10)}... (${docType || "unknown"}) ---`,
    );
    console.log(`--- Scope: ${scope}, Branch: ${branch} ---`);
    console.log("");

    const pass1 = analyzeStreamDivergence(reactorNames, allGroups, sk);
    console.log(pass1.join("\n"));
    console.log("");

    const pass2 = analyzeTimestampCollisions(reactorNames, allGroups, sk);
    console.log(pass2.join("\n"));
    console.log("");

    const pass3 = analyzeHashChain(reactorNames, allGroups, sk);
    console.log(pass3.join("\n"));
    console.log("");

    const pass4 = analyzeMissingOps(reactorNames, allGroups, sk);
    console.log(pass4.join("\n"));
    console.log("");

    const pass5 = analyzeDuplicateIndices(reactorNames, allGroups, sk);
    console.log(pass5.join("\n"));
    console.log("");
  }
}

main();
