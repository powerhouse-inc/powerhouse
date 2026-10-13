import {
  cpSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { toPosixPath } from "./package-revision.js";
import { canonicalPath, pathWithin } from "./paths.js";
import { filesIn, relocateSourceMap } from "./source-maps.js";

type Emitted = {
  readonly from: string;
  // The path its map resolves sources from: where tsc would write it.
  readonly servedAt: string;
  readonly configured: string;
};

// One declaration tsc emitted into the scratch directory, and where the
// build puts it.
export type PlacedDeclaration =
  // Configured under the output directory: promotion delivers it there.
  | (Emitted & { readonly kind: "output"; readonly inCandidate: string })
  // Configured outside the output directory, resolving into it through a
  // symlink: promotion delivers it, and its configured spelling is an alias.
  | (Emitted & {
      readonly kind: "resolvedIntoOutput";
      readonly inCandidate: string;
      readonly target: string;
      readonly aliases: readonly string[];
    })
  // Written into the package outside the output directory after promotion.
  | (Emitted & {
      readonly kind: "external";
      readonly packagePath: string;
      readonly target: string;
      readonly aliases: readonly string[];
    });

export type DeclarationRoots = {
  readonly candidateRoot: string;
  readonly declarationsRoot: string;
};

type DeclarationPlan =
  | {
      readonly ok: true;
      readonly declarations: readonly PlacedDeclaration[];
    }
  | { readonly ok: false; readonly summary: string };

export function planDeclarations(request: {
  readonly packageRoot: string;
  readonly outDir: string;
  readonly emittedRoot: string;
  readonly directory: string | null;
  readonly inputs: readonly string[];
  readonly scratch: string;
}): DeclarationPlan {
  const declarations: PlacedDeclaration[] = [];
  const claimed = new Map<string, string>();
  const { directory, packageRoot } = request;
  if (directory === null) return { ok: true, declarations };
  const configuredOutput = resolve(packageRoot, request.outDir);
  const output = canonicalPath(configuredOutput);
  // Whether spellings that differ only in case name one input, as tsc
  // decides for the package's file system.
  const spelling = caseInsensitive(packageRoot)
    ? (path: string) => path.toLowerCase()
    : (path: string) => path;
  const listed = new Set(request.inputs.map(spelling));
  let canonicalInputs: ReadonlySet<string> | undefined;
  const isCanonicalInput = (path: string): boolean =>
    (canonicalInputs ??= new Set(request.inputs.map(resolvedOrSelf))).has(path);
  const refuse = (summary: string): DeclarationPlan => ({ ok: false, summary });
  for (const file of filesIn(request.emittedRoot)) {
    if (!/\.d\.[cm]?ts(?:\.map)?$/.test(file)) continue;
    const configured = join(directory, file);
    const from = join(request.emittedRoot, file);
    const overwrites = (): DeclarationPlan =>
      refuse(
        `tsc would overwrite the input ${JSON.stringify(configured)} with its declaration (TS5055).`,
      );
    // Promotion replaces the output directory whole, so a declaration
    // configured under it lands there, wherever a symlink inside it led, and
    // only its configured spelling can clash, as tsc compares it.
    const underOutput = pathWithin(configuredOutput, configured);
    if (underOutput !== null) {
      if (listed.has(spelling(configured))) return overwrites();
      declarations.push({
        kind: "output",
        from,
        servedAt: configured,
        configured,
        inCandidate: underOutput,
      });
      continue;
    }
    let target: string;
    try {
      target = canonicalPath(configured);
    } catch (error) {
      return refuse(
        `The declaration path ${JSON.stringify(configured)} cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const inPackage = pathWithin(packageRoot, target);
    if (inPackage === null) {
      return refuse(
        `tsc would write the declaration ${JSON.stringify(configured)} outside the package.`,
      );
    }
    if (pathWithin(request.scratch, target) !== null) {
      return refuse(
        `tsc would write the declaration ${JSON.stringify(configured)} inside ${toPosixPath(relative(packageRoot, request.scratch))}, which every build clears.`,
      );
    }
    if (listed.has(spelling(configured))) return overwrites();
    if (isCanonicalInput(target)) {
      return refuse(
        `The declaration ${JSON.stringify(configured)} would overwrite the input ${JSON.stringify(target)} through a symlink.`,
      );
    }
    if (statSync(target, { throwIfNoEntry: false })?.isFile() === false) {
      return refuse(
        `tsc would write the declaration ${JSON.stringify(configured)} where a directory stands.`,
      );
    }
    const rival = claimed.get(spelling(target));
    if (rival !== undefined) {
      return refuse(
        `The declarations ${JSON.stringify(rival)} and ${JSON.stringify(configured)} resolve to one file, ${JSON.stringify(target)}; which one tsc leaves there depends on its emit order.`,
      );
    }
    claimed.set(spelling(target), configured);
    const servedAt =
      pathWithin(packageRoot, configured) === null ? target : configured;
    const inOutput = pathWithin(output, target);
    const packagePath = toPosixPath(inPackage);
    // The package revision walks a declaration under its configured
    // spelling too when a symlink in the package leads there; any other
    // symlink to it only makes prepack rerun the check.
    const configuredSpelling =
      servedAt === configured
        ? toPosixPath(relative(packageRoot, configured))
        : undefined;
    if (inOutput !== null) {
      declarations.push({
        kind: "resolvedIntoOutput",
        from,
        servedAt,
        configured,
        inCandidate: inOutput,
        target,
        aliases: configuredSpelling === undefined ? [] : [configuredSpelling],
      });
    } else {
      declarations.push({
        kind: "external",
        from,
        servedAt,
        configured,
        packagePath,
        target,
        aliases:
          configuredSpelling === undefined || configuredSpelling === packagePath
            ? []
            : [configuredSpelling],
      });
    }
  }
  return { ok: true, declarations };
}

function revisionPaths(declaration: PlacedDeclaration): readonly string[] {
  switch (declaration.kind) {
    case "output":
      return [];
    case "resolvedIntoOutput":
      return declaration.aliases;
    case "external":
      return [declaration.packagePath, ...declaration.aliases];
  }
}

export function publishedPaths(
  declarations: readonly PlacedDeclaration[],
): string[] {
  return declarations.flatMap(revisionPaths).sort();
}

// The copy promotion delivers, or writes, and the landing check compares.
function stagedCopy(
  declaration: PlacedDeclaration,
  roots: DeclarationRoots,
): string {
  return declaration.kind === "external"
    ? join(roots.declarationsRoot, declaration.packagePath)
    : join(roots.candidateRoot, declaration.inCandidate);
}

function copiesOf(
  declaration: PlacedDeclaration,
  roots: DeclarationRoots,
): string[] {
  return [
    stagedCopy(declaration, roots),
    ...(declaration.kind === "output" ? [] : declaration.aliases).map((alias) =>
      join(roots.declarationsRoot, alias),
    ),
  ];
}

export function stageDeclarations(
  declarations: readonly PlacedDeclaration[],
  roots: DeclarationRoots,
): void {
  for (const declaration of declarations) {
    const { from, servedAt } = declaration;
    for (const to of copiesOf(declaration, roots)) {
      mkdirSync(dirname(to), { recursive: true });
      if (from.endsWith(".map")) {
        writeFileSync(
          to,
          relocateSourceMap(
            readFileSync(from, "utf8"),
            dirname(from),
            dirname(servedAt),
          ),
        );
      } else {
        cpSync(from, to);
      }
    }
  }
}

type Resolved = Exclude<PlacedDeclaration, { readonly kind: "output" }>;

function isResolved(declaration: PlacedDeclaration): declaration is Resolved {
  return declaration.kind !== "output";
}

export function movedDeclaration(
  declarations: readonly PlacedDeclaration[],
): Resolved | undefined {
  return declarations
    .filter(isResolved)
    .find(({ configured, target }) => resolvesElsewhere(configured, target));
}

export function writeOutsideOutput(
  declarations: readonly PlacedDeclaration[],
  roots: DeclarationRoots,
): void {
  for (const declaration of declarations) {
    if (declaration.kind !== "external") continue;
    mkdirSync(dirname(declaration.target), { recursive: true });
    cpSync(stagedCopy(declaration, roots), declaration.target);
  }
}

// What a consumer reads at the configured path must be what this build
// wrote, not a file an earlier build left there.
export function unlandedDeclaration(
  declarations: readonly PlacedDeclaration[],
  roots: DeclarationRoots,
): Resolved | undefined {
  return declarations.filter(isResolved).find((declaration) => {
    try {
      return !readFileSync(declaration.configured).equals(
        readFileSync(stagedCopy(declaration, roots)),
      );
    } catch {
      return true;
    }
  });
}

function resolvedOrSelf(path: string): string {
  try {
    return canonicalPath(path);
  } catch {
    return path;
  }
}

// Probed inside the package, the file system tsc's inputs live on: an
// ancestor on another mount may treat case differently.
export function caseInsensitive(packageRoot: string): boolean {
  const options = { bigint: true, throwIfNoEntry: false } as const;
  const lower = statSync(join(packageRoot, "package.json"), options);
  const upper = statSync(join(packageRoot, "PACKAGE.JSON"), options);
  return (
    lower !== undefined &&
    upper !== undefined &&
    lower.ino === upper.ino &&
    lower.dev === upper.dev
  );
}

function resolvesElsewhere(configured: string, target: string): boolean {
  try {
    return (
      canonicalPath(configured) !== target ||
      statSync(target, { throwIfNoEntry: false })?.isFile() === false
    );
  } catch {
    return true;
  }
}
