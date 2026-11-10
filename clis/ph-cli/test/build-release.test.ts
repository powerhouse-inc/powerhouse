// `ph build --release` writes a release approval once the new output is in
// place; `ph model check --prepack` and `ph publish` read it back. These
// builds run in this process on copies of the fixtures.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVersion } from "../src/get-version.js";
import { BuildRefusal } from "../src/services/package-build/pipeline/steps.js";
import { buildPackage } from "../src/services/package-build/run-build.js";
import type { StandardBuildStep } from "../src/services/package-build/steps/context.js";
import { standardBuildSteps } from "../src/services/package-build/steps/standard.js";
import { runModelCheck } from "../src/services/model/check.js";
import {
  parseReleaseApproval,
  type ReleaseApproval,
} from "../src/services/release/approval.js";
import type { BuildArgs } from "../src/types.js";
import { LEDGER_SOURCE } from "./model-project.js";
import {
  addCodeFirstLedger,
  createStagedProject,
  type StagedProject,
  treeDigest,
} from "./staged-build-project.js";

const args = {
  outDir: "dist",
  noSharedDeps: false,
  ignoreTypeErrors: false,
  release: true,
  debug: undefined,
} as BuildArgs;

const APPROVAL = ".ph/build/release-approval.json";

const DOCUMENT_MODEL_VERSION = (
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "packages",
        "document-model",
        "package.json",
      ),
      "utf8",
    ),
  ) as { version: string }
).version;

const originalCwd = process.cwd();
const projects: StagedProject[] = [];
let logs: string[];
let warnings: string[];

// The generated file the ledger imports is git-ignored, as codegen output often is.
const GENERATED = "document-models/ledger/generated.ts";
const LEDGER_WITH_GENERATED = `import { LEDGER_DESCRIPTION } from "./generated.js";\n${LEDGER_SOURCE.replace(
  'description: "A ledger."',
  "description: LEDGER_DESCRIPTION",
)}`;

const entry = (path: string, types = true) => ({
  ...(types && { types: `./dist/types/${path}.d.ts` }),
  browser: `./dist/browser/${path}.js`,
  node: `./dist/node/${path}.mjs`,
});

const EXPORTS = {
  ".": entry("index"),
  "./document-models": entry("document-models/index"),
  "./document-models/*": entry("document-models/*/index", false),
  "./editors": entry("editors/index"),
};

/**
 * The classic fixture, with the code-first ledger unless `codeFirst` is
 * false, published as `ph init` publishes (`files: ["/dist"]`, with the
 * generated exports), in a git work tree that ignores what a generated
 * project ignores and what the test stubs write.
 */
function releaseProject(codeFirst = true): StagedProject {
  const made = createStagedProject();
  projects.push(made);
  if (codeFirst) {
    addCodeFirstLedger(made, LEDGER_WITH_GENERATED);
    made.write(GENERATED, 'export const LEDGER_DESCRIPTION = "A ledger.";\n');
  } else {
    made.write("powerhouse.config.json", "{}\n");
  }
  const pkg = JSON.parse(made.read("package.json")) as Record<string, unknown>;
  made.write(
    "package.json",
    `${JSON.stringify(
      {
        ...pkg,
        files: ["/dist"],
        exports: codeFirst
          ? { ...EXPORTS, "./scalars": entry("scalars/index", false) }
          : EXPORTS,
        ...(codeFirst && {
          peerDependencies: { "document-model": "*", zod: "*" },
        }),
      },
      null,
      2,
    )}\n`,
  );
  made.write(
    ".gitignore",
    [
      "dist",
      "node_modules",
      "*.tsbuildinfo",
      ".ph",
      "tsc-calls.jsonl",
      "tailwind-input.css",
      GENERATED,
      "",
    ].join("\n"),
  );
  expect(spawnSync("git", ["init", "--quiet"], { cwd: made.root }).status).toBe(
    0,
  );
  process.chdir(made.root);
  return made;
}

async function prepack(root: string) {
  let stdout = "";
  let stderr = "";
  const code = await runModelCheck(
    { json: true, prepack: true },
    {
      projectRoot: root,
      streams: {
        out: (text) => void (stdout += text),
        err: (text) => void (stderr += text),
      },
    },
  );
  expect(stderr).toBe("");
  return {
    code,
    ...(JSON.parse(stdout) as { decision: string; reasons: string[] }),
  };
}

const APPROVED = { code: 0, decision: "approved", reasons: [] };

const stale = (...reasons: string[]) => ({
  code: 1,
  decision: "stale",
  reasons,
});

const FILES_CHANGED = "the package's files changed since the approval was made";

function readApproval(made: StagedProject): ReleaseApproval {
  const read = parseReleaseApproval(made.read(APPROVAL));
  if (read.kind !== "found") throw new Error(`unreadable: ${read.reason}`);
  return read.approval;
}

beforeEach(() => {
  logs = [];
  warnings = [];
  vi.stubEnv("CI", "1");
  const capture =
    (into: string[]) =>
    (...parts: unknown[]) => {
      const message = parts.map(String).join(" ");
      if (!message.includes("[PLUGIN_TIMINGS]")) into.push(message);
    };
  vi.spyOn(console, "log").mockImplementation(capture(logs));
  vi.spyOn(console, "warn").mockImplementation(capture(warnings));
  vi.spyOn(console, "error").mockImplementation(capture([]));
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const made of projects.splice(0)) made.dispose();
});

describe("ph build --release", () => {
  it("writes an approval that ph model check --prepack accepts, and a default build adds nothing", async () => {
    const made = releaseProject();

    await buildPackage({ ...args, release: false });
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
    expect(logs.filter((line) => /approval/i.test(line))).toEqual([]);
    expect((await prepack(made.root)).decision).toBe("missing");

    await buildPackage(args);
    expect(logs).toContain(`✔ Release approval written to ${APPROVAL}`);
    const approval = readApproval(made);
    const published = Object.keys(treeDigest(made.root, ["dist"]))
      .concat("package.json")
      .sort();
    expect({
      ...approval,
      packageRevision: { ...approval.packageRevision, digest: "<digest>" },
      publishedFiles: approval.publishedFiles.map(({ path }) => path),
      report: {
        ...approval.report,
        definitions: approval.report.definitions.map((definition) => ({
          ...definition,
          digest: "<definition digest>",
        })),
      },
    }).toEqual({
      kind: "powerhouse.release-approval",
      formatVersion: 1,
      phCliVersion: getVersion(),
      outDir: "dist",
      packageRevision: {
        digest: "<digest>",
        excluded: ["tsconfig.tsbuildinfo"],
      },
      publishedFiles: published,
      report: {
        profile: "release",
        status: "ok",
        definitions: [
          {
            kind: "document-model",
            key: "example/ledger",
            version: 1,
            digest: "<definition digest>",
            source: {
              specifier: "./document-models/ledger/index.ts",
              exportPath: ["Ledger"],
            },
          },
        ],
      },
      scalars: [
        {
          scalar: "Currency",
          packageName: "document-model",
          version: DOCUMENT_MODEL_VERSION,
        },
        {
          scalar: "Iban",
          packageName: "@fixture/classic-package",
          version: "4.1.0",
        },
      ],
      hostValidation: { completed: true, findings: [] },
    });
    expect(await prepack(made.root)).toEqual(APPROVED);

    // A default rebuild of the same package keeps the approval and prints nothing about it.
    const text = made.read(APPROVAL);
    logs.length = 0;
    await buildPackage({ ...args, release: false });
    expect(made.read(APPROVAL)).toBe(text);
    expect(logs.filter((line) => /approval/i.test(line))).toEqual([]);
    expect(await prepack(made.root)).toEqual(APPROVED);
  }, 240_000);

  it("is stale after each change publishing would not match, and not after an ignored file changes", async () => {
    const made = releaseProject();
    await buildPackage(args);
    expect(await prepack(made.root)).toEqual(APPROVED);

    const editAndCheck = async (
      path: string,
      from: string,
      to: string,
      expected: unknown,
    ) => {
      const before = made.read(path);
      expect(before).toContain(from);
      made.write(path, before.replace(from, to));
      expect(await prepack(made.root)).toEqual(expected);
      made.write(path, before);
    };

    await editAndCheck(
      "document-models/ledger/index.ts",
      "state.total += input.amount;",
      "state.total -= input.amount;",
      stale(FILES_CHANGED),
    );
    // Git ignores it, so the revision does not read it; what was published from it has not changed.
    await editAndCheck(GENERATED, "A ledger.", "Another ledger.", APPROVED);
    await editAndCheck(
      "dist/node/index.mjs",
      "export",
      "export /* edited */",
      stale(
        "1 published file changed since the approval was made: dist/node/index.mjs",
      ),
    );
    expect(await prepack(made.root)).toEqual(APPROVED);
  }, 240_000);

  it("approves a package whose model directories export no model", async () => {
    const made = releaseProject(false);

    await buildPackage(args);

    expect(logs).toContain(`✔ Release approval written to ${APPROVAL}`);
    expect(readApproval(made).report).toEqual({
      profile: "release",
      status: "skipped",
      definitions: [],
    });
    expect(await prepack(made.root)).toEqual(APPROVED);
  }, 240_000);

  it("writes no approval for a package whose output directory is a link, which npm does not pack through", async () => {
    const made = releaseProject();
    mkdirSync(join(made.root, "artifacts"));
    symlinkSync("artifacts", made.dist);

    const failure = await buildPackage(args).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        '✘ No release approval was written: the packed package does not install and import in a scratch consumer: exports["."] names ./dist/types/index.d.ts, which the package does not contain, exports["."] names ./dist/browser/index.js, which the package does not contain, exports["."] names ./dist/node/index.mjs, which the package does not contain, exports["./document-models"] names ./dist/types/document-models/index.d.ts, which the package does not contain, exports["./document-models"] names ./dist/browser/document-models/index.js, which the package does not contain and 14 more. The new output is in place; build again with --release to approve it.',
      ),
    );
    expect(existsSync(join(made.root, "artifacts", "node", "index.mjs"))).toBe(
      true,
    );
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
  }, 240_000);

  it("writes no approval when a bundle imports a package the package declares only as a devDependency", async () => {
    const made = releaseProject();
    const pkg = JSON.parse(made.read("package.json")) as Record<
      string,
      unknown
    >;
    made.write(
      "package.json",
      JSON.stringify({
        ...pkg,
        peerDependencies: { "document-model": "*" },
        devDependencies: { zod: "*" },
      }),
    );

    const failure = await buildPackage(args).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        "✘ No release approval was written: the packed package does not install and import in a scratch consumer: node consumer cannot import @fixture/classic-package/document-models/ledger: Cannot find package 'zod' imported from node_modules/@fixture/classic-package/dist/node/scalars/index.mjs, node consumer cannot import @fixture/classic-package/scalars: Cannot find package 'zod' imported from node_modules/@fixture/classic-package/dist/node/scalars/index.mjs, browser consumer cannot import @fixture/classic-package/document-models/ledger: Cannot find package 'zod' imported from node_modules/@fixture/classic-package/dist/browser/scalars/index.js, browser consumer cannot import @fixture/classic-package/scalars: Cannot find package 'zod' imported from node_modules/@fixture/classic-package/dist/browser/scalars/index.js. The new output is in place; build again with --release to approve it.",
      ),
    );
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
  }, 240_000);

  it("keeps the build's lock out of an approval that covers the packed .ph, so it holds once the build ends", async () => {
    const made = releaseProject(false);
    const pkg = JSON.parse(made.read("package.json")) as Record<
      string,
      unknown
    >;
    made.write(
      "package.json",
      JSON.stringify({ ...pkg, files: ["/dist", ".ph"] }),
    );
    made.write(".ph/payload.js", "export const payload = 1;\n");

    await buildPackage(args);

    expect(existsSync(join(made.root, ".ph", "build", "lock"))).toBe(false);
    expect(
      readApproval(made)
        .publishedFiles.map(({ path }) => path)
        .filter((path) => path.startsWith(".ph/")),
    ).toEqual([".ph/payload.js"]);
    expect(await prepack(made.root)).toEqual(APPROVED);
    made.write(".ph/payload.js", "export const payload = 2;\n");
    expect(await prepack(made.root)).toEqual(
      stale(
        "1 published file changed since the approval was made: .ph/payload.js",
      ),
    );
  }, 240_000);

  it("approves the generated optional exports the build did not write, and refuses one it did write under another path", async () => {
    const made = releaseProject(false);
    const pkg = JSON.parse(made.read("package.json")) as {
      exports: Record<string, unknown>;
    };
    const generated = {
      ...pkg.exports,
      "./scalars": entry("scalars/index", false),
      "./connect-routes": { browser: "./dist/browser/connect-routes.js" },
      "./pieces": { node: "./dist/node/pieces/index.mjs" },
    };
    made.write("package.json", JSON.stringify({ ...pkg, exports: generated }));

    await buildPackage(args);
    expect(await prepack(made.root)).toEqual(APPROVED);

    made.write("scalars/index.ts", "export const scalars = [];\n");
    made.write(
      "package.json",
      JSON.stringify({
        ...pkg,
        exports: { ...generated, "./scalars": entry("scalar/index", false) },
      }),
    );
    const failure = await buildPackage(args).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        "✘ No release approval was written: the packed package does not install and import in a scratch consumer: exports[\"./scalars\"] names ./dist/browser/scalar/index.js, which the package does not contain, exports[\"./scalars\"] names ./dist/node/scalar/index.mjs, which the package does not contain, node consumer cannot import @fixture/classic-package/scalars: Cannot find module 'node_modules/@fixture/classic-package/dist/node/scalar/index.mjs', browser consumer cannot import @fixture/classic-package/scalars: Cannot find module 'node_modules/@fixture/classic-package/dist/browser/scalar/index.js'. The new output is in place; build again with --release to approve it.",
      ),
    );
    expect(existsSync(join(made.dist, "node", "scalars", "index.mjs"))).toBe(
      true,
    );
  }, 240_000);

  it("writes no approval when an export names a file the package does not contain, and skips an entry the package does not ship", async () => {
    const made = releaseProject(false);
    const pkg = JSON.parse(made.read("package.json")) as Record<
      string,
      unknown
    >;
    made.write(
      "package.json",
      JSON.stringify({
        ...pkg,
        exports: {
          ...EXPORTS,
          "./editors": {
            ...entry("editors/index"),
            node: "./dist/node/editor/index.mjs",
          },
          "./pieces": entry("pieces/index"),
        },
      }),
    );

    const failure = await buildPackage(args).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        "✘ No release approval was written: the packed package does not install and import in a scratch consumer: exports[\"./editors\"] names ./dist/node/editor/index.mjs, which the package does not contain, node consumer cannot import @fixture/classic-package/editors: Cannot find module 'node_modules/@fixture/classic-package/dist/node/editor/index.mjs'. The new output is in place; build again with --release to approve it.",
      ),
    );
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
  }, 240_000);

  it("writes no approval when tsc's type errors were accepted", async () => {
    const made = releaseProject();
    made.write(
      "index.ts",
      `${made.read("index.ts")}\nexport const x: number = "x";\n`,
    );

    const failure = await buildPackage({
      ...args,
      ignoreTypeErrors: true,
    }).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        "✘ No release approval was written: the build went on despite tsc's type errors. The new output is in place; build again with --release to approve it.",
      ),
    );
    expect(existsSync(join(made.dist, "node", "index.mjs"))).toBe(true);
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
  }, 240_000);

  it("writes no approval when the package changes while it builds", async () => {
    const made = releaseProject();
    const editDuringBuild: StandardBuildStep = {
      id: "edit-during-build",
      after: ["browser-bundle"],
      run: () => {
        made.write("index.ts", `${made.read("index.ts")}\n// edited\n`);
        return Promise.resolve();
      },
    };

    const failure = await buildPackage(args, {
      steps: [...standardBuildSteps, editDuringBuild],
    }).catch((error: unknown) => error);

    expect(failure).toEqual(
      new BuildRefusal(
        "✘ No release approval was written: the package's files changed while it was built (index.ts). The new output is in place; build again with --release to approve it.",
      ),
    );
    expect(existsSync(join(made.root, APPROVAL))).toBe(false);
  }, 240_000);

  // The ledger takes Iban from scalars/iban.ts, so the scalars entry can differ from it.
  it.each([
    {
      problem: "a scalar the scalars entry no longer exports",
      entry: "export {};\n",
      report: [
        "invalid: 1 definition (./document-models: 2 code-first entries, 0 stored models)",
        "  document-model example/ledger v1 ./document-models/ledger/index.ts#/Ledger",
        "PH-REL-HOST-SCALAR-UNBOUND [error/package] ./document-models/ledger/index.ts#/Ledger scalar Iban /specifications/0/scalars/1: example/ledger declares package scalar Iban, but the package registers no binding for it, so a host serves Iban values without validating them. Expected: an export named Iban in the package's scalars entry Received: no binding Repair: Export the defineScalar binding the model uses from scalars/index.ts under the name Iban.",
        "1 error, 0 warnings",
      ],
    },
    {
      problem: "a scalars entry that throws",
      entry: 'throw new Error("scalars exploded");\n',
      report: [
        "failed: 1 definition (./document-models: 2 code-first entries, 0 stored models)",
        "  document-model example/ledger v1 ./document-models/ledger/index.ts#/Ledger",
        "PH-REL-HOST-VALIDATION-INCOMPLETE [error/import] (no source) (root): Host validation did not run, so this check cannot tell whether a host serves the package's models as declared. Received: ./scalars/index.ts could not be loaded: scalars exploded Repair: Fix what stopped host validation, then run the release check again.",
        "1 error, 0 warnings",
      ],
    },
  ])(
    "stops before the output on $problem, and keeps the old approval",
    async ({ entry, report }) => {
      const made = releaseProject();
      await buildPackage(args);
      const approval = made.read(APPROVAL);
      const output = treeDigest(made.root, ["dist"]);
      made.write("scalars/iban.ts", made.read("scalars/index.ts"));
      made.write("scalars/index.ts", entry);
      made.write(
        "document-models/ledger/index.ts",
        made
          .read("document-models/ledger/index.ts")
          .replace("../../scalars/index.js", "../../scalars/iban.js"),
      );

      const failure = await buildPackage(args).catch((error: unknown) => error);

      expect(failure).toEqual(
        new BuildRefusal(
          ["✘ The release definition check stopped the build:", ...report].join(
            "\n",
          ),
        ),
      );
      expect(treeDigest(made.root, ["dist"])).toEqual(output);
      expect(made.read(APPROVAL)).toBe(approval);
      expect(await prepack(made.root)).toEqual(stale(FILES_CHANGED));
    },
    240_000,
  );
});
