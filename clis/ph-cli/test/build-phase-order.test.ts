import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  releaseCheck: vi.fn(),
  retainReleaseCheck: vi.fn(),
  resolveCommand: vi.fn(),
  spawnAsync: vi.fn(),
  tsdownBuild: vi.fn(),
}));

vi.mock("@powerhousedao/shared/clis", () => ({
  spawnAsync: mocks.spawnAsync,
}));
vi.mock("package-manager-detector", () => ({
  detect: mocks.detect,
  resolveCommand: mocks.resolveCommand,
}));
vi.mock("tsdown", () => ({ build: mocks.tsdownBuild }));
vi.mock("../src/services/definition-release.js", () => ({
  runBuildDefinitionCheck: mocks.releaseCheck,
  retainReleaseDefinitionCheck: mocks.retainReleaseCheck,
}));

import { runBuild } from "../src/services/build.js";

const originalCwd = process.cwd();
const created: string[] = [];

function useTemporaryProject() {
  const directory = mkdtempSync(join(tmpdir(), "ph-build-order-"));
  created.push(directory);
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "@acme/build-order", version: "1.0.0" }),
  );
  writeFileSync(join(directory, "powerhouse.config.json"), "{}\n");
  writeFileSync(join(directory, "tsconfig.json"), "{}\n");
  process.chdir(directory);
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.PH_BUILD_ALLOW_TS_ERRORS;
  useTemporaryProject();
  mocks.detect.mockResolvedValue({ agent: "pnpm" });
  mocks.releaseCheck.mockResolvedValue(undefined);
  mocks.spawnAsync.mockResolvedValue("");
  mocks.resolveCommand.mockImplementation(
    (_agent: string, _command: string, args: string[]) => ({
      command: "pnpm",
      args: ["exec", ...args],
    }),
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.PH_BUILD_ALLOW_TS_ERRORS;
  while (created.length > 0) {
    const directory = created.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("runBuild phase order", () => {
  it("runs tsc before the browser bundle, node bundle, and Tailwind", async () => {
    const phases: string[] = [];
    const outDir = "build output;still-one-argument";
    mocks.spawnAsync.mockImplementation(
      (_command: string, commandArgs: string[]) => {
        phases.push(commandArgs.includes("tsc") ? "tsc" : "tailwind");
        return Promise.resolve("");
      },
    );
    mocks.tsdownBuild.mockImplementation((config: { outDir: string }) => {
      phases.push(config.outDir.endsWith("browser") ? "browser" : "node");
      return Promise.resolve();
    });
    mocks.releaseCheck.mockImplementation(() => {
      phases.push("definitions");
      return Promise.resolve(undefined);
    });
    mocks.retainReleaseCheck.mockImplementation(() => {
      phases.push("retain");
    });

    await runBuild({
      allowTsErrors: false,
      configFile: "./powerhouse.config.json",
      debug: undefined,
      outDir,
      sources: [],
    });

    expect(phases).toEqual([
      "tsc",
      "definitions",
      "browser",
      "node",
      "tailwind",
      "retain",
    ]);
    const browserConfig = mocks.tsdownBuild.mock.calls[0]?.[0] as {
      copy?: unknown;
      outDir: string;
    };
    const stagingPath = dirname(browserConfig.outDir);
    expect(basename(stagingPath)).toMatch(
      /^\.build output;still-one-argument\.staging-/,
    );
    expect(mocks.spawnAsync).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["exec", "tsc", "--build", join(stagingPath, ".ph-build-tsconfig.json")],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    expect(mocks.spawnAsync).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      [
        "exec",
        "tailwindcss",
        "-i",
        "./style.css",
        "-o",
        join(stagingPath, "style.css"),
      ],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    expect(mocks.releaseCheck).toHaveBeenCalledWith({
      configFile: "./powerhouse.config.json",
      outDir,
      additionalOutputDirectories: [stagingPath],
      sources: [],
    });
    expect(mocks.retainReleaseCheck).toHaveBeenCalledWith({
      configFile: "./powerhouse.config.json",
      outDir: stagingPath,
      additionalOutputDirectories: [outDir],
      report: undefined,
    });
    expect(browserConfig.copy).toEqual(expect.any(Function));
    const copyEntries = await (
      browserConfig.copy as (options: { outDir: string }) => unknown
    )({ outDir: browserConfig.outDir });
    expect(copyEntries).toEqual([
      { from: "powerhouse.manifest.json", to: stagingPath },
    ]);
    expect(existsSync(stagingPath)).toBe(false);
    expect(existsSync(join(process.cwd(), outDir))).toBe(true);
  });

  it("propagates a tsc failure before any bundle writes", async () => {
    const typeScriptFailure = new Error("tsc failed");
    mocks.spawnAsync.mockRejectedValueOnce(typeScriptFailure);

    await expect(
      runBuild({
        allowTsErrors: false,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "dist",
        sources: [],
      }),
    ).rejects.toBe(typeScriptFailure);

    expect(mocks.tsdownBuild).not.toHaveBeenCalled();
    expect(mocks.releaseCheck).not.toHaveBeenCalled();
    expect(mocks.spawnAsync).toHaveBeenCalledTimes(1);
  });

  it("propagates a release definition failure before any bundle writes", async () => {
    const definitionFailure = new Error("definition check invalid");
    mocks.releaseCheck.mockRejectedValue(definitionFailure);

    await expect(
      runBuild({
        allowTsErrors: false,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "dist",
        sources: [],
      }),
    ).rejects.toBe(definitionFailure);

    expect(mocks.releaseCheck).toHaveBeenCalledWith({
      configFile: "./powerhouse.config.json",
      outDir: "dist",
      additionalOutputDirectories: [expect.stringContaining(".dist.staging-")],
      sources: [],
    });
    expect(mocks.tsdownBuild).not.toHaveBeenCalled();
    expect(mocks.retainReleaseCheck).not.toHaveBeenCalled();
    expect(mocks.spawnAsync).toHaveBeenCalledTimes(1);
  });

  it("supports the deprecated CLI escape hatch", async () => {
    mocks.spawnAsync.mockRejectedValueOnce(new Error("tsc failed"));

    await expect(
      runBuild({
        allowTsErrors: true,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "dist",
        sources: [],
      }),
    ).resolves.toBeUndefined();

    expect(mocks.tsdownBuild).toHaveBeenCalledTimes(2);
    expect(mocks.spawnAsync).toHaveBeenCalledTimes(2);
  });

  it("supports PH_BUILD_ALLOW_TS_ERRORS=1", async () => {
    process.env.PH_BUILD_ALLOW_TS_ERRORS = "1";
    mocks.spawnAsync.mockRejectedValueOnce(new Error("tsc failed"));

    await expect(
      runBuild({
        allowTsErrors: false,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "dist",
        sources: [],
      }),
    ).resolves.toBeUndefined();

    expect(mocks.tsdownBuild).toHaveBeenCalledTimes(2);
    expect(mocks.spawnAsync).toHaveBeenCalledTimes(2);
  });

  it("preserves the exact prior output when a late build phase fails", async () => {
    const outputPath = join(process.cwd(), "dist");
    mkdirSync(join(outputPath, "browser"), { recursive: true });
    writeFileSync(join(outputPath, "browser/prior.js"), "prior-browser\n");
    writeFileSync(join(outputPath, "style.css"), "prior-style\n");
    mocks.spawnAsync.mockImplementation(
      (_command: string, commandArgs: string[]) => {
        if (commandArgs.includes("tsc")) {
          const configPath = commandArgs.at(-1);
          if (!configPath) throw new Error("Expected a staged tsconfig path");
          const config = JSON.parse(readFileSync(configPath, "utf8")) as {
            compilerOptions: { declarationDir: string };
          };
          mkdirSync(config.compilerOptions.declarationDir, { recursive: true });
          writeFileSync(
            join(config.compilerOptions.declarationDir, "index.d.ts"),
            "export {};\n",
          );
        } else {
          const stylePath = commandArgs.at(-1);
          if (!stylePath) throw new Error("Expected a staged style path");
          writeFileSync(stylePath, "new-style\n");
        }
        return Promise.resolve("");
      },
    );
    mocks.tsdownBuild.mockImplementation((config: { outDir: string }) => {
      mkdirSync(config.outDir, { recursive: true });
      writeFileSync(join(config.outDir, "index.js"), "new-bundle\n");
      return Promise.resolve();
    });
    const lateFailure = new Error("retention failed");
    mocks.retainReleaseCheck.mockImplementation(
      ({ outDir }: { outDir: string }) => {
        writeFileSync(join(outDir, "partial-report.json"), "partial\n");
        return Promise.reject(lateFailure);
      },
    );

    await expect(
      runBuild({
        allowTsErrors: false,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "dist",
        sources: [],
      }),
    ).rejects.toBe(lateFailure);

    expect(readdirSync(outputPath)).toEqual(["browser", "style.css"]);
    expect(readFileSync(join(outputPath, "browser/prior.js"), "utf8")).toBe(
      "prior-browser\n",
    );
    expect(readFileSync(join(outputPath, "style.css"), "utf8")).toBe(
      "prior-style\n",
    );
    expect(
      readdirSync(process.cwd()).filter((name) =>
        /^\.dist\.(?:staging|backup)-/.test(name),
      ),
    ).toEqual([]);
  });

  it("rejects an output directory that overlaps a selected source", async () => {
    mkdirSync(join(process.cwd(), "src"));
    writeFileSync(join(process.cwd(), "src/model.ts"), "export {};\n");
    writeFileSync(
      join(process.cwd(), "powerhouse.config.json"),
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./src/model.ts" }],
        },
      }),
    );

    await expect(
      runBuild({
        allowTsErrors: false,
        configFile: "./powerhouse.config.json",
        debug: undefined,
        outDir: "src",
        sources: [],
      }),
    ).rejects.toThrow(/contains a package input.*src\/model\.ts/);
    expect(mocks.spawnAsync).not.toHaveBeenCalled();
    expect(mocks.tsdownBuild).not.toHaveBeenCalled();
  });
});
