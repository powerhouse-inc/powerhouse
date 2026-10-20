import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  chmodSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  typedRuntimeAlias,
  monorepoLoader,
  loaderCases,
  loaderPackage,
  mutableRuntime,
  workspaceCases,
  workspaceRuntime,
  workspaceApproval,
} from "./helpers/loader-cases.js";
import {
  cleanUp,
  itWithSymlinks,
  packageWith,
  writeTsconfig,
} from "./helpers/declarations.js";
import {
  duplicatePackages,
  noInputProbe,
  writeCmdShim,
} from "./helpers/workspace.js";
import { incrementalDeclarations } from "./helpers/incremental-declarations.js";

afterEach(cleanUp);

itWithSymlinks(
  "reruns the built-CLI release check after only workspace JavaScript changes",
  () => {
    const { root, edit } = workspaceApproval("workspace JavaScript");
    const cli = resolve(import.meta.dirname, "../dist/cli.mjs");
    const run = (command: string[]) =>
      spawnSync(
        process.execPath,
        [
          cli,
          ...command,
          "--config-file",
          join(root, "powerhouse.config.json"),
        ],
        { cwd: root, encoding: "utf8", timeout: 120_000 },
      );
    const built = run(["build"]);
    expect(built.status, built.stdout + built.stderr).toBe(0);
    const retained = run(["model", "prepack"]);
    expect(retained.status, retained.stdout + retained.stderr).toBe(0);
    expect(retained.stdout + retained.stderr).toContain(
      "Reusing the completed release check",
    );
    edit();
    const changed = run(["model", "prepack"]);
    expect(changed.status, changed.stdout + changed.stderr).toBe(1);
    expect(changed.stdout + changed.stderr).toContain(
      "PH-DM-DECLARATION-INVALID",
    );
  },
  120_000,
);

it("restores deleted incremental declarations and reuses approval through the built CLI", () => {
  const root = incrementalDeclarations("code-first");
  const cli = resolve(import.meta.dirname, "../dist/cli.mjs");
  const run = (command: string[]) =>
    spawnSync(
      process.execPath,
      [cli, ...command, "--config-file", join(root, "powerhouse.config.json")],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
  const built = run(["build"]);
  expect(built.status, built.stdout + built.stderr).toBe(0);
  const declaration = join(root, "dist/types/index.d.ts");
  const before = readFileSync(declaration, "utf8");
  rmSync(join(root, "dist"), { recursive: true });
  expect(existsSync(join(root, "tsconfig.tsbuildinfo"))).toBe(true);
  const rebuilt = run(["build"]);
  expect(rebuilt.status, rebuilt.stdout + rebuilt.stderr).toBe(0);
  expect(readFileSync(declaration, "utf8")).toBe(before);
  const retained = run(["model", "prepack"]);
  expect(retained.status, retained.stdout + retained.stderr).toBe(0);
  expect(retained.stdout + retained.stderr).toContain(
    "Reusing the completed release check",
  );
}, 120_000);

it("describes preserved output files in built-CLI help", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../dist/cli.mjs"), "build", "--help"],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("preserves other files");
  expect(result.stdout).toContain("style.css");
  expect(result.stdout).not.toContain("replaces it wholesale");
});

itWithSymlinks(
  "keeps TS18003 preflight outside the package through the built CLI",
  () => {
    const { root, sentinel } = noInputProbe("configDir");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        resolve(import.meta.dirname, "helpers/preflight-monitor.mjs"),
        resolve(import.meta.dirname, "../dist/cli.mjs"),
        "build",
        "--ignore-type-errors",
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stderr).toContain("outside the package");
    expect(readFileSync(sentinel, "utf8")).toBe("protected\n");
    expect(result.stderr).not.toContain("PH-PREFLIGHT-PACKAGE-WRITE");
  },
  120_000,
);

it.each(["local JavaScript", "local CommonJS"] as const)(
  "refreshes %s helpers during built-CLI release watch",
  async (kind) => {
    const { root, edit } = mutableRuntime(kind);
    const child = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, "../dist/cli.mjs"),
        "model",
        "check",
        "--release",
        "--watch",
        "--json-lines",
        "--config-file",
        join(root, "powerhouse.config.json"),
      ],
      { cwd: root, timeout: 120_000 },
    );
    const exited = new Promise((resolve) => child.once("exit", resolve));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (text: Buffer) => {
      stdout += text.toString();
    });
    child.stderr.on("data", (text: Buffer) => {
      stderr += text.toString();
    });
    const reportSchema = z.object({
      status: z.string(),
      definitions: z.array(z.object({ key: z.string() })),
    });
    const reports = () =>
      stdout
        .split("\n")
        .slice(0, -1)
        .filter(Boolean)
        .map((text) => reportSchema.parse(JSON.parse(text)));
    try {
      await vi.waitFor(() => expect(reports()[0]?.status, stderr).toBe("ok"), {
        timeout: 30_000,
      });
      await delay(150);
      edit();
      await vi.waitFor(
        () =>
          expect(
            reports()[1]?.definitions.map((definition) => definition.key),
            stderr,
          ).toEqual(["test/invoice-next", "test/invoice-next"]),
        { timeout: 30_000 },
      );
      expect(reports()[1]?.status).toBe("ok");
    } finally {
      child.kill("SIGINT");
      await exited;
    }
  },
  120_000,
);

itWithSymlinks.each(workspaceCases)(
  "loads workspace %s through the built CLI",
  (kind) => {
    const { root } = workspaceRuntime(kind);
    const result = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "../dist/cli.mjs"),
        "build",
        "--config-file",
        join(root, "powerhouse.config.json"),
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  },
  120_000,
);

it("reuses duplicate-package approval through the built CLI", () => {
  const root = duplicatePackages();
  const cli = resolve(import.meta.dirname, "../dist/cli.mjs");
  for (const command of [["build"], ["model", "prepack"]]) {
    const result = spawnSync(
      process.execPath,
      [cli, ...command, "--config-file", join(root, "powerhouse.config.json")],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    if (command.includes("prepack"))
      expect(result.stdout + result.stderr).toContain(
        "Reusing the completed release check",
      );
  }
}, 120_000);

it.each(loaderCases)(
  "loads %s through the built CLI",
  (kind) => {
    const root = loaderPackage(kind);
    const result = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "../dist/cli.mjs"),
        "build",
        "--config-file",
        join(root, "powerhouse.config.json"),
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  },
  120_000,
);

it("loads an ESM reference in a monorepo through the built CLI", () => {
  const { root } = monorepoLoader();
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "../dist/cli.mjs"),
      "build",
      "--config-file",
      join(root, "powerhouse.config.json"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const approval = z
    .object({ report: z.object({ status: z.string() }) })
    .parse(
      JSON.parse(
        readFileSync(join(root, ".ph/build/release-approval.json"), "utf8"),
      ),
    );
  expect(approval.report.status).toBe("ok");
}, 120_000);

it("loads the built CLI and every ESM command chunk without a CommonJS TypeScript bundle", () => {
  const root = resolve(import.meta.dirname, "..");
  const files = readdirSync(join(root, "dist")).filter(
    (file) => file.endsWith(".mjs") && file !== "cli.mjs",
  );
  expect(files.length).toBeGreaterThan(0);
  const imported = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "for (const path of process.argv.slice(1)) await import(path);",
      ...files.map((file) => pathToFileURL(join(root, "dist", file)).href),
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(imported.status, imported.stdout + imported.stderr).toBe(0);
  const version = spawnSync(
    process.execPath,
    [join(root, "dist", "cli.mjs"), "--version"],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(version.status, version.stdout + version.stderr).toBe(0);
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
}, 60_000);

it("keeps runtime TypeScript compiler imports out of the CLI sources", () => {
  const root = resolve(import.meta.dirname, "../src");
  const files = readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  const imported = files.flatMap((entry) => {
    const file = join(entry.parentPath, entry.name);
    return [
      ...readFileSync(file, "utf8").matchAll(
        /import\s+(?!type\b)[^;]*?from\s*["'](?:ts-morph|typescript)["']/g,
      ),
    ].map((match) => `${file}: ${match[0]}`);
  });
  expect(imported).toEqual([]);
});

it("loads a typed JavaScript paths alias through the built CLI", () => {
  const root = typedRuntimeAlias();
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "../dist/cli.mjs"),
      "build",
      "--config-file",
      join(root, "powerhouse.config.json"),
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 120_000);

it("reports compiler stderr through the built CLI", () => {
  const root = packageWith("code-first");
  writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
  const bin = join(root, "node_modules/.bin/tsc");
  rmSync(bin);
  writeFileSync(
    bin,
    '#!/usr/bin/env node\nif (process.argv.includes("--version")) { console.log("Version 7.0.2"); } else { process.stderr.write("compiler stderr diagnostic\\n"); process.exit(1); }\n',
  );
  chmodSync(bin, 0o755);
  writeCmdShim(bin);
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../dist/cli.mjs"), "build"],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  expect(result.status).toBe(2);
  expect(result.stdout + result.stderr).toContain("compiler stderr diagnostic");
}, 120_000);

itWithSymlinks(
  "builds through an internal scratch alias in the built CLI",
  () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    mkdirSync(join(root, "state"));
    writeFileSync(join(root, "state/keep.txt"), "retained state\n");
    symlinkSync("state", join(root, ".ph"));
    const result = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "../dist/cli.mjs"),
        "build",
        "--config-file",
        join(root, "powerhouse.config.json"),
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(join(root, "state/keep.txt"), "utf8")).toBe(
      "retained state\n",
    );
  },
  120_000,
);
