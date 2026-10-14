import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPrepack } from "../src/services/build.js";
import {
  cleanUp,
  itWithSymlinks,
  disposals,
  packageWith,
  writeShape,
  writeTsconfig,
  build,
} from "./helpers/declarations.js";

afterEach(cleanUp);

describe("the release check and declarations outside the output directory", () => {
  it("reuses the release check for declarations outside a non-default output directory", async () => {
    const root = packageWith("code-first");
    const manifest = join(root, "package.json");
    writeFileSync(
      manifest,
      readFileSync(manifest, "utf8")
        .replaceAll("./dist/", "./build/")
        .replace('"files":["dist",', '"files":["build","dist",'),
    );
    writeTsconfig(root, { declaration: true, declarationDir: "./dist/types" });
    const built = await build(root, "code-first", "build");
    expect(built.exitCode, built.log).toBe(0);
    expect(existsSync(join(root, "dist", "types", "src", "shape.d.ts"))).toBe(
      true,
    );

    const messages: string[] = [];
    const retained = await runPrepack(
      {
        configFile: join(root, "powerhouse.config.json"),
        outDir: "build",
        source: [],
        warningsAsErrors: false,
        noSharedDeps: false,
        ignoreTypeErrors: false,
        debug: false,
      },
      { log: (text) => messages.push(text) },
    );
    expect(messages.join("")).toContain("Reusing the completed release check");
    expect(retained.phases).toEqual([]);
  }, 120_000);

  it("reuses the release check after the build wrote them", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, {
      declaration: true,
      declarationMap: true,
      declarationDir: "./types",
    });
    expect((await build(root, "code-first")).exitCode).toBe(0);

    const messages: string[] = [];
    const retained = await runPrepack(
      {
        configFile: join(root, "powerhouse.config.json"),
        outDir: "dist",
        source: [],
        warningsAsErrors: false,
        noSharedDeps: false,
        ignoreTypeErrors: false,
        debug: false,
      },
      { log: (text) => messages.push(text) },
    );
    expect(messages.join("")).toContain("Reusing the completed release check");
    expect(retained.phases).toEqual([]);
  }, 120_000);

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails before bundling when tsc cannot write the declarations",
    async () => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      mkdirSync(join(root, "types"));
      chmodSync(join(root, "types"), 0o555);
      disposals.unshift(() => chmodSync(join(root, "types"), 0o755));

      const result = await build(root, "code-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("TS5033");
      expect(
        existsSync(join(root, ".ph", "build", "release-approval.json")),
      ).toBe(false);
    },
    120_000,
  );

  it("reruns a release check another ph version made, saying so", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "./types" });
    expect((await build(root, "code-first")).exitCode).toBe(0);
    const approvalFile = join(root, ".ph", "build", "release-approval.json");
    writeFileSync(
      approvalFile,
      JSON.stringify({
        ...(JSON.parse(readFileSync(approvalFile, "utf8")) as object),
        formatVersion: 1,
      }),
    );

    const messages: string[] = [];
    await runPrepack(
      {
        configFile: join(root, "powerhouse.config.json"),
        outDir: "dist",
        source: [],
        warningsAsErrors: false,
        noSharedDeps: false,
        ignoreTypeErrors: false,
        debug: false,
      },
      { log: (text) => messages.push(text) },
    );
    expect(messages.join("")).toContain(
      "Running a release check: the retained release check was made by another ph version",
    );
  }, 120_000);

  itWithSymlinks(
    "reuses the release check when a symlink in the package leads to them",
    async () => {
      const root = packageWith("code-first");
      mkdirSync(join(root, "generated", "deep", "types"), { recursive: true });
      symlinkSync(
        join(root, "generated", "deep", "types"),
        join(root, "types"),
      );
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      expect((await build(root, "code-first")).exitCode).toBe(0);

      const messages: string[] = [];
      const retained = await runPrepack(
        {
          configFile: join(root, "powerhouse.config.json"),
          outDir: "dist",
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
          debug: false,
        },
        { log: (text) => messages.push(text) },
      );
      expect(messages.join("")).toContain(
        "Reusing the completed release check",
      );
      expect(retained.phases).toEqual([]);
    },
    120_000,
  );

  itWithSymlinks(
    "reuses the release check when a symlink outside the output directory leads into it",
    async () => {
      const root = packageWith("code-first");
      mkdirSync(join(root, "dist", "types"), { recursive: true });
      symlinkSync("dist/types", join(root, "types"));
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      writeShape(root, "string");
      expect((await build(root, "code-first")).exitCode).toBe(0);
      writeShape(root, "number");
      expect((await build(root, "code-first")).exitCode).toBe(0);

      const messages: string[] = [];
      const retained = await runPrepack(
        {
          configFile: join(root, "powerhouse.config.json"),
          outDir: "dist",
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
          debug: false,
        },
        { log: (text) => messages.push(text) },
      );
      expect(messages.join("")).toContain(
        "Reusing the completed release check",
      );
      expect(retained.phases).toEqual([]);
    },
    120_000,
  );
});
