import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ApPiece } from "./types.js";

export interface LoadedPiece {
  piece: ApPiece;
  entryPath: string;
  // Which duck-type check identified the export.
  check: "constructor-name" | "structural";
}

// Resolves a bundle's entry file. Published bundles typically carry only
// `main` (no `exports`, no `type` — they are CJS).
export function resolveEntry(pieceDir: string): string {
  const raw = readFileSync(path.join(pieceDir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as {
    main?: string;
    module?: string;
    exports?: Record<string, unknown>;
  };
  const dotExport = pkg.exports?.["."];
  const candidates: (string | undefined)[] = [];
  if (typeof dotExport === "string") candidates.push(dotExport);
  if (dotExport && typeof dotExport === "object") {
    const cond = dotExport as Record<string, unknown>;
    for (const key of ["import", "require", "default"]) {
      const value = cond[key];
      if (typeof value === "string") candidates.push(value);
    }
  }
  candidates.push(pkg.main, pkg.module, "src/index.js", "index.js", "main.js");
  // A bundle's manifest (or a symlink inside it) must not point the entry
  // outside pieceDir; realpath so a symlink can't launder the escape.
  const root = realpathSync(pieceDir);
  const rootWithSep = root + path.sep;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const abs = path.resolve(pieceDir, candidate);
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      continue; // candidate doesn't exist; try the next one
    }
    if (real !== root && !real.startsWith(rootWithSep)) continue;
    return abs;
  }
  throw new Error(`No entry file found for piece bundle at ${pieceDir}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Identify the piece by constructor name (their own loader's check), falling
// back to structure for bundles minified without keepNames. No `instanceof`.
function findPiece(
  mod: Record<string, unknown>,
): Pick<LoadedPiece, "piece" | "check"> | undefined {
  const candidates: unknown[] = [
    ...Object.values(mod),
    ...(isRecord(mod.default) ? Object.values(mod.default) : []),
    mod.default,
  ];
  for (const candidate of candidates) {
    // `constructor?.name`: a bundle may export an Object.create(null), and the
    // real piece is usually beside it in the same module.
    if (isRecord(candidate) && candidate.constructor?.name === "Piece") {
      return {
        piece: candidate as unknown as ApPiece,
        check: "constructor-name",
      };
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
      return { piece: candidate as unknown as ApPiece, check: "structural" };
    }
  }
  return undefined;
}

// A module the piece names and node cannot find. Dependencies are installed
// with scripts disabled, so a native or downloaded one looks like this.
function missingModule(entryPath: string, error: unknown): Error | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
    return undefined;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Piece at ${entryPath} could not be loaded: it imports a module that is ` +
      `not there. Its dependencies are installed with lifecycle scripts ` +
      `disabled, so one that compiles or downloads on install -- a native ` +
      `addon, a browser download -- cannot be prepared here. ${detail}`,
  );
}

// ESM-first `import()` — Node's CJS interop handles the typical CJS bundle —
// with a `require` fallback.
export async function loadPiece(entryPath: string): Promise<LoadedPiece> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(
      /* @vite-ignore */ pathToFileURL(entryPath).href
    )) as Record<string, unknown>;
  } catch (imported) {
    try {
      const require = createRequire(import.meta.url);
      mod = require(entryPath) as Record<string, unknown>;
    } catch (required) {
      // The import's error names the missing module; require's often names
      // only the entry it was handed.
      throw (
        missingModule(entryPath, imported) ??
        missingModule(entryPath, required) ??
        required
      );
    }
  }
  const found = findPiece(mod);
  if (!found) {
    throw new Error(
      `No Piece export found in ${entryPath}. Export keys: ${Object.keys(mod).join(", ")}`,
    );
  }
  return { ...found, entryPath };
}

export async function loadPieceFromDir(pieceDir: string): Promise<LoadedPiece> {
  return loadPiece(resolveEntry(pieceDir));
}
