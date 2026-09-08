import { describe, expect, it } from "vitest";
import {
  isPhCliJsonReportInvocation,
  phCliCommandsWithSubcommands,
} from "./command-names.js";

describe("phCliCommandsWithSubcommands", () => {
  it("matches the cmd-ts subcommand trees used for telemetry", () => {
    expect(phCliCommandsWithSubcommands).toEqual([
      "generate",
      "connect",
      "model",
      "scalar",
      "subgraph",
    ]);
  });
});

describe("isPhCliJsonReportInvocation", () => {
  it.each(["model", "scalar", "subgraph"])(
    "recognizes %s JSON reports",
    (command) => {
      expect(isPhCliJsonReportInvocation([command, "inspect", "--json"])).toBe(
        true,
      );
      expect(
        isPhCliJsonReportInvocation([command, "inspect", "--json=false"]),
      ).toBe(true);
    },
  );

  it("does not classify Connect's JSON option as a definition report", () => {
    expect(
      isPhCliJsonReportInvocation(["connect", "build", "--json", "{}"]),
    ).toBe(false);
  });
});
