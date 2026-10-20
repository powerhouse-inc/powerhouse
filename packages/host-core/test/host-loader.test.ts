import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findNonStaticValue,
  HostLoadError,
  lintHostImports,
  loadHost,
  probeHostsFolder,
  stripComments,
} from "../src/host-loader.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-loader-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({ logLevel: "info", vetra: { connectPort: 2599 } }),
  );
  return dir;
}

function writeHost(projectRoot: string, name: string, source: string): void {
  const dir = path.join(projectRoot, "hosts", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "host.js"), source);
}

const VALID_HOST = `
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "lab-vetra",
  runner: {
    module: "@powerhousedao/host-core/runners/compound",
    defaultVerb: "dev",
  },
  children: {
    studio: { host: "connect", runner: { port: config.vetra?.connectPort ?? 3001 } },
  },
  config: { runtimeRecord: true },
};
`;

describe("probeHostsFolder", () => {
  it("reports absent when there is no hosts/ folder", () => {
    expect(probeHostsFolder(makeProject())).toEqual({ kind: "absent" });
  });

  it("reports empty for a hosts/ folder with no host.js (the guard state)", () => {
    const project = makeProject();
    mkdirSync(path.join(project, "hosts", "stray"), { recursive: true });
    expect(probeHostsFolder(project)).toMatchObject({ kind: "empty" });
  });

  it("lists hosts that carry a host.js, sorted", () => {
    const project = makeProject();
    writeHost(project, "vetra", VALID_HOST);
    writeHost(project, "connect", VALID_HOST);
    expect(probeHostsFolder(project)).toMatchObject({
      kind: "present",
      hosts: ["connect", "vetra"],
    });
  });
});

describe("loadHost", () => {
  it("loads a valid host definition", async () => {
    const project = makeProject();
    writeHost(project, "vetra", VALID_HOST);
    const loaded = await loadHost(project, "vetra");
    expect(loaded.host.name).toBe("lab-vetra");
    expect(loaded.host.runner.module).toBe(
      "@powerhousedao/host-core/runners/compound",
    );
    // the projection resolved the referenced config value:
    expect(loaded.host.children).toMatchObject({
      studio: { runner: { port: 2599 } },
    });
  });

  it("names available hosts for an unknown host name", async () => {
    const project = makeProject();
    writeHost(project, "vetra", VALID_HOST);
    await expect(loadHost(project, "nope")).rejects.toThrow(
      /Unknown host "nope".*vetra/,
    );
  });

  it("errors on an absent hosts/ folder with the scaffold hint", async () => {
    await expect(loadHost(makeProject(), "vetra")).rejects.toThrow(
      /No hosts\/ folder/,
    );
  });

  it("errors loudly on the empty-guard state", async () => {
    const project = makeProject();
    mkdirSync(path.join(project, "hosts"), { recursive: true });
    await expect(loadHost(project, "vetra")).rejects.toThrow(
      /contains no <name>\/host\.js/,
    );
  });

  it("rejects a non-static export, naming the offending path", async () => {
    const project = makeProject();
    writeHost(
      project,
      "bad",
      `export default { name: "x", runner: { module: "m" }, config: { cb: () => 1 } };`,
    );
    await expect(loadHost(project, "bad")).rejects.toThrow(
      /config\.cb.*function/,
    );
  });

  it("rejects reactor + children together (XOR)", async () => {
    const project = makeProject();
    writeHost(
      project,
      "both",
      `export default { name: "x", runner: { module: "m" }, reactor: {}, children: {} };`,
    );
    await expect(loadHost(project, "both")).rejects.toThrow(
      /mutually exclusive/,
    );
  });

  it("rejects imports other than powerhouse.config.json", async () => {
    const project = makeProject();
    writeHost(
      project,
      "importer",
      `import fs from "node:fs";\nexport default { name: "x", runner: { module: "m" } };`,
    );
    await expect(loadHost(project, "importer")).rejects.toThrow(
      /may only import the project's powerhouse\.config\.json/,
    );
  });

  it("rejects dynamic import()", async () => {
    const project = makeProject();
    writeHost(
      project,
      "dyn",
      `const fs = import("node:fs");\nexport default { name: "x", runner: { module: "m" }, config: {} };`,
    );
    await expect(loadHost(project, "dyn")).rejects.toThrow(/static data/);
  });

  it("loads a JSDoc import() type: comments are not code", async () => {
    const project = makeProject();
    writeHost(
      project,
      "typed",
      [
        `/** @type {import("@powerhousedao/ph-cli/runners/connect").ConnectHost} */`,
        `// require("x") in a line comment, import "y" too`,
        `export default {`,
        `  name: "x",`,
        `  runner: { module: "m" },`,
        `  config: { url: "http://localhost:4001/d/x", t: \`a//b\` },`,
        `};`,
      ].join("\n"),
    );
    const loaded = await loadHost(project, "typed");
    expect(loaded.host.config).toEqual({
      url: "http://localhost:4001/d/x",
      t: "a//b",
    });
  });

  it("requires runner.module", async () => {
    const project = makeProject();
    writeHost(project, "norunner", `export default { name: "x", runner: {} };`);
    await expect(loadHost(project, "norunner")).rejects.toThrow(
      /`module` specifier/,
    );
  });
});

describe("findNonStaticValue", () => {
  it("accepts plain JSON data", () => {
    expect(
      findNonStaticValue({ a: 1, b: [true, "x", null], c: { d: {} } }),
    ).toBeUndefined();
  });

  it.each([
    [{ a: () => 1 }, "a (function)"],
    [{ a: { b: undefined } }, "a.b (undefined)"],
    [{ a: new Date() }, "a (non-plain object)"],
    [{ a: [1, { b: 1n }] }, "a[1].b (bigint)"],
  ])("reports the offending path", (value, expected) => {
    expect(findNonStaticValue(value)).toBe(expected);
  });
});

describe("lintHostImports", () => {
  it("allows the powerhouse.config.json import", () => {
    expect(() =>
      lintHostImports(
        `import config from "../../powerhouse.config.json" with { type: "json" };`,
        "host.js",
      ),
    ).not.toThrow();
  });

  it("rejects side-effect imports", () => {
    expect(() => lintHostImports(`import "./setup.js";`, "host.js")).toThrow(
      HostLoadError,
    );
  });

  it("ignores imports and require() inside block and line comments", () => {
    const source = [
      `/*`,
      `import "./setup.js";`,
      `import x from "node:fs";`,
      `*/`,
      `// const y = require("node:path");`,
      `export default {};`,
    ].join("\n");
    expect(lintHostImports(source, "host.js")).toEqual([]);
  });

  it("still sees a real require() after a string that contains //", () => {
    expect(() =>
      lintHostImports(
        `const u = "http://x"; const fs = require("node:fs");`,
        "host.js",
      ),
    ).toThrow(/static data/);
  });
});

describe("stripComments", () => {
  it("keeps strings, template literals and newlines; blanks comments", () => {
    const source = `a = "//x"; // c\nb = '/*y*/'; /* d\ne */ t = \`//\`;`;
    const out = stripComments(source);
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain(`"//x"`);
    expect(out).toContain(`'/*y*/'`);
    expect(out).toContain("`//`");
    expect(out).not.toMatch(/\bc\b|\bd\b|\be\b/);
  });
});
