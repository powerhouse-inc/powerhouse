import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFileSync }));

import { installPackages, readManifest } from "../src/packages/util.js";

describe("package CLI utilities", () => {
  beforeEach(() => {
    execFileSync.mockReset();
    execFileSync.mockReturnValue(Buffer.from("manifest output"));
  });

  it("passes package specs as arguments instead of shell source", async () => {
    await installPackages([
      "package; touch /tmp/not-run",
      "package with spaces",
    ]);

    expect(execFileSync.mock.calls).toEqual([
      ["ph", ["install", "package; touch /tmp/not-run"]],
      ["ph", ["install", "package with spaces"]],
    ]);
  });

  it("invokes the manifest command without a shell", () => {
    expect(readManifest()).toBe("manifest output");
    expect(execFileSync).toHaveBeenCalledWith("ph", ["manifest"]);
  });
});
