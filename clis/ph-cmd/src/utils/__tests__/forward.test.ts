import { describe, expect, it } from "vitest";
import { forwardsToPhCli } from "../forward.js";

describe("forwardsToPhCli", () => {
  it("forwards ph-cli commands", () => {
    expect(forwardsToPhCli("generate")).toBe(true);
    expect(forwardsToPhCli("is")).toBe(true);
  });

  it("forwards run and host", () => {
    expect(forwardsToPhCli("run")).toBe(true);
    expect(forwardsToPhCli("host")).toBe(true);
  });

  it("keeps ph-cmd's own commands and unknown ones", () => {
    expect(forwardsToPhCli("use")).toBe(false);
    expect(forwardsToPhCli("my-host")).toBe(false);
    expect(forwardsToPhCli(undefined)).toBe(false);
  });
});
