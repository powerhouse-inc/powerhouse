// The pieces half of a package build: find and bundle each piece whole, load
// it once in a child process to learn what it is, and write what a host reads.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { InlineConfig } from "tsdown";
import type { Manifest, PieceModule } from "../document-model/types.js";
import { buildPieceBuildConfig, PIECE_ENTRY_GLOB } from "./build-config.mjs";

export type PiecePlan = {
  /** The directory under pieces/, and so under <outDir>/node/pieces. */
  dir: string;
  /** Source entry, relative to the project root: pieces/<dir>/index.ts. */
  entry: string;
  /** Where the piece lands, relative to the project root. */
  outDir: string;
};

// What buildPieces needs to know about the package it works in: where it is,
// where it builds to, and which pieces the plan found.
export type PieceBuildTarget = {
  projectRoot: string;
  outDir: string;
  pieces: PiecePlan[];
};

// One entry of pieces/index.ts, as @powerhousedao/pieces-framework declares it.
// Declared here so the build needs no dependency on a package meant for pieces.
export type PackagePiece = {
  name: string;
  version: string;
  entry?: string;
  bundle?: string;
};

// What a piece says about itself, in the framework's PieceMetadata shape.
// Read from the built piece, so nothing in the build has to know the framework.
export type PieceMetadata = Record<string, unknown> & {
  displayName?: string;
  description?: string;
  actions?: Record<string, unknown>;
  triggers?: Record<string, unknown>;
};

export type DescribedPiece = {
  name: string;
  version: string;
  metadata: PieceMetadata;
};

export type DescribeResult = {
  list: PackagePiece[];
  pieces: DescribedPiece[];
  errors: { name: string; message: string }[];
};

export type BuiltPiece = {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  /** Piece directory, relative to the project root, `/` separated. */
  bundle: string;
  /** The descriptor inside it, relative to the project root, `/` separated. */
  descriptor: string;
};

export type PackageIdentity = {
  name: string;
  version: string;
  license?: string;
};

export type PieceBuildOptions = {
  /** The bundler: tsdown's `build`, handed in so this module never loads it. */
  bundle: (config: InlineConfig) => Promise<unknown>;
};

const toPosix = (p: string) => p.split(sep).join("/");

export function statSafe(p: string) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// Expand entry globs (single-`*` segments only — the shape `browserEntry`
// uses) against files on disk, resolving against `root`.
export function expandEntryGlobs(root: string, globs: string[]): string[] {
  const files = new Set<string>();
  for (const pattern of globs) {
    const segments = pattern.split("/").filter(Boolean);
    let dirs = [root];
    for (const seg of segments) {
      const next: string[] = [];
      for (const d of dirs) {
        if (!statSafe(d)?.isDirectory()) continue;
        if (seg === "*") {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            next.push(join(d, e.name));
          }
        } else {
          next.push(join(d, seg));
        }
      }
      dirs = next;
    }
    for (const f of dirs) {
      if (statSafe(f)?.isFile()) files.add(f);
    }
  }
  return [...files];
}

// The pieces a project holds, one per pieces/<dir>/index.ts, sorted by dir so
// a build log and a manifest read the same from one run to the next.
export function planPieces(projectRoot: string, outDir: string): PiecePlan[] {
  return expandEntryGlobs(projectRoot, [PIECE_ENTRY_GLOB])
    .map((file) => {
      const dir = basename(dirname(file));
      return {
        dir,
        entry: relative(projectRoot, file),
        outDir: join(outDir, "node", "pieces", dir),
      };
    })
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

// A JSON.stringify replacer that makes a piece's metadata serializable: props
// carry resolvers, defaults may be class instances, and a schema may cycle.
export function createJsonReplacer() {
  const ancestors: object[] = [];
  return function replace(this: unknown, _key: string, value: unknown) {
    if (typeof value === "function" || value === undefined) return undefined;
    if (typeof value === "bigint") return value.toString();
    if (typeof value !== "object" || value === null) return value;
    // `this` is the holder, so popping back to it leaves the current path.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(value)) return undefined;
    ancestors.push(value);
    return value;
  };
}

// The half of the child script that needs nothing from the job: a test
// evaluates this text on its own, so neither copy can drift from the other.

// `constructor?.name`: a module may export an Object.create(null), and the
// real piece is usually beside it in the same module.
export const DESCRIBE_HELPERS = `
const isRecord = (value) => typeof value === "object" && value !== null;

function findPiece(mod) {
  const candidates = [
    ...Object.values(mod),
    ...(isRecord(mod.default) ? Object.values(mod.default) : []),
    mod.default,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate) && candidate.constructor?.name === "Piece") {
      return candidate;
    }
  }
  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      typeof candidate.displayName === "string" &&
      (isRecord(candidate.actions) ||
        typeof candidate.actions === "function" ||
        typeof candidate.getAction === "function")
    ) {
      return candidate;
    }
  }
  return undefined;
}

function describePiece(piece) {
  if (typeof piece.metadata === "function") return piece.metadata();
  const call = (value) => (typeof value === "function" ? value.call(piece) : value);
  return {
    displayName: piece.displayName,
    logoUrl: piece.logoUrl,
    description: piece.description,
    authors: piece.authors,
    categories: piece.categories,
    auth: piece.auth,
    minimumSupportedRelease: piece.minimumSupportedRelease,
    maximumSupportedRelease: piece.maximumSupportedRelease,
    deprecated: piece.deprecated,
    actions: call(piece.actions) ?? {},
    triggers: call(piece.triggers) ?? {},
  };
}

function createJsonReplacer() {
  const ancestors = [];
  return function replace(_key, value) {
    if (typeof value === "function" || value === undefined) return undefined;
    if (typeof value === "bigint") return value.toString();
    if (typeof value !== "object" || value === null) return value;
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(value)) return undefined;
    ancestors.push(value);
    return value;
  };
}
`;

// Runs in a child node process: loading a piece runs piece-authored top-level
// code, and the runtime describes pieces in a worker for the same reason.

// A string so it works from `src` under bun or tsx as well as from `dist`. It
// answers through a file, leaving both its streams to the piece.
export const DESCRIBE_SCRIPT = `
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
${DESCRIBE_HELPERS}
// Says why the child gave up in the one place the parent always reads, so a
// failure reports the cause and never the text of this script.
function fail(message) {
  writeFileSync(job.outFile, JSON.stringify({ fatal: message }));
  process.exit(1);
}

// The module to load for a list entry; a bundle names its own main.
function entryFile(piece) {
  const declared = piece.entry ?? piece.bundle;
  if (typeof declared !== "string") return undefined;
  const path = isAbsolute(declared) ? declared : join(job.projectRoot, declared);
  if (piece.entry) return path;
  const pkgFile = join(path, "package.json");
  if (!existsSync(pkgFile)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  return join(path, typeof pkg.main === "string" ? pkg.main : "index.mjs");
}

let listModule;
try {
  listModule = await import(pathToFileURL(job.listPath).href);
} catch (error) {
  fail(job.listPath + " threw on import: " + (error instanceof Error ? error.message : String(error)));
}
const list = listModule.pieces ?? listModule.default;
if (!Array.isArray(list)) {
  fail(job.listPath + ' exports no "pieces" array');
}

const out = { list, pieces: [], errors: [] };
for (const piece of list) {
  const file = entryFile(piece);
  // A missing file is the parent's to report, with the message it owns.
  if (!file || !existsSync(file)) continue;
  try {
    const mod = await import(pathToFileURL(file).href);
    const found = findPiece(mod);
    if (!found) {
      throw new Error(
        "no Piece export found in " + file + "; exports: " + Object.keys(mod).join(", "),
      );
    }
    const metadata = JSON.parse(JSON.stringify(describePiece(found), createJsonReplacer()));
    out.pieces.push({ name: piece.name, version: piece.version, metadata });
  } catch (error) {
    out.errors.push({
      name: piece.name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
writeFileSync(job.outFile, JSON.stringify(out, createJsonReplacer()));
`;

// What the child said went wrong, if it got that far, and otherwise how it
// died: an exit status, never the whole script an `Error.message` carries.
function childFailure(error: unknown, outFile: string): string {
  try {
    const answer = JSON.parse(readFileSync(outFile, "utf8")) as {
      fatal?: unknown;
    };
    if (typeof answer.fatal === "string") return answer.fatal;
  } catch {
    // no answer on disk: fall through to the exit status
  }
  const { status, signal } = error as {
    status?: number | null;
    signal?: string | null;
  };
  if (signal) return `the describe child was killed by ${signal}`;
  return `the describe child exited with code ${status ?? "unknown"}`;
}

// Load the built list and every piece it names in a child process and return
// what they say about themselves. Throws when the list itself cannot be read.

// Both of the child's streams are the parent's, so a piece that prints at
// import time is heard rather than mixed into the answer.
export function describePieces(
  projectRoot: string,
  listPath: string,
): DescribeResult {
  const dir = mkdtempSync(join(tmpdir(), "ph-build-pieces-"));
  const rel = toPosix(relative(projectRoot, listPath));
  try {
    const jobFile = join(dir, "job.json");
    const scriptFile = join(dir, "describe.mjs");
    const outFile = join(dir, "describe.json");
    writeFileSync(scriptFile, DESCRIBE_SCRIPT);
    writeFileSync(jobFile, JSON.stringify({ projectRoot, listPath, outFile }));
    try {
      execFileSync(process.execPath, [scriptFile, jobFile], {
        timeout: 60_000,
        stdio: "inherit",
      });
    } catch (error) {
      throw new Error(
        `pieces: could not load ${rel}: ${childFailure(error, outFile)}`,
        { cause: error },
      );
    }
    return JSON.parse(readFileSync(outFile, "utf8")) as DescribeResult;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type PieceLocation = {
  /** The piece directory, absolute. */
  dir: string;
  /** The module file, absolute; unset for a bundle, whose package.json names it. */
  entryFile?: string;
  form: "entry" | "bundle";
};

// Where a list entry says its built piece is, checked against the disk: a
// listed piece nobody built would otherwise fail much later, in a host.
export function resolvePieceLocation(
  piece: PackagePiece,
  projectRoot: string,
  outDir: string,
): PieceLocation {
  const declared = piece.entry ?? piece.bundle;
  if (typeof declared !== "string" || declared === "") {
    throw new Error(
      `pieces: "${piece.name}" declares neither an entry nor a bundle`,
    );
  }
  const path = isAbsolute(declared) ? declared : join(projectRoot, declared);
  const form = piece.entry ? "entry" : "bundle";
  const present =
    form === "entry"
      ? statSafe(path)?.isFile()
      : statSafe(join(path, "package.json"))?.isFile();
  if (!present) {
    throw new Error(
      `pieces: "${piece.name}" declares ${declared}, which is missing`,
    );
  }
  const dir = form === "entry" ? dirname(path) : path;
  // Both forms, not just `entry`: a descriptor.json is written into this
  // directory, and outside outDir that lands in tracked source.
  const piecesRoot = resolve(projectRoot, outDir, "node", "pieces");
  const inside = relative(piecesRoot, dir);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    const expected = toPosix(join(outDir, "node", "pieces"));
    throw new Error(
      `pieces: "${piece.name}" declares ${declared}, which is outside ${expected}/; ` +
        `a piece is built to ${expected}/<dir>/index.mjs and its entry must point there`,
    );
  }
  return form === "entry" ? { dir, entryFile: path, form } : { dir, form };
}

// Where the node build leaves the list of pieces a package ships. Its presence
// on disk, not a pieces/<dir> in the source, is what says a package has them.
export function pieceListPath(target: {
  projectRoot: string;
  outDir: string;
}): string {
  return resolve(
    target.projectRoot,
    target.outDir,
    "node",
    "pieces",
    "index.mjs",
  );
}

// `dist` is not a default here but a contract: a host reads a piece from
// dist/node/pieces/<name>, and a list entry names that path literally.
export function assertPiecesOutDir(target: {
  outDir: string;
  pieces: PiecePlan[];
}): void {
  if (target.pieces.length === 0 || target.outDir === "dist") return;
  throw new Error(
    `pieces: --out-dir ${target.outDir} cannot hold pieces; a piece is loaded from ` +
      `dist/node/pieces/<name> by the host, so a package that ships pieces builds to dist`,
  );
}

// A piece named after its package must carry the package's version: once
// published, a drifted version resolves to the wrong tarball.
export function assertPieceVersion(
  piece: PackagePiece,
  pkg: PackageIdentity,
): void {
  if (piece.name === pkg.name && piece.version !== pkg.version) {
    throw new Error(
      `pieces: "${piece.name}" declares version ${piece.version}, package.json says ${pkg.version}`,
    );
  }
}

// The package.json written beside a piece built from an `entry`, giving the
// directory npm-bundle shape so a registry can serve it on its own.
export function piecePackageJson(options: {
  name: string;
  version: string;
  description?: string;
  main: string;
  license?: string;
}): Record<string, unknown> {
  return {
    name: options.name,
    version: options.version,
    description: options.description ?? "",
    type: "module",
    main: options.main,
    ...(options.license ? { license: options.license } : {}),
    // Empty on purpose: the runtime treats a bundle that declares dependencies
    // as not self-contained, and everything a piece needs is inlined already.
    dependencies: {},
  };
}

// The descriptor written beside a piece: the list's name and version, then
// whatever the piece said about itself, in the framework's PieceMetadata shape.
export function pieceDescriptor(
  piece: PackagePiece,
  metadata: PieceMetadata,
): Record<string, unknown> {
  const { name: _name, version: _version, ...rest } = metadata;
  return { name: piece.name, version: piece.version, ...rest };
}

// The manifest's `pieces` with what the build learned: a built piece replaces
// the source entry with its id in place, or is appended at the end.

// A source entry nothing built is kept as it is and returned as `unbuilt`,
// for the caller to warn about.
export function enrichManifestPieces(
  manifest: Manifest,
  built: BuiltPiece[],
): { manifest: Manifest; unbuilt: string[] } {
  const byId = new Map(built.map((piece) => [piece.name, piece]));
  const toModule = (piece: BuiltPiece): PieceModule => ({
    id: piece.name,
    name: piece.displayName ?? piece.name,
    version: piece.version,
    ...(piece.description ? { description: piece.description } : {}),
    bundle: piece.bundle,
    descriptor: piece.descriptor,
  });
  const unbuilt: string[] = [];
  const seen = new Set<string>();
  const pieces: PieceModule[] = (manifest.pieces ?? []).map((entry) => {
    const hit = byId.get(entry.id);
    if (!hit) {
      unbuilt.push(entry.id);
      return entry;
    }
    seen.add(entry.id);
    return toModule(hit);
  });
  for (const piece of built) {
    if (!seen.has(piece.name)) pieces.push(toModule(piece));
  }
  return { manifest: { ...manifest, pieces }, unbuilt };
}

const count = (record: unknown) =>
  typeof record === "object" && record !== null
    ? Object.keys(record).length
    : 0;

// Build every planned piece, then read the built list and describe what it
// names. Returns what was built, for the manifest.
export async function buildPieces(
  target: PieceBuildTarget,
  pkg: PackageIdentity,
  options: PieceBuildOptions,
): Promise<BuiltPiece[]> {
  const { projectRoot, outDir } = target;
  assertPiecesOutDir(target);
  // resolve, not join: an absolute --out-dir is what the browser and node
  // steps hand tsdown, and joining it onto the project root mangles it.
  for (const piece of target.pieces) {
    console.log(`\n▶ Building piece ${piece.dir}...`);
    await options.bundle(
      buildPieceBuildConfig({
        entry: resolve(projectRoot, piece.entry),
        outDir: resolve(projectRoot, piece.outDir),
      }),
    );
  }

  // The list is the source of truth for names and versions; a package that
  // built pieces without a list has nothing a host could read.
  const listPath = pieceListPath(target);
  if (!existsSync(listPath)) {
    throw new Error(
      `pieces: ${toPosix(relative(projectRoot, listPath))} was not built; ` +
        `pieces/index.ts must export the list of pieces this package ships`,
    );
  }
  const described = describePieces(projectRoot, listPath);

  const built: BuiltPiece[] = [];
  const listedDirs = new Set<string>();
  for (const piece of described.list) {
    const location = resolvePieceLocation(piece, projectRoot, outDir);
    assertPieceVersion(piece, pkg);
    const failure = described.errors.find((e) => e.name === piece.name);
    if (failure) {
      throw new Error(
        `pieces: "${piece.name}" could not be described: ${failure.message}`,
      );
    }
    const found = described.pieces.find((p) => p.name === piece.name);
    if (!found) {
      throw new Error(`pieces: "${piece.name}" was not described`);
    }
    const metadata = found.metadata;
    const relDir = toPosix(relative(projectRoot, location.dir));
    listedDirs.add(relDir);

    writeFileSync(
      join(location.dir, "descriptor.json"),
      JSON.stringify(
        pieceDescriptor(piece, metadata),
        createJsonReplacer(),
        2,
      ) + "\n",
    );
    if (location.form === "entry" && location.entryFile) {
      writeFileSync(
        join(location.dir, "package.json"),
        JSON.stringify(
          piecePackageJson({
            name: piece.name,
            version: piece.version,
            description: metadata.description,
            main: relative(location.dir, location.entryFile),
            license: pkg.license,
          }),
          null,
          2,
        ) + "\n",
      );
    }
    console.log(
      `piece: ${piece.name}@${piece.version} -> ${relDir} ` +
        `(${count(metadata.actions)} actions, ${count(metadata.triggers)} triggers)`,
    );
    built.push({
      name: piece.name,
      version: piece.version,
      displayName: metadata.displayName,
      description: metadata.description,
      bundle: relDir,
      descriptor: `${relDir}/descriptor.json`,
    });
  }

  warnUnlistedPieces(target.pieces, listedDirs);
  return built;
}

// A built piece no list entry points into ships without a host ever finding it.
function warnUnlistedPieces(
  planned: PiecePlan[],
  listedDirs: Set<string>,
): void {
  for (const piece of planned) {
    if (!listedDirs.has(toPosix(piece.outDir))) {
      console.warn(
        `⚠ pieces: pieces/${piece.dir} was built but pieces/index.ts does not list it; a host will not find it`,
      );
    }
  }
}

// Make sure the manifest ships under outDir (tsdown copies it only in the
// browser build) and, when pieces were built, list them in that copy.

// Always copied afresh: only <outDir>/node is cleaned by the builds, so a copy
// left by the last build would otherwise outlive an edit to the source.

// The source file is never written. Returns the path of the copy, if any.
export function syncDistManifest(
  target: PieceBuildTarget,
  built: BuiltPiece[],
): string | undefined {
  const { projectRoot, outDir } = target;
  const source = join(projectRoot, "powerhouse.manifest.json");
  const copy = join(projectRoot, outDir, "powerhouse.manifest.json");
  // The built list, not the source plan: a package whose pieces are all
  // `bundle:` entries has no pieces/<dir> and still ships pieces.
  const shipsPieces = existsSync(pieceListPath(target));
  if (!existsSync(source)) {
    if (shipsPieces) {
      console.warn("⚠ no powerhouse.manifest.json; pieces will not be listed");
    }
    return undefined;
  }
  mkdirSync(dirname(copy), { recursive: true });
  copyFileSync(source, copy);
  if (!shipsPieces) return copy;

  const manifest = JSON.parse(readFileSync(copy, "utf8")) as Manifest;
  const enriched = enrichManifestPieces(manifest, built);
  for (const id of enriched.unbuilt) {
    console.warn(`⚠ manifest lists piece "${id}" but nothing built it`);
  }
  writeFileSync(copy, JSON.stringify(enriched.manifest, null, 2) + "\n");
  return copy;
}
