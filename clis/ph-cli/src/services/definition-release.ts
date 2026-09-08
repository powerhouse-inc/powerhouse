import type {
  DefinitionCheckReport,
  DefinitionSourceDiagnostic,
  DefinitionSourceLoadResult,
  TypeScriptSourceImportInterface,
} from "document-model/tooling";
import {
  canonicalJson,
  DefinitionSourceLoader,
  isCanonicalDefinitionSource,
  isSha256Digest,
  normalizeDefinitions,
} from "document-model/tooling";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { isPlainObject as isRecord } from "remeda";
import {
  createDefinitionPackageRevision,
  runDefinitionCheck,
  type DefinitionSourceCommandArgs,
} from "./definition-check.js";
import { NodeBuildTypeScriptSourceImportAdapter } from "./definition-import-build.js";
import { renderDefinitionReport } from "./definition-output.js";

const RETAINED_REPORT_NAME = "definition-check.release.json";

const DEFINITION_PHASES = new Set([
  "configuration",
  "import",
  "definition",
  "composition",
  "authorization",
  "typecheck",
  "package",
  "replay",
]);

type RetainedDefinitionEntry = DefinitionCheckReport["definitions"][number] & {
  readonly digest: `sha256:${string}`;
};

export type RetainedDefinitionCheckV1 = {
  readonly kind: "powerhouse.retained-definition-check";
  readonly formatVersion: 1;
  readonly packageRevision: `sha256:${string}`;
  readonly sourceSetDigest: `sha256:${string}`;
  readonly contributesReleaseEvidence: boolean;
  readonly report: DefinitionCheckReport;
};

function isDiagnosticPath(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (segment) =>
        typeof segment === "string" ||
        (typeof segment === "number" &&
          Number.isSafeInteger(segment) &&
          segment >= 0),
    )
  );
}

function isDiagnosticText(value: unknown): value is string {
  return typeof value === "string" && [...value].length <= 512;
}

function isDefinitionIdentity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    ["document-model", "subgraph", "scalar", "package"].includes(
      String(value.kind),
    ) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    (value.version === undefined ||
      (Number.isSafeInteger(value.version) && Number(value.version) > 0))
  );
}

function isRelatedDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCanonicalDefinitionSource(value.source) &&
    isDiagnosticPath(value.path) &&
    isDiagnosticText(value.message)
  );
}

function isDefinitionDiagnostic(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    /^PH-[A-Z0-9-]+$/.test(value.code) &&
    (value.severity === "error" || value.severity === "warning") &&
    DEFINITION_PHASES.has(String(value.phase)) &&
    isDiagnosticPath(value.path) &&
    isDiagnosticText(value.message) &&
    isDiagnosticText(value.repair) &&
    (value.expected === undefined || isDiagnosticText(value.expected)) &&
    (value.received === undefined || isDiagnosticText(value.received)) &&
    (value.source === undefined || isCanonicalDefinitionSource(value.source)) &&
    (value.definition === undefined ||
      isDefinitionIdentity(value.definition)) &&
    (value.related === undefined ||
      (Array.isArray(value.related) &&
        value.related.every(isRelatedDiagnostic)))
  );
}

function isDefinitionEntry(value: unknown): value is RetainedDefinitionEntry {
  if (!isRecord(value)) return false;
  return (
    ["document-model", "subgraph", "scalar", "package"].includes(
      String(value.kind),
    ) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    isCanonicalDefinitionSource(value.source) &&
    (value.kind === "document-model"
      ? Number.isSafeInteger(value.version) && Number(value.version) > 0
      : value.version === undefined) &&
    isSha256Digest(value.digest)
  );
}

function isRetainedDefinitionCheck(
  value: unknown,
): value is RetainedDefinitionCheckV1 {
  if (!isRecord(value) || !isRecord(value.report)) return false;
  const report = value.report;
  if (!isRecord(report.sourceSet) || !isRecord(report.summary)) return false;
  const sourceSet = report.sourceSet;
  const status = report.status;
  const diagnostics = report.diagnostics;
  const definitions = report.definitions;
  if (
    value.kind !== "powerhouse.retained-definition-check" ||
    value.formatVersion !== 1 ||
    !isSha256Digest(value.packageRevision) ||
    !isSha256Digest(value.sourceSetDigest) ||
    typeof value.contributesReleaseEvidence !== "boolean" ||
    report.kind !== "powerhouse.definition-check" ||
    report.formatVersion !== 1 ||
    report.profile !== "release" ||
    (status !== "ok" && status !== "skipped") ||
    (sourceSet.mode !== "code-first" && sourceSet.mode !== "legacy") ||
    !["config", "cli"].includes(String(sourceSet.origin)) ||
    !isSha256Digest(sourceSet.digest) ||
    !Array.isArray(sourceSet.sources) ||
    !sourceSet.sources.every(isCanonicalDefinitionSource) ||
    !Array.isArray(definitions) ||
    !definitions.every(isDefinitionEntry) ||
    !Array.isArray(diagnostics) ||
    !diagnostics.every(isDefinitionDiagnostic) ||
    !Number.isSafeInteger(report.summary.errors) ||
    Number(report.summary.errors) < 0 ||
    !Number.isSafeInteger(report.summary.warnings) ||
    Number(report.summary.warnings) < 0 ||
    value.sourceSetDigest !== sourceSet.digest ||
    value.contributesReleaseEvidence !== (status === "ok") ||
    (sourceSet.mode === "code-first" && sourceSet.sources.length === 0) ||
    (sourceSet.mode === "legacy" && sourceSet.sources.length > 0)
  ) {
    return false;
  }
  const errors = diagnostics.filter(
    (diagnostic) => isRecord(diagnostic) && diagnostic.severity === "error",
  ).length;
  const warnings = diagnostics.length - errors;
  if (
    report.summary.errors !== errors ||
    report.summary.warnings !== warnings
  ) {
    return false;
  }
  const sourceKeys = new Set(
    sourceSet.sources.map((source) => canonicalJson(source)),
  );
  const definitionSourceKeys = new Set(
    definitions.map((definition) => canonicalJson(definition.source)),
  );
  if (
    sourceKeys.size !== sourceSet.sources.length ||
    [...definitionSourceKeys].some((source) => !sourceKeys.has(source)) ||
    (status === "ok" &&
      [...sourceKeys].some((source) => !definitionSourceKeys.has(source)))
  ) {
    return false;
  }
  const logicalKeys = new Set(
    definitions.map(
      (definition) =>
        `${definition.kind}\0${definition.key}\0${definition.version ?? ""}`,
    ),
  );
  if (logicalKeys.size !== definitions.length) return false;
  return status === "ok"
    ? report.skipReason === undefined &&
        errors === 0 &&
        sourceSet.mode === "code-first" &&
        definitions.length > 0
    : report.skipReason === "explicit-legacy-mode" &&
        sourceSet.mode === "legacy" &&
        sourceSet.origin === "config" &&
        sourceSet.sources.length === 0 &&
        definitions.length === 0 &&
        diagnostics.length === 0;
}

function missingSources(report: DefinitionCheckReport): boolean {
  return (
    report.status === "failed" &&
    report.diagnostics.length === 1 &&
    report.diagnostics[0]?.code === "PH-CONFIG-SOURCES-MISSING"
  );
}

function releaseFailure(
  loadResult: DefinitionSourceLoadResult,
  diagnostic: DefinitionSourceDiagnostic,
): DefinitionCheckReport {
  return normalizeDefinitions({
    formatVersion: 1,
    profile: "release",
    loadResult: {
      ...loadResult,
      status: "failed",
      diagnostics: [...loadResult.diagnostics, diagnostic],
      values: [],
    },
  }).report;
}

function retainedReportPath(packageRoot: string, outDir: string): string {
  return resolve(packageRoot, outDir, RETAINED_REPORT_NAME);
}

export async function runBuildDefinitionCheck(
  args: DefinitionSourceCommandArgs & {
    readonly outDir: string;
    readonly additionalOutputDirectories?: readonly string[];
  },
): Promise<DefinitionCheckReport | undefined> {
  const importer = new NodeBuildTypeScriptSourceImportAdapter();
  try {
    const report = await runDefinitionCheck(
      {
        ...args,
        outputDirectories: [
          "dist",
          args.outDir,
          ...(args.additionalOutputDirectories ?? []),
        ],
        profile: "release",
      },
      { importer },
    );
    if (missingSources(report)) {
      process.stderr.write(
        "Deprecated compatibility path: no definitionSources field is configured; continuing this legacy build. Add explicit legacy mode before the compatibility window closes.\n",
      );
      return undefined;
    }
    if (report.status === "skipped") {
      process.stderr.write(
        "Definition check skipped by explicit legacy mode; this build contributes no code-first release evidence.\n",
      );
      return report;
    }
    if (report.status !== "ok") {
      renderDefinitionReport(report, false);
      throw new Error(
        `Release definition check ${report.status} before bundle output.`,
      );
    }
    process.stdout.write(
      `✔ Release definitions checked (${report.definitions.length})\n`,
    );
    return report;
  } finally {
    await importer.close();
  }
}

export async function retainReleaseDefinitionCheck(request: {
  readonly configFile: string;
  readonly outDir: string;
  readonly additionalOutputDirectories?: readonly string[];
  readonly report: DefinitionCheckReport | undefined;
}): Promise<void> {
  if (!request.report) return;
  const configFile = resolve(request.configFile);
  const packageRoot = dirname(configFile);
  const packageRevision = await createDefinitionPackageRevision({
    configFile,
    outputDirectories: [
      "dist",
      request.outDir,
      ...(request.additionalOutputDirectories ?? []),
    ],
  });
  const retained: RetainedDefinitionCheckV1 = {
    kind: "powerhouse.retained-definition-check",
    formatVersion: 1,
    packageRevision,
    sourceSetDigest: request.report.sourceSet.digest,
    contributesReleaseEvidence: request.report.status === "ok",
    report: request.report,
  };
  const path = retainedReportPath(packageRoot, request.outDir);
  mkdirSync(dirname(path), { recursive: true });
  const stagingPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(stagingPath, `${JSON.stringify(retained)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(stagingPath, path);
  } finally {
    rmSync(stagingPath, { force: true });
  }
}

function invalidRetainedReport(
  loadResult: DefinitionSourceLoadResult,
  code: `PH-${string}`,
  message: string,
  repair: string,
): DefinitionCheckReport {
  return releaseFailure(loadResult, {
    code,
    severity: "error",
    phase: "package",
    path: ["retainedReleaseReport"],
    message,
    repair,
  });
}

export async function consumeRetainedDefinitionCheck(request: {
  readonly configFile: string;
  readonly sources: readonly string[];
  readonly outDir?: string;
  readonly allowMissingSources?: boolean;
  readonly warningsAsErrors?: boolean;
}): Promise<DefinitionCheckReport | undefined> {
  const configFile = resolve(request.configFile);
  const importer: TypeScriptSourceImportInterface = {
    importModule: () =>
      Promise.reject(
        new Error("Retained report validation must not import source modules."),
      ),
  };
  const loader = new DefinitionSourceLoader(importer);
  const resolution = loader.resolve({
    configFile,
    cliSources: request.sources,
  });
  const loadResult: DefinitionSourceLoadResult = {
    ...resolution,
    values: [],
  };
  if (
    request.allowMissingSources === true &&
    resolution.diagnostics.length === 1 &&
    resolution.diagnostics[0]?.code === "PH-CONFIG-SOURCES-MISSING"
  ) {
    process.stderr.write(
      "Deprecated compatibility path: no definitionSources field is configured; publication continues without code-first release evidence.\n",
    );
    return undefined;
  }
  if (resolution.status === "failed") {
    return normalizeDefinitions({
      formatVersion: 1,
      profile: "release",
      loadResult,
    }).report;
  }

  const path = retainedReportPath(
    dirname(configFile),
    request.outDir ?? "dist",
  );
  if (!existsSync(path)) {
    return invalidRetainedReport(
      loadResult,
      "PH-PKG-RELEASE-REPORT-MISSING",
      "No retained release definition report exists for this package.",
      "Run ph build successfully before packing or publishing.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return invalidRetainedReport(
      loadResult,
      "PH-PKG-RELEASE-REPORT-INVALID",
      "The retained release definition report cannot be parsed.",
      "Run ph build to replace the invalid retained report.",
    );
  }

  const packageRevision = await createDefinitionPackageRevision({
    configFile,
    outputDirectories: ["dist", request.outDir ?? "dist"],
  });
  if (!isRetainedDefinitionCheck(parsed)) {
    return invalidRetainedReport(
      loadResult,
      "PH-PKG-RELEASE-REPORT-INVALID",
      "The retained release definition report has an invalid shape or inconsistent fields.",
      "Run ph build to replace the invalid retained report.",
    );
  }
  if (
    parsed.packageRevision !== packageRevision ||
    parsed.sourceSetDigest !== resolution.sourceSet.digest
  ) {
    return invalidRetainedReport(
      loadResult,
      "PH-PKG-RELEASE-REPORT-STALE",
      "The retained release definition report does not match the selected source revision.",
      "Run ph build after the latest source or configuration change.",
    );
  }
  if (
    request.warningsAsErrors === true &&
    parsed.report.status === "ok" &&
    parsed.report.summary.warnings > 0
  ) {
    return { ...parsed.report, status: "invalid" };
  }
  return parsed.report;
}
