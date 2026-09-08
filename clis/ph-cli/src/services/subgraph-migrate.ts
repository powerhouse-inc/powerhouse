import {
  analyzeLegacySubgraph,
  type LegacySubgraphAnalysis,
} from "@powerhousedao/codegen/migration";
import { renderCodeFirstSubgraph } from "document-model/tooling";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  assertNoSymlinks,
  createRelativeSymlinkErrorFactory,
  isVisibleDirectoryBasename,
  relativePathWithin,
  sha256Digest,
  snapshotFileTree,
  toPosixPath,
  writeFileIfAbsentOrEqual,
} from "./file-tree.js";

/**
 * `ph subgraph migrate` is the subgraph half of the code-first migration. It
 * mirrors `ph model migrate`: report-only by default, and `--apply` writes a
 * candidate beside the legacy source without replacing it.
 *
 * The candidate lands under `subgraphs/.verification/<name>/`, which no package
 * loader scans. That matters more for subgraphs than for models: the host keeps
 * the *first* registration for a duplicate subgraph name and logs nothing an
 * author would notice, so a second top-level export would silently shadow the
 * legacy class instead of failing.
 */
export type SubgraphMigrationReport = {
  readonly kind: "powerhouse.subgraph-migration";
  readonly formatVersion: 1;
  readonly operation: "to-code";
  readonly status: "ready" | "applied" | "blocked" | "failed";
  readonly subgraph: string;
  readonly packageRoot: ".";
  readonly legacyRoot: string;
  readonly candidateRoot: string;
  readonly sourceTreeDigest: `sha256:${string}` | null;
  readonly outputTreeDigest: `sha256:${string}` | null;
  /** The registered instance and route segment name, read from the class. */
  readonly subgraphName: string | null;
  readonly className: string | null;
  readonly schemaKind: "graphql-ast-compat" | null;
  /** The exact legacy value; `null` records an undeclared field. */
  readonly hasSubscriptions: boolean | null;
  readonly typeDefsSource: string | null;
  readonly resolversSource: string | null;
  readonly droppedMembers: readonly string[];
  readonly proposedWrites: readonly string[];
  readonly unmovedLegacyPaths: readonly string[];
  readonly diagnostics: readonly {
    readonly code: `PH-MIGRATE-SUBGRAPH-${string}`;
    readonly severity: "error" | "warning";
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly repair: string;
  }[];
};

class SubgraphMigrationError extends Error {
  constructor(
    readonly code: `PH-MIGRATE-SUBGRAPH-${string}`,
    message: string,
  ) {
    super(message);
    this.name = "SubgraphMigrationError";
  }
}

function baseReport(request: {
  readonly subgraph: string;
  readonly legacyRoot: string;
  readonly candidateRoot: string;
}) {
  return {
    kind: "powerhouse.subgraph-migration" as const,
    formatVersion: 1 as const,
    operation: "to-code" as const,
    subgraph: request.subgraph,
    packageRoot: "." as const,
    legacyRoot: request.legacyRoot,
    candidateRoot: request.candidateRoot,
  };
}

function emptyResult() {
  return {
    sourceTreeDigest: null,
    outputTreeDigest: null,
    subgraphName: null,
    className: null,
    schemaKind: null,
    hasSubscriptions: null,
    typeDefsSource: null,
    resolversSource: null,
    droppedMembers: [] as const,
    proposedWrites: [] as const,
    unmovedLegacyPaths: [] as const,
  };
}

function failedReport(request: {
  readonly subgraph: string;
  readonly legacyRoot: string;
  readonly candidateRoot: string;
  readonly code: `PH-MIGRATE-SUBGRAPH-${string}`;
  readonly message: string;
  readonly repair?: string;
}): SubgraphMigrationReport {
  return {
    ...baseReport(request),
    ...emptyResult(),
    status: "failed",
    diagnostics: [
      {
        code: request.code,
        severity: "error",
        path: [],
        message: request.message,
        repair:
          request.repair ??
          "Resolve the reported precondition and rerun without a force flag.",
      },
    ],
  };
}

export function subgraphMigrationArgumentFailure(request: {
  readonly subgraph: string;
  readonly code: `PH-MIGRATE-SUBGRAPH-${string}`;
  readonly message: string;
}): SubgraphMigrationReport {
  return failedReport({
    subgraph: request.subgraph,
    legacyRoot: `subgraphs/${request.subgraph}`,
    candidateRoot: `subgraphs/.verification/${request.subgraph}`,
    code: request.code,
    message: request.message,
  });
}

/**
 * Locates the legacy module for one subgraph directory.
 *
 * Only `index.ts` is accepted. The legacy scaffold, the aggregate export
 * builder, and every package loader all treat `<dir>/index.ts` as the module
 * that declares the class, so guessing another file would migrate something the
 * host does not register.
 */
async function legacyModulePath(
  legacyRoot: string,
  legacyRelative: string,
): Promise<string> {
  const candidate = resolve(legacyRoot, "index.ts");
  const candidateRelative = `${legacyRelative}/index.ts`;
  try {
    const stats = await lstat(candidate);
    if (stats.isSymbolicLink()) {
      throw new SubgraphMigrationError(
        "PH-MIGRATE-SUBGRAPH-SYMLINK",
        "The legacy subgraph module is a symbolic link.",
      );
    }
    if (!stats.isFile()) {
      throw new SubgraphMigrationError(
        "PH-MIGRATE-SUBGRAPH-MODULE-NOT-FILE",
        `${candidateRelative} is not a file.`,
      );
    }
    return candidate;
  } catch (cause) {
    if (cause instanceof SubgraphMigrationError) throw cause;
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SubgraphMigrationError(
        "PH-MIGRATE-SUBGRAPH-MODULE-NOT-FOUND",
        `No legacy subgraph module was found at ${candidateRelative}.`,
      );
    }
    throw cause;
  }
}

function describeTypeDefs(analysis: LegacySubgraphAnalysis): string | null {
  const source = analysis.typeDefs;
  if (!source) return null;
  return source.kind === "gql-source"
    ? `gql-source ${source.binding.importSpecifier}`
    : `document ${source.binding.importSpecifier}`;
}

function describeResolvers(analysis: LegacySubgraphAnalysis): string | null {
  const source = analysis.resolvers;
  if (!source) return null;
  return `${source.kind} ${source.binding.importSpecifier}`;
}

export async function runSubgraphToCodeMigration(request: {
  readonly subgraph: string;
  readonly apply: boolean;
  readonly packageRoot?: string;
}): Promise<SubgraphMigrationReport> {
  const packageRoot = await realpath(
    resolve(request.packageRoot ?? process.cwd()),
  );
  const legacyRoot = resolve(packageRoot, "subgraphs", request.subgraph);
  const candidateRoot = resolve(
    packageRoot,
    "subgraphs",
    ".verification",
    request.subgraph,
  );
  const legacyRelative = relativePathWithin(packageRoot, legacyRoot);
  const candidateRelative = relativePathWithin(packageRoot, candidateRoot);
  if (!isVisibleDirectoryBasename(request.subgraph)) {
    return failedReport({
      subgraph: request.subgraph,
      legacyRoot: legacyRelative ?? "<outside>",
      candidateRoot: candidateRelative ?? "<outside>",
      code: "PH-MIGRATE-SUBGRAPH-NAME-RESERVED",
      message:
        "The subgraph must be one directory name other than .verification.",
      repair: "Pass one legacy directory name from subgraphs/.",
    });
  }
  if (legacyRelative === null || candidateRelative === null) {
    return failedReport({
      subgraph: request.subgraph,
      legacyRoot: String(legacyRelative),
      candidateRoot: String(candidateRelative),
      code: "PH-MIGRATE-SUBGRAPH-PATH-OUTSIDE-PACKAGE",
      message: "Migration roots must stay inside the package root.",
    });
  }
  try {
    const sourceSymlinkError = createRelativeSymlinkErrorFactory(
      packageRoot,
      "Source path",
      (message) =>
        new SubgraphMigrationError("PH-MIGRATE-SUBGRAPH-SYMLINK", message),
    );
    await assertNoSymlinks(packageRoot, legacyRoot, sourceSymlinkError);
    if (!(await lstat(legacyRoot)).isDirectory()) {
      throw new SubgraphMigrationError(
        "PH-MIGRATE-SUBGRAPH-ROOT-NOT-DIRECTORY",
        `Legacy subgraph root ${legacyRelative} is not a directory.`,
      );
    }
    const sourcePath = await legacyModulePath(legacyRoot, legacyRelative);
    const analysis = analyzeLegacySubgraph({
      sourcePath,
      candidateDirectory: candidateRoot,
    });
    const legacyTree = await snapshotFileTree(legacyRoot, sourceSymlinkError);
    const unmovedLegacyPaths = legacyTree.files.map((path) =>
      toPosixPath(relative(packageRoot, path)),
    );
    const sourceTreeDigest = legacyTree.digest;
    const blocking = analysis.diagnostics.filter(
      ({ severity }) => severity === "error",
    );

    // Report every blocker at once. A migration that stopped at the first one
    // would need as many runs as the class has unsupported members.
    if (
      blocking.length > 0 ||
      analysis.name === null ||
      analysis.className === null ||
      analysis.typeDefs === null ||
      analysis.resolvers === null
    ) {
      return {
        ...baseReport({
          subgraph: request.subgraph,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
        }),
        ...emptyResult(),
        status: "blocked",
        sourceTreeDigest,
        subgraphName: analysis.name,
        className: analysis.className,
        hasSubscriptions: analysis.hasSubscriptions ?? null,
        typeDefsSource: describeTypeDefs(analysis),
        resolversSource: describeResolvers(analysis),
        droppedMembers: analysis.droppedMembers,
        unmovedLegacyPaths,
        diagnostics: analysis.diagnostics,
      };
    }

    const source = renderCodeFirstSubgraph({
      name: analysis.name,
      exportName: analysis.className,
      typeDefs: analysis.typeDefs,
      resolvers: analysis.resolvers,
      hasSubscriptions: analysis.hasSubscriptions,
    });
    const candidatePath = resolve(candidateRoot, "index.ts");
    const reportPath = resolve(candidateRoot, "migration-report.json");

    const report: SubgraphMigrationReport = {
      ...baseReport({
        subgraph: request.subgraph,
        legacyRoot: legacyRelative,
        candidateRoot: candidateRelative,
      }),
      status: request.apply ? "applied" : "ready",
      sourceTreeDigest,
      outputTreeDigest: sha256Digest(source),
      subgraphName: analysis.name,
      className: analysis.className,
      schemaKind: "graphql-ast-compat",
      hasSubscriptions: analysis.hasSubscriptions ?? null,
      typeDefsSource: describeTypeDefs(analysis),
      resolversSource: describeResolvers(analysis),
      droppedMembers: analysis.droppedMembers,
      proposedWrites: [
        toPosixPath(relative(packageRoot, candidatePath)),
        toPosixPath(relative(packageRoot, reportPath)),
      ],
      unmovedLegacyPaths,
      diagnostics: [
        ...analysis.diagnostics,
        {
          code: "PH-MIGRATE-SUBGRAPH-LEGACY-ACTIVE" as const,
          severity: "warning" as const,
          path: [],
          message:
            "The legacy class remains the registered subgraph; the candidate is reachable only from the verification subpath.",
          repair:
            "Keep the legacy source until parity, activation, and rollback evidence pass for this subgraph.",
        },
      ],
    };

    if (request.apply) {
      const candidateSymlinkError = createRelativeSymlinkErrorFactory(
        packageRoot,
        "Candidate path",
        (message) =>
          new SubgraphMigrationError(
            "PH-MIGRATE-SUBGRAPH-CANDIDATE-SYMLINK",
            message,
          ),
      );
      await Promise.all([
        assertNoSymlinks(packageRoot, candidatePath, candidateSymlinkError),
        assertNoSymlinks(packageRoot, reportPath, candidateSymlinkError),
      ]);
      await mkdir(candidateRoot, { recursive: true });
      if (
        !(await writeFileIfAbsentOrEqual(
          packageRoot,
          candidatePath,
          source,
          candidateSymlinkError,
        ))
      ) {
        return failedReport({
          subgraph: request.subgraph,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
          code: "PH-MIGRATE-SUBGRAPH-CANDIDATE-DRIFT",
          message:
            "The verification candidate exists with different content; no file was overwritten.",
          repair:
            "Review the existing candidate, remove it if it is stale, then rerun with --apply.",
        });
      }
      if (
        !(await writeFileIfAbsentOrEqual(
          packageRoot,
          reportPath,
          `${JSON.stringify(report, null, 2)}\n`,
          candidateSymlinkError,
        ))
      ) {
        return failedReport({
          subgraph: request.subgraph,
          legacyRoot: legacyRelative,
          candidateRoot: candidateRelative,
          code: "PH-MIGRATE-SUBGRAPH-REPORT-DRIFT",
          message:
            "The migration report exists with different content; no file was overwritten.",
          repair:
            "Review the existing report, remove it if it is stale, then rerun with --apply.",
        });
      }
    }
    return report;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return failedReport({
      subgraph: request.subgraph,
      legacyRoot: legacyRelative,
      candidateRoot: candidateRelative,
      code: missing
        ? "PH-MIGRATE-SUBGRAPH-MODULE-NOT-FOUND"
        : error instanceof SubgraphMigrationError
          ? error.code
          : "PH-MIGRATE-SUBGRAPH-CONVERSION-FAILED",
      message: missing
        ? `No legacy subgraph was found at ${legacyRelative}.`
        : error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

export function subgraphMigrationExitCode(
  report: SubgraphMigrationReport,
): 0 | 1 | 2 {
  if (report.status === "ready" || report.status === "applied") return 0;
  // 1 marks a legacy source the migration understood but cannot convert; 2
  // marks a precondition the author must fix before analysis is meaningful.
  return report.status === "blocked" ? 1 : 2;
}

export function renderSubgraphMigrationReport(
  report: SubgraphMigrationReport,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  if (report.status === "failed" || report.status === "blocked") {
    process.stderr.write(`to-code ${report.status}: ${report.subgraph}\n`);
    for (const diagnostic of report.diagnostics) {
      if (diagnostic.severity !== "error") continue;
      const at =
        diagnostic.path.length > 0 ? ` at ${diagnostic.path.join(".")}` : "";
      process.stderr.write(
        `ERROR ${diagnostic.code}${at}\n${diagnostic.message}\nRepair: ${diagnostic.repair}\n`,
      );
    }
    return;
  }
  process.stdout.write(
    `to-code ${report.status}: ${report.subgraph} (${report.className} as ${report.schemaKind})\n`,
  );
  process.stdout.write(
    `  name: ${report.subgraphName}\n  hasSubscriptions: ${report.hasSubscriptions ?? "undeclared"}\n  typeDefs: ${report.typeDefsSource}\n  resolvers: ${report.resolversSource}\n`,
  );
  if (report.droppedMembers.length > 0) {
    process.stdout.write(
      `  dropped members: ${report.droppedMembers.join(", ")}\n`,
    );
  }
  for (const path of report.proposedWrites) {
    process.stdout.write(
      `  ${report.status === "applied" ? "wrote" : "would write"} ${path}\n`,
    );
  }
  for (const diagnostic of report.diagnostics) {
    process.stdout.write(
      `  WARNING ${diagnostic.code} ${diagnostic.message}\n`,
    );
  }
}
