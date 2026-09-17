import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeInvocation } from "../src/lib/claude-driver.js";
import { VALIDATED_CLI_VERSION } from "../src/lib/claude-driver.js";
import { ClaudeCli, buildArgs, parseCliVersion } from "../src/lib/claude.js";
import { FakeClaude } from "../src/lib/fake-claude.js";
import { ClaudeOutcome } from "../src/lib/schemas.js";
import { Semaphore } from "../src/lib/semaphore.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "fake-claude");
const FAKE_BIN = path.join(FIXTURES, "fake-claude.sh");

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-claude-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function invocation(
  overrides: Partial<ClaudeInvocation> = {},
): ClaudeInvocation {
  const cwd = path.join(tmp, "ws");
  mkdirSync(cwd, { recursive: true });
  return {
    cwd,
    prompt: "Build the recipe. Reply when done.",
    systemPromptFile: "/attempt/builder.system.md",
    model: "sonnet",
    settingsFile: "/attempt/settings.json",
    addDirs: ["/run/docs"],
    tools: ["Read", "Grep", "Glob", "Bash"],
    permissionMode: "dontAsk",
    maxTurns: 40,
    maxBudgetUsd: 2.5,
    wallClockMs: 20_000,
    sessionId: "99471370-f4aa-4208-b226-91a9ab79bcc7",
    authMode: "oauth-isolated",
    transcriptPath: path.join(tmp, "out", "transcript.stream.jsonl"),
    stderrPath: path.join(tmp, "out", "build.stderr.log"),
    ...overrides,
  };
}

function cli(
  mode: string,
  opts: ConstructorParameters<typeof ClaudeCli>[0] = {},
) {
  return {
    driver: new ClaudeCli({ binary: FAKE_BIN, ...opts }),
    env: { FAKE_CLAUDE_MODE: mode },
  };
}

describe("buildArgs", () => {
  it("oauth-isolated invocation: isolation flags, no --bare, prompt last", () => {
    const args = buildArgs(invocation());
    expect(args).toEqual([
      "-p",
      "--model",
      "sonnet",
      "--permission-mode",
      "dontAsk",
      "--settings",
      "/attempt/settings.json",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--tools",
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "--add-dir",
      "/run/docs",
      "--max-turns",
      "40",
      "--max-budget-usd",
      "2.5",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      "99471370-f4aa-4208-b226-91a9ab79bcc7",
      "--system-prompt-file",
      "/attempt/builder.system.md",
      "Build the recipe. Reply when done.",
    ]);
    expect(args).not.toContain("--bare");
    expect(args).not.toContain("--no-session-persistence");
  });

  it("bare invocation adds --bare; empty tools becomes a single empty arg", () => {
    const args = buildArgs(
      invocation({ authMode: "bare", tools: [], addDirs: [], model: "haiku" }),
    );
    expect(args.slice(0, 4)).toEqual(["-p", "--bare", "--model", "haiku"]);
    const i = args.indexOf("--tools");
    expect(args[i + 1]).toBe("");
    expect(args[i + 2]).toBe("--max-turns");
    expect(args).not.toContain("--add-dir");
  });

  it("--json-schema carries the minified schema text and the prompt stays last", () => {
    const schemaFile = path.join(tmp, "judge.schema.json");
    writeFileSync(
      schemaFile,
      '{\n  "type": "object",\n  "properties": {\n    "answer": { "type": "string" }\n  }\n}\n',
    );
    const prompt = "Judge this.";
    const args = buildArgs(
      invocation({ jsonSchemaFile: schemaFile, prompt, addDirs: ["/a", "/b"] }),
    );
    const i = args.indexOf("--json-schema");
    expect(args[i + 1]).toBe(
      '{"type":"object","properties":{"answer":{"type":"string"}}}',
    );
    expect(args.at(-1)).toBe(prompt);
    expect(args.filter((a) => a === "--add-dir")).toHaveLength(2);
  });
});

describe("parseCliVersion", () => {
  it("takes the leading token", () => {
    expect(parseCliVersion("2.1.258 (Claude Code)\n")).toBe("2.1.258");
  });
});

describe("ClaudeCli with the fake binary", () => {
  it("version() runs --version once and caches", async () => {
    const { driver } = cli("ok");
    expect(await driver.version()).toBe(
      `${VALIDATED_CLI_VERSION} (Claude Code)`,
    );
    expect(await driver.version()).toBe(
      `${VALIDATED_CLI_VERSION} (Claude Code)`,
    );
  });

  it("ok: exit 0 with a result record; transcript and stderr on disk", async () => {
    const { driver, env } = cli("ok");
    const argsFile = path.join(tmp, "args.txt");
    const inv = invocation({
      extraEnv: { ...env, FAKE_CLAUDE_ARGS_FILE: argsFile },
    });
    const out = await driver.run(inv);
    expect(ClaudeOutcome.parse(out)).toEqual(out);
    expect(out.ok).toBe(true);
    expect(out.failureReason).toBeUndefined();
    expect(out.exitCode).toBe(0);
    expect(out.killedByWallClock).toBe(false);
    expect(out.resultRecord?.subtype).toBe("success");
    expect(out.costUsd).toBeCloseTo(0.0188332);
    expect(out.turns).toBe(5);
    expect(out.structuredOutput).toBeNull();
    expect(out.sessionJsonlPath).toBeNull();
    expect(out.model).toBe("sonnet");
    expect(out.cliVersion).toBe(VALIDATED_CLI_VERSION);
    expect(out.argv[0]).toBe(FAKE_BIN);
    expect(out.argv.slice(1)).toEqual(buildArgs(inv));
    expect(out.stderrTail).toContain("mode=ok");

    const lines = readFileSync(inv.transcriptPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(6);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: "system",
      subtype: "init",
    });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ type: "result" });
    expect(readFileSync(inv.stderrPath, "utf8")).toContain("mode=ok");
    expect(readFileSync(argsFile, "utf8").trimEnd().split("\n")).toEqual(
      buildArgs(inv),
    );
  });

  it("noresult: exit 0 without a result record is a failure", async () => {
    const { driver, env } = cli("noresult");
    const out = await driver.run(invocation({ extraEnv: env }));
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe("no-result-record");
    expect(out.exitCode).toBe(0);
    expect(out.resultRecord).toBeNull();
    expect(out.costUsd).toBeNull();
  });

  it("apierror: is_error wins even though subtype is success", async () => {
    const { driver, env } = cli("apierror");
    const out = await driver.run(invocation({ extraEnv: env }));
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe("api-error");
    expect(out.exitCode).toBe(1);
    expect(out.resultRecord?.subtype).toBe("success");
    expect(out.resultRecord?.is_error).toBe(true);
    expect(out.resultRecord?.terminal_reason).toBe("api_error");
    expect(out.resultRecord?.api_error_status).toBe(404);
  });

  it("budget: error_max_budget_usd has no result key and still parses", async () => {
    const { driver, env } = cli("budget");
    const out = await driver.run(invocation({ extraEnv: env }));
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe("budget-exhausted");
    expect(out.exitCode).toBe(1);
    expect(out.resultRecord?.subtype).toBe("error_max_budget_usd");
    expect(out.resultRecord?.result).toBeUndefined();
    expect(out.resultRecord?.errors).toEqual(["Reached maximum budget ($0.1)"]);
    expect(out.costUsd).toBeCloseTo(0.121494);
  });

  it("structured: structured_output is surfaced", async () => {
    const { driver, env } = cli("structured");
    const out = await driver.run(invocation({ extraEnv: env }));
    expect(out.ok).toBe(true);
    expect(out.structuredOutput).toEqual({ answer: "ok", n: 3 });
    expect(out.resultRecord?.result).toBe('{"answer":"ok","n":3}');
  });

  it("hang: the wall clock kills the process group", async () => {
    const { driver, env } = cli("hang");
    const startedAt = Date.now();
    const inv = invocation({ extraEnv: env, wallClockMs: 500 });
    const out = await driver.run(inv);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    expect(out.ok).toBe(false);
    expect(out.killedByWallClock).toBe(true);
    expect(out.failureReason).toBe("wall-clock");
    expect(out.signal).toBe("SIGTERM");
    expect(out.exitCode).toBeNull();
    // The init line was flushed before the hang.
    const lines = readFileSync(inv.transcriptPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: "system",
      subtype: "init",
    });
  });

  it("refuses to spawn on CLI version drift", async () => {
    const { driver, env } = cli("ok", { validatedVersion: "9.9.9" });
    const inv = invocation({ extraEnv: env });
    const out = await driver.run(inv);
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe("cli-version-drift");
    expect(out.cliVersion).toBe(VALIDATED_CLI_VERSION);
    expect(out.stderrTail).toContain("9.9.9");
    expect(existsSync(inv.transcriptPath)).toBe(false);
  });

  it("runs anyway when drift is allowed", async () => {
    const { driver, env } = cli("ok", {
      validatedVersion: "9.9.9",
      allowVersionDrift: true,
    });
    const out = await driver.run(invocation({ extraEnv: env }));
    expect(out.ok).toBe(true);
  });

  it("a missing binary is a spawn-error, not a throw", async () => {
    const driver = new ClaudeCli({
      binary: path.join(tmp, "definitely-not-here"),
      validatedVersion: VALIDATED_CLI_VERSION,
    });
    const out = await driver.run(invocation());
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe("spawn-error");
    expect(out.stderrTail).toContain("ENOENT");
  });

  it("bare mode: CLAUDE_CONFIG_DIR is set and the session file is copied", async () => {
    const configDir = path.join(tmp, "cfg");
    const { driver, env } = cli("ok", { configDir });
    const inv = invocation({
      authMode: "bare",
      sessionId: randomUUID(),
      sessionJsonlCopyPath: path.join(tmp, "out", "session.jsonl"),
      extraEnv: { ...env, FAKE_CLAUDE_WRITE_SESSION: "1" },
    });
    const out = await driver.run(inv);
    expect(out.ok).toBe(true);
    expect(out.sessionJsonlPath).toBe(inv.sessionJsonlCopyPath);
    const copied = JSON.parse(
      readFileSync(inv.sessionJsonlCopyPath!, "utf8"),
    ) as {
      sessionId: string;
      cwd: string;
    };
    expect(copied.sessionId).toBe(inv.sessionId);
    // The child sees the resolved cwd; the driver must look there too.
    expect(copied.cwd).toBe(realpathSync(inv.cwd));
  });

  it("oauth-isolated: CLAUDE_CONFIG_DIR is not touched; missing session is null", async () => {
    const { driver, env } = cli("ok", { configDir: path.join(tmp, "cfg") });
    const inv = invocation({
      sessionJsonlCopyPath: path.join(tmp, "out", "session.jsonl"),
      extraEnv: { ...env, FAKE_CLAUDE_WRITE_SESSION: "1" },
    });
    const out = await driver.run(inv);
    expect(out.ok).toBe(true);
    // Not bare, so the fake had no CLAUDE_CONFIG_DIR and wrote nothing.
    expect(out.sessionJsonlPath).toBeNull();
    expect(existsSync(inv.sessionJsonlCopyPath!)).toBe(false);
  });

  it("serialises runs through the semaphore", async () => {
    const sem = new Semaphore(1);
    const { driver, env } = cli("ok", { semaphore: sem });
    let peak = 0;
    const watch = setInterval(() => {
      peak = Math.max(peak, sem.inFlight);
    }, 5);
    try {
      const runs = [1, 2, 3].map((n) =>
        driver.run(
          invocation({
            extraEnv: env,
            transcriptPath: path.join(tmp, `out/${n}.jsonl`),
            stderrPath: path.join(tmp, `out/${n}.stderr`),
          }),
        ),
      );
      const outs = await Promise.all(runs);
      expect(outs.every((o) => o.ok)).toBe(true);
    } finally {
      clearInterval(watch);
    }
    expect(peak).toBe(1);
    expect(sem.inFlight).toBe(0);
  });
});

describe("FakeClaude", () => {
  const fixture = path.join(FIXTURES, "ok.jsonl");

  it("copies the fixture, replaces the result line, writes empty stderr", async () => {
    const fake = new FakeClaude({
      transcriptFixture: fixture,
      resultOverride: { total_cost_usd: 0.5, num_turns: 7 },
    });
    expect(await fake.version()).toContain(VALIDATED_CLI_VERSION);
    const inv = invocation({
      sessionJsonlCopyPath: path.join(tmp, "out", "session.jsonl"),
    });
    const out = await fake.run(inv);
    expect(ClaudeOutcome.parse(out)).toEqual(out);
    expect(out.ok).toBe(true);
    expect(out.costUsd).toBe(0.5);
    expect(out.turns).toBe(7);
    expect(out.resultRecord?.session_id).toBe(inv.sessionId);
    expect(out.sessionJsonlPath).toBe(inv.sessionJsonlCopyPath);
    expect(fake.invocations).toHaveLength(1);

    const lines = readFileSync(inv.transcriptPath, "utf8").trim().split("\n");
    expect(lines.filter((l) => l.includes('"type":"result"'))).toHaveLength(1);
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      type: "result",
      total_cost_usd: 0.5,
    });
    expect(readFileSync(inv.stderrPath, "utf8")).toBe("");
  });

  it("structuredOutput lands in both places", async () => {
    const fake = new FakeClaude({
      transcriptFixture: fixture,
      structuredOutput: { findings: [] },
    });
    const out = await fake.run(invocation());
    expect(out.structuredOutput).toEqual({ findings: [] });
    expect(out.resultRecord?.result).toBe('{"findings":[]}');
  });

  it.each([
    ["no-result-record", 0, null],
    ["api-error", 1, null],
    ["nonzero-exit", 1, null],
    ["wall-clock", null, "SIGTERM"],
    ["spawn-error", null, null],
    ["cli-version-drift", null, null],
  ] as const)("failWith %s", async (reason, code, signal) => {
    const fake = new FakeClaude({
      transcriptFixture: fixture,
      failWith: reason,
    });
    const out = await fake.run(invocation());
    expect(ClaudeOutcome.parse(out)).toEqual(out);
    expect(out.ok).toBe(false);
    expect(out.failureReason).toBe(reason);
    expect(out.exitCode).toBe(code);
    expect(out.signal).toBe(signal);
    expect(out.killedByWallClock).toBe(reason === "wall-clock");
    if (reason === "api-error") expect(out.resultRecord?.is_error).toBe(true);
    if (reason === "no-result-record" || reason === "wall-clock") {
      expect(out.resultRecord).toBeNull();
    }
  });

  it("delayMs is honoured", async () => {
    const fake = new FakeClaude({ transcriptFixture: fixture, delayMs: 50 });
    const t = Date.now();
    await fake.run(invocation());
    expect(Date.now() - t).toBeGreaterThanOrEqual(45);
  });
});
