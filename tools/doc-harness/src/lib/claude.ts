/** Real `claude -p` driver. Failure is exit != 0 OR is_error OR no result. */
import { execFile, spawn } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  type WriteStream,
} from "node:fs";
import path from "node:path";
import type { ClaudeDriver, ClaudeInvocation } from "./claude-driver.js";
import { VALIDATED_CLI_VERSION } from "./claude-driver.js";
import { claudeSessionFile, defaultClaudeConfigDir } from "./paths.js";
import {
  ClaudeOutcome,
  ResultRecord,
  type ClaudeFailureReason,
} from "./schemas.js";
import { Semaphore } from "./semaphore.js";

const STDERR_TAIL_BYTES = 4096;
const SIGKILL_GRACE_MS = 5_000;

/** The argv after the binary. Pure; the prompt is always the last element. */
export function buildArgs(inv: ClaudeInvocation): string[] {
  const args: string[] = ["-p"];
  if (inv.authMode === "bare") args.push("--bare");
  args.push("--model", inv.model);
  args.push("--permission-mode", inv.permissionMode);
  args.push("--settings", inv.settingsFile);
  args.push("--setting-sources", "");
  args.push("--strict-mcp-config");
  args.push("--mcp-config", '{"mcpServers":{}}');
  args.push("--tools", ...(inv.tools.length === 0 ? [""] : inv.tools));
  for (const dir of inv.addDirs) args.push("--add-dir", dir);
  args.push("--max-turns", String(inv.maxTurns));
  args.push("--max-budget-usd", String(inv.maxBudgetUsd));
  args.push("--output-format", "stream-json");
  args.push("--verbose");
  args.push("--session-id", inv.sessionId);
  args.push("--system-prompt-file", inv.systemPromptFile);
  if (inv.jsonSchemaFile !== undefined) {
    args.push("--json-schema", minifyJsonFile(inv.jsonSchemaFile));
  }
  args.push(inv.prompt);
  return args;
}

/** `--json-schema` takes the schema text, not a path. */
export function minifyJsonFile(file: string): string {
  const text = readFileSync(file, "utf8");
  return JSON.stringify(JSON.parse(text));
}

/** `2.1.258` out of `2.1.258 (Claude Code)`. */
export function parseCliVersion(versionOutput: string): string {
  return versionOutput.trim().split(/\s+/)[0] ?? "";
}

export interface ClaudeCliOptions {
  binary?: string;
  semaphore?: Semaphore;
  validatedVersion?: string;
  allowVersionDrift?: boolean;
  /** CLAUDE_CONFIG_DIR for bare mode; also where the session file is looked up. */
  configDir?: string;
}

export class ClaudeCli implements ClaudeDriver {
  readonly name = "claude-cli";
  readonly #binary: string;
  readonly #semaphore: Semaphore;
  readonly #validatedVersion: string;
  readonly #allowVersionDrift: boolean;
  readonly #configDir: string | undefined;
  #version: Promise<string> | undefined;

  constructor(opts: ClaudeCliOptions = {}) {
    this.#binary = opts.binary ?? "claude";
    this.#semaphore = opts.semaphore ?? new Semaphore(1);
    this.#validatedVersion = opts.validatedVersion ?? VALIDATED_CLI_VERSION;
    this.#allowVersionDrift = opts.allowVersionDrift ?? false;
    this.#configDir = opts.configDir;
  }

  version(): Promise<string> {
    this.#version ??= new Promise<string>((resolve, reject) => {
      execFile(
        this.#binary,
        ["--version"],
        { encoding: "utf8", timeout: 30_000 },
        (err, stdout) => {
          if (err) reject(new Error(err.message, { cause: err }));
          else resolve(stdout.trim());
        },
      );
    });
    return this.#version;
  }

  async run(inv: ClaudeInvocation): Promise<ClaudeOutcome> {
    const argv = [this.#binary, ...buildArgs(inv)];
    let cliVersion: string;
    try {
      cliVersion = parseCliVersion(await this.version());
    } catch (err) {
      return refused(inv, argv, "unknown", "spawn-error", describe(err));
    }
    if (cliVersion !== this.#validatedVersion && !this.#allowVersionDrift) {
      return refused(
        inv,
        argv,
        cliVersion,
        "cli-version-drift",
        `claude ${cliVersion} != validated ${this.#validatedVersion}; pass --allow-cli-drift to run anyway`,
      );
    }
    return this.#semaphore.with(() => this.#spawn(inv, argv, cliVersion));
  }

  #spawn(
    inv: ClaudeInvocation,
    argv: string[],
    cliVersion: string,
  ): Promise<ClaudeOutcome> {
    const configDir = inv.configDir ?? this.#configDir;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: "1",
      ...inv.extraEnv,
    };
    if (inv.authMode === "bare" && configDir !== undefined) {
      env.CLAUDE_CONFIG_DIR = configDir;
    }

    mkdirSync(path.dirname(inv.transcriptPath), { recursive: true });
    mkdirSync(path.dirname(inv.stderrPath), { recursive: true });
    const transcript = createWriteStream(inv.transcriptPath);
    const stderr = createWriteStream(inv.stderrPath);

    const startedAt = Date.now();
    let killedByWallClock = false;
    let spawnError: Error | undefined;
    let resultRecord: ResultRecord | null = null;
    let stderrTail = "";
    let pending = "";

    const onLine = (line: string) => {
      transcript.write(line + "\n");
      if (!line.includes('"type":"result"')) return;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        return;
      }
      const parsed = ResultRecord.safeParse(json);
      if (parsed.success) resultRecord = parsed.data;
    };

    return new Promise<ClaudeOutcome>((resolve) => {
      const child = spawn(this.#binary, argv.slice(1), {
        cwd: inv.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env,
      });

      const killTree = (signal: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, signal);
        } catch {
          // Group already gone.
        }
      };

      const timer = setTimeout(() => {
        killedByWallClock = true;
        killTree("SIGTERM");
        setTimeout(() => killTree("SIGKILL"), SIGKILL_GRACE_MS).unref();
      }, inv.wallClockMs);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        pending += chunk;
        let nl = pending.indexOf("\n");
        while (nl !== -1) {
          onLine(pending.slice(0, nl).replace(/\r$/, ""));
          pending = pending.slice(nl + 1);
          nl = pending.indexOf("\n");
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr.write(chunk);
        stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
      });

      let settled = false;
      const settle = (
        code: number | null,
        signal: NodeJS.Signals | null,
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (pending.length > 0) onLine(pending);
        pending = "";
        void Promise.all([finish(transcript), finish(stderr)]).then(() => {
          const durationMs = Date.now() - startedAt;
          const failureReason = classify({
            killedByWallClock,
            spawnError,
            code,
            result: resultRecord,
          });
          const outcome: ClaudeOutcome = {
            ok: failureReason === undefined,
            exitCode: code,
            signal,
            killedByWallClock,
            failureReason,
            resultRecord,
            structuredOutput: resultRecord?.structured_output ?? null,
            transcriptPath: inv.transcriptPath,
            sessionJsonlPath: copySession(inv, configDir),
            stderrPath: inv.stderrPath,
            stderrTail: spawnError
              ? `${stderrTail}\n[spawn error] ${spawnError.message}`.trim()
              : stderrTail,
            durationMs,
            costUsd: resultRecord?.total_cost_usd ?? null,
            turns: resultRecord?.num_turns ?? null,
            model: inv.model,
            cliVersion,
            argv,
          };
          resolve(ClaudeOutcome.parse(outcome));
        });
      };

      child.on("error", (err) => {
        spawnError = err;
        settle(null, null);
      });
      child.on("close", settle);
    });
  }
}

function classify(input: {
  killedByWallClock: boolean;
  spawnError: Error | undefined;
  code: number | null;
  result: ResultRecord | null;
}): ClaudeFailureReason | undefined {
  const { killedByWallClock, spawnError, code, result } = input;
  if (killedByWallClock) return "wall-clock";
  if (spawnError) return "spawn-error";
  if (
    result &&
    (result.terminal_reason === "budget_exhausted" ||
      result.subtype === "error_max_budget_usd")
  ) {
    return "budget-exhausted";
  }
  if (result && (result.is_error || result.terminal_reason === "api_error")) {
    return "api-error";
  }
  if (code !== 0) return "nonzero-exit";
  if (!result) return "no-result-record";
  return undefined;
}

/** The CLI encodes the resolved cwd (macOS: /tmp -> /private/tmp), so try both spellings. */
function copySession(
  inv: ClaudeInvocation,
  configDir: string | undefined,
): string | null {
  if (inv.sessionJsonlCopyPath === undefined) return null;
  const root = configDir ?? defaultClaudeConfigDir();
  const cwds = [inv.cwd];
  try {
    const real = realpathSync(inv.cwd);
    if (real !== inv.cwd) cwds.unshift(real);
  } catch {
    // cwd may already be gone; fall through to the literal spelling.
  }
  for (const cwd of cwds) {
    const src = claudeSessionFile(root, cwd, inv.sessionId);
    if (!existsSync(src)) continue;
    try {
      mkdirSync(path.dirname(inv.sessionJsonlCopyPath), { recursive: true });
      copyFileSync(src, inv.sessionJsonlCopyPath);
      return inv.sessionJsonlCopyPath;
    } catch {
      return null;
    }
  }
  return null;
}

function finish(stream: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.once("error", () => resolve());
    stream.end(() => resolve());
  });
}

function refused(
  inv: ClaudeInvocation,
  argv: string[],
  cliVersion: string,
  failureReason: ClaudeFailureReason,
  message: string,
): ClaudeOutcome {
  return ClaudeOutcome.parse({
    ok: false,
    exitCode: null,
    signal: null,
    killedByWallClock: false,
    failureReason,
    resultRecord: null,
    structuredOutput: null,
    transcriptPath: inv.transcriptPath,
    sessionJsonlPath: null,
    stderrPath: inv.stderrPath,
    stderrTail: message,
    durationMs: 0,
    costUsd: null,
    turns: null,
    model: inv.model,
    cliVersion,
    argv,
  } satisfies ClaudeOutcome);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
