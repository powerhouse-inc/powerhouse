import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Task } from "../src/lib/catalog.js";
import {
  collectDts,
  copyAcceptanceFiles,
  copyPinnedInputs,
  copyReference,
  dtsHasSymbol,
  installedVersion,
  installWorkspace,
  pinsDocumentModels,
  pinsVitestConfig,
  refreshGradingConfig,
  scaffoldWorkspace,
  workspacePackageJson,
  workspaceTsconfig,
} from "../src/lib/workspace.js";

const MODEL_TEST_GLOBS = [
  "document-models/**/tests/**",
  "document-models/**/*.test.ts",
];

const PIN = "6.2.2-dev.62";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "custom-read-model",
    title: "Custom read model",
    recipeDir: "custom-read-model",
    brief: null,
    difficulty: "S",
    taskPrompt: "x".repeat(200),
    contract: [
      {
        file: "src/document-count-read-model.ts",
        exports: ["DocumentCountReadModel"],
      },
    ],
    pinnedInputs: [],
    acceptance: { kind: "vitest", files: [], vitestConfig: false },
    docSections: [],
    packages: ["@powerhousedao/reactor", "document-model"],
    extraDeps: {},
    arms: ["A", "B"],
    timeouts: { buildMs: 1_000, acceptanceMs: 1_000 },
    budgets: { buildUsd: 1, maxTurns: 10, judgeUsd: 1, verifyUsd: 1 },
    ...overrides,
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-ws-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("scaffoldWorkspace", () => {
  it("writes exactly the five workspace files", () => {
    const dir = path.join(tmp, "ws");
    const t = task({ extraDeps: { kysely: "^0.28.17" } });
    const written = scaffoldWorkspace({ dir, task: t, pin: PIN });
    expect(written.sort()).toEqual([
      ".gitignore",
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "vitest.config.ts",
    ]);

    const pkg: unknown = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    expect(pkg).toEqual({
      name: "doc-harness-ws-custom-read-model",
      private: true,
      type: "module",
      scripts: { tsc: "tsc --noEmit", test: "vitest run" },
      dependencies: {
        "@powerhousedao/reactor": PIN,
        "document-model": PIN,
        kysely: "^0.28.17",
      },
      devDependencies: {
        "@types/node": "^24.0.0",
        tsx: "^4.21.0",
        typescript: "^5.9.3",
        vitest: "^4.1.0",
      },
    });

    const tsconfig: unknown = JSON.parse(
      readFileSync(path.join(dir, "tsconfig.json"), "utf8"),
    );
    expect(tsconfig).toEqual({
      compilerOptions: {
        strict: true,
        target: "es2022",
        module: "nodenext",
        moduleResolution: "nodenext",
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["node"],
      },
      include: ["**/*.ts"],
      exclude: ["node_modules", "dist", "reference", "__verify__"],
    });

    const vitestConfig = readFileSync(
      path.join(dir, "vitest.config.ts"),
      "utf8",
    );
    for (const glob of [
      "**/node_modules/**",
      "**/dist/**",
      "**/reference/**",
      "**/__verify__/**",
      ...MODEL_TEST_GLOBS.map((g) => `**/${g}`),
    ]) {
      expect(vitestConfig).toContain(`"${glob}",`);
    }

    const yaml = readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    expect(yaml).toContain("allowBuilds:\n  '@apollo/protobufjs': true\n");
    expect(yaml).toContain("  esbuild: true\n");
    expect(yaml).toContain(
      'minimumReleaseAgeExclude:\n  - "@powerhousedao/*"\n  - "@renown/*"\n  - "document-model"\n',
    );
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules\ndist\n",
    );
  });

  it("adds tsconfig paths only when document-models are pinned", () => {
    const plain = task();
    expect(pinsDocumentModels(plain)).toBe(false);
    const withModels = task({
      pinnedInputs: [{ from: "document-models", to: "document-models/" }],
    });
    expect(pinsDocumentModels(withModels)).toBe(true);
    expect(
      pinsDocumentModels(
        task({
          pinnedInputs: [{ from: "document-models", to: "document-models" }],
        }),
      ),
    ).toBe(true);
    expect(
      pinsDocumentModels(
        task({ pinnedInputs: [{ from: "x", to: "src/document-models-x.ts" }] }),
      ),
    ).toBe(false);
    const cfg = workspaceTsconfig(withModels) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
      exclude: string[];
    };
    expect(cfg.compilerOptions.baseUrl).toBeUndefined();
    expect(cfg.compilerOptions.paths).toEqual({
      "document-models": ["./document-models/index.ts"],
      "document-models/*": ["./document-models/*/index.ts"],
    });
    expect(cfg.include).toEqual(["**/*.ts"]);
    // The pinned codegen tests are not graded.
    expect(cfg.exclude).toEqual([
      "node_modules",
      "dist",
      "reference",
      "__verify__",
      ...MODEL_TEST_GLOBS,
    ]);
  });

  it("lets versions override the devDependency ranges", () => {
    const pkg = workspacePackageJson({
      dir: tmp,
      task: task(),
      pin: PIN,
      versions: { vitest: "^5.0.0" },
    }) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.vitest).toBe("^5.0.0");
    expect(pkg.devDependencies.typescript).toBe("^5.9.3");
  });
});

describe("refreshGradingConfig", () => {
  const stale = JSON.stringify({
    compilerOptions: { strict: true },
    include: ["**/*.ts"],
    exclude: ["node_modules", "dist", "reference", "__verify__"],
  });

  it("replaces an old tsconfig and the default vitest config", () => {
    const t = task({
      pinnedInputs: [{ from: "document-models", to: "document-models" }],
    });
    const ws = path.join(tmp, "ws");
    mkdirSync(ws, { recursive: true });
    writeFileSync(path.join(ws, "tsconfig.json"), stale);
    writeFileSync(path.join(ws, "vitest.config.ts"), "// old default\n");

    expect(refreshGradingConfig(t, ws)).toEqual([
      "tsconfig.json",
      "vitest.config.ts",
    ]);
    expect(
      JSON.parse(readFileSync(path.join(ws, "tsconfig.json"), "utf8")),
    ).toEqual(workspaceTsconfig(t));
    const vitestConfig = readFileSync(
      path.join(ws, "vitest.config.ts"),
      "utf8",
    );
    expect(vitestConfig).toContain("tsconfigPaths: true");
    for (const glob of MODEL_TEST_GLOBS) {
      expect(vitestConfig).toContain(`"**/${glob}",`);
    }
  });

  it("leaves a pinned vitest.config.ts alone", () => {
    const t = task({
      acceptance: {
        kind: "vitest",
        files: [{ from: "vitest.config.ts", to: "vitest.config.ts" }],
        vitestConfig: true,
      },
    });
    expect(pinsVitestConfig(t)).toBe(true);
    expect(pinsVitestConfig(task())).toBe(false);
    const ws = path.join(tmp, "ws");
    mkdirSync(ws, { recursive: true });
    writeFileSync(path.join(ws, "tsconfig.json"), stale);
    writeFileSync(path.join(ws, "vitest.config.ts"), "// pinned\n");

    expect(refreshGradingConfig(t, ws)).toEqual(["tsconfig.json"]);
    expect(readFileSync(path.join(ws, "vitest.config.ts"), "utf8")).toBe(
      "// pinned\n",
    );
    expect(
      JSON.parse(readFileSync(path.join(ws, "tsconfig.json"), "utf8")),
    ).toEqual(workspaceTsconfig(t));
  });
});

describe("copy helpers", () => {
  it("copies pinned inputs and acceptance files, files or dirs", () => {
    const pinned = path.join(tmp, "pinned");
    const src = path.join(pinned, "custom-read-model");
    mkdirSync(path.join(src, "document-models/todo/gen"), { recursive: true });
    writeFileSync(path.join(src, "document-models/todo/gen/index.ts"), "x");
    writeFileSync(path.join(src, "todo.json"), "{}");
    writeFileSync(path.join(src, "hidden.test.ts"), "test");

    const t = task({
      pinnedInputs: [
        { from: "document-models", to: "document-models" },
        { from: "todo.json", to: "spec/todo.json" },
      ],
      acceptance: {
        kind: "vitest",
        files: [{ from: "hidden.test.ts", to: "tests/hidden.test.ts" }],
        vitestConfig: true,
      },
    });
    const ws = path.join(tmp, "ws");
    copyPinnedInputs(t, ws, pinned);
    expect(existsSync(path.join(ws, "document-models/todo/gen/index.ts"))).toBe(
      true,
    );
    expect(existsSync(path.join(ws, "spec/todo.json"))).toBe(true);
    expect(existsSync(path.join(ws, "tests/hidden.test.ts"))).toBe(false);

    const written = copyAcceptanceFiles(t, ws, pinned);
    expect(existsSync(path.join(ws, "tests/hidden.test.ts"))).toBe(true);
    expect(written).toContain(path.join(ws, "vitest.config.ts"));
    expect(readFileSync(path.join(ws, "vitest.config.ts"), "utf8")).toContain(
      "tsconfigPaths: true",
    );
  });

  it("keeps a pinned vitest.config.ts", () => {
    const pinned = path.join(tmp, "pinned");
    const src = path.join(pinned, "custom-read-model");
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "vitest.config.ts"), "// pinned\n");
    const t = task({
      acceptance: {
        kind: "vitest",
        files: [{ from: "vitest.config.ts", to: "vitest.config.ts" }],
        vitestConfig: true,
      },
    });
    const ws = path.join(tmp, "ws");
    copyAcceptanceFiles(t, ws, pinned);
    expect(readFileSync(path.join(ws, "vitest.config.ts"), "utf8")).toBe(
      "// pinned\n",
    );
  });

  it("copies the reference recipe without build output", () => {
    const recipes = path.join(tmp, "recipes");
    const recipe = path.join(recipes, "custom-read-model");
    mkdirSync(path.join(recipe, "src"), { recursive: true });
    mkdirSync(path.join(recipe, "node_modules/x"), { recursive: true });
    mkdirSync(path.join(recipe, "dist"), { recursive: true });
    mkdirSync(path.join(recipe, ".tsbuild"), { recursive: true });
    writeFileSync(path.join(recipe, "src/index.ts"), "export {};");
    writeFileSync(path.join(recipe, "package.json"), "{}");
    writeFileSync(path.join(recipe, "node_modules/x/index.js"), "");
    writeFileSync(path.join(recipe, "dist/index.js"), "");
    writeFileSync(path.join(recipe, ".tsbuild/a.js"), "");
    writeFileSync(path.join(recipe, "tsconfig.tsbuildinfo"), "");

    const ref = path.join(tmp, "reference");
    expect(copyReference(recipes, task(), ref)).toBe(2);
    expect(existsSync(path.join(ref, "src/index.ts"))).toBe(true);
    expect(existsSync(path.join(ref, "node_modules"))).toBe(false);
    expect(existsSync(path.join(ref, "dist"))).toBe(false);
    expect(existsSync(path.join(ref, ".tsbuild"))).toBe(false);
    expect(existsSync(path.join(ref, "tsconfig.tsbuildinfo"))).toBe(false);
  });

  it("refuses a brief-only task", () => {
    expect(() =>
      copyReference(tmp, task({ recipeDir: null }), path.join(tmp, "r")),
    ).toThrow(/recipeDir/);
  });
});

describe("collectDts", () => {
  it("follows the package symlink and keeps relative paths", () => {
    const ws = path.join(tmp, "ws");
    const store = path.join(
      ws,
      "node_modules/.pnpm/@powerhousedao+reactor@1/node_modules/@powerhousedao/reactor",
    );
    mkdirSync(path.join(store, "dist/sub"), { recursive: true });
    mkdirSync(path.join(store, "node_modules/nested"), { recursive: true });
    writeFileSync(path.join(store, "package.json"), '{"version":"1.0.0"}');
    writeFileSync(
      path.join(store, "dist/index.d.ts"),
      "export declare class ReactorBuilder { withReadModels(): this; }\n",
    );
    writeFileSync(path.join(store, "dist/sub/x.d.mts"), "export {};\n");
    writeFileSync(path.join(store, "dist/index.js"), "");
    writeFileSync(path.join(store, "node_modules/nested/n.d.ts"), "nested");
    mkdirSync(path.join(ws, "node_modules/@powerhousedao"), {
      recursive: true,
    });
    symlinkSync(
      "../.pnpm/@powerhousedao+reactor@1/node_modules/@powerhousedao/reactor",
      path.join(ws, "node_modules/@powerhousedao/reactor"),
    );

    const out = path.join(tmp, "dts");
    const count = collectDts(
      ws,
      ["@powerhousedao/reactor", "document-model"],
      out,
    );
    expect(count).toBe(2);
    expect(
      existsSync(path.join(out, "@powerhousedao/reactor/dist/index.d.ts")),
    ).toBe(true);
    expect(
      existsSync(path.join(out, "@powerhousedao/reactor/dist/sub/x.d.mts")),
    ).toBe(true);
    expect(
      existsSync(path.join(out, "@powerhousedao/reactor/dist/index.js")),
    ).toBe(false);
    expect(dtsHasSymbol(out, "withReadModels")).toBe(true);
    expect(dtsHasSymbol(out, "withReadModel")).toBe(false);
    expect(dtsHasSymbol(out, "nested")).toBe(false);
    expect(dtsHasSymbol(path.join(tmp, "missing"), "x")).toBe(false);

    expect(installedVersion(ws, ["@powerhousedao/reactor"])).toBe("1.0.0");
    expect(
      installedVersion(path.join(tmp, "none"), ["document-model"]),
    ).toBeNull();
  });
});

const integration = process.env.DOC_HARNESS_INTEGRATION === "1";

describe.skipIf(!integration)("installWorkspace (integration)", () => {
  it("installs the pin, then reinstalls offline from the cached lockfile", async () => {
    const t = task({
      id: "install-probe",
      packages: [
        "@powerhousedao/reactor",
        "@powerhousedao/shared",
        "document-model",
      ],
    });
    const cacheDir = path.join(tmp, "cache");
    const ws1 = path.join(tmp, "ws1");
    scaffoldWorkspace({ dir: ws1, task: t, pin: PIN });
    const first = await installWorkspace({
      dir: ws1,
      task: t,
      cacheDir,
      logPath: path.join(tmp, "logs/install1.log"),
      timeoutMs: 900_000,
    });
    expect(first.ok).toBe(true);
    expect(first.fromCache).toBe(false);
    expect(first.installedVersion).toBe(PIN);
    expect(
      existsSync(path.join(cacheDir, "install-probe/pnpm-lock.yaml")),
    ).toBe(true);

    const ws2 = path.join(tmp, "ws2");
    scaffoldWorkspace({ dir: ws2, task: t, pin: PIN });
    const second = await installWorkspace({
      dir: ws2,
      task: t,
      cacheDir,
      logPath: path.join(tmp, "logs/install2.log"),
      timeoutMs: 900_000,
    });
    expect(second.ok).toBe(true);
    expect(second.fromCache).toBe(true);
    expect(second.installedVersion).toBe(PIN);
    expect(collectDts(ws2, t.packages, path.join(tmp, "dts"))).toBeGreaterThan(
      0,
    );
    console.log(
      `install: first ${first.ms}ms, cached ${second.ms}ms (${path.join(tmp, "logs")})`,
    );
  }, 900_000);
});
