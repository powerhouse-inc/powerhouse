/** Fixture-backed driver for --dry-run and workflow tests; spawns nothing. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { buildArgs } from "./claude.js";
import type { ClaudeDriver, ClaudeInvocation } from "./claude-driver.js";
import { VALIDATED_CLI_VERSION } from "./claude-driver.js";
import {
  ClaudeOutcome,
  ResultRecord,
  type ClaudeFailureReason,
} from "./schemas.js";
import { parseTranscriptLines, walkTranscript } from "./transcript.js";

export interface FakeClaudeOptions {
  /** A stream-json file; any result line in it is replaced. */
  transcriptFixture: string;
  resultOverride?: Partial<ResultRecord>;
  structuredOutput?: unknown;
  delayMs?: number;
  failWith?: ClaudeFailureReason;
}

export class FakeClaude implements ClaudeDriver {
  readonly name = "fake-claude";
  readonly #opts: FakeClaudeOptions;
  readonly invocations: ClaudeInvocation[] = [];

  constructor(opts: FakeClaudeOptions) {
    this.#opts = opts;
  }

  version(): Promise<string> {
    return Promise.resolve(`${VALIDATED_CLI_VERSION} (Claude Code)`);
  }

  async run(inv: ClaudeInvocation): Promise<ClaudeOutcome> {
    this.invocations.push(inv);
    const startedAt = Date.now();
    const { failWith, delayMs } = this.#opts;
    if (delayMs !== undefined && delayMs > 0) await sleep(delayMs);
    const argv = ["fake-claude", ...buildArgs(inv)];

    if (failWith === "cli-version-drift") {
      return this.#outcome(inv, argv, {
        exitCode: null,
        failureReason: failWith,
        durationMs: Date.now() - startedAt,
      });
    }

    const lines = readFileSync(this.#opts.transcriptFixture, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .filter((l) => !isResultLine(l));

    const result = this.#result(inv, failWith);
    const killed = failWith === "wall-clock" || failWith === "rate-limited";
    const emitResult =
      failWith !== "no-result-record" && !killed && failWith !== "spawn-error";
    const out = emitResult ? [...lines, JSON.stringify(result)] : lines;

    for (const p of [inv.transcriptPath, inv.stderrPath]) {
      mkdirSync(path.dirname(p), { recursive: true });
    }
    writeFileSync(inv.transcriptPath, out.map((l) => l + "\n").join(""));
    writeFileSync(inv.stderrPath, "");

    let sessionJsonlPath: string | null = null;
    if (inv.sessionJsonlCopyPath !== undefined && failWith !== "spawn-error") {
      mkdirSync(path.dirname(inv.sessionJsonlCopyPath), { recursive: true });
      writeFileSync(
        inv.sessionJsonlCopyPath,
        lines.map((l) => l + "\n").join(""),
      );
      sessionJsonlPath = inv.sessionJsonlCopyPath;
    }

    const exit = exitFor(failWith);
    const walk = walkTranscript(parseTranscriptLines(lines.join("\n")).records);
    return this.#outcome(inv, argv, {
      tokens: walk.turns.length > 0 ? walk.tokens : null,
      exitCode: exit.code,
      signal: exit.signal,
      killedByWallClock: killed,
      failureReason: failWith,
      apiRetries: failWith === "rate-limited" ? 3 : 0,
      resultRecord: emitResult ? result : null,
      structuredOutput: emitResult ? (result.structured_output ?? null) : null,
      sessionJsonlPath,
      durationMs: Date.now() - startedAt,
      costUsd: emitResult ? (result.total_cost_usd ?? null) : null,
      turns: emitResult ? (result.num_turns ?? null) : null,
    });
  }

  #result(
    inv: ClaudeInvocation,
    failWith: ClaudeFailureReason | undefined,
  ): ResultRecord {
    const base: ResultRecord = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 1200,
      duration_api_ms: 1000,
      num_turns: 3,
      total_cost_usd: 0.0123,
      session_id: inv.sessionId,
      result: "fake result",
      terminal_reason: "completed",
      api_error_status: null,
      permission_denials: [],
    };
    const failure: Partial<ResultRecord> =
      failWith === "api-error"
        ? {
            is_error: true,
            terminal_reason: "api_error",
            api_error_status: 500,
            result: "fake api error",
          }
        : {};
    const structured =
      this.#opts.structuredOutput !== undefined
        ? {
            structured_output: this.#opts.structuredOutput,
            result: JSON.stringify(this.#opts.structuredOutput),
          }
        : {};
    return ResultRecord.parse({
      ...base,
      ...structured,
      ...failure,
      ...this.#opts.resultOverride,
    });
  }

  #outcome(
    inv: ClaudeInvocation,
    argv: string[],
    partial: Partial<ClaudeOutcome>,
  ): ClaudeOutcome {
    return ClaudeOutcome.parse({
      ok: partial.failureReason === undefined,
      exitCode: 0,
      signal: null,
      killedByWallClock: false,
      resultRecord: null,
      structuredOutput: null,
      transcriptPath: inv.transcriptPath,
      sessionJsonlPath: null,
      stderrPath: inv.stderrPath,
      stderrTail: "",
      durationMs: 0,
      costUsd: null,
      turns: null,
      model: inv.model,
      cliVersion: VALIDATED_CLI_VERSION,
      argv,
      ...partial,
    });
  }
}

function isResultLine(line: string): boolean {
  if (!line.includes('"type":"result"')) return false;
  try {
    const json: unknown = JSON.parse(line);
    return (
      typeof json === "object" &&
      json !== null &&
      (json as { type?: unknown }).type === "result"
    );
  } catch {
    return false;
  }
}

function exitFor(failWith: ClaudeFailureReason | undefined): {
  code: number | null;
  signal: string | null;
} {
  switch (failWith) {
    case undefined:
    case "no-result-record":
      return { code: 0, signal: null };
    case "api-error":
    case "budget-exhausted":
    case "nonzero-exit":
      return { code: 1, signal: null };
    case "wall-clock":
    case "rate-limited":
      return { code: null, signal: "SIGTERM" };
    case "spawn-error":
    case "cli-version-drift":
      return { code: null, signal: null };
  }
}
