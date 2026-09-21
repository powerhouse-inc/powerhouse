import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builderSettings,
  judgeSettings,
  pathRule,
  tsxSocketDirs,
  verifierSettings,
  writeSettings,
} from "../src/lib/settings.js";

const WS = "/runs/r1/task/A/1/workspace";
const DOCS = "/runs/r1/docs";
const MONO = "/home/me/projects/powerhouse";
const RECIPES = "/home/me/projects/recipes";
const REF = `${WS}/reference`;
const CLAUDE_RULE = pathRule("Read", path.join(homedir(), ".claude"));

describe("pathRule", () => {
  it("spells absolute paths with a // prefix and a /** suffix", () => {
    expect(pathRule("Read", "/Users/x/docs")).toBe("Read(//Users/x/docs/**)");
    expect(pathRule("Edit", "/a/b/../c/")).toBe("Edit(//a/c/**)");
  });
});

describe("builderSettings", () => {
  const base = {
    workspaceDir: WS,
    docsDir: DOCS,
    deniedRoots: [MONO, RECIPES],
    referenceDir: REF,
  };

  it("arm A denies the reference dir; arm B does not", () => {
    const a = builderSettings({ ...base, arm: "A", sandbox: "dontAsk" });
    const b = builderSettings({ ...base, arm: "B", sandbox: "dontAsk" });
    const refRule = pathRule("Read", REF);
    expect(a.permissions.deny).toContain(refRule);
    expect(b.permissions.deny).not.toContain(refRule);
    expect(b.permissions.deny).toEqual(
      a.permissions.deny.filter((r) => r !== refRule),
    );
    expect(a.sandbox).toEqual(b.sandbox);
  });

  it("has the expected shape under dontAsk", () => {
    const s = builderSettings({ ...base, arm: "A", sandbox: "dontAsk" });
    expect(s).toEqual({
      permissions: {
        defaultMode: "dontAsk",
        allow: [
          "Read(//runs/r1/task/A/1/workspace/**)",
          "Edit(//runs/r1/task/A/1/workspace/**)",
          "Write(//runs/r1/task/A/1/workspace/**)",
          "Read(//runs/r1/docs/**)",
          "Glob(*)",
          "Grep(*)",
          "Bash(*)",
        ],
        deny: [
          "Read(//home/me/projects/powerhouse/**)",
          "Read(//home/me/projects/recipes/**)",
          CLAUDE_RULE,
          "Read(//runs/r1/task/A/1/workspace/reference/**)",
          "WebFetch",
          "WebSearch",
          "Agent",
          "Skill",
          "Task",
        ],
      },
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: false,
        allowUnsandboxedCommands: false,
        filesystem: {
          denyRead: [MONO, RECIPES, path.join(homedir(), ".claude")],
        },
        network: { allowedDomains: [], allowUnixSockets: tsxSocketDirs() },
      },
    });
  });

  it("switches defaultMode for bypass", () => {
    const s = builderSettings({ ...base, arm: "B", sandbox: "bypass" });
    expect(s.permissions.defaultMode).toBe("bypassPermissions");
  });

  it("uses only absolute // rules for paths", () => {
    const s = builderSettings({ ...base, arm: "A", sandbox: "dontAsk" });
    const pathRules = [...s.permissions.allow, ...s.permissions.deny].filter(
      (r) => r.includes("("),
    );
    for (const rule of pathRules) {
      expect(rule).toMatch(/^\w+\((\/\/[^/].*\/\*\*|\*)\)$/);
    }
    for (const p of s.sandbox.filesystem.denyRead) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });

  it("lets tsx bind its loader socket without letting bash out of the sandbox", () => {
    const s = builderSettings({ ...base, arm: "A", sandbox: "dontAsk" });
    const uid = process.getuid?.();
    if (uid !== undefined) {
      expect(s.sandbox.network.allowUnixSockets).toContain(
        `/tmp/claude-${uid}/tsx-${uid}`,
      );
    }
    expect(s.sandbox.network.allowedDomains).toEqual([]);
    expect(s.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(s.sandbox.enabled).toBe(true);
  });
});

describe("tsxSocketDirs", () => {
  it("names only tsx's own IPC directory, absolutely and without duplicates", () => {
    const dirs = tsxSocketDirs();
    const uid = process.getuid?.();
    if (uid === undefined) {
      expect(dirs).toEqual([]);
      return;
    }
    expect(dirs.length).toBeGreaterThan(0);
    expect(new Set(dirs).size).toBe(dirs.length);
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true);
      expect(path.basename(dir)).toBe(`tsx-${uid}`);
    }
  });
});

describe("judgeSettings", () => {
  it("is read-only with no Bash and no network", () => {
    const s = judgeSettings({
      attemptDir: "/runs/r1/task/A/1",
      docsDir: DOCS,
      dtsDir: "/runs/r1/task/A/1/dts",
    });
    expect(s.permissions.defaultMode).toBe("dontAsk");
    expect(s.permissions.allow).toEqual([
      "Read(//runs/r1/task/A/1/**)",
      "Read(//runs/r1/docs/**)",
      "Read(//runs/r1/task/A/1/dts/**)",
      "Glob(*)",
      "Grep(*)",
    ]);
    expect(s.permissions.deny).toContain("Bash");
    expect(s.permissions.deny).toContain("Edit");
    expect(s.permissions.deny).toContain("Write");
    expect(s.permissions.deny).toContain("WebFetch");
    expect(s.permissions.allow.some((r) => r.startsWith("Bash"))).toBe(false);
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.network.allowedDomains).toEqual([]);
  });
});

describe("verifierSettings", () => {
  it("allows Bash but denies the roots at the OS level", () => {
    const s = verifierSettings({
      workspaceDir: WS,
      docsDir: DOCS,
      deniedRoots: [MONO],
    });
    expect(s.permissions.allow).toContain("Bash(*)");
    expect(s.permissions.allow).toContain("Read(//runs/r1/docs/**)");
    expect(s.permissions.deny).toContain(
      "Read(//home/me/projects/powerhouse/**)",
    );
    expect(s.permissions.allow).toContain(
      "Write(//runs/r1/task/A/1/workspace/**)",
    );
    expect(s.permissions.deny).not.toContain("Write");
    expect(s.sandbox.filesystem.denyRead).toEqual([
      MONO,
      path.join(homedir(), ".claude"),
    ]);
    expect(s.sandbox.network.allowedDomains).toEqual([]);
  });
});

describe("writeSettings", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-settings-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates parent dirs and writes pretty JSON", () => {
    const file = path.join(tmp, "a/b/settings.json");
    const s = judgeSettings({ attemptDir: "/x", docsDir: "/y", dtsDir: "/z" });
    writeSettings(file, s);
    const text = readFileSync(file, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(s);
  });
});
