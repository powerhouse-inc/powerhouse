import { describe, expect, it } from "vitest";
import {
  detectGlobalInstall,
  updateArgv,
  updateCommand,
} from "../self-update.js";

describe("detectGlobalInstall", () => {
  it("detects an npm global install (plain node_modules under the prefix)", () => {
    const result = detectGlobalInstall(
      "/usr/local/lib/node_modules/ph-cmd/dist/cli.mjs",
    );
    expect(result).toEqual({
      pm: "npm",
      pkgRoot: "/usr/local/lib/node_modules/ph-cmd",
    });
  });

  it("detects a pnpm global install (.pnpm store path)", () => {
    const result = detectGlobalInstall(
      "/home/u/.local/share/pnpm/global/node_modules/.pnpm/ph-cmd@6.2.2/node_modules/ph-cmd/dist/cli.mjs",
    );
    expect(result).toEqual({
      pm: "pnpm",
      pkgRoot:
        "/home/u/.local/share/pnpm/global/node_modules/.pnpm/ph-cmd@6.2.2/node_modules/ph-cmd",
    });
  });

  it("detects a bun global install", () => {
    const result = detectGlobalInstall(
      "/home/u/.bun/install/global/node_modules/ph-cmd/dist/cli.mjs",
    );
    expect(result).toEqual({
      pm: "bun",
      pkgRoot: "/home/u/.bun/install/global/node_modules/ph-cmd",
    });
  });

  it("detects a yarn classic global install", () => {
    const result = detectGlobalInstall(
      "/home/u/.config/yarn/global/node_modules/ph-cmd/dist/cli.mjs",
    );
    expect(result).toEqual({
      pm: "yarn",
      pkgRoot: "/home/u/.config/yarn/global/node_modules/ph-cmd",
    });
  });

  it("refuses a source-checkout run (repo layout)", () => {
    const result = detectGlobalInstall("/repo/clis/ph-cmd/dist/cli.mjs");
    expect(result).toEqual({ pm: null, reason: "source-checkout" });
  });

  it("reports unknown for an unrecognized layout", () => {
    const result = detectGlobalInstall("/opt/whatever/cli.mjs");
    expect(result).toEqual({ pm: null, reason: "unknown" });
  });

  it("normalizes Windows-style paths before matching", () => {
    const result = detectGlobalInstall(
      "C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\ph-cmd\\dist\\cli.mjs",
    );
    expect(result).toEqual({
      pm: "npm",
      pkgRoot: "C:/Users/u/AppData/Roaming/npm/node_modules/ph-cmd",
    });
  });

  it("does not misclassify a non-ph-cmd package in the same layout", () => {
    const result = detectGlobalInstall(
      "/usr/local/lib/node_modules/other-pkg/dist/cli.mjs",
    );
    expect(result).toEqual({ pm: null, reason: "unknown" });
  });
});

describe("updateCommand / updateArgv", () => {
  it("builds the right global install command per PM", () => {
    expect(updateCommand("npm", "latest")).toBe("npm install -g ph-cmd@latest");
    expect(updateArgv("npm", "latest")).toEqual([
      "npm",
      "install",
      "-g",
      "ph-cmd@latest",
    ]);
    expect(updateCommand("pnpm", "latest")).toBe("pnpm add -g ph-cmd@latest");
    expect(updateArgv("pnpm", "latest")).toEqual([
      "pnpm",
      "add",
      "-g",
      "ph-cmd@latest",
    ]);
    expect(updateCommand("bun", "dev")).toBe("bun add -g ph-cmd@dev");
    expect(updateArgv("bun", "dev")).toEqual([
      "bun",
      "add",
      "-g",
      "ph-cmd@dev",
    ]);
    expect(updateCommand("yarn", "latest")).toBe(
      "yarn global add ph-cmd@latest",
    );
    expect(updateArgv("yarn", "latest")).toEqual([
      "yarn",
      "global",
      "add",
      "ph-cmd@latest",
    ]);
  });
});
