import { describe, expect, it, vi } from "vitest";
import {
  ADMINISTRATION_LOG_PREFIX,
  describeAdministrator,
  logAdministration,
} from "./administration.js";

describe("describeAdministrator", () => {
  it("names the address and the session's label", () => {
    expect(
      describeAdministrator({ address: "0xabc", label: "vetra agent x" }),
    ).toBe("0xabc (vetra agent x)");
  });

  it("names the address alone when the session has no label", () => {
    expect(describeAdministrator({ address: "0xabc" })).toBe("0xabc");
  });

  it("says so for an anonymous caller", () => {
    expect(describeAdministrator(undefined)).toBe("an anonymous caller");
    expect(describeAdministrator({ label: "x" })).toBe("an anonymous caller");
  });
});

describe("logAdministration", () => {
  it("logs what was done and by whom, at info, under the common prefix", () => {
    const logger = { info: vi.fn() };
    logAdministration(logger, "installed package @scope/pkg", {
      address: "0xabc",
      label: "mcp claude",
    });
    expect(logger.info).toHaveBeenCalledWith(
      `${ADMINISTRATION_LOG_PREFIX} @action by @administrator`,
      "installed package @scope/pkg",
      "0xabc (mcp claude)",
    );
  });
});
