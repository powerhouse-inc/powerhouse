// `ph build` writes to a stage and replaces the output only when every step
// succeeded. These builds run in this process on copies of the fixtures.

import { spawnSync } from "node:child_process";
import type * as NodeFs from "node:fs";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild } from "../src/services/build.js";
import {
  BuildRefusal,
  BuildStopped,
} from "../src/services/package-build/pipeline/steps.js";
import { buildPackage } from "../src/services/package-build/run-build.js";
import { openBuildSession } from "../src/services/package-build/staging/open.js";
import { replayRun } from "../src/services/package-build/staging/recovery.js";
import { nodeBundleStep } from "../src/services/package-build/steps/bundles.js";
import type { StandardBuildStep } from "../src/services/package-build/steps/context.js";
import { standardBuildSteps } from "../src/services/package-build/steps/standard.js";
import type { BuildArgs } from "../src/types.js";
import { LEDGER_SOURCE } from "./model-project.js";
import {
  addCodeFirstLedger,
  createStagedProject,
  previousOutput,
  scratchLeft,
  type StagedProject,
  TAILWIND_INPUT,
  treeDigest,
} from "./staged-build-project.js";

// A rename, removal or hard link the test fails on purpose; and the hard
// links made, by target.
const injected = vi.hoisted(() => ({
  rename: undefined as
    | ((from: string, to: string) => NodeJS.ErrnoException | undefined)
    | undefined,
  rm: undefined as
    | ((path: string) => NodeJS.ErrnoException | undefined)
    | undefined,
  link: undefined as
    | ((to: string) => NodeJS.ErrnoException | undefined)
    | undefined,
  linked: [] as string[],
}));

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof NodeFs>();
  return {
    ...fs,
    renameSync: (from: string, to: string) => {
      const error = injected.rename?.(String(from), String(to));
      if (error) throw error;
      fs.renameSync(from, to);
    },
    linkSync: (from: string, to: string) => {
      const error = injected.link?.(String(to));
      if (error) throw error;
      fs.linkSync(from, to);
      injected.linked.push(String(to));
    },
    rmSync: (path: string, options?: NodeFs.RmOptions) => {
      const error = injected.rm?.(String(path));
      if (error) throw error;
      fs.rmSync(path, options);
    },
  };
});

const prompt = vi.hoisted(() => vi.fn());
vi.mock("enquirer", () => ({ default: { prompt } }));

const args = {
  outDir: "dist",
  noSharedDeps: false,
  ignoreTypeErrors: false,
  release: false,
  debug: undefined,
} as BuildArgs;

const originalCwd = process.cwd();
const interactive = process.stdin.isTTY;
const projects: StagedProject[] = [];
let logs: string[];
let warnings: string[];
let errors: string[];

function project(): StagedProject {
  const made = createStagedProject();
  projects.push(made);
  process.chdir(made.root);
  return made;
}

const errnoError = (code: string) =>
  Object.assign(new Error(`${code}: injected`), { code });

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

beforeEach(() => {
  logs = [];
  warnings = [];
  errors = [];
  injected.rename = undefined;
  injected.rm = undefined;
  injected.link = undefined;
  injected.linked = [];
  prompt.mockReset();
  vi.stubEnv("CI", "1");
  const capture =
    (into: string[]) =>
    (...parts: unknown[]) => {
      const message = parts.map(String).join(" ");
      // Rolldown's timing advice depends on the machine, not on the build.
      if (!message.includes("[PLUGIN_TIMINGS]")) into.push(message);
    };
  vi.spyOn(console, "log").mockImplementation(capture(logs));
  vi.spyOn(console, "warn").mockImplementation(capture(warnings));
  vi.spyOn(console, "error").mockImplementation(capture(errors));
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Exit(code === undefined ? undefined : Number(code));
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const made of projects.splice(0)) made.dispose();
});

const CLASSIC_OUTPUT = [
  "browser/document-models/index.js",
  "browser/document-models/index.js.map",
  "browser/document-models/thing/index.js",
  "browser/document-models/thing/index.js.map",
  "browser/editors/index.js",
  "browser/editors/index.js.map",
  "browser/index.js",
  "node/document-models/index.mjs",
  "node/document-models/index.mjs.map",
  "node/document-models/thing/index.mjs",
  "node/document-models/thing/index.mjs.map",
  "node/editors/index.mjs",
  "node/editors/index.mjs.map",
  "node/index.mjs",
  "powerhouse.manifest.json",
  "style.css",
  "types/document-models/index.d.ts",
  "types/document-models/thing/index.d.ts",
  "types/editors/index.d.ts",
  "types/index.d.ts",
];

// The fixture's index.ts exports nothing; once it does, its bundles get maps.
const INDEX_MAPS = ["browser/index.js.map", "node/index.mjs.map"];

const files = (dir: string) => Object.keys(treeDigest(dir, ["."])).sort();

/** Each sourcemap's `sources`, by its path under `dir`. */
function mapSources(dir: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(treeDigest(dir, ["."]))
      .filter((file) => file.endsWith(".map"))
      .sort()
      .map((file) => [
        file,
        (
          JSON.parse(readFileSync(join(dir, file), "utf8")) as {
            sources: unknown;
          }
        ).sources,
      ]),
  );
}

const writesInPlace = (reason: string) =>
  `⚠ ${reason}, so this build writes dist in place: if it does not finish, dist can be left part old, part new.`;

const TYPE_ERROR = 'export const broken: number = "not a number";\n';

describe("a staged build", () => {
  it("writes the output main writes, and leaves no scratch behind", async () => {
    const made = project();

    await buildPackage(args, { checkDefinitions: true });

    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
    expect(scratchLeft(made)).toEqual([]);
    expect(readdirSync(join(made.root, ".ph", "build"))).toEqual(["runs"]);
    expect(logs).toContain(`✔ Types emitted to ${join("dist", "types")}`);
    expect(warnings).toEqual([]);
    // A package that selects no code-first source checks nothing.
    expect(
      logs.filter((line) => line.includes("document model definitions")),
    ).toEqual([]);
    // tsdown labels the files it writes with the output, not the stage.
    expect(logs.filter((line) => line.includes(".ph-stage-"))).toEqual([]);
    expect(logs.some((line) => line.includes(`dist${sep}browser${sep}`))).toBe(
      true,
    );
    // Tailwind scans the staged browser bundle, which the stage name keeps
    // out of tsc's and tsdown's globs but not out of an explicit @source.
    const sources = made
      .read(TAILWIND_INPUT)
      .split("\n")
      .filter((line) => line.startsWith("@source"))
      .map((line) => line.replace(/ph-stage-[^/]+/, "ph-stage-<run>"));
    expect(sources).toEqual([
      '@source "./.dist.ph-stage-<run>/browser";',
      '@source not "./.dist.ph-stage-<run>/browser/**/*.map";',
    ]);
  }, 120_000);

  it("keeps files no step writes and drops bundles the bundler would clean", async () => {
    const made = project();
    await buildPackage(args);
    made.write("dist/notes.txt", "kept\n");
    made.write("dist/extra/deep/readme.md", "# kept too\n");
    made.write("dist/browser/stale.js", "export const stale = 1;\n");

    await buildPackage(args);

    expect(made.read("dist/notes.txt")).toBe("kept\n");
    expect(made.read("dist/extra/deep/readme.md")).toBe("# kept too\n");
    expect(existsSync(join(made.dist, "browser", "stale.js"))).toBe(false);
    expect(files(made.dist)).toEqual(
      [...CLASSIC_OUTPUT, "extra/deep/readme.md", "notes.txt"].sort(),
    );
  }, 120_000);

  it("runs tsc with main's command lines, in the package", async () => {
    const made = project();
    await buildPackage(args);
    await buildPackage(args);
    // Like the ph init tsconfig, the fixture is incremental; its build info stays.
    rmSync(made.dist, { recursive: true });
    await buildPackage(args);

    expect(made.tscCalls().map(({ args, cwd }) => [cwd, ...args])).toEqual([
      [made.root, "--showConfig"],
      [made.root, "--build", "--force"],
      [made.root, "--showConfig"],
      [made.root, "--build"],
      [made.root, "--showConfig"],
      [made.root, "--build", "--force"],
    ]);
  }, 240_000);

  it("runs the steps a command passes through runBuild, and exits 1 on their refusal", async () => {
    const made = project();
    const refusing: StandardBuildStep = {
      id: "refusing",
      after: ["node-bundle"],
      run: () => Promise.reject(new BuildRefusal("✘ refused by an added step")),
    };

    await expect(
      runBuild(args, { steps: [...standardBuildSteps, refusing] }),
    ).rejects.toThrow(new Exit(1));

    expect(errors).toEqual(["✘ refused by an added step"]);
    // tsc wrote dist/types and its build info first; a first build leaves neither.
    expect(existsSync(made.dist)).toBe(false);
    expect(existsSync(join(made.root, "tsconfig.tsbuildinfo"))).toBe(false);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("installs the fresh bundle of a list whose own bundle step writes where tsc writes", async () => {
    const made = project();
    made.write(
      "tsconfig.json",
      made.read("tsconfig.json").replace('"./dist/types"', '"./dist/node"'),
    );
    await buildPackage(args);
    const previous = made.read("dist/node/index.mjs");
    made.write("index.ts", `${made.read("index.ts")}export const added = 1;\n`);
    const renamed = standardBuildSteps.map((step) =>
      step.id === "node-bundle" ? { ...step, id: "custom-bundle" } : step,
    );

    await buildPackage(args, { steps: renamed });
    const custom = made.read("dist/node/index.mjs");
    await buildPackage(args);

    expect(custom).not.toBe(previous);
    expect(custom).toBe(made.read("dist/node/index.mjs"));
  }, 240_000);

  it("builds a symlinked output directory in place, with main's sourcemaps", async () => {
    const made = project();
    const target = join(dirname(made.root), "elsewhere", "deep", "build");
    mkdirSync(target, { recursive: true });
    symlinkSync(target, made.dist, "dir");

    await buildPackage(args);
    await buildPackage(args);

    expect(warnings).toEqual([
      writesInPlace("dist is a symbolic link"),
      writesInPlace("dist is a symbolic link"),
    ]);
    expect(readlinkSync(made.dist)).toBe(target);
    expect(files(target)).toEqual(CLASSIC_OUTPUT);
    // What main's ph build writes for this layout.
    expect(mapSources(target)).toEqual({
      "browser/document-models/index.js.map": [
        "../../../document-models/index.ts",
      ],
      "browser/document-models/thing/index.js.map": [
        "../../../../document-models/thing/index.ts",
      ],
      "browser/editors/index.js.map": ["../../../editors/index.ts"],
      "node/document-models/index.mjs.map": [
        "../../../document-models/index.ts",
      ],
      "node/document-models/thing/index.mjs.map": [
        "../../../../document-models/thing/index.ts",
      ],
      "node/editors/index.mjs.map": ["../../../editors/index.ts"],
    });
    expect(scratchLeft(made)).toEqual([]);
    expect(readdirSync(dirname(target))).toEqual(["build"]);
  }, 240_000);

  it("stages an absolute --out-dir that reaches the output through a symlink, with main's sourcemaps", async () => {
    const made = project();
    const alias = join(dirname(made.root), "alias");
    symlinkSync(dirname(made.root), alias, "dir");

    await buildPackage({ ...args, outDir: join(alias, "my package", "dist") });

    expect(warnings).toEqual([]);
    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
    // What main's ph build writes for this --out-dir: paths from the alias.
    expect(mapSources(made.dist)).toEqual({
      "browser/document-models/index.js.map": [
        "../../../../../my package/document-models/index.ts",
      ],
      "browser/document-models/thing/index.js.map": [
        "../../../../../../my package/document-models/thing/index.ts",
      ],
      "browser/editors/index.js.map": [
        "../../../../../my package/editors/index.ts",
      ],
      "node/document-models/index.mjs.map": [
        "../../../../../my package/document-models/index.ts",
      ],
      "node/document-models/thing/index.mjs.map": [
        "../../../../../../my package/document-models/thing/index.ts",
      ],
      "node/editors/index.mjs.map": [
        "../../../../../my package/editors/index.ts",
      ],
    });
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("leaves unprotected a compiler output that holds .ph/build, directly or through a symlink, and protects the others", async () => {
    const made = project();
    symlinkSync(".", join(made.root, "root-alias"), "dir");
    symlinkSync(".ph", join(made.root, "compiler-alias"), "dir");
    made.write("lib/index.d.ts", "export declare const kept: 1;\n");
    const session = await openBuildSession({
      packageRoot: made.root,
      outDir: "dist",
      cleanedEntries: [],
      linkCleanedEntries: false,
    });

    try {
      session.protectCompilerOutputs([
        { path: join(made.root, ".ph"), kind: "directory" },
        { path: join(made.root, "compiler-alias"), kind: "directory" },
        { path: join(made.root, "root-alias"), kind: "directory" },
        { path: join(made.root, "lib"), kind: "directory" },
      ]);
      made.write("lib/index.d.ts", "export declare const rewritten: 1;\n");
      session.rollback();
    } finally {
      session.close();
    }

    expect(made.read("lib/index.d.ts")).toBe("export declare const kept: 1;\n");
    expect(scratchLeft(made)).toEqual([]);
  });

  it("builds to an absolute --out-dir and writes the stylesheet where main does", async () => {
    const made = project();
    const outside = join(dirname(made.root), "absolute out");

    await buildPackage({ ...args, outDir: outside });

    expect(files(outside)).toEqual(
      CLASSIC_OUTPUT.filter(
        (file) => file !== "style.css" && !file.startsWith("types/"),
      ),
    );
    // As without staging: tsc's declarations, the browser build's manifest
    // copy and the stylesheet go to the package's dist/.
    expect(files(made.dist)).toEqual([
      "powerhouse.manifest.json",
      "style.css",
      "types/document-models/index.d.ts",
      "types/document-models/thing/index.d.ts",
      "types/editors/index.d.ts",
      "types/index.d.ts",
    ]);
    expect(readdirSync(dirname(made.root)).sort()).toEqual([
      "absolute out",
      "my package",
    ]);
  }, 120_000);

  it("finishes despite type errors with --ignore-type-errors, and warns last", async () => {
    const made = project();
    await buildPackage(args);
    made.write(
      "index.ts",
      `${made.read("index.ts")}export const added = 1;\n${TYPE_ERROR}`,
    );

    await buildPackage({ ...args, ignoreTypeErrors: true });

    expect(made.read("dist/node/index.mjs")).toContain("added");
    expect(files(made.dist)).toEqual([...CLASSIC_OUTPUT, ...INDEX_MAPS].sort());
    expect(warnings.at(-1)).toBe(
      "\n⚠ Built despite type errors. A package built with type errors can load and still fail at runtime. Fix them before you publish or deploy it.",
    );
    expect(scratchLeft(made)).toEqual([]);
  }, 240_000);

  it("warns when it cannot remove the old output, and the next build removes it", async () => {
    const made = project();
    await buildPackage(args);
    made.write("index.ts", `${made.read("index.ts")}export const added = 1;\n`);
    injected.rm = (path) =>
      path.includes(".dist.ph-old-") ? errnoError("EIO") : undefined;

    await buildPackage(args);

    expect(warnings).toEqual([
      "⚠ The build finished, but its scratch files were not all removed (EIO: injected); the next build removes them.",
    ]);
    expect(made.read("dist/types/index.d.ts")).toContain(
      "export declare const added = 1;",
    );
    injected.rm = undefined;

    await buildPackage(args);

    expect(warnings.at(-1)).toBe(
      "⚠ An earlier build of this package stopped while it replaced its output; the replacement was completed.",
    );
    expect(scratchLeft(made)).toEqual([]);
  }, 240_000);
});

describe("a build that does not finish leaves the previous output as it was", () => {
  async function builtOnce(): Promise<{
    made: StagedProject;
    before: Record<string, string>;
  }> {
    const made = project();
    await buildPackage(args);
    // A change the next build would write, so a leak would show.
    made.write("index.ts", `${made.read("index.ts")}export const added = 1;\n`);
    return { made, before: previousOutput(made) };
  }

  it("when tsc reports type errors and nobody can be asked", async () => {
    const { made, before } = await builtOnce();
    made.write("index.ts", `${made.read("index.ts")}${TYPE_ERROR}`);

    await expect(runBuild(args)).rejects.toThrow(new Exit(1));

    expect(errors).toEqual([
      "\n✘ tsc reported the type errors above. A package built with type errors can load and still fail at runtime.\nFix them and build again. --ignore-type-errors skips this check, at the risk of shipping that failure.",
    ]);
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when the type error prompt is declined", async () => {
    const { made, before } = await builtOnce();
    made.write("index.ts", `${made.read("index.ts")}${TYPE_ERROR}`);
    vi.stubEnv("CI", "");
    process.stdin.isTTY = true;
    prompt.mockResolvedValue({ confirmed: false });

    try {
      await expect(runBuild(args)).rejects.toThrow(new Exit(1));
    } finally {
      process.stdin.isTTY = interactive;
    }

    expect(prompt).toHaveBeenCalledWith({
      type: "confirm",
      name: "confirmed",
      message:
        "tsc reported the type errors above. A package built with type errors can load and still fail at runtime. Build anyway?",
      initial: false,
    });
    expect(errors).toEqual([
      "Build cancelled. Fix them and build again. --ignore-type-errors skips this check, at the risk of shipping that failure.",
    ]);
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when a bundle fails", async () => {
    const { made, before } = await builtOnce();
    // Bundled for the browser only, and outside tsc's include.
    made.write("reactor/index.ts", "export const = ;\n");

    await expect(buildPackage(args)).rejects.toThrow(/reactor\/index\.ts/);

    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when the output cannot be moved aside after the standard steps, whose stage had the previous bundles by hard link", async () => {
    const { made, before } = await builtOnce();
    injected.rename = (from) =>
      from === made.dist ? errnoError("EIO") : undefined;

    await expect(buildPackage(args)).rejects.toThrow("EIO: injected");

    const stageLinks = injected.linked
      .map(
        (to) =>
          /\.dist\.ph-stage-[^/]+\/(.*)$/.exec(to.replaceAll(sep, "/"))?.[1],
      )
      .filter((file) => file !== undefined);
    expect(stageLinks).toEqual(
      expect.arrayContaining(["browser/index.js", "node/index.mjs"]),
    );
    expect(logs.filter((line) => line.includes("Cleaning"))).toHaveLength(2);
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when a step of a list of its own writes a file the stage took from the output", async () => {
    const { made, before } = await builtOnce();
    // The node bundle's id, so node/ is an entry the list cleans.
    const overwriting: StandardBuildStep = {
      ...nodeBundleStep,
      run: ({ session }) => {
        writeFileSync(
          join(session.stage(), "node", "index.mjs"),
          "export const leaked = true;\n",
        );
        return Promise.reject(new Error("failed after it wrote"));
      },
    };

    await expect(buildPackage(args, { steps: [overwriting] })).rejects.toThrow(
      "failed after it wrote",
    );

    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when the stage cannot take the output's place", async () => {
    const { made, before } = await builtOnce();
    injected.rename = (from, to) =>
      to === made.dist && from.includes(".dist.ph-stage-")
        ? errnoError("EIO")
        : undefined;

    await expect(buildPackage(args)).rejects.toThrow("EIO: injected");

    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when a rollback is cut short, and the next build finishes that rollback", async () => {
    const { made, before } = await builtOnce();
    const fromStage = (from: string) => from.includes(".dist.ph-stage-");
    const fromRetired = (from: string) => from.includes(".dist.ph-old-");
    injected.rename = (from, to) => {
      // The stage goes in entry by entry and fails at node/; putting the
      // old node/ back fails too.
      if (fromStage(from) && to === made.dist) return errnoError("EBUSY");
      if (
        to === join(made.dist, "node") &&
        (fromStage(from) || fromRetired(from))
      )
        return errnoError("EIO");
      return undefined;
    };

    await expect(buildPackage(args)).rejects.toThrow("EIO: injected");
    expect(errors).toEqual([
      "✘ The previous output could not be restored (EIO: injected); the next build restores it.",
    ]);
    injected.rename = undefined;
    const runs = join(made.root, ".ph", "build", "runs");
    const [run] = readdirSync(runs);

    expect(replayRun(made.root, join(runs, run))).toBe("rolled-back");
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);

  it("when tsc writes its declarations into the output directory itself", async () => {
    const made = project();
    made.write(
      "tsconfig.json",
      made
        .read("tsconfig.json")
        .replace('"declarationDir": "./dist/types"', '"outDir": "./dist"'),
    );
    await buildPackage(args);
    made.write("index.ts", `${made.read("index.ts")}export const added = 1;\n`);
    const before = previousOutput(made);
    made.write("reactor/index.ts", "export const = ;\n");

    await expect(buildPackage(args)).rejects.toThrow(/reactor\/index\.ts/);
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);

    rmSync(join(made.root, "reactor"), { recursive: true });
    await buildPackage(args);
    expect(made.read("dist/index.d.ts")).toContain(
      "export declare const added = 1;",
    );
    expect(files(made.dist)).toEqual(
      expect.arrayContaining([
        "browser/index.js",
        "node/index.mjs",
        "index.d.ts",
        "tsconfig.tsbuildinfo",
      ]),
    );
  }, 240_000);

  it("when tsc keeps its build info outside its output directory, and a rebuild without edits emits current declarations", async () => {
    const made = project();
    made.write("src/index.ts", "export const first = 1;\n");
    made.write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          module: "nodenext",
          moduleResolution: "nodenext",
          target: "esnext",
          declaration: true,
          emitDeclarationOnly: true,
          incremental: true,
          rootDir: "src",
          outDir: "lib",
          strict: true,
          skipLibCheck: true,
          types: [],
        },
        include: ["src/**/*"],
      }),
    );
    const compiled = () =>
      treeDigest(made.root, ["dist", "lib", "tsconfig.tsbuildinfo"]);
    await buildPackage(args);
    expect(made.read("lib/index.d.ts")).toBe(
      "export declare const first = 1;\n",
    );
    made.write(
      "src/index.ts",
      "export const first = 1;\nexport const second = 2;\n",
    );
    const before = compiled();
    made.write("reactor/index.ts", "export const = ;\n");

    await expect(buildPackage(args)).rejects.toThrow(/reactor\/index\.ts/);
    expect(compiled()).toEqual(before);

    rmSync(join(made.root, "reactor"), { recursive: true });
    await buildPackage(args);
    expect(made.read("lib/index.d.ts")).toBe(
      "export declare const first = 1;\nexport declare const second = 2;\n",
    );
  }, 240_000);
});

// On Windows, process.kill ends the process instead of delivering the signal.
describe.skipIf(process.platform === "win32")(
  "a build stopped by a signal its process handles",
  () => {
    it("removes what the step running at the signal writes before it settles", async () => {
      const made = project();
      await buildPackage(args);
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const before = previousOutput(made);
      const stopped: StandardBuildStep = {
        id: "stopped",
        after: ["typecheck"],
        run: async ({ session }) => {
          const stage = session.stage();
          process.kill(process.pid, "SIGTERM");
          await sleep(300);
          // A bundler that goes on writing after the signal.
          mkdirSync(join(stage, "browser"), { recursive: true });
          writeFileSync(join(stage, "browser", "late.js"), "late\n");
        },
      };
      const embedding = () => undefined;
      process.on("SIGTERM", embedding);

      try {
        await expect(
          buildPackage(args, { steps: [...standardBuildSteps, stopped] }),
        ).rejects.toThrow(new BuildStopped("SIGTERM"));
      } finally {
        process.removeListener("SIGTERM", embedding);
      }

      expect(previousOutput(made)).toEqual(before);
      expect(scratchLeft(made)).toEqual([]);
    }, 120_000);

    it("keeps the lock until the step running at the signal settles, so another build waits for it", async () => {
      const made = project();
      await buildPackage(args);
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const lockFile = join(made.root, ".ph", "build", "lock");
      const holder = () =>
        (JSON.parse(readFileSync(lockFile, "utf8")) as { runId: string }).runId;
      const held: string[] = [];
      let second: Promise<unknown> | undefined;
      const writing: StandardBuildStep = {
        id: "writing",
        after: ["typecheck"],
        run: async ({ session }) => {
          const stage = session.stage();
          const first = holder();
          process.kill(process.pid, "SIGTERM");
          await sleep(50);
          second = buildPackage(args);
          for (let write = 0; write < 5; write++) {
            await sleep(200);
            held.push(holder() === first ? "first" : "another");
            // A bundler that goes on writing after the signal.
            mkdirSync(stage, { recursive: true });
            writeFileSync(join(stage, `late-${write}.js`), "late\n");
          }
        },
      };
      const embedding = () => undefined;
      process.on("SIGTERM", embedding);

      try {
        await expect(
          buildPackage(args, { steps: [...standardBuildSteps, writing] }),
        ).rejects.toThrow(new BuildStopped("SIGTERM"));
        await second;
      } finally {
        process.removeListener("SIGTERM", embedding);
      }

      expect(held).toEqual(["first", "first", "first", "first", "first"]);
      expect(
        logs.filter((line) => line.startsWith("Another build")),
      ).toHaveLength(1);
      expect(made.read("dist/types/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      expect(files(made.dist)).toEqual(
        [...CLASSIC_OUTPUT, ...INDEX_MAPS].sort(),
      );
      expect(scratchLeft(made)).toEqual([]);
    }, 240_000);

    it("leaves nothing a stopped run wrote beside the output after the next build", async () => {
      const made = project();
      made.write(".dist.ph-stage-gone/browser/late.js", "late\n");
      made.write(".dist.ph-old-gone/index.js", "old\n");

      await buildPackage(args);

      expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
      expect(scratchLeft(made)).toEqual([]);
    }, 120_000);
  },
);

describe("replacing an output another process holds open", () => {
  it("retries, then moves entry by entry and says so", async () => {
    const made = project();
    await buildPackage(args);
    injected.rename = (from) =>
      from === made.dist ? errnoError("EBUSY") : undefined;
    const started = Date.now();

    await buildPackage(args);

    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(warnings).toEqual([
      "⚠ Another process holds files in dist, so dist was replaced entry by entry instead of in one rename; while that ran, it held parts of both builds.",
    ]);
    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);
});

const onWindows = process.platform === "win32";
// chmod does not restrict root.
const unrestricted = onWindows || process.getuid?.() === 0;

describe("where a staged build cannot run as an unstaged one would, it writes in place", () => {
  it("when .ph is a file", async () => {
    const made = project();
    made.write(".ph", "");

    await buildPackage(args);

    expect(warnings).toEqual([
      writesInPlace(`${join(".ph", "build")} cannot be written (ENOTDIR)`),
    ]);
    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
  }, 120_000);

  it("when the filesystem has no hard links for the lock", async () => {
    const made = project();
    injected.link = (to) =>
      to.endsWith(`${sep}lock`) ? errnoError("ENOTSUP") : undefined;

    await buildPackage(args);

    expect(warnings).toEqual([
      writesInPlace(`${join(".ph", "build")} cannot be written (ENOTSUP)`),
    ]);
    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
    expect(readdirSync(join(made.root, ".ph", "build"))).toEqual([]);
  }, 120_000);

  it("when the output holds .ph/build, whose lock and runs stay where they are", async () => {
    const made = project();
    made.write(".ph/kept.txt", "kept\n");
    const ph = join(made.root, ".ph");

    await runBuild({ ...args, outDir: ".ph" });
    await runBuild({ ...args, outDir: ".ph" });

    const inPlace = `⚠ .ph holds ${join(".ph", "build")}, so this build writes .ph in place: if it does not finish, .ph can be left part old, part new.`;
    expect(warnings).toEqual([inPlace, inPlace]);
    expect(made.read(".ph/kept.txt")).toBe("kept\n");
    expect(files(ph)).toEqual(
      expect.arrayContaining(["browser/index.js", "node/index.mjs"]),
    );
    expect(readdirSync(join(ph, "build"))).toEqual([]);
    expect(scratchLeft(made)).toEqual([]);
  }, 240_000);

  it.skipIf(unrestricted)(
    "when .ph cannot be written",
    async () => {
      const made = project();
      mkdirSync(join(made.root, ".ph"));
      chmodSync(join(made.root, ".ph"), 0o555);

      try {
        await buildPackage(args);
      } finally {
        chmodSync(join(made.root, ".ph"), 0o755);
      }

      expect(warnings).toEqual([
        writesInPlace(`${join(".ph", "build")} cannot be written (EACCES)`),
      ]);
      expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
      expect(readdirSync(join(made.root, ".ph"))).toEqual([]);
    },
    120_000,
  );

  it.skipIf(unrestricted)(
    "when the directory holding the output cannot be written",
    async () => {
      const made = project();
      await buildPackage(args);
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      chmodSync(made.root, 0o555);

      try {
        await buildPackage(args);
      } finally {
        chmodSync(made.root, 0o755);
      }

      expect(warnings).toEqual([
        writesInPlace("the package root cannot be written (EACCES)"),
      ]);
      expect(made.read("dist/types/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      expect(files(made.dist)).toEqual(
        [...CLASSIC_OUTPUT, ...INDEX_MAPS].sort(),
      );
      expect(scratchLeft(made)).toEqual([]);
    },
    240_000,
  );

  it.skipIf(unrestricted)(
    "when the output holds a file or directory it cannot read",
    async () => {
      const made = project();
      await buildPackage(args);
      made.write("dist/unused/secret", "secret\n");
      made.write("dist/locked/inside", "inside\n");
      const unreadable = ["dist/unused/secret", "dist/locked"];

      for (const entry of unreadable) {
        warnings.length = 0;
        chmodSync(join(made.root, entry), 0);
        try {
          await buildPackage(args);
        } finally {
          chmodSync(join(made.root, entry), 0o755);
        }
        expect(warnings).toEqual([writesInPlace(`${entry} cannot be read`)]);
      }

      expect(made.read("dist/unused/secret")).toBe("secret\n");
      expect(files(made.dist)).toEqual(
        [...CLASSIC_OUTPUT, "locked/inside", "unused/secret"].sort(),
      );
      expect(scratchLeft(made)).toEqual([]);
    },
    240_000,
  );

  it.skipIf(onWindows)(
    "when the output holds a FIFO",
    async () => {
      const made = project();
      await buildPackage(args);
      const fifo = join(made.dist, "pipe");
      expect(spawnSync("mkfifo", [fifo]).status).toBe(0);

      await buildPackage(args);

      expect(warnings).toEqual([
        writesInPlace("dist/pipe is not a file, directory or symbolic link"),
      ]);
      expect(lstatSync(fifo).isFIFO()).toBe(true);
      rmSync(fifo);
      expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
      expect(scratchLeft(made)).toEqual([]);
    },
    240_000,
  );
});

describe("a compiler output directory that only tsc's files can be written in", () => {
  const mode = (path: string) => lstatSync(path).mode & 0o777;

  it.skipIf(unrestricted)(
    "is put back with its mode when the build does not finish, and the next build writes in it",
    async () => {
      const made = project();
      made.write(
        "tsconfig.json",
        made.read("tsconfig.json").replace('"./dist/types"', '"./lib"'),
      );
      await buildPackage(args);
      const lib = join(made.root, "lib");
      const before = treeDigest(made.root, ["lib"]);
      const source = made.read("index.ts");
      chmodSync(lib, 0o555);
      made.write("index.ts", `${source}${TYPE_ERROR}`);

      try {
        await expect(runBuild(args)).rejects.toThrow(new Exit(1));
        expect(mode(lib)).toBe(0o555);
        expect(treeDigest(made.root, ["lib"])).toEqual(before);
        expect(scratchLeft(made)).toEqual([]);

        made.write("index.ts", `${source}export const added = 1;\n`);
        await buildPackage(args);
        expect(mode(lib)).toBe(0o555);
      } finally {
        chmodSync(lib, 0o755);
      }

      expect(warnings).toEqual([]);
      expect(made.read("lib/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      expect(scratchLeft(made)).toEqual([]);
    },
    240_000,
  );
});

describe("a session closed after a rollback", () => {
  it("releases the lock though its run cannot be removed", async () => {
    const made = project();
    const session = await openBuildSession({
      packageRoot: made.root,
      outDir: "dist",
      cleanedEntries: [],
      linkCleanedEntries: false,
    });
    session.stage();
    session.rollback();
    const runs = join(made.root, ".ph", "build", "runs");
    injected.rm = (path) =>
      dirname(path) === runs ? errnoError("EIO") : undefined;

    expect(() => session.close()).toThrow("EIO: injected");

    injected.rm = undefined;
    expect(scratchLeft(made)).toEqual([expect.stringMatching(/^runs\//)]);
  });
});

describe.skipIf(onWindows)(
  "a compiler output directory that holds a FIFO",
  () => {
    it("is left unprotected, and the build goes on as main's", async () => {
      const made = project();
      made.write(
        "tsconfig.json",
        made.read("tsconfig.json").replace('"./dist/types"', '"./lib"'),
      );
      await buildPackage(args);
      const pipe = join(made.root, "lib", "pipe");
      expect(spawnSync("mkfifo", [pipe]).status).toBe(0);
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );

      await buildPackage(args);

      expect(warnings).toEqual([]);
      expect(made.read("lib/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      expect(lstatSync(pipe).isFIFO()).toBe(true);
      expect(scratchLeft(made)).toEqual([]);
    }, 240_000);
  },
);

describe("a build that writes in place after a dead run", () => {
  it.skipIf(onWindows)(
    "finishes that run first, so a later failed build does not put back what the run saved",
    async () => {
      const made = project();
      await buildPackage(args);
      // A run that died after it saved the declarations of the build above.
      const runDir = join(made.root, ".ph", "build", "runs", "dead-run");
      cpSync(join(made.dist, "types"), join(runDir, "compiler", "0"), {
        recursive: true,
      });
      writeFileSync(
        join(runDir, "journal.json"),
        JSON.stringify({
          format: 1,
          runId: "dead-run",
          pid: spawnSync(process.execPath, ["-e", ""]).pid,
          state: "building",
          output: "dist",
          stage: ".dist.ph-stage-dead-run",
          retired: ".dist.ph-old-dead-run",
          compiler: [
            {
              path: "dist/types",
              kind: "directory",
              copy: "compiler/0",
              created: null,
            },
          ],
        }),
      );
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const fifo = join(made.dist, "pipe");
      expect(spawnSync("mkfifo", [fifo]).status).toBe(0);

      await buildPackage(args);

      expect(warnings).toEqual([
        "⚠ An earlier build of this package stopped before it finished; its partial output was removed and the previous output restored.",
        writesInPlace("dist/pipe is not a file, directory or symbolic link"),
      ]);
      expect(made.read("dist/types/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      rmSync(fifo);
      const inPlace = previousOutput(made);
      made.write("index.ts", `${made.read("index.ts")}${TYPE_ERROR}`);

      await expect(runBuild(args)).rejects.toThrow(new Exit(1));

      expect(previousOutput(made)).toEqual(inPlace);
      expect(scratchLeft(made)).toEqual([]);
    },
    240_000,
  );
});

describe("the definitions step", () => {
  // What `ph build` asks for; Connect and the switchboard runner do not.
  const checking = { checkDefinitions: true };
  const codeFirstProject = (ledger?: string) => {
    const made = project();
    addCodeFirstLedger(made, ledger);
    return made;
  };

  const invalidLedger = () =>
    LEDGER_SOURCE.replace(
      'ph.object("LedgerState"',
      'ph.object("Ledger State"',
    );

  it("prints nothing and goes on for a package whose definitionSources do not resolve", async () => {
    const made = project();
    made.write("powerhouse.config.json", '{ "definitionSources": 42 }');

    await buildPackage(args, checking);

    expect(
      logs.filter((line) => line.includes("document model definitions")),
    ).toEqual([]);
    expect(warnings).toEqual([]);
    expect(files(made.dist)).toEqual(CLASSIC_OUTPUT);
  }, 120_000);

  it("imports none of the package's modules unless ph build asks", async () => {
    // Each import appends a line, in whichever process imports the module.
    const made = codeFirstProject(
      `${LEDGER_SOURCE}\nprocess.getBuiltinModule("node:fs").appendFileSync("ledger-imports", "imported\\n");\n`,
    );
    const imports = () =>
      existsSync(join(made.root, "ledger-imports"))
        ? readFileSync(join(made.root, "ledger-imports"), "utf8")
        : "";

    await runBuild(args);
    expect(imports()).toBe("");
    await runBuild(args, checking);
    expect(imports()).toBe("imported\n");
  }, 240_000);

  it("checks the selected sources and reports them", async () => {
    codeFirstProject();

    await buildPackage(args, checking);

    expect(logs).toContain("\n▶ Checking document model definitions...");
    expect(logs).toContain(
      [
        "✔ ok: 1 definition (code-first, 1 selected source)",
        "  document-model example/ledger v1 ./document-models/ledger/index.ts#/Ledger",
        "0 errors, 0 warnings",
      ].join("\n"),
    );
  }, 120_000);

  it("warns about an invalid definition and goes on", async () => {
    const made = codeFirstProject(invalidLedger());

    await buildPackage(args, checking);

    expect(warnings).toEqual([
      [
        "⚠ The definition check reported problems; the build goes on:",
        "invalid: 0 definitions (code-first, 1 selected source)",
        "PH-DEF-NAME-INVALID [error/definition] ./document-models/ledger/index.ts /name: A GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and must not start with two underscores. Expected: a GraphQL name such as InvoiceLineItem Received: Ledger State Repair: Use letters, digits, and underscores, start with a letter or one underscore, and avoid the reserved __ prefix.",
        "1 error, 0 warnings",
      ].join("\n"),
    ]);
    expect(existsSync(join(made.dist, "node", "index.mjs"))).toBe(true);
  }, 120_000);

  it("with --release, stops on an invalid definition and keeps the previous output", async () => {
    const made = codeFirstProject();
    await buildPackage(args);
    made.write("document-models/ledger/index.ts", invalidLedger());
    const before = previousOutput(made);

    await expect(runBuild({ ...args, release: true })).rejects.toThrow(
      new Exit(1),
    );

    expect(errors).toEqual([
      [
        "✘ The release definition check stopped the build:",
        "invalid: 0 definitions (code-first, 1 selected source)",
        "PH-DEF-NAME-INVALID [error/definition] ./document-models/ledger/index.ts /name: A GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and must not start with two underscores. Expected: a GraphQL name such as InvoiceLineItem Received: Ledger State Repair: Use letters, digits, and underscores, start with a letter or one underscore, and avoid the reserved __ prefix.",
        "1 error, 0 warnings",
      ].join("\n"),
    ]);
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 240_000);
});
