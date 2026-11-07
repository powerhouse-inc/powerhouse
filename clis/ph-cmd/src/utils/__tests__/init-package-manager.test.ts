import type { Agent } from "package-manager-detector";
import { describe, expect, it } from "vitest";
import {
  type DetectFn,
  resolveInitPackageManager,
} from "../init-package-manager.js";

/** A detector that reports `pm` and records the options it was called with. */
function detector(
  pm: Agent,
  source: "user-agent" | "install" | "path" | "fallback",
) {
  const calls: { allowed?: readonly Agent[] }[] = [];
  const detect: DetectFn = (options) => {
    calls.push(options);
    return { pm, source };
  };
  return { detect, calls };
}

describe("resolveInitPackageManager", () => {
  it("forwards the detected manager when the user named none", () => {
    const { detect, calls } = detector("bun", "path");
    expect(resolveInitPackageManager({}, detect)).toEqual({
      pm: "bun",
      forwardedFlags: ["--bun"],
      detectedFrom: "path",
    });
    expect(calls).toEqual([{}]);
  });

  it("does not report a fallback as detected", () => {
    const { detect } = detector("npm", "fallback");
    expect(resolveInitPackageManager({}, detect)).toEqual({
      pm: "npm",
      forwardedFlags: ["--npm"],
      detectedFrom: undefined,
    });
  });

  it("uses an explicit flag without detecting or forwarding", () => {
    const { detect, calls } = detector("bun", "path");
    expect(resolveInitPackageManager({ pnpm: true }, detect)).toEqual({
      pm: "pnpm",
      forwardedFlags: [],
      detectedFrom: undefined,
    });
    expect(calls).toEqual([]);
  });

  it("uses --package-manager without forwarding a second flag", () => {
    const { detect } = detector("bun", "path");
    expect(
      resolveInitPackageManager({ packageManager: "yarn" }, detect),
    ).toEqual({ pm: "yarn", forwardedFlags: [], detectedFrom: undefined });
  });

  it("limits detection to pnpm and npm under --clone", () => {
    const { detect, calls } = detector("pnpm", "path");
    expect(resolveInitPackageManager({ clone: "../base" }, detect)).toEqual({
      pm: "pnpm",
      forwardedFlags: ["--pnpm"],
      detectedFrom: "path",
    });
    expect(calls).toEqual([{ allowed: ["pnpm", "npm"] }]);
  });

  it("forwards nothing when the user passed --npm=false", () => {
    // ph-cli counts any defined package-manager key as given, so a forwarded
    // --pnpm next to npm: false would trip its mutual-exclusion check.
    const { detect } = detector("pnpm", "path");
    expect(resolveInitPackageManager({ npm: false }, detect)).toEqual({
      pm: "pnpm",
      forwardedFlags: [],
      detectedFrom: "path",
    });
  });
});
