import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, vi } from "vitest";
import { runPrepack } from "../src/services/build.js";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import { packageRevisionOf } from "../src/services/definitions/package-revision.js";
import {
  isIgnoredModelCheckPath,
  runModelCheckWatch,
} from "../src/services/model-check.js";
import {
  build,
  cleanUp,
  itWithSymlinks,
  packageWith,
  writeTsconfig,
  type Flow,
} from "./helpers/declarations.js";

afterEach(cleanUp);

function configuredPackage(flow: Flow): string {
  const root = packageWith(flow);
  writeTsconfig(root, { declaration: true, declarationDir: "./types" });
  return root;
}

describe.each<Flow>(["code-first", "schema-first"])(
  "%s scratch identity",
  (flow) => {
    itWithSymlinks.each(["relative", "absolute"])(
      "builds twice through a %s internal .ph link and keeps other state",
      async (layout) => {
        const root = configuredPackage(flow);
        const state = join(root, "state");
        mkdirSync(state);
        writeFileSync(join(state, "keep.txt"), "keep me\n");
        symlinkSync(layout === "relative" ? "state" : state, join(root, ".ph"));
        symlinkSync("state", join(root, "state-alias"));
        const steps = await createGenerationSteps();
        const consumers: (readonly string[])[] = [];
        const observed = {
          ...steps,
          verifyPackedConsumers: async (
            request: Parameters<typeof steps.verifyPackedConsumers>[0],
          ) => {
            const result = await steps.verifyPackedConsumers(request);
            expect(result).toEqual({
              ok: true,
              consumers: ["node", "browser"],
            });
            consumers.push(result.consumers);
            expect(
              readFileSync(
                join(state, "build", "pack", "state", "keep.txt"),
                "utf8",
              ),
            ).toBe("keep me\n");
            expect(
              existsSync(join(state, "build", "pack", "state", "build")),
            ).toBe(false);
            return result;
          },
        };
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await build(root, flow, "dist", observed);
          expect(result.exitCode, result.log).toBe(0);
          expect(readFileSync(join(state, "keep.txt"), "utf8")).toBe(
            "keep me\n",
          );
          expect(existsSync(join(root, "dist", "node", "index.mjs"))).toBe(
            true,
          );
        }
        if (flow === "code-first") {
          expect(consumers).toEqual([
            ["node", "browser"],
            ["node", "browser"],
          ]);
          expect(readdirSync(join(state, "build"))).toEqual([
            "release-approval.json",
          ]);
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
            { steps: observed, log: (text) => messages.push(text) },
          );
          expect(retained.exitCode).toBe(0);
          expect(retained.phases, messages.join("")).toEqual([]);
          expect(messages).toEqual([
            "✔ Reusing the completed release check for this revision.\n",
          ]);
        }
      },
      120_000,
    );

    itWithSymlinks(
      "refuses an external .ph without touching its target",
      async () => {
        const root = configuredPackage(flow);
        const external = configuredPackage("schema-first");
        mkdirSync(join(external, "build"));
        writeFileSync(join(external, "build", "sentinel.txt"), "untouched\n");
        symlinkSync(external, join(root, ".ph"));
        const result = await build(root, flow);
        expect(result.exitCode).toBe(2);
        expect(result.log).toContain(
          "ph build never writes outside the package root",
        );
        expect(readdirSync(join(external, "build"))).toEqual(["sentinel.txt"]);
        expect(
          readFileSync(join(external, "build", "sentinel.txt"), "utf8"),
        ).toBe("untouched\n");
      },
      60_000,
    );

    itWithSymlinks(
      "refuses an external .ph whose target does not exist",
      async () => {
        const root = configuredPackage(flow);
        const external = join(configuredPackage("schema-first"), "missing");
        symlinkSync(external, join(root, ".ph"));
        const result = await build(root, flow);
        expect(result.exitCode).toBe(2);
        expect(result.log).toContain(
          "ph build never writes outside the package root",
        );
        expect(existsSync(external)).toBe(false);
      },
      60_000,
    );

    itWithSymlinks(
      "creates internal state through a dangling .ph link",
      async () => {
        const root = configuredPackage(flow);
        symlinkSync("state", join(root, ".ph"));
        const result = await build(root, flow);
        expect(result.exitCode, result.log).toBe(0);
        expect(lstatSync(join(root, "state", "build")).isDirectory()).toBe(
          true,
        );
      },
      60_000,
    );

    itWithSymlinks.each(["internal", "external"])(
      "replaces a .ph/build link to an %s directory and leaves the target alone",
      async (layout) => {
        const root = configuredPackage(flow);
        const target =
          layout === "internal"
            ? join(root, "state")
            : join(configuredPackage("schema-first"), "state");
        mkdirSync(target);
        writeFileSync(join(target, "keep.txt"), "target survives\n");
        mkdirSync(join(root, ".ph"));
        symlinkSync(target, join(root, ".ph", "build"));
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await build(root, flow);
          expect(result.exitCode, result.log).toBe(0);
          expect(lstatSync(join(root, ".ph", "build")).isDirectory()).toBe(
            true,
          );
          expect(readdirSync(target)).toEqual(["keep.txt"]);
          expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe(
            "target survives\n",
          );
        }
      },
      120_000,
    );
  },
);

itWithSymlinks(
  "ignores scratch through directory and file aliases at every depth",
  async () => {
    const root = configuredPackage("code-first");
    mkdirSync(join(root, "state", "build"), { recursive: true });
    writeFileSync(join(root, "state", "keep.txt"), "before\n");
    writeFileSync(join(root, "state", "build", "noise.txt"), "before\n");
    symlinkSync("state", join(root, ".ph"));
    symlinkSync("state", join(root, "state-alias"));
    mkdirSync(join(root, "nested", "deep"), { recursive: true });
    symlinkSync("../../state/build", join(root, "nested", "deep", "scratch"));
    symlinkSync(
      "../../state/build/noise.txt",
      join(root, "nested", "deep", "noise.txt"),
    );
    const revision = packageRevisionOf(root, "dist");
    writeFileSync(join(root, "state", "build", "noise.txt"), "after\n");
    expect(packageRevisionOf(root, "dist")).toBe(revision);
    writeFileSync(join(root, "state", "keep.txt"), "after\n");
    expect(packageRevisionOf(root, "dist")).not.toBe(revision);
    const steps = await createGenerationSteps();
    const result = await build(root, "code-first", "dist", {
      ...steps,
      verifyPackedConsumers: async (request) => {
        // Generation clears scratch; recreate the file alias's target before copying.
        writeFileSync(join(root, "state", "build", "noise.txt"), "during\n");
        const packed = await steps.verifyPackedConsumers(request);
        expect(packed).toEqual({ ok: true, consumers: ["node", "browser"] });
        expect(
          readdirSync(join(root, "state", "build", "pack", "nested", "deep")),
        ).toEqual([]);
        return packed;
      },
    });
    expect(result.exitCode, result.log).toBe(0);
  },
  60_000,
);

itWithSymlinks(
  "keeps a build working when Git lists a directory cycle only as a symlink",
  async () => {
    const root = configuredPackage("code-first");
    symlinkSync(".", join(root, "loop"));
    expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(0);
    const listed = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" },
    );
    expect(listed.status).toBe(0);
    expect(
      listed.stdout
        .split("\0")
        .filter((path) => path === "loop" || path.startsWith("loop/")),
    ).toEqual(["loop"]);
    const result = await build(root, "code-first");
    expect(result.exitCode, result.log).toBe(0);
  },
  60_000,
);

itWithSymlinks.each(["loop", ".ph"])(
  "reports a self-referential %s link without ELOOP",
  async (entry) => {
    const root = configuredPackage("code-first");
    symlinkSync(entry, join(root, entry));
    const result = await build(root, "code-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain(
      `Directory symlink cycle at ${JSON.stringify(entry)}`,
    );
    expect(result.log).not.toContain("ELOOP");
  },
  60_000,
);

itWithSymlinks(
  "builds through a directory symlink cycle, as tsc does",
  async () => {
    const root = configuredPackage("code-first");
    symlinkSync(".", join(root, "loop"));
    const result = await build(root, "code-first");
    expect(result.exitCode, result.log).toBe(0);
  },
  60_000,
);

itWithSymlinks.each([".vite", "ignored"])(
  "builds with a cycle inside excluded %s state",
  async (directory) => {
    const root = configuredPackage("code-first");
    mkdirSync(join(root, directory));
    symlinkSync(".", join(root, directory, "loop"));
    if (directory === "ignored") {
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(
        0,
      );
      writeFileSync(
        join(root, ".gitignore"),
        "ignored/\nnode_modules/\ndist/\ntypes/\n",
      );
    }
    const result = await build(root, "code-first");
    expect(result.exitCode, result.log).toBe(0);
  },
  60_000,
);

itWithSymlinks(
  "ignores watch events under scratch through every spelling, including deleted files",
  () => {
    const root = configuredPackage("code-first");
    mkdirSync(join(root, "state", "build"), { recursive: true });
    writeFileSync(join(root, "state", "keep.txt"), "input\n");
    symlinkSync("state", join(root, ".ph"));
    symlinkSync("state", join(root, "state-alias"));
    mkdirSync(join(root, "nested"));
    symlinkSync("../state/build", join(root, "nested", "scratch"));
    for (const path of [
      ".ph/build/gone.txt",
      "state/build/gone.txt",
      "state-alias/build/gone.txt",
      "nested/scratch/gone.txt",
    ]) {
      expect(isIgnoredModelCheckPath(root, "dist", path), path).toBe(true);
    }
    expect(isIgnoredModelCheckPath(root, "dist", "state/keep.txt")).toBe(false);
    expect(isIgnoredModelCheckPath(root, "dist", "state-alias/keep.txt")).toBe(
      false,
    );
  },
);

itWithSymlinks(
  "watches source edits without rebuilding for aliased scratch events",
  async () => {
    const root = configuredPackage("code-first");
    mkdirSync(join(root, "state", "build"), { recursive: true });
    symlinkSync("state", join(root, ".ph"));
    symlinkSync("state", join(root, "state-alias"));
    const steps = await createGenerationSteps();
    const published: unknown[] = [];
    let compilations = 0;
    const signalListeners = process.listenerCount("SIGINT");
    const watching = runModelCheckWatch(
      {
        configFile: join(root, "powerhouse.config.json"),
        source: [],
        outDir: "dist",
        warningsAsErrors: false,
        watch: true,
        release: true,
        json: false,
        jsonLines: true,
        debug: false,
      },
      {
        steps: {
          ...steps,
          typecheck: async (request) => {
            compilations += 1;
            return await steps.typecheck(request);
          },
        },
        streams: {
          out: (text) => {
            published.push(JSON.parse(text));
          },
          err: () => undefined,
        },
      },
    );
    try {
      await vi.waitFor(
        () => {
          expect(process.listenerCount("SIGINT")).toBe(signalListeners + 1);
          expect(published).toMatchObject([{ status: "ok" }]);
        },
        { timeout: 30_000 },
      );
      for (const state of [".ph", "state", "state-alias"]) {
        writeFileSync(join(root, state, "build", "noise.txt"), "ignored\n");
      }
      await delay(200);
      expect(compilations).toBe(1);
      expect(published).toMatchObject([{ status: "ok" }]);
      writeFileSync(
        join(root, "src", "helper.ts"),
        "export const normalizeTitle = (t: string) => t.toUpperCase();\n",
      );
      await vi.waitFor(
        () => {
          expect(published).toMatchObject([{ status: "ok" }, { status: "ok" }]);
        },
        { timeout: 30_000 },
      );
      expect(compilations).toBe(2);
    } finally {
      process.emit("SIGINT");
      expect(await watching).toBe(0);
    }
  },
  60_000,
);
