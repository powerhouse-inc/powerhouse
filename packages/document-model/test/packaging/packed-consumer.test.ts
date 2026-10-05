import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adaptCodeFirstDocumentModelSource,
  type NormalizedDocumentModelArtifact,
} from "../../src/definition/index.js";
import * as versionedTodo from "../parity/corpus/versioned-todo.code-first.js";
import { goldenContents, readGolden } from "../parity/goldens.js";
import {
  PACKED_CORPUS_ROOT,
  type PackedInstall,
  declarationFiles,
  packAndInstall,
  runConsumer,
  treeDigest,
  typecheckConsumer,
  writeConsumerFile,
} from "./harness.js";

/**
 * What a consumer sees after a real install.
 *
 * Every assertion here is one a workspace link would have hidden: a `files`
 * list that forgot a declaration, an `exports` map that points at a path the
 * tarball does not carry, a `.d.ts` with a machine-local path baked into it, a
 * runtime dependency that was only ever a devDependency, a `source` condition
 * no installed package has. They all pass in the repository and fail on the
 * first install, so they are checked where an installer would meet them.
 */

let install: PackedInstall;
// A setup failure should report itself, not a second error from a teardown
// that assumed it succeeded.
let installed = false;

/** The Node consumer's own source, typechecked at two strictness settings. */
const NODE_CONSUMER_SOURCE = `import { modules, SOURCE_REVISION } from "@ph-fixture/packed-model";
import { handshake } from "@ph-fixture/packed-model/worker";

const latest = modules[modules.length - 1];
const document = latest.utils.createDocument();
export const report = {
  revision: SOURCE_REVISION,
  documentType: document.header.documentType,
  handshake: handshake({ nonce: "typecheck" }),
};
`;

beforeAll(() => {
  install = packAndInstall();
  installed = true;
}, 600_000);

afterAll(() => {
  if (installed) install.dispose();
});

/**
 * A consumer script that reports what it resolved as well as what it read.
 *
 * The hook sees the ESM graph. A CommonJS entry's own `require()` calls do not
 * pass through it, so a dependency that reached for one would leave a subtree
 * unrecorded. Nothing in this closure is CommonJS today, and the manifest
 * assertions below say what they say about the graph the hook can see.
 */
function recordingConsumer(name: string, body: string): string {
  writeConsumerFile(
    install,
    "record-loader.mjs",
    `import { appendFileSync } from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  appendFileSync(process.env.PH_RESOLVE_LOG, \`\${result.url}\\n\`);
  return result;
}
`,
  );
  writeConsumerFile(
    install,
    "register.mjs",
    `import { register } from "node:module";
register("./record-loader.mjs", import.meta.url);
`,
  );
  return writeConsumerFile(install, name, body);
}

/** The installed package a resolved URL belongs to, or null for a built-in. */
function resolvedPackage(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const inside = relative(install.installRoot, fileURLToPath(url));
  if (inside.startsWith("..")) return null;
  const parts = inside.split("/");
  return parts[0].startsWith("@")
    ? `${parts[0]}/${parts[1]}`
    : (parts[0] ?? null);
}

function resolvedUrls(log: string): readonly string[] {
  return [
    ...new Set(
      readFileSync(join(install.consumerRoot, log), "utf8")
        .split("\n")
        .filter((line) => line !== ""),
    ),
  ].sort();
}

const NODE_MAIN_SOURCE = `import * as packed from "@ph-fixture/packed-model";
import { handshake } from "@ph-fixture/packed-model/worker";
import { adaptCodeFirstDocumentModelSource } from "document-model";

const { modules, compatibility, SOURCE_REVISION } = packed;
const latest = modules[modules.length - 1];
const document = latest.utils.createDocument();
const artifacts = modules.map(
  (module) => adaptCodeFirstDocumentModelSource(module, { specifier: "./packed.js" }).artifacts[0],
);
console.log(
  JSON.stringify({
    entry: packed.ENTRY ?? "node",
    revision: SOURCE_REVISION,
    documentType: document.header.documentType,
    revisionNumbers: document.header.revision,
    versions: modules.map((module) => module.version),
    actionTypes: modules.map((module) => Object.keys(module.actions).sort()),
    compatibility:
      compatibility.definition.specifications[0].graphQLCompatibility !== null,
    handshake: handshake({ nonce: "node-entry" }),
    artifacts,
  }),
);
`;

const WORKER_ENTRY_SOURCE = `import { parentPort } from "node:worker_threads";
import { handshake } from "@ph-fixture/packed-model/worker";
import * as packed from "@ph-fixture/packed-model";

parentPort.on("message", (message) => {
  parentPort.postMessage({ ...handshake(message), entry: packed.ENTRY ?? "node" });
});
`;

const WORKER_HOST_SOURCE = `import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("./worker-entry.mjs", import.meta.url));
const reply = await new Promise((resolve, reject) => {
  worker.once("message", resolve);
  worker.once("error", reject);
  worker.postMessage({ nonce: "handshake-1" });
});
await worker.terminate();
console.log(JSON.stringify(reply));
`;

type RecordedRun = {
  readonly stdout: string;
  readonly resolved: readonly string[];
};

/**
 * Each recorded consumer runs once and is remembered.
 *
 * Remembered rather than re-derived, so a test that reads a manifest does not
 * depend on another test having run first: `vitest -t` selecting one of them
 * would otherwise find no log and fail for the wrong reason.
 */
const recorded = new Map<string, RecordedRun>();

function runRecorded(
  name: string,
  build: () => string,
  log: string,
  conditions: readonly string[] = [],
): RecordedRun {
  const existing = recorded.get(name);
  if (existing !== undefined) return existing;
  const stdout = runConsumer(install, build(), {
    conditions,
    // The loader writes here; `--import` registers it before the entry runs.
    env: { PH_RESOLVE_LOG: join(install.consumerRoot, log) },
    preload: "./register.mjs",
  });
  const run = { stdout, resolved: resolvedUrls(log) };
  recorded.set(name, run);
  return run;
}

/** The Node consumer, recorded. */
function nodeRun(): RecordedRun {
  return runRecorded(
    "node",
    () => recordingConsumer("node-main.mjs", NODE_MAIN_SOURCE),
    "node-resolve.log",
  );
}

/** The browser worker consumer, recorded. */
function workerRun(): RecordedRun {
  return runRecorded(
    "worker",
    () => {
      writeConsumerFile(install, "worker-entry.mjs", WORKER_ENTRY_SOURCE);
      return recordingConsumer("worker-host.mjs", WORKER_HOST_SOURCE);
    },
    "worker-resolve.log",
    ["browser"],
  );
}

describe("the Node consumer", () => {
  it("typechecks against the packed declarations", () => {
    writeConsumerFile(install, "node-consumer.ts", NODE_CONSUMER_SOURCE);
    writeConsumerFile(
      install,
      "tsconfig.node.json",
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            noEmit: true,
            // What a consumer actually sets, and the default `tsc --init`
            // writes. The stricter setting is measured separately below,
            // because a dependency's own declaration hygiene is a different
            // question from whether this consumer can read the packed types.
            skipLibCheck: true,
            types: ["node"],
          },
          include: ["node-consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    expect(() =>
      typecheckConsumer(install, "tsconfig.node.json"),
    ).not.toThrow();
  }, 300_000);

  it("imports the packed entry and creates a document", () => {
    const { stdout } = nodeRun();
    const report = JSON.parse(stdout) as {
      entry: string;
      revision: string;
      documentType: string;
      versions: number[];
      compatibility: boolean;
    };
    expect(report.entry).toBe("node");
    expect(report.revision).toBe(install.sourceRevision);
    expect(report.documentType).toBe("test/todo");
    expect(report.versions).toEqual([1, 2]);
    expect(report.compatibility).toBe(true);
  }, 300_000);

  it("matches the parity goldens, compiled by the packed compiler", () => {
    const file = writeConsumerFile(
      install,
      "node-artifacts.mjs",
      `import { modules } from "@ph-fixture/packed-model";
import { adaptCodeFirstDocumentModelSource } from "document-model";

console.log(
  JSON.stringify(
    modules.map(
      (module) =>
        adaptCodeFirstDocumentModelSource(module, { specifier: "./packed.js" })
          .artifacts[0],
    ),
  ),
);
`,
    );
    const artifacts = JSON.parse(
      runConsumer(install, file),
    ) as NormalizedDocumentModelArtifact[];
    expect(artifacts).toHaveLength(2);

    // The parity goldens in `test/parity/goldens`, produced here by a
    // compiler that was packed, published and installed rather than imported
    // from source.
    for (const [name, contents] of goldenContents(artifacts[0])) {
      expect(contents, name).toBe(readGolden(`${PACKED_CORPUS_ROOT}.${name}`));
    }
    // And the source compiler agrees with the packed one, artifact for
    // artifact, so "the goldens still match" cannot be a stale golden.
    const fromSource = adaptCodeFirstDocumentModelSource(
      versionedTodo.modules[0],
      { specifier: "./packed.js" },
    ).artifacts[0];
    expect(JSON.parse(JSON.stringify(fromSource))).toStrictEqual(artifacts[0]);
  }, 300_000);
});

describe("the browser-worker consumer", () => {
  it("typechecks against the packed declarations under browser conditions", () => {
    writeConsumerFile(
      install,
      "browser-consumer.ts",
      `import { handshake, type HandshakeRequest } from "@ph-fixture/packed-model/worker";

declare const self: {
  addEventListener: (
    type: "message",
    listener: (event: { data: HandshakeRequest }) => void,
  ) => void;
  postMessage: (message: unknown) => void;
};

self.addEventListener("message", (event) => {
  self.postMessage(handshake(event.data));
});
`,
    );
    writeConsumerFile(
      install,
      "tsconfig.browser.json",
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022"],
            module: "Preserve",
            moduleResolution: "bundler",
            customConditions: ["browser"],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
          },
          include: ["browser-consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    expect(() =>
      typecheckConsumer(install, "tsconfig.browser.json"),
    ).not.toThrow();
  }, 300_000);

  it("imports in a worker and completes a handshake", () => {
    // The worker inherits the parent's execArgv, so the browser condition is
    // what it resolves the packed entry under.
    const { stdout } = workerRun();
    const reply = JSON.parse(stdout) as {
      ok: boolean;
      nonce: string;
      documentType: string;
      versions: number[];
      revision: string;
      entry: string;
    };
    expect(reply.ok).toBe(true);
    expect(reply.nonce).toBe("handshake-1");
    expect(reply.documentType).toBe("test/todo");
    expect(reply.versions).toEqual([1, 2]);
    expect(reply.revision).toBe(install.sourceRevision);
    // The browser build is what the worker resolved, not the Node one.
    expect(reply.entry).toBe("browser");
  }, 300_000);
});

describe("what the consumers resolved", () => {
  it("reaches no file outside the install directory", () => {
    for (const [log, run] of [
      ["node", nodeRun()],
      ["worker", workerRun()],
    ] as const) {
      const urls = run.resolved;
      const outside = urls.filter((url) => {
        // A Node built-in has no filesystem path, so it is not a consumer
        // module input and has nothing to be outside of.
        if (!url.startsWith("file:")) return false;
        return relative(install.consumerRoot, fileURLToPath(url)).startsWith(
          "..",
        );
      });
      expect(outside, log).toEqual([]);

      // Anchored: the packed model and the packed compiler really are among
      // what was resolved, so "nothing outside" is not "nothing at all".
      const inside = urls.map((url) =>
        url.startsWith("file:")
          ? relative(install.consumerRoot, fileURLToPath(url))
          : url,
      );
      expect(inside, log).toContain(
        "node_modules/@ph-fixture/packed-model/dist/index.js",
      );
      expect(
        inside.some((path) => path.startsWith("node_modules/document-model/")),
        log,
      ).toBe(true);
      expect(
        inside.some((path) =>
          path.startsWith("node_modules/@powerhousedao/shared/"),
        ),
        log,
      ).toBe(true);
    }
  });

  it("loads no GraphQL implementation in the model runtime graph", () => {
    for (const [log, run] of [
      ["node", nodeRun()],
      ["worker", workerRun()],
    ] as const) {
      // By resolved package, not by substring of the path: a substring match
      // misses `@graphql-tools/…` and `@apollo/subgraph/dist/graphql.js`, and
      // fires on the compiler's own `graphql-ast.js`.
      const graphql = run.resolved.filter((url) =>
        /(^|\/)graphql($|\/)|(^|\/)@(graphql-tools|graphql-typed-document-node|apollo)\//.test(
          resolvedPackage(url) ?? "",
        ),
      );
      // The compatibility model carries a recorded AST and is imported by
      // both consumers, which is the case this is really about: an AST is
      // data, so carrying one must not drag a GraphQL implementation in.
      expect(graphql, log).toEqual([]);
    }
  });

  it("records what each consumer resolved, for a future budget", () => {
    const node = nodeRun().resolved;
    const worker = workerRun().resolved;
    // No budget is enforced yet; the numbers cost nothing to print and make
    // setting one later cheap.
    process.stdout.write(
      `packed consumer module counts: node=${String(node.length)} worker=${String(worker.length)}\n`,
    );
    expect(node.length).toBeGreaterThan(0);
    expect(worker.length).toBeGreaterThan(0);
  });
});

/**
 * Paths that must not survive publication: a machine-local root, a pnpm store
 * layout, or a path into a workspace package's source tree.
 */
function forbiddenInDeclarations(): readonly RegExp[] {
  return [
    /\/Users\//,
    /\/home\/[a-z]/,
    /node_modules\/\.pnpm/,
    /packages\/document-model\/src\//,
    /packages\/shared\/[a-z]/,
    // The directory this fixture was built and installed in. Without it the
    // check is inert for the packed model itself, whose build root is a temp
    // directory that none of the patterns above can match.
    new RegExp(escapeForRegExp(install.consumerRoot)),
    new RegExp(escapeForRegExp(install.buildRoot)),
  ];
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function declarationOffenders(
  predicate: (file: string) => boolean,
): readonly string[] {
  const offenders: string[] = [];
  for (const file of declarationFiles(install)) {
    if (!predicate(file)) continue;
    const contents = readFileSync(file, "utf8");
    for (const pattern of forbiddenInDeclarations()) {
      if (pattern.test(contents)) {
        offenders.push(
          `${relative(install.installRoot, file)}: ${pattern.source}`,
        );
      }
    }
  }
  return offenders.sort();
}

describe("the published declarations", () => {
  it("carry no absolute path, store path, or source path for the packed model", () => {
    expect(
      declarationOffenders((file) => file.includes("@ph-fixture")),
    ).toEqual([]);
  });

  it("carry none for the compiler either", () => {
    expect(
      declarationOffenders((file) => file.includes("/document-model/")),
    ).toEqual([]);
  });

  /**
   * One dependency does leak, and it is recorded rather than hidden.
   *
   * `@powerhousedao/shared` publishes bundled declarations whose `//#region`
   * provenance comments name the pnpm store path each fragment came from. They
   * are comments, so nothing resolves through them, but they are exactly the
   * store paths this check exists to find. Listing them here means the leak is
   * visible, cannot grow quietly, and removing it is a deliberate edit to that
   * package's bundler configuration rather than a change to this test.
   */
  it("records the one dependency that still leaks a store path", () => {
    expect(
      declarationOffenders((file) =>
        file.includes("@powerhousedao/shared"),
      ).map((line) =>
        line.replace(
          /\/clis\/index-[A-Za-z0-9_-]+\.d\.mts/,
          "/clis/<chunk>.d.mts",
        ),
      ),
    ).toEqual([
      "@powerhousedao/shared/dist/clis/<chunk>.d.mts: node_modules\\/\\.pnpm",
    ]);
  });
});

/**
 * What a consumer would see with `skipLibCheck` turned off.
 *
 * No consumer has to set it, and the one above does not, so this is not a
 * failure of the packed model. It is the published declaration graph of its
 * dependencies measured at its strictest, recorded so the list can only
 * shrink on purpose.
 */
describe("the strictest possible consumer", () => {
  it("sees exactly these declaration diagnostics", () => {
    writeConsumerFile(install, "node-consumer.ts", NODE_CONSUMER_SOURCE);
    writeConsumerFile(
      install,
      "tsconfig.strict.json",
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: ["node"],
          },
          include: ["node-consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    let diagnostics: string[] = [];
    try {
      typecheckConsumer(install, "tsconfig.strict.json");
    } catch (error) {
      diagnostics = (error as Error).message
        .split("\n")
        .filter((line) => /error TS\d+/.test(line))
        .map((line) =>
          line
            .replace(/\(\d+,\d+\)/, "")
            .replace(/'\/[^']*\/consumer\/[^']*'/, "'<path>'")
            // The chunk names are content hashes: they change whenever a
            // workspace package is rebuilt, which says nothing about whether
            // the published declarations got better or worse.
            .replace(/\/(index|types)-[A-Za-z0-9_-]+\.d\.ts/, "/<chunk>.d.ts")
            .trim(),
        )
        .sort();
    }
    expect(diagnostics).toEqual([
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'FileSystemFileHandle'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'FileSystemFileHandle'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'JsonWebKey'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'JsonWebKey'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'JsonWebKey'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2304: Cannot find name 'JsonWebKey'.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS2307: Cannot find module 'react' or its corresponding type declarations.",
      "node_modules/@powerhousedao/shared/dist/<chunk>.d.ts: error TS7016: Could not find a declaration file for module 'luxon'. '<path>' implicitly has an 'any' type.",
    ]);
    // The packed model's own declarations are not among them.
    expect(diagnostics.filter((line) => line.includes("@ph-fixture"))).toEqual(
      [],
    );
  }, 300_000);
});

describe("staleness", () => {
  it("binds the published bundle to the sources it was built from", () => {
    const file = writeConsumerFile(
      install,
      "revision.mjs",
      `import { SOURCE_REVISION } from "@ph-fixture/packed-model";
console.log(SOURCE_REVISION);
`,
    );
    expect(runConsumer(install, file).trim()).toBe(install.sourceRevision);
    // And the installed output is byte-identical to what was built, so the
    // tarball cannot have carried a different bundle.
    const installedDist = join(
      install.installRoot,
      "@ph-fixture",
      "packed-model",
      "dist",
    );
    expect(treeDigest(installedDist)).toBe(install.outputDigest);
  });

  it("notices when the sources move underneath the bundle", () => {
    // The binding is worth only as much as its ability to fail. Editing one
    // published file gives the install directory a different digest, which is
    // exactly what a stale tarball would look like.
    const installedDist = join(
      install.installRoot,
      "@ph-fixture",
      "packed-model",
      "dist",
    );
    const marker = join(installedDist, "revision.js");
    const original = readFileSync(marker, "utf8");
    writeFileSync(marker, `${original}// edited\n`);
    try {
      expect(treeDigest(installedDist)).not.toBe(install.outputDigest);
    } finally {
      writeFileSync(marker, original);
    }
    expect(treeDigest(installedDist)).toBe(install.outputDigest);
  });
});
