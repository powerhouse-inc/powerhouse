import { readFileSync } from "node:fs";
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
  for (const candidate of candidates) {
    if (!candidate) continue;
    const abs = path.resolve(pieceDir, candidate);
    try {
      readFileSync(abs);
      return abs;
    } catch {
      // try the next candidate
    }
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
    if (isRecord(candidate) && candidate.constructor.name === "Piece") {
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

// ESM-first `import()` — Node's CJS interop handles the typical CJS bundle —
// with a `require` fallback.
export async function loadPiece(entryPath: string): Promise<LoadedPiece> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */pathToFileURL(entryPath).href)) as Record<
      string,
      unknown
    >;
  } catch {
    const require = createRequire(import.meta.url);
    mod = require(entryPath) as Record<string, unknown>;
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
