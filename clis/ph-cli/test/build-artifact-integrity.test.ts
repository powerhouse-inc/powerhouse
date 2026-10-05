import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { runBuild } from "../src/services/build.js";
import {
  createGenerationSteps,
  promoteCandidate,
} from "../src/services/definitions/build-steps.js";
import {
  assertOutputDirectory,
  directoryDigest,
  GENERATION_DIRECTORY,
  type GenerationSteps,
  packageRevisionOf,
  runGeneration,
} from "../src/services/definitions/generation.js";
import { runModelCheck } from "../src/services/model-check.js";
import { emitFixture, writeFixtureTsconfig } from "./helpers/emit-fixture.js";
import { recorder } from "./helpers/recorder.js";

describe("physical output containment", () => {
  it.each(["dist", "new/deep/dist"])(
    "refuses linked parents for %s at promotion",
    (outDir) => {
      const fixture = materializeFixturePackage("control");
      const outside = materializeFixturePackage("control");
      try {
        const parent = join(fixture.root, "linked");
        const candidateRoot = join(
          fixture.root,
          GENERATION_DIRECTORY,
          "candidate",
        );
        mkdirSync(candidateRoot, { recursive: true });
        writeFileSync(
          join(candidateRoot, "index.js"),
          "export const candidate = true;",
        );
        mkdirSync(join(outside.root, "dist"));
        writeFileSync(join(outside.root, "dist", "keep"), "prior output");
        symlinkSync(outside.root, parent);
        expect(() =>
          promoteCandidate({
            packageRoot: fixture.root,
            candidateRoot,
            outDir: `linked/${outDir}`,
          }),
        ).toThrow(/--out-dir/);
        expect(readFileSync(join(outside.root, "dist", "keep"), "utf8")).toBe(
          "prior output",
        );
      } finally {
        fixture.dispose();
        outside.dispose();
      }
    },
  );

  it("permits output within an internal symlink and a nonexistent child", () => {
    const fixture = materializeFixturePackage("control");
    try {
      mkdirSync(join(fixture.root, "actual"));
      symlinkSync(join(fixture.root, "actual"), join(fixture.root, "linked"));
      expect(() =>
        assertOutputDirectory(fixture.root, "linked/new/dist"),
      ).not.toThrow();
    } finally {
      fixture.dispose();
    }
  });
});

describe("published source maps", () => {
  it("name the package's sources from where they are published", async () => {
    const fixture = materializeFixturePackage("schema-first");
    try {
      writeFixtureTsconfig(fixture.root);
      const tsconfig = JSON.parse(
        readFileSync(join(fixture.root, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown>; include: string[] };
      tsconfig.compilerOptions.declarationMap = true;
      tsconfig.include = ["index.ts", "src/**/*.ts", "document-models/**/*.ts"];
      writeFileSync(
        join(fixture.root, "tsconfig.json"),
        JSON.stringify(tsconfig),
      );
      writeFileSync(
        join(fixture.root, "index.ts"),
        'export { authoringApproach } from "./src/index.js";\n',
      );
      mkdirSync(join(fixture.root, "document-models", "foo"), {
        recursive: true,
      });
      writeFileSync(
        join(fixture.root, "document-models", "foo", "index.ts"),
        "export const foo = 1;\n",
      );
      const steps = {
        ...(await createGenerationSteps("dist")),
        typecheck: recorder().steps.typecheck,
      };
      const result = await runBuild(
        {
          outDir: "dist",
          debug: false,
          configFile: join(fixture.root, "powerhouse.config.json"),
          source: [],
          warningsAsErrors: false,
        },
        { steps, log: () => undefined },
      );
      expect(result.exitCode).toBe(0);

      const dist = join(fixture.root, "dist");
      const sources = Object.fromEntries(
        readdirSync(dist, { recursive: true, encoding: "utf8" })
          .filter((file) => file.endsWith(".map"))
          .sort()
          .map((file) => {
            const map = JSON.parse(readFileSync(join(dist, file), "utf8")) as {
              sources: string[];
            };
            const source = resolve(dirname(join(dist, file)), map.sources[0]);
            expect(existsSync(source), file).toBe(true);
            return [file, relative(fixture.root, source)];
          }),
      );
      expect(sources).toEqual({
        "browser/document-models/foo/index.js.map": join(
          "document-models",
          "foo",
          "index.ts",
        ),
        "browser/index.js.map": join("src", "index.ts"),
        "node/document-models/foo/index.mjs.map": join(
          "document-models",
          "foo",
          "index.ts",
        ),
        "node/index.mjs.map": join("src", "index.ts"),
        "types/document-models/foo/index.d.ts.map": join(
          "document-models",
          "foo",
          "index.ts",
        ),
        "types/index.d.ts.map": "index.ts",
        "types/src/index.d.ts.map": join("src", "index.ts"),
      });
    } finally {
      fixture.dispose();
    }
  }, 120_000);
});

describe("published artifact digest", () => {
  it.each(["node_modules", ".git", ".ph", ".tsbuild", ".turbo", ".vite"])(
    "binds bytes under %s",
    (directory) => {
      const fixture = materializeFixturePackage("control");
      try {
        const output = join(fixture.root, "dist");
        mkdirSync(join(output, directory), { recursive: true });
        const file = join(output, directory, "runtime.js");
        writeFileSync(file, "export const value = 1;");
        const before = directoryDigest(output);
        writeFileSync(file, "export const value = 2;");
        expect(directoryDigest(output)).not.toBe(before);
      } finally {
        fixture.dispose();
      }
    },
  );
});

describe("concurrent release callers", () => {
  it.each([false, true])(
    "keeps an active candidate intact across callers (symlink alias: %s)",
    async (throughAlias) => {
      const fixture = materializeFixturePackage("control");
      writeFixtureTsconfig(fixture.root);
      const firstEntered = Promise.withResolvers<void>();
      const secondEntered = Promise.withResolvers<void>();
      const releaseFirst = Promise.withResolvers<void>();
      const releaseSecond = Promise.withResolvers<void>();
      const calls: Promise<number>[] = [];
      const stepsFor = (first: boolean): GenerationSteps => ({
        ...recorder().steps,
        emitCandidate: async ({ candidateRoot }) => {
          const marker = join(candidateRoot, first ? "first.js" : "second.js");
          writeFileSync(marker, "export const candidate = true;");
          (first ? firstEntered : secondEntered).resolve();
          await (first ? releaseFirst : releaseSecond).promise;
          return {
            ok: existsSync(marker),
            summary: "Another generation deleted this candidate.",
          };
        },
      });
      const alias = join(fixture.root, "node_modules", "package-alias");
      if (throughAlias) symlinkSync(fixture.root, alias);
      const run = (first: boolean) =>
        runModelCheck(
          {
            configFile: join(
              !first && throughAlias ? alias : fixture.root,
              "powerhouse.config.json",
            ),
            source: [],
            outDir: "dist",
            release: true,
            json: true,
            jsonLines: false,
            watch: false,
            warningsAsErrors: false,
            debug: false,
          },
          {
            steps: stepsFor(first),
            streams: { out: () => undefined, err: () => undefined },
          },
        );
      try {
        calls.push(run(true));
        await firstEntered.promise;
        calls.push(run(false));
        await Promise.race([
          secondEntered.promise,
          new Promise<void>((resolve) => setTimeout(resolve, 100)),
        ]);
        releaseFirst.resolve();
        const firstCode = await calls[0];
        await secondEntered.promise;
        releaseSecond.resolve();
        const secondCode = await calls[1];
        expect([firstCode, secondCode]).toEqual([0, 0]);
      } finally {
        releaseFirst.resolve();
        releaseSecond.resolve();
        await Promise.allSettled(calls);
        fixture.dispose();
      }
    },
    60_000,
  );
});

describe("generation queue recovery", () => {
  it("runs the next request after a compiler step throws", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    let calls = 0;
    const steps: GenerationSteps = {
      ...recorder().steps,
      typecheck: ({ packageRoot, emittedRoot }) => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error("compiler invocation failed"))
          : emitFixture(packageRoot, emittedRoot);
      },
    };
    const request = {
      packageRoot: fixture.root,
      configFile: join(fixture.root, "powerhouse.config.json"),
      outDir: "dist",
      warningsAsErrors: false,
      promoteOutput: false,
      steps,
      log: () => undefined,
    };
    const first = runGeneration(request);
    const second = runGeneration(request);
    try {
      await expect(first).rejects.toThrow("compiler invocation failed");
      expect((await second).exitCode).toBe(0);
      expect(calls).toBe(2);
    } finally {
      await Promise.allSettled([first, second]);
      fixture.dispose();
    }
  }, 60_000);
});

describe("package revision", () => {
  it("ignores files git ignores and counts every other change", () => {
    const fixture = materializeFixturePackage("control");
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: fixture.root });
      writeFileSync(join(fixture.root, ".gitignore"), "*.log\n.DS_Store\n");
      const before = packageRevisionOf(fixture.root, "dist");
      writeFileSync(join(fixture.root, "build.log"), "▶ Compiling\n");
      writeFileSync(join(fixture.root, ".DS_Store"), "finder");
      expect(packageRevisionOf(fixture.root, "dist")).toBe(before);
      writeFileSync(join(fixture.root, "notes.md"), "untracked input\n");
      expect(packageRevisionOf(fixture.root, "dist")).not.toBe(before);
    } finally {
      fixture.dispose();
    }
  });

  it("skips a dangling symlink in an ignored directory", () => {
    const fixture = materializeFixturePackage("control");
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: fixture.root });
      writeFileSync(join(fixture.root, ".gitignore"), "coverage/\n");
      const before = packageRevisionOf(fixture.root, "dist");
      mkdirSync(join(fixture.root, "coverage"));
      symlinkSync(
        join(fixture.root, "missing"),
        join(fixture.root, "coverage", "broken-link"),
      );
      expect(packageRevisionOf(fixture.root, "dist")).toBe(before);
    } finally {
      fixture.dispose();
    }
  });

  it("counts every file outside a git work tree", () => {
    const fixture = materializeFixturePackage("control");
    try {
      const before = packageRevisionOf(fixture.root, "dist");
      writeFileSync(join(fixture.root, "build.log"), "▶ Compiling\n");
      expect(packageRevisionOf(fixture.root, "dist")).not.toBe(before);
    } finally {
      fixture.dispose();
    }
  });
});
