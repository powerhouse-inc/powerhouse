import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPackedConsumers } from "../src/services/definitions/build-steps.js";
import { GENERATION_DIRECTORY } from "../src/services/definitions/generation.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function packageWithCandidate(options: {
  readonly node: string;
  readonly browser: string;
}): { readonly packageRoot: string; readonly candidateRoot: string } {
  const packageRoot = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-packed-")),
  );
  roots.push(packageRoot);
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "ph-packed-fixture",
        version: "0.0.0",
        private: true,
        type: "module",
        files: ["dist"],
        exports: {
          ".": {
            browser: "./dist/browser/index.js",
            default: "./dist/node/index.js",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(packageRoot, "node_modules"), { recursive: true });
  const candidateRoot = join(packageRoot, GENERATION_DIRECTORY, "candidate");
  mkdirSync(join(candidateRoot, "node"), { recursive: true });
  mkdirSync(join(candidateRoot, "browser"), { recursive: true });
  writeFileSync(join(candidateRoot, "node", "index.js"), options.node);
  writeFileSync(join(candidateRoot, "browser", "index.js"), options.browser);
  return { packageRoot, candidateRoot };
}

describe("the packed consumer verifier", () => {
  it("packs the candidate and imports it as both a Node and a browser consumer", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence).toMatchObject({ ok: true });
    expect(evidence.consumers).toEqual(["node", "browser"]);
  }, 120_000);

  it("fails when the candidate cannot be imported", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'throw new Error("the node bundle is broken");\n',
      browser: 'export const runtime = "browser";\n',
    });
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence.ok).toBe(false);
    expect(evidence.summary).toContain("node:");
    expect(evidence.summary).toContain("the node bundle is broken");
  }, 120_000);

  it("fails when the browser condition resolves to something broken", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'throw new Error("the browser bundle is broken");\n',
    });
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence.ok).toBe(false);
    expect(evidence.summary).toContain("browser:");
  }, 120_000);

  it("fails when the package's files list leaves the candidate out", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ ...manifest, files: ["README.md"] }, null, 2)}\n`,
    );
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence.ok).toBe(false);
    expect(evidence.summary).toContain("node:");
  }, 120_000);

  it("verifies the directory the package actually publishes from", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify(
        {
          ...manifest,
          files: ["lib"],
          exports: {
            ".": {
              browser: "./lib/browser/index.js",
              default: "./lib/node/index.js",
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    mkdirSync(join(packageRoot, "lib", "node"), { recursive: true });
    mkdirSync(join(packageRoot, "lib", "browser"), { recursive: true });
    writeFileSync(
      join(packageRoot, "lib", "node", "index.js"),
      'export const runtime = "stale";\n',
    );
    writeFileSync(
      join(packageRoot, "lib", "browser", "index.js"),
      'export const runtime = "stale";\n',
    );
    writeFileSync(
      join(candidateRoot, "node", "index.js"),
      'throw new Error("the candidate is broken");\n',
    );
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "lib",
    });
    expect(evidence.ok).toBe(false);
    expect(evidence.summary).toContain("the candidate is broken");
  }, 120_000);

  it("reports a package whose manifest cannot be read, rather than throwing", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    writeFileSync(join(packageRoot, "package.json"), "{");
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence).toEqual({
      ok: false,
      consumers: [],
      summary: "the package manifest could not be read",
    });
  }, 120_000);

  it("verifies a package with no node_modules", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    rmSync(join(packageRoot, "node_modules"), { recursive: true, force: true });
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence.ok).toBe(true);
  }, 120_000);
});

describe("the packed consumer verifier's own pack", () => {
  it("does not run the package's prepack hook", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: 'export const runtime = "node";\n',
      browser: 'export const runtime = "browser";\n',
    });
    const marker = join(packageRoot, "prepack-ran");
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify(
        {
          ...manifest,
          scripts: {
            prepack: `node -e "require('node:fs').writeFileSync(${JSON.stringify(marker).replaceAll('"', "'")},'1')"`,
          },
        },
        null,
        2,
      )}\n`,
    );
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "dist",
    });
    expect(evidence).toEqual({ ok: true, consumers: ["node", "browser"] });
    expect(existsSync(marker)).toBe(false);
  }, 120_000);
});

describe("packed output containment", () => {
  it("does not follow a copied output symlink back into the live package", async () => {
    const { packageRoot, candidateRoot } = packageWithCandidate({
      node: "export {};",
      browser: "export {};",
    });
    mkdirSync(join(packageRoot, "actual", "dist"), { recursive: true });
    writeFileSync(join(packageRoot, "actual", "dist", "keep"), "prior output");
    symlinkSync(join(packageRoot, "actual"), join(packageRoot, "linked"));
    const evidence = await verifyPackedConsumers({
      packageRoot,
      candidateRoot,
      outDir: "linked/dist",
    });
    expect(evidence.ok).toBe(false);
    expect(
      readFileSync(join(packageRoot, "actual", "dist", "keep"), "utf8"),
    ).toBe("prior output");
  }, 60_000);
});
