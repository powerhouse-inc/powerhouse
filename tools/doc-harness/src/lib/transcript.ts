/** Metrics from a `claude -p` transcript, stream-json or session envelope. */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ResultRecord,
  type BashCommand,
  type DocPageRead,
  type Escape,
  type Metrics,
  type SymbolUse,
  type TokenUsage,
} from "./schemas.js";

/* ------------------------------------------------------------- parsing */

export type ParsedLines = { records: unknown[]; badLines: number };

/** Blank lines are skipped; lines that are not JSON objects count as bad. */
export function parseTranscriptLines(text: string): ParsedLines {
  const records: unknown[] = [];
  let badLines = 0;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) records.push(value);
      else badLines += 1;
    } catch {
      badLines += 1;
    }
  }
  return { records, badLines };
}

export type TranscriptFormat = "stream-json" | "session";

const SESSION_ONLY_TYPES = new Set([
  "attachment",
  "queue-operation",
  "last-prompt",
  "ai-title",
  "atis-latch",
  "cost-state",
]);

export function detectFormat(records: unknown[]): TranscriptFormat {
  let stream = 0;
  let session = 0;
  for (const r of records) {
    if (!isRecord(r)) continue;
    if (
      "session_id" in r ||
      "tool_use_result" in r ||
      "parent_tool_use_id" in r
    )
      stream += 1;
    if (r.type === "result" || r.type === "rate_limit_event") stream += 1;
    if ("sessionId" in r || "toolUseResult" in r || "parentUuid" in r)
      session += 1;
    if (typeof r.type === "string" && SESSION_ONLY_TYPES.has(r.type))
      session += 1;
  }
  return session > stream ? "session" : "stream-json";
}

/* -------------------------------------------------------- normalising */

export type RecordKind = "assistant" | "user" | "system" | "result" | "other";

export type NormalizedRecord = {
  kind: RecordKind;
  type: string;
  subtype: string | null;
  message: Record<string, unknown> | null;
  toolUseResult: unknown;
  /** tool_use ids this record marks as not executed (permission rule). */
  deniedToolUseIds: string[];
  /** Session records carry `toolDenialKind` at record level. */
  recordDenied: boolean;
  timestamp: string | null;
  uuid: string | null;
  /** CLI version, when the envelope carries one (session `version`). */
  version: string | null;
  raw: Record<string, unknown>;
};

export function normalizeRecord(value: unknown): NormalizedRecord | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type : "other";
  const kind: RecordKind =
    type === "assistant" ||
    type === "user" ||
    type === "system" ||
    type === "result"
      ? type
      : "other";
  const meta = value.tool_result_meta;
  const deniedToolUseIds: string[] = [];
  if (Array.isArray(meta)) {
    for (const m of meta) {
      if (
        isRecord(m) &&
        typeof m.id === "string" &&
        typeof m.non_execution_kind === "string"
      ) {
        deniedToolUseIds.push(m.id);
      }
    }
  }
  return {
    kind,
    type,
    subtype: typeof value.subtype === "string" ? value.subtype : null,
    message: isRecord(value.message) ? value.message : null,
    toolUseResult:
      "tool_use_result" in value ? value.tool_use_result : value.toolUseResult,
    deniedToolUseIds,
    recordDenied: typeof value.toolDenialKind === "string",
    timestamp: typeof value.timestamp === "string" ? value.timestamp : null,
    uuid: typeof value.uuid === "string" ? value.uuid : null,
    version: typeof value.version === "string" ? value.version : null,
    raw: value,
  };
}

/* ------------------------------------------------------------- walking */

export type ToolResult = {
  text: string;
  isError: boolean;
  denied: boolean;
  /** The envelope's structured result (Bash: {stdout, stderr, interrupted}). */
  structured: unknown;
};

export type ToolCall = {
  turn: number;
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: ToolResult | null;
};

export type Turn = {
  index: number;
  uuid: string | null;
  messageId: string | null;
  model: string | null;
  texts: string[];
  toolCalls: ToolCall[];
};

export type Walk = {
  format: TranscriptFormat;
  turns: Turn[];
  toolCalls: ToolCall[];
  result: ResultRecord | null;
  init: Record<string, unknown> | null;
  cliVersion: string | null;
  model: string | null;
  tokens: TokenUsage;
  /** Session-format fallback: last `attachment.budget_usd.used` or cost-state. */
  sessionCostUsd: number | null;
  /** Session-format fallback: `cost-state` duration or turns, when present. */
  sessionDurationMs: number | null;
  sessionTurns: number | null;
};

const DENIED_TEXT = /denied by your permission settings|has been denied\.?$/im;

export function walkTranscript(records: unknown[]): Walk {
  const normalized = records
    .map(normalizeRecord)
    .filter((r): r is NormalizedRecord => r !== null);

  // result.permission_denials arrives last, so collect denials before pairing.
  const deniedIds = new Set<string>();
  let result: ResultRecord | null = null;
  let init: Record<string, unknown> | null = null;
  let sessionCostUsd: number | null = null;
  let sessionDurationMs: number | null = null;
  let sessionTurns: number | null = null;
  let cliVersion: string | null = null;

  for (const r of normalized) {
    for (const id of r.deniedToolUseIds) deniedIds.add(id);
    if (r.kind === "system" && r.subtype === "permission_denied") {
      if (typeof r.raw.tool_use_id === "string")
        deniedIds.add(r.raw.tool_use_id);
    }
    if (r.kind === "system" && r.subtype === "init") {
      init = r.raw;
      if (typeof r.raw.claude_code_version === "string")
        cliVersion = r.raw.claude_code_version;
    }
    if (r.kind === "result") {
      const parsed = ResultRecord.safeParse(r.raw);
      if (parsed.success) {
        result = parsed.data;
        for (const d of parsed.data.permission_denials ?? []) {
          if (typeof d.tool_use_id === "string") deniedIds.add(d.tool_use_id);
        }
      }
    }
    if (r.type === "attachment" && isRecord(r.raw.attachment)) {
      const a = r.raw.attachment;
      if (a.type === "budget_usd" && typeof a.used === "number")
        sessionCostUsd = a.used;
    }
    if (r.type === "cost-state") {
      const cost = numberField(r.raw, [
        "totalCostUSD",
        "totalCostUsd",
        "costUsd",
        "total_cost_usd",
      ]);
      if (cost !== null) sessionCostUsd = cost;
      sessionDurationMs = numberField(r.raw, ["durationMs", "duration_ms"]);
      sessionTurns = numberField(r.raw, ["numTurns", "num_turns", "turns"]);
    }
    if (cliVersion === null && r.version !== null) cliVersion = r.version;
  }

  const turns: Turn[] = [];
  const toolCalls: ToolCall[] = [];
  const byId = new Map<string, ToolCall>();
  // One record per content block, usage repeated on each: sum once per message id.
  const usageByMessage = new Map<string, Record<string, unknown>>();
  let anonymousUsage = 0;
  const tokens: TokenUsage = {
    input: 0,
    output: 0,
    cacheCreation: 0,
    cacheRead: 0,
  };
  let model: string | null = null;

  for (const r of normalized) {
    if (r.kind === "assistant" && r.message !== null) {
      const turn: Turn = {
        index: turns.length + 1,
        uuid: r.uuid,
        messageId: typeof r.message.id === "string" ? r.message.id : null,
        model: typeof r.message.model === "string" ? r.message.model : null,
        texts: [],
        toolCalls: [],
      };
      if (
        model === null &&
        turn.model !== null &&
        turn.model !== "<synthetic>"
      ) {
        model = turn.model;
      }
      if (isRecord(r.message.usage)) {
        if (turn.messageId !== null)
          usageByMessage.set(turn.messageId, r.message.usage);
        else usageByMessage.set(`anon-${anonymousUsage++}`, r.message.usage);
      }
      const content = Array.isArray(r.message.content) ? r.message.content : [];
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") {
          turn.texts.push(block.text);
        } else if (
          block.type === "tool_use" &&
          typeof block.name === "string"
        ) {
          const call: ToolCall = {
            turn: turn.index,
            id:
              typeof block.id === "string"
                ? block.id
                : `anon-${toolCalls.length}`,
            name: block.name,
            input: isRecord(block.input) ? block.input : {},
            result: null,
          };
          turn.toolCalls.push(call);
          toolCalls.push(call);
          byId.set(call.id, call);
        }
      }
      turns.push(turn);
      continue;
    }

    if (r.kind === "user" && r.message !== null) {
      const content = Array.isArray(r.message.content) ? r.message.content : [];
      for (const block of content) {
        if (!isRecord(block) || block.type !== "tool_result") continue;
        const id =
          typeof block.tool_use_id === "string" ? block.tool_use_id : "";
        const call = byId.get(id);
        if (call === undefined) continue;
        const text = blockText(block.content);
        const isError = block.is_error === true;
        const denied =
          deniedIds.has(id) ||
          r.recordDenied ||
          (isError && DENIED_TEXT.test(text));
        call.result = { text, isError, denied, structured: r.toolUseResult };
      }
    }
  }

  for (const usage of usageByMessage.values()) {
    tokens.input += numberField(usage, ["input_tokens"]) ?? 0;
    tokens.output += numberField(usage, ["output_tokens"]) ?? 0;
    tokens.cacheCreation +=
      numberField(usage, ["cache_creation_input_tokens"]) ?? 0;
    tokens.cacheRead += numberField(usage, ["cache_read_input_tokens"]) ?? 0;
  }

  return {
    format: detectFormat(records),
    turns,
    toolCalls,
    result,
    init,
    cliVersion,
    model,
    tokens,
    sessionCostUsd,
    sessionDurationMs,
    sessionTurns,
  };
}

/* ------------------------------------------------------------- metrics */

export type ExtractContext = {
  workspaceDir: string;
  docsDir: string;
  deniedRoots: string[];
  /** The doc page (relative to docsDir) that documents a symbol, if any. */
  docsIndex?: (symbol: string) => { rel: string } | null;
  docsHasSymbol?: (symbol: string) => boolean;
};

const NETWORK_BASH =
  /(^|[\s;&|(`])(curl|wget|git\s+(clone|fetch)|pnpm\s+add|npm\s+i(nstall)?|yarn\s+add|npx\s+(?!(tsc|vitest|tsx)\b)\S+)(\s|$)/;

/** Only `dts-read` counts attempts; other escapes need the tool to have run. */
export function extractMetrics(
  records: unknown[],
  ctx: ExtractContext,
): Metrics {
  const walk = walkTranscript(records);
  const workspaceDir = path.resolve(ctx.workspaceDir);
  const docsDir = path.resolve(ctx.docsDir);
  const deniedRoots = ctx.deniedRoots.map((r) => path.resolve(r));

  const toolHistogram: Record<string, number> = {};
  const pages = new Map<string, DocPageRead>();
  const escapes: Escape[] = [];
  const bashCommands: BashCommand[] = [];
  const symbolFirstUse = new Map<string, SymbolUse>();
  let errorToolResults = 0;
  let deniedRootRead = false;

  const recordPage = (rel: string, turn: number, via: DocPageRead["via"]) => {
    if (!pages.has(rel)) pages.set(rel, { rel, firstTurn: turn, via });
  };
  const docsRel = (abs: string): string | null => {
    if (!isUnder(abs, docsDir)) return null;
    const rel = path.relative(docsDir, abs);
    return rel === "" ? "." : rel;
  };

  for (const call of walk.toolCalls) {
    toolHistogram[call.name] = (toolHistogram[call.name] ?? 0) + 1;
    const res = call.result;
    if (res?.isError) errorToolResults += 1;
    const ran = res !== null && !res.denied;

    if (call.name === "Read") {
      const raw = stringField(call.input, ["file_path", "path"]);
      if (raw === null) continue;
      const abs = resolveInput(raw, workspaceDir);
      const rel = docsRel(abs);
      if (rel !== null) recordPage(rel, call.turn, "Read");
      if (abs.split(path.sep).includes("node_modules")) {
        escapes.push({ kind: "dts-read", turn: call.turn, detail: abs });
      } else if (ran && !isUnder(abs, workspaceDir) && rel === null) {
        escapes.push({
          kind: "outside-root-read",
          turn: call.turn,
          detail: abs,
        });
      }
      if (ran && deniedRoots.some((root) => isUnder(abs, root)))
        deniedRootRead = true;
      continue;
    }

    if (call.name === "Grep" || call.name === "Glob") {
      const raw = stringField(call.input, ["path"]);
      if (raw !== null) {
        const rel = docsRel(resolveInput(raw, workspaceDir));
        if (rel !== null) recordPage(rel, call.turn, call.name);
      }
      continue;
    }

    if (call.name === "Bash") {
      const cmd = stringField(call.input, ["command"]) ?? "";
      for (const rel of docsMentions(cmd, docsDir))
        recordPage(rel, call.turn, "Bash");
      bashCommands.push(bashCommand(call, cmd));
      if (ran) {
        const hit = deniedRoots.find((root) => cmd.includes(root));
        if (hit !== undefined || cmd.includes("~/.claude")) {
          escapes.push({
            kind: "denied-path-bash",
            turn: call.turn,
            detail: cmd,
          });
        }
        if (NETWORK_BASH.test(cmd))
          escapes.push({ kind: "network-bash", turn: call.turn, detail: cmd });
      }
      continue;
    }

    if (call.name === "Write" || call.name === "Edit") {
      const file = stringField(call.input, ["file_path"]) ?? "";
      const text =
        call.name === "Write"
          ? (stringField(call.input, ["content"]) ?? "")
          : (stringField(call.input, ["new_string"]) ?? "");
      for (const use of importedSymbols(text)) {
        const key = `${use.pkg} ${use.name}`;
        if (!symbolFirstUse.has(key)) {
          symbolFirstUse.set(key, {
            pkg: use.pkg,
            name: use.name,
            firstUseTurn: call.turn,
            firstDocReadTurn: null,
            docPage: null,
            documentedAnywhere: false,
          });
        }
      }
      if (
        ran &&
        path.basename(file) === "package.json" &&
        /"(dependencies|devDependencies)"/.test(text)
      ) {
        escapes.push({ kind: "dep-change", turn: call.turn, detail: file });
      }
    }
  }

  const symbols = [...symbolFirstUse.values()].map((s) => {
    const page = ctx.docsIndex?.(s.name) ?? null;
    const documentedAnywhere = ctx.docsHasSymbol?.(s.name) ?? page !== null;
    const read = page === null ? undefined : pages.get(page.rel);
    return {
      ...s,
      docPage: page?.rel ?? null,
      firstDocReadTurn: read?.firstTurn ?? null,
      documentedAnywhere,
    };
  });

  const finalText = lastText(walk.turns);
  const contaminated =
    escapes.some(
      (e) =>
        e.kind === "denied-path-bash" ||
        e.kind === "outside-root-read" ||
        e.kind === "network-bash",
    ) || deniedRootRead;

  return {
    format: walk.format,
    cliVersion: walk.cliVersion,
    model: walk.model,
    turns: walk.result?.num_turns ?? walk.sessionTurns ?? walk.turns.length,
    assistantMessages: walk.turns.length,
    tokens: walk.tokens,
    costUsd: walk.result?.total_cost_usd ?? walk.sessionCostUsd,
    durationMs: walk.result?.duration_ms ?? walk.sessionDurationMs,
    toolHistogram,
    docPagesRead: [...pages.values()],
    escapes,
    bashCommands,
    errorToolResults,
    retryLoops: retryLoopsOf(bashCommands),
    symbols,
    finalText,
    docGapsStated: docGaps(finalText),
    contaminated,
  };
}

export function extractMetricsFromFile(
  file: string,
  ctx: ExtractContext,
): Metrics {
  const { records } = parseTranscriptLines(readFileSync(file, "utf8"));
  return extractMetrics(records, ctx);
}

/* --------------------------------------------------------------- bash */

const EXIT_CODE = /^(?:Error: )?Exit code (\d+)/m;

function bashCommand(call: ToolCall, cmd: string): BashCommand {
  const res = call.result;
  const structured = isRecord(res?.structured) ? res.structured : null;
  const stderr =
    structured !== null && typeof structured.stderr === "string"
      ? structured.stderr
      : "";
  const interrupted = structured?.interrupted === true;
  const isError = res?.isError === true;
  let exitCodeInferred: number | null = null;
  if (res !== null && !res.denied && !interrupted) {
    const m = EXIT_CODE.exec(res.text);
    if (m !== null) exitCodeInferred = Number(m[1]);
    else if (!isError) exitCodeInferred = 0;
  }
  const head =
    stderr.length > 0 ? stderr : res?.isError === true ? res.text : "";
  return {
    turn: call.turn,
    cmd,
    isError,
    exitCodeInferred,
    stderrHead: head.slice(0, 200),
  };
}

export function normalizeCommand(cmd: string): string {
  return cmd.replace(/\s+/g, " ").trim();
}

function retryLoopsOf(
  commands: BashCommand[],
): { cmd: string; count: number }[] {
  const failing = new Map<string, number>();
  for (const c of commands) {
    if (!c.isError) continue;
    const key = normalizeCommand(c.cmd);
    failing.set(key, (failing.get(key) ?? 0) + 1);
  }
  return [...failing.entries()]
    .filter(([, count]) => count >= 2)
    .map(([cmd, count]) => ({ cmd, count }));
}

function docsMentions(cmd: string, docsDir: string): string[] {
  const escaped = docsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}(?:/[^\\s"'\`|;&<>()]*)?`, "g");
  const out: string[] = [];
  for (const m of cmd.matchAll(re)) {
    const rel = path.relative(docsDir, m[0].replace(/\/+$/, ""));
    out.push(rel === "" ? "." : rel);
  }
  return out;
}

/* ------------------------------------------------------------ symbols */

export type ImportedSymbol = { pkg: string; name: string };

const IMPORT_RE =
  /import\s+(?:type\s+)?((?:\{[^}]*\})|(?:\*\s+as\s+[\w$]+)|(?:[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?))\s+from\s+["'](@powerhousedao\/[^"']+|document-model[^"']*)["']/g;

/** Imports from Powerhouse packages; namespace is `*`, default is `default`. */
export function importedSymbols(source: string): ImportedSymbol[] {
  const out: ImportedSymbol[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const clause = m[1];
    const pkg = m[2];
    const braceStart = clause.indexOf("{");
    const head = (braceStart >= 0 ? clause.slice(0, braceStart) : clause)
      .replace(/,\s*$/, "")
      .trim();
    if (head.length > 0) {
      if (/^\*\s+as\s+/.test(head)) out.push({ pkg, name: "*" });
      else out.push({ pkg, name: "default" });
    }
    if (braceStart >= 0) {
      const inner = clause.slice(braceStart + 1, clause.lastIndexOf("}"));
      for (const part of inner.split(",")) {
        const entry = part
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim()
          .replace(/^type\s+/, "");
        if (entry.length === 0) continue;
        const name = entry.split(/\s+as\s+/)[0].trim();
        if (name.length > 0) out.push({ pkg, name });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- text */

function lastText(turns: Turn[]): string {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const texts = turns[i].texts.filter((t) => t.trim().length > 0);
    if (texts.length > 0) return texts[texts.length - 1];
  }
  return "";
}

const GAPS_HEADING = /^#{1,6}\s*documentation gaps\s*$/im;

/** Body under a "Documentation gaps" heading, up to the next heading. */
export function docGaps(text: string): string | null {
  const m = GAPS_HEADING.exec(text);
  if (m === null) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^#{1,6}\s/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

/* -------------------------------------------------------------- utils */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function numberField(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
  }
  return null;
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (typeof b === "string") parts.push(b);
    else if (isRecord(b) && typeof b.text === "string") parts.push(b.text);
  }
  return parts.join("\n");
}

function resolveInput(p: string, cwd: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);
}

/** True when `child` is `root` or lies beneath it. */
export function isUnder(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  );
}
