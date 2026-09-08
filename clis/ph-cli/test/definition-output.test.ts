import type { DefinitionCheckReport } from "document-model/tooling";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  definitionReportExitCode,
  renderDefinitionReport,
} from "../src/services/definition-output.js";

const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

function report(status: "ok" | "invalid" | "failed"): DefinitionCheckReport {
  return {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: "edit",
    status,
    sourceSet: {
      mode: "code-first",
      origin: "config",
      digest,
      sources: [],
    },
    definitions: [],
    diagnostics: [],
    summary: { errors: status === "ok" ? 0 : 1, warnings: 0 },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("definition command output", () => {
  it("writes exactly one JSON value and maps closed statuses to exit codes", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const value = report("ok");

    renderDefinitionReport(value, true);

    expect(stdout).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(value)}\n`);
    expect(definitionReportExitCode(value)).toBe(0);
    expect(definitionReportExitCode(report("invalid"))).toBe(1);
    expect(definitionReportExitCode(report("failed"))).toBe(2);
  });
});
