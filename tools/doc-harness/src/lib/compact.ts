/** Judge-facing markdown of a transcript: one section per assistant record. */
import { walkTranscript, type ToolCall } from "./transcript.js";

export type CompactOptions = {
  /** Assistant text per turn. */
  textLimit?: number;
  /** Tool result text per call. */
  resultLimit?: number;
  /** Lines shown of a Write's content. */
  writeHeadLines?: number;
};

const DEFAULTS: Required<CompactOptions> = {
  textLimit: 500,
  resultLimit: 1500,
  writeHeadLines: 40,
};

export function compactTranscript(
  records: unknown[],
  opts: CompactOptions = {},
): string {
  const o = { ...DEFAULTS, ...opts };
  const walk = walkTranscript(records);
  const out: string[] = [];

  for (const turn of walk.turns) {
    const texts = turn.texts.filter((t) => t.trim().length > 0);
    if (texts.length === 0 && turn.toolCalls.length === 0) continue;
    out.push(`## Turn ${turn.index}`, "");
    for (const t of texts) out.push(truncate(t.trim(), o.textLimit), "");
    for (const call of turn.toolCalls) {
      out.push(...renderCall(call, o), "");
    }
  }

  out.push("## Result", "");
  const r = walk.result;
  if (r === null) {
    out.push("(no result record)");
    if (walk.sessionCostUsd !== null)
      out.push(`- cost_usd: ${walk.sessionCostUsd}`);
    out.push(`- assistant_messages: ${walk.turns.length}`);
  } else {
    out.push(
      `- subtype: ${r.subtype}`,
      `- is_error: ${String(r.is_error)}`,
      `- terminal_reason: ${r.terminal_reason ?? "unknown"}`,
      `- turns: ${r.num_turns ?? "unknown"}`,
      `- cost_usd: ${r.total_cost_usd ?? "unknown"}`,
      `- duration_ms: ${r.duration_ms ?? "unknown"}`,
    );
    const denials = r.permission_denials ?? [];
    if (denials.length > 0) out.push(`- permission_denials: ${denials.length}`);
    if (r.errors !== undefined && r.errors.length > 0)
      out.push(`- errors: ${r.errors.join("; ")}`);
  }
  out.push("");
  return out.join("\n");
}

function renderCall(call: ToolCall, o: Required<CompactOptions>): string[] {
  const lines: string[] = [];
  const input = call.input;
  const str = (k: string): string | null =>
    typeof input[k] === "string" ? (input[k] as string) : null;

  switch (call.name) {
    case "Bash":
      lines.push(`- **Bash** ${inline(str("command") ?? "")}`);
      break;
    case "Read":
      lines.push(`- **Read** ${str("file_path") ?? ""}`);
      break;
    case "Glob":
    case "Grep": {
      const where = str("path");
      lines.push(
        `- **${call.name}** ${inline(str("pattern") ?? "")}${where === null ? "" : ` in ${where}`}`,
      );
      break;
    }
    case "Write": {
      lines.push(`- **Write** ${str("file_path") ?? ""}`);
      lines.push(...fence(headLines(str("content") ?? "", o.writeHeadLines)));
      break;
    }
    case "Edit": {
      lines.push(`- **Edit** ${str("file_path") ?? ""}`);
      lines.push("  old:");
      lines.push(...fence(truncate(str("old_string") ?? "", o.textLimit)));
      lines.push("  new:");
      lines.push(...fence(truncate(str("new_string") ?? "", o.textLimit)));
      break;
    }
    default:
      lines.push(`- **${call.name}** ${inline(JSON.stringify(input))}`);
  }

  const res = call.result;
  if (res === null) {
    lines.push("  result: (none)");
    return lines;
  }
  const flags = [res.isError ? "is_error" : "ok", res.denied ? "denied" : null]
    .filter((f): f is string => f !== null)
    .join(", ");
  lines.push(`  result: ${flags}`);
  if (res.text.trim().length > 0)
    lines.push(...fence(truncate(res.text, o.resultLimit)));
  return lines;
}

/* -------------------------------------------------------------- utils */

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[... truncated ${text.length - limit} chars]`;
}

function headLines(text: string, n: number): string {
  const lines = text.split("\n");
  if (lines.length <= n) return text;
  return `${lines.slice(0, n).join("\n")}\n[... ${lines.length - n} more lines]`;
}

function inline(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  const shown = one.length > 300 ? `${one.slice(0, 300)} [...]` : one;
  return `\`${shown.replace(/`/g, "'")}\``;
}

function fence(body: string): string[] {
  const ticks = body.includes("```") ? "````" : "```";
  return [`  ${ticks}`, ...body.split("\n").map((l) => `  ${l}`), `  ${ticks}`];
}
