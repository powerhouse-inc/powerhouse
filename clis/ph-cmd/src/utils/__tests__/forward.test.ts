import { describe, expect, it } from "vitest";
import { forwardsToPhCli } from "../forward.js";

describe("forwardsToPhCli", () => {
  it("forwards ph-cli commands", () => {
    expect(forwardsToPhCli("generate", false)).toBe(true);
    expect(forwardsToPhCli("is", false)).toBe(true);
  });

  it("forwards run and host only with uniform-runners on", () => {
    for (const command of ["run", "host"]) {
      expect(forwardsToPhCli(command, false)).toBe(false);
      expect(forwardsToPhCli(command, true)).toBe(true);
    }
  });

  it("keeps ph-cmd's own commands and unknown ones", () => {
    expect(forwardsToPhCli("use", true)).toBe(false);
    expect(forwardsToPhCli("my-host", true)).toBe(false);
    expect(forwardsToPhCli(undefined, true)).toBe(false);
  });
});
