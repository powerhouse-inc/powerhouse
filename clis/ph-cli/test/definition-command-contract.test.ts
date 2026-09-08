import { run } from "cmd-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelCheck, modelInspect } from "../src/commands/model.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function runJsonCommand(
  command: Parameters<typeof run>[0],
  args: string[],
): Promise<Record<string, unknown>> {
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);

  await run(command, args);

  expect(stdout).toHaveBeenCalledOnce();
  expect(stderr).not.toHaveBeenCalled();
  const output = String(stdout.mock.calls[0]?.[0]);
  expect(output.endsWith("\n")).toBe(true);
  return JSON.parse(output) as Record<string, unknown>;
}

describe("definition command JSON contracts", () => {
  it("renders an invalid model selector as one versioned JSON report", async () => {
    const report = await runJsonCommand(modelInspect, [
      "invalid-selector",
      "--json=true",
    ]);

    expect(report).toMatchObject({
      kind: "powerhouse.definition-command",
      formatVersion: 1,
      command: "model.inspect",
      status: "invalid",
      diagnostics: [
        {
          code: "PH-INSPECT-SELECTOR-INVALID",
          received: "invalid-selector",
        },
      ],
    });
    expect(process.exitCode).toBe(1);
  });

  it("rejects retained checks that omit the release profile", async () => {
    const report = await runJsonCommand(modelCheck, [
      "--retained",
      "--json=true",
    ]);

    expect(report).toMatchObject({
      kind: "powerhouse.definition-command",
      formatVersion: 1,
      command: "model.check",
      status: "invalid",
      diagnostics: [{ code: "PH-CLI-OPTION-REQUIRED" }],
    });
    expect(process.exitCode).toBe(1);
  });

  it("rejects a retained-report directory without retained mode", async () => {
    const report = await runJsonCommand(modelCheck, [
      "--out-dir",
      "custom output",
      "--json=true",
    ]);

    expect(report).toMatchObject({
      kind: "powerhouse.definition-command",
      formatVersion: 1,
      command: "model.check",
      status: "invalid",
      diagnostics: [
        {
          code: "PH-CLI-OPTION-INCOMPATIBLE",
          received: "--out-dir custom output",
        },
      ],
    });
    expect(process.exitCode).toBe(1);
  });
});
