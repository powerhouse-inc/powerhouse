// What the next build does with a run a dead build left, by the journal state
// it died in. Each case lays out the files that state leaves on disk.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fromJournalPath,
  type JournalState,
  readJournal,
  type RunJournal,
  toJournalPath,
  type UndoStep,
  writeJournal,
} from "../src/services/package-build/staging/journal.js";
import {
  outputDigest,
  replayRun,
} from "../src/services/package-build/staging/recovery.js";
import { treeDigest } from "./staged-build-project.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

// A path ending in "/" is an empty directory.
function write(root: string, files: Readonly<Record<string, string>>) {
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith("/")) {
      mkdirSync(join(root, path), { recursive: true });
      continue;
    }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

const OLD = { "index.js": "old index\n", "types/index.d.ts": "old types\n" };
const NEW = { "index.js": "new index\n", "types/index.d.ts": "new types\n" };
const prefixed = (prefix: string, files: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(files).map(([path, text]) => [`${prefix}/${path}`, text]),
  );

/**
 * A package with a dead run in `state`. `disk` is what is on disk besides
 * the run: the output, the stage, the retired tree. The run's compiler
 * snapshot holds the build info as it was before tsc.
 */
function deadRun(
  state: JournalState,
  disk: Readonly<Record<string, string>>,
  undo: UndoStep | null = null,
  recorded: Partial<RunJournal> = {},
): { root: string; runDir: string } {
  const root = join(
    realpathSync.native(mkdtempSync(join(tmpdir(), "ph recovery "))),
    "pkg",
  );
  roots.push(dirname(root));
  const runDir = join(root, ".ph", "build", "runs", "dead");
  write(root, {
    ...disk,
    "tsconfig.tsbuildinfo": "build info tsc wrote\n",
    ".ph/build/runs/dead/compiler/0": "build info before tsc\n",
  });
  writeJournal(runDir, {
    format: 1,
    runId: "dead",
    pid: 0,
    state,
    undo,
    output: "dist",
    stage: ".dist.ph-stage-dead",
    retired: ".dist.ph-old-dead",
    compiler: [
      {
        path: "tsconfig.tsbuildinfo",
        kind: "build-info",
        copy: "compiler/0",
        created: null,
      },
      { path: "dist/new-dir", kind: "directory", copy: null, created: null },
    ],
    ...recorded,
  });
  return { root, runDir };
}

const tree = (root: string) => treeDigest(root, readdirSync(root).sort());
const expected = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), "ph recovery expected "));
  roots.push(root);
  write(root, files);
  return tree(root);
};

describe("replayRun", () => {
  it("undoes a building run: the stage goes, compiler outputs come back", () => {
    const { root } = deadRun("building", {
      ...prefixed("dist", OLD),
      "dist/new-dir/emitted.d.ts": "tsc wrote this\n",
      ...prefixed(".dist.ph-stage-dead", NEW),
    });

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "rolled-back",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info before tsc\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("undoes a retiring run that had moved the output aside", () => {
    const { root } = deadRun("retiring", {
      ...prefixed(".dist.ph-old-dead", OLD),
      ...prefixed(".dist.ph-stage-dead", NEW),
    });

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "rolled-back",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info before tsc\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("undoes a retiring run that was moving the output entry by entry", () => {
    const { root } = deadRun("retiring", {
      "dist/index.js": OLD["index.js"],
      ".dist.ph-old-dead/types/index.d.ts": OLD["types/index.d.ts"],
      ...prefixed(".dist.ph-stage-dead", NEW),
    });

    replayRun(root, join(root, ".ph/build/runs/dead"));

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info before tsc\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("finishes an installing run whose output was aside", () => {
    const { root } = deadRun("installing", {
      ...prefixed(".dist.ph-old-dead", OLD),
      ...prefixed(".dist.ph-stage-dead", NEW),
    });

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "completed",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", NEW),
        "tsconfig.tsbuildinfo": "build info tsc wrote\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("finishes an installing run that was moving the stage entry by entry", () => {
    const { root } = deadRun("installing", {
      "dist/index.js": NEW["index.js"],
      ".dist.ph-stage-dead/types/index.d.ts": NEW["types/index.d.ts"],
      ...prefixed(".dist.ph-old-dead", OLD),
    });

    replayRun(root, join(root, ".ph/build/runs/dead"));

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", NEW),
        "tsconfig.tsbuildinfo": "build info tsc wrote\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("removes what a committed run left", () => {
    const { root } = deadRun("committed", {
      ...prefixed("dist", NEW),
      ...prefixed(".dist.ph-old-dead", OLD),
    });

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "completed",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", NEW),
        "tsconfig.tsbuildinfo": "build info tsc wrote\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("finishes a rollback that was cut short instead of the replacement", () => {
    // Installing went entry by entry; its rollback emptied the output and
    // had put back index.js when it stopped.
    const { root } = deadRun(
      "rolling-back",
      {
        "dist/index.js": OLD["index.js"],
        ".dist.ph-old-dead/types/index.d.ts": OLD["types/index.d.ts"],
        ".dist.ph-stage-dead/types/index.d.ts": NEW["types/index.d.ts"],
      },
      "retire",
    );

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "rolled-back",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info before tsc\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("repeats an undo step that may have run before", () => {
    // Stopped after the output was emptied, before the journal said so.
    const { root } = deadRun(
      "rolling-back",
      {
        "dist/": "",
        ...prefixed(".dist.ph-old-dead", OLD),
        ...prefixed(".dist.ph-stage-dead", NEW),
      },
      "install",
    );

    replayRun(root, join(root, ".ph/build/runs/dead"));

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info before tsc\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("finishes an installing run, then puts the build info tsc wrote for its stage in place", () => {
    const { root } = deadRun(
      "installing",
      {
        ...prefixed(".dist.ph-old-dead", OLD),
        ...prefixed(".dist.ph-stage-dead", NEW),
        ".tsconfig.tsbuildinfo.ph-stage-dead": "build info for the stage\n",
      },
      null,
      {
        compiler: [],
        pendingBuildInfo: {
          path: ".tsconfig.tsbuildinfo.ph-stage-dead",
          target: "tsconfig.tsbuildinfo",
        },
      },
    );

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "completed",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", NEW),
        "tsconfig.tsbuildinfo": "build info for the stage\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("undoes a building run that sent tsc to its stage: what it wrote for tsc goes, the build info stays", () => {
    const { root } = deadRun(
      "building",
      {
        ...prefixed("dist", OLD),
        ...prefixed(".dist.ph-stage-dead", NEW),
        ".tsconfig.ph-stage-dead.json": "{}\n",
        ".tsconfig.tsbuildinfo.ph-stage-dead": "build info for the stage\n",
      },
      null,
      {
        compiler: [],
        generatedConfig: ".tsconfig.ph-stage-dead.json",
        pendingBuildInfo: {
          path: ".tsconfig.tsbuildinfo.ph-stage-dead",
          target: "tsconfig.tsbuildinfo",
        },
      },
    );

    expect(replayRun(root, join(root, ".ph/build/runs/dead"))).toBe(
      "rolled-back",
    );

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", OLD),
        "tsconfig.tsbuildinfo": "build info tsc wrote\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it("sees a bundle another build adds beside declarations tsc wrote into a directory it created", () => {
    const root = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-recovery-sibling-")),
    );
    roots.push(root);
    const output = join(root, "dist");
    const compiler = [
      {
        path: "dist/node/types",
        kind: "directory",
        copy: null,
        created: "dist",
      },
    ] as const;
    const before = outputDigest(root, output, compiler);

    write(root, { "dist/node/types/index.d.ts": "new types\n" });
    expect(outputDigest(root, output, compiler)).toBe(before);

    write(root, { "dist/node/index.mjs": "later bundle\n" });
    expect(outputDigest(root, output, compiler)).not.toBe(before);
  });

  it("keeps the compiler outputs of a build that rewrote the output after the run saved them", () => {
    const { root, runDir } = deadRun("building", {
      ...prefixed("dist", OLD),
      ...prefixed(".dist.ph-stage-dead", NEW),
    });
    const journal = readJournal(runDir)!;
    writeJournal(runDir, {
      ...journal,
      outputDigest: outputDigest(root, join(root, "dist"), journal.compiler!),
    });
    rmSync(join(root, "dist"), { recursive: true });
    write(root, {
      ...prefixed("dist", NEW),
      "tsconfig.tsbuildinfo": "build info of the later build\n",
    });

    expect(replayRun(root, runDir)).toBe("superseded");

    expect(tree(root)).toEqual(
      expected({
        ...prefixed("dist", NEW),
        "tsconfig.tsbuildinfo": "build info of the later build\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it.each([
    [
      "keeps the compiler snapshot of an output only touched since",
      "rolled-back",
      {
        "dist/index.js": "old index\n",
        "dist/types/index.d.ts": "old types\n",
      },
    ],
    [
      "drops it for an output rewritten since with the same size and times",
      "superseded",
      {
        "dist/index.js": "new index\n",
        "dist/types/index.d.ts": "new types\n",
      },
    ],
  ] as const)("%s", (_, replayed, files) => {
    const { root, runDir } = deadRun(
      "building",
      {
        "dist/index.js": "old index\n",
        "dist/notes.txt": "notes\n",
        "dist/types/index.d.ts": "new types\n",
        ".ph/build/runs/dead/compiler/1/index.d.ts": "old types\n",
      },
      null,
      {
        compiler: [
          {
            path: "tsconfig.tsbuildinfo",
            kind: "build-info",
            copy: "compiler/0",
            created: null,
          },
          {
            path: "dist/types",
            kind: "directory",
            copy: "compiler/1",
            created: null,
          },
        ],
      },
    );
    const bundle = join(root, "dist", "index.js");
    utimesSync(bundle, 1_700_000_000, 1_700_000_000);
    const journal = readJournal(runDir)!;
    writeJournal(runDir, {
      ...journal,
      outputDigest: outputDigest(root, join(root, "dist"), journal.compiler!),
    });
    if (replayed === "rolled-back") {
      utimesSync(join(root, "dist", "notes.txt"), 1_800_000_000, 1_800_000_000);
    } else {
      writeFileSync(bundle, "new index\n");
      utimesSync(bundle, 1_700_000_000, 1_700_000_000);
    }

    expect(replayRun(root, runDir)).toBe(replayed);

    expect(tree(root)).toEqual(
      expected({
        ...files,
        "dist/notes.txt": "notes\n",
        "tsconfig.tsbuildinfo":
          replayed === "rolled-back"
            ? "build info before tsc\n"
            : "build info tsc wrote\n",
        ".ph/build/runs/": "",
      }),
    );
  });

  it.each([
    ["building", null, []],
    ["rolling-back", "stage", ["dist/index.d.ts"]],
  ] as const)(
    "undoes a %s run whose tsc created the output, also when it is repeated after a cut",
    (state, undo, alreadyUndone) => {
      const compiler = [
        {
          path: "tsconfig.tsbuildinfo",
          kind: "build-info" as const,
          copy: "compiler/0",
          created: null,
        },
        ...["dist/index.d.ts", "dist/models/thing.d.ts"].map((path) => ({
          path,
          kind: "file" as const,
          copy: null,
          created: "dist",
        })),
      ];
      const { root, runDir } = deadRun(
        state,
        prefixed(".dist.ph-stage-dead", NEW),
        undo,
        { compiler },
      );
      const journal = readJournal(runDir)!;
      writeJournal(runDir, {
        ...journal,
        outputDigest: outputDigest(root, join(root, "dist"), compiler),
      });
      write(root, {
        "dist/index.d.ts": "new types\n",
        "dist/models/thing.d.ts": "new types\n",
      });
      for (const path of alreadyUndone) rmSync(join(root, path));

      expect(replayRun(root, runDir)).toBe("rolled-back");

      expect(tree(root)).toEqual(
        expected({
          "tsconfig.tsbuildinfo": "build info before tsc\n",
          ".ph/build/runs/": "",
        }),
      );
    },
  );

  it("only removes a run directory whose journal cannot be read", () => {
    const { root, runDir } = deadRun("building", {
      ...prefixed("dist", OLD),
      ...prefixed(".dist.ph-stage-dead", NEW),
    });
    writeFileSync(join(runDir, "journal.json"), "{ not json");

    expect(replayRun(root, runDir)).toBe("discarded");

    expect(existsSync(runDir)).toBe(false);
    expect(existsSync(join(root, ".dist.ph-stage-dead"))).toBe(true);
  });
});

describe("journal paths on Windows", () => {
  const packageRoot = "C:\\work\\my package";
  const recorded = (path: string) => {
    const journal = toJournalPath(packageRoot, path, win32);
    return { journal, decoded: fromJournalPath(packageRoot, journal, win32) };
  };

  it("records a path inside the package relative, in POSIX form", () => {
    expect(recorded("C:\\work\\my package\\.dist.ph-stage-1 2")).toEqual({
      journal: ".dist.ph-stage-1 2",
      decoded: "C:\\work\\my package\\.dist.ph-stage-1 2",
    });
    expect(recorded("C:\\work\\my package\\build out\\dist")).toEqual({
      journal: "build out/dist",
      decoded: "C:\\work\\my package\\build out\\dist",
    });
  });

  it("records a path outside the package absolute and gives it back unchanged", () => {
    expect(recorded("C:\\work\\other out\\dist")).toEqual({
      journal: "C:\\work\\other out\\dist",
      decoded: "C:\\work\\other out\\dist",
    });
    expect(recorded("D:\\build out\\dist")).toEqual({
      journal: "D:\\build out\\dist",
      decoded: "D:\\build out\\dist",
    });
    expect(recorded("\\\\server\\share\\build out")).toEqual({
      journal: "\\\\server\\share\\build out",
      decoded: "\\\\server\\share\\build out",
    });
  });
});
