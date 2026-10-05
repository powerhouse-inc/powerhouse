import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { sha256 } from "../../src/definition/primitives.js";
import {
  REPOSITORY_ROOT,
  declaredDependencies,
  stageDependencyClosure,
  stageWorkspacePackage,
} from "./prestage.js";

/**
 * A consumer that installs the tarball, and nothing else.
 *
 * A workspace link hides packaging bugs: with one in place a consumer
 * typechecks against source that will never be published, resolves a `source`
 * condition no installed package has, and imports a dependency that was only
 * ever a devDependency. Every one of those passes in the repository and fails
 * on the first real install.
 *
 * So this builds a package, packs it, and installs the tarball into a
 * directory that has no link back — every file the consumer can reach is one
 * that was published or staged beside it.
 */

const FIXTURE_NAME = "@ph-fixture/packed-model";

/** The corpus root the packed model is declared from. */
const CORPUS_ROOT = "versioned-todo";

const CORPUS_SOURCE = join(
  REPOSITORY_ROOT,
  "packages/document-model/test/parity/corpus",
  `${CORPUS_ROOT}.code-first.ts`,
);

export const PACKED_CORPUS_ROOT = CORPUS_ROOT;

/**
 * The corpus declaration, re-spelled to import the compiler by name.
 *
 * The same declaration the parity suite compiles from source, so the goldens
 * it produces are the ones committed in `test/parity/goldens`. Copying it by
 * hand would let the packed side drift from the source side silently, which
 * is the one thing a packaging test must not allow.
 */
function packedModelSource(): string {
  const source = readFileSync(CORPUS_SOURCE, "utf8");
  const rewritten = source.replace(
    /from "\.\.\/\.\.\/\.\.\/src\/definition\/[a-z-]+\.js"/g,
    'from "document-model"',
  );
  if (rewritten.includes("../../../src/")) {
    throw new Error("the corpus declaration reaches into the compiler source");
  }
  return rewritten;
}

/** A model whose GraphQL projection is a recorded AST, written as a literal. */
const COMPATIBILITY_SOURCE = `import { defineDocumentModel, ph } from "document-model";

/**
 * A model whose GraphQL projection is a retained AST.
 *
 * Written as a plain object literal, which is the point: an AST is data, so a
 * model that carries one still loads with no GraphQL implementation anywhere
 * in its import graph.
 */
export const compatibility = defineDocumentModel({
  id: "test/packed-compat",
  name: "PackedCompat",
  description: "A model that retains a GraphQL AST.",
  extension: "compat",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    graphQLCompatibility: {
      kind: "graphql-ast-v1",
      preserveDefinitionOrder: true,
      document: {
        kind: "Document",
        definitions: [
          {
            kind: "ObjectTypeDefinition",
            name: { kind: "Name", value: "PackedCompatState" },
            interfaces: [],
            directives: [],
            fields: [
              {
                kind: "FieldDefinition",
                name: { kind: "Name", value: "label" },
                arguments: [],
                directives: [],
                type: {
                  kind: "NonNullType",
                  type: {
                    kind: "NamedType",
                    name: { kind: "Name", value: "String" },
                  },
                },
              },
            ],
          },
        ],
      },
    },
    global: {
      schema: ph.object("PackedCompatState", {
        fields: { label: ph.String({ required: true }) },
      }),
      initialValue: { label: "" },
    },
    local: { schema: null, initialValue: {} },
  },
}).finalize({ modules: [] });
`;

const INDEX_SOURCE = `export { family, modules } from "./model.js";
export { compatibility } from "./compat.js";
export { SOURCE_REVISION } from "./revision.js";
`;

const BROWSER_SOURCE = `export * from "./index.js";

/** Which entry a consumer resolved, so the conditions can be asserted. */
export const ENTRY = "browser";
`;

const WORKER_SOURCE = `import { modules } from "./model.js";
import { SOURCE_REVISION } from "./revision.js";

export type HandshakeRequest = { readonly nonce: string };

export type HandshakeReply = {
  readonly ok: true;
  readonly nonce: string;
  readonly documentType: string;
  readonly versions: readonly number[];
  readonly revision: string;
};

/**
 * The worker's half of a handshake.
 *
 * Platform-free on purpose: the host wires whatever worker it has to this,
 * which is also what lets the same entry be imported under browser conditions
 * and under Node's.
 */
export function handshake(request: HandshakeRequest): HandshakeReply {
  const list = modules as readonly { version: number; documentModel: { global: { id: string } } }[];
  return {
    ok: true,
    nonce: request.nonce,
    documentType: list[0].documentModel.global.id,
    versions: list.map((entry) => entry.version),
    revision: SOURCE_REVISION,
  };
}
`;

function writeFixtureSources(sourceRoot: string): void {
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(join(sourceRoot, "model.ts"), packedModelSource());
  writeFileSync(join(sourceRoot, "compat.ts"), COMPATIBILITY_SOURCE);
  writeFileSync(join(sourceRoot, "index.ts"), INDEX_SOURCE);
  writeFileSync(join(sourceRoot, "browser.ts"), BROWSER_SOURCE);
  writeFileSync(join(sourceRoot, "worker.ts"), WORKER_SOURCE);
}

/** Every file under a directory, relative and sorted, for a digest. */
function treeFiles(root: string, prefix = ""): readonly string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry);
    const name = prefix === "" ? entry : `${prefix}/${entry}`;
    if (statSync(full).isDirectory()) {
      entries.push(...treeFiles(full, name));
    } else {
      entries.push(name);
    }
  }
  return entries;
}

const SEPARATOR = String.fromCharCode(0);

export function treeDigest(root: string): string {
  const parts: string[] = [];
  for (const name of treeFiles(root)) {
    parts.push(name, readFileSync(join(root, name), "utf8"));
  }
  return sha256(parts.join(SEPARATOR));
}

/** The newest modification time under a directory, skipping build output. */
function newestSource(root: string, skip: ReadonlySet<string>): number {
  let newest = 0;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (skip.has(entry)) continue;
      const full = join(directory, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else if (!entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
        newest = Math.max(newest, stats.mtimeMs);
      }
    }
  };
  walk(root);
  return newest;
}

/** The oldest modification time under a directory. */
function oldestOutput(root: string): number {
  let oldest = Number.POSITIVE_INFINITY;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else {
        oldest = Math.min(oldest, stats.mtimeMs);
      }
    }
  };
  walk(root);
  return oldest;
}

/**
 * Refuses to pack a `dist` older than the sources beside it.
 *
 * Without this the suite silently measures the previous build: it packs what
 * is on disk, and a `dist` nobody rebuilt is a perfectly valid tarball of the
 * wrong thing. Every other definition and replay suite avoids the problem by
 * forcing the `source` condition, which this one cannot.
 */
function assertBuilt(packageRoot: string): void {
  const output = join(packageRoot, "dist");
  if (!existsSync(output)) {
    throw new Error(
      `${packageRoot} has no dist. Run \`pnpm --filter ./${relative(REPOSITORY_ROOT, packageRoot)} build\` first.`,
    );
  }
  const skip = new Set([
    "dist",
    "node_modules",
    ".tsbuild",
    ".turbo",
    "test",
    "bench",
  ]);
  // An empty `dist` is stale by definition: `oldestOutput` would otherwise
  // return `+Infinity` and the harness would pack a tarball with no build
  // output at all, reported later as a confusing `tsc` failure.
  const oldest = oldestOutput(output);
  if (!Number.isFinite(oldest)) {
    throw new Error(
      `${packageRoot} has an empty dist. Run \`pnpm --filter ./${relative(REPOSITORY_ROOT, packageRoot)} build\` first.`,
    );
  }
  if (newestSource(packageRoot, skip) > oldest) {
    throw new Error(
      `${packageRoot} has a stale dist. Run \`pnpm --filter ./${relative(REPOSITORY_ROOT, packageRoot)} build\` first.`,
    );
  }
}

export type PackedInstall = {
  /** The consumer's own directory. Nothing it imports lives outside it. */
  readonly consumerRoot: string;
  readonly installRoot: string;
  /** Where the fixture was compiled, so a declaration naming it is caught. */
  readonly buildRoot: string;
  /** The digest of the sources the published bundle was built from. */
  readonly sourceRevision: string;
  /** The digest of the built output, taken before packing. */
  readonly outputDigest: string;
  readonly dispose: () => void;
};

/** Builds, packs and installs the fixture; returns the consumer. */
export function packAndInstall(): PackedInstall {
  // The real path: on macOS a temp directory is reached through a symlink,
  // and a consumer's resolved-file manifest would then read as "outside".
  const base = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-packed-consumer-")),
  );
  const dispose = () => rmSync(base, { recursive: true, force: true });
  try {
    const tarballs = join(base, "tarballs");
    const staging = join(base, "staging", "node_modules");
    mkdirSync(staging, { recursive: true });

    // Everything the model can reach, staged from what this repository
    // already has. No step after this one goes to the network.
    const shared = join(REPOSITORY_ROOT, "packages/shared");
    const compiler = join(REPOSITORY_ROOT, "packages/document-model");
    // Checked first, on purpose. This suite is the one place that cannot
    // force the `source` condition — a packed consumer has no such condition
    // — so a stale `dist` would publish yesterday's bytes and report today's
    // verdict. Building here instead would rewrite a sibling package while
    // other test files are reading it, so the requirement is enforced rather
    // than performed.
    assertBuilt(shared);
    assertBuilt(compiler);
    stageWorkspacePackage(shared, staging, tarballs);
    stageWorkspacePackage(compiler, staging, tarballs);
    stageDependencyClosure(declaredDependencies(shared), shared, staging);
    stageDependencyClosure(declaredDependencies(compiler), compiler, staging);
    // The consumer's own tools: a TypeScript and the Node type declarations
    // it typechecks against. Tools, not module inputs.
    stageDependencyClosure(
      ["typescript", "@types/node"],
      REPOSITORY_ROOT,
      staging,
    );

    const packRoot = join(base, "fixture");
    const sourceRoot = join(packRoot, "src");
    writeFixtureSources(sourceRoot);

    // The revision is a digest of every other source file, so a bundle built
    // before an edit carries a revision the edit no longer produces.
    const sourceRevision = treeDigest(sourceRoot);
    writeFileSync(
      join(sourceRoot, "revision.ts"),
      `export const SOURCE_REVISION = ${JSON.stringify(sourceRevision)};\n`,
    );

    writeFileSync(
      join(packRoot, "package.json"),
      `${JSON.stringify(
        {
          name: FIXTURE_NAME,
          version: "0.0.0",
          type: "module",
          files: ["dist"],
          exports: {
            ".": {
              types: "./dist/index.d.ts",
              browser: "./dist/browser.js",
              default: "./dist/index.js",
            },
            "./worker": {
              types: "./dist/worker.d.ts",
              default: "./dist/worker.js",
            },
          },
          dependencies: { "document-model": "*" },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(packRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            declaration: true,
            declarationMap: false,
            sourceMap: false,
            outDir: "dist",
            rootDir: "src",
            skipLibCheck: true,
            types: [],
          },
          include: ["src"],
        },
        null,
        2,
      )}\n`,
    );

    // The fixture is compiled against the packed compiler's declarations, not
    // against its source: a wrong `types` entry in the published `exports` map
    // fails here rather than after a release.
    cpSync(staging, join(packRoot, "node_modules"), {
      recursive: true,
      dereference: true,
    });
    execFileSync(
      process.execPath,
      [join(packRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "."],
      { cwd: packRoot, stdio: ["ignore", "pipe", "pipe"] },
    );

    const outputDigest = treeDigest(join(packRoot, "dist"));

    stageWorkspacePackage(packRoot, join(base, "extracted"), tarballs);

    // A fresh consumer: the tarball's contents and the staged closure, with
    // no link of any kind pointing back out.
    const consumerRoot = join(base, "consumer");
    const installRoot = join(consumerRoot, "node_modules");
    mkdirSync(installRoot, { recursive: true });
    cpSync(staging, installRoot, { recursive: true, dereference: true });
    cpSync(
      join(base, "extracted", ...FIXTURE_NAME.split("/")),
      join(installRoot, ...FIXTURE_NAME.split("/")),
      { recursive: true, dereference: true },
    );
    writeFileSync(
      join(consumerRoot, "package.json"),
      `${JSON.stringify({ name: "packed-consumer", private: true, type: "module" }, null, 2)}\n`,
    );

    return {
      consumerRoot,
      installRoot,
      buildRoot: packRoot,
      sourceRevision,
      outputDigest,
      dispose,
    };
  } catch (error) {
    dispose();
    const failure = error as { stderr?: Buffer; stdout?: Buffer };
    const reported = [failure.stdout?.toString(), failure.stderr?.toString()]
      .filter((part) => part !== undefined && part.trim() !== "")
      .join("\n")
      .trim();
    throw new Error(
      reported === ""
        ? error instanceof Error
          ? error.message
          : String(error)
        : reported,
      { cause: error },
    );
  }
}

/** Runs a consumer script and returns its stdout. */
export function runConsumer(
  install: PackedInstall,
  file: string,
  options: {
    readonly conditions?: readonly string[];
    /** A module registered before the entry, for recording what it resolves. */
    readonly preload?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {},
): string {
  const conditions = (options.conditions ?? []).flatMap((condition) => [
    "--conditions",
    condition,
  ]);
  const preload =
    options.preload === undefined ? [] : ["--import", options.preload];
  return execFileSync(process.execPath, [...conditions, ...preload, file], {
    cwd: install.consumerRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
  });
}

/** Typechecks one consumer tsconfig with the staged TypeScript. */
export function typecheckConsumer(
  install: PackedInstall,
  tsconfig: string,
): void {
  try {
    execFileSync(
      process.execPath,
      [
        join(install.installRoot, "typescript", "bin", "tsc"),
        "-p",
        tsconfig,
        "--noEmit",
      ],
      { cwd: install.consumerRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // `tsc` reports on stdout; an exit code alone would say nothing about
    // which declaration the consumer could not read.
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      [failure.stdout?.toString(), failure.stderr?.toString()]
        .filter((part) => part !== undefined && part.trim() !== "")
        .join("\n")
        .trim(),
      { cause: error },
    );
  }
}

/** Every declaration file the consumer installed. */
export function declarationFiles(install: PackedInstall): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith(".d.ts") || full.endsWith(".d.mts")) {
        found.push(full);
      }
    }
  };
  for (const name of [
    ...FIXTURE_NAME.split("/").slice(0, 1),
    "document-model",
    "@powerhousedao",
  ]) {
    const directory = join(install.installRoot, name);
    walk(directory);
  }
  return found;
}

export function writeConsumerFile(
  install: PackedInstall,
  file: string,
  contents: string,
): string {
  const full = join(install.consumerRoot, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}
