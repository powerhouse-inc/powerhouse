import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import {
  checkProjectDefinitions,
  documentModelChecks,
  type HostValidationEvidence,
  type ProjectDefinitions,
  releaseChecks,
} from "document-model/tooling";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ScalarBinding } from "./approval.js";
import { type PackageIdentity, scalarBindings } from "./scalar-bindings.js";

/** Imports a package module through the loader that loaded its definitions. */
type PackageModules = {
  readonly importModule: (
    specifier: `./${string}`,
  ) => Promise<Readonly<Record<string, unknown>>>;
};

/** The package's scalars entry, as `ph build` bundles it and a host loads it. */
const SCALARS_ENTRY = "./scalars/index.ts";

/** What the release profile found: the report, and the evidence an approval records. */
export type ReleaseCheck = {
  readonly report: DefinitionCheckReport;
  readonly host: HostValidationEvidence;
  readonly scalars: readonly ScalarBinding[];
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const packageJson = z.looseObject({
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

function readPackageJson(path: string): z.infer<typeof packageJson> {
  try {
    const parsed = packageJson.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function packageIdentity(packageRoot: string): PackageIdentity {
  const { name, version } = readPackageJson(join(packageRoot, "package.json"));
  return { name, version };
}

/** The version of document-model the package resolves, as Node finds a bare import. */
function installedDocumentModelVersion(packageRoot: string): string | null {
  for (let directory = packageRoot; ; directory = dirname(directory)) {
    const json = readPackageJson(
      join(directory, "node_modules", "document-model", "package.json"),
    );
    if (json.version !== undefined) return json.version;
    if (dirname(directory) === directory) return null;
  }
}

/** Tool and Node messages can quote the machine path the package lives at. */
const packageRelative = (text: string, packageRoot: string) =>
  text.replaceAll(packageRoot, ".");

/**
 * Validates the models as a host that installed this package would: its
 * scalars entry builds the registry the way the host builds it, and each
 * artifact supplies the module's documentModel, definition and version.
 */
async function validateForHost(
  project: ProjectDefinitions,
  modules: PackageModules,
  identity: PackageIdentity,
): Promise<HostValidationEvidence> {
  if (identity.name === undefined) {
    return {
      completed: false,
      reason:
        "package.json has no name, and a host registers package scalars by package name",
      findings: [],
    };
  }
  let scalars: Readonly<Record<string, unknown>> = {};
  if (existsSync(join(project.packageRoot, SCALARS_ENTRY))) {
    try {
      scalars = await modules.importModule(SCALARS_ENTRY);
    } catch (error) {
      return {
        completed: false,
        reason: packageRelative(
          `${SCALARS_ENTRY} could not be loaded: ${errorMessage(error)}`,
          project.packageRoot,
        ),
        findings: [],
      };
    }
  }
  const {
    buildScalarRegistry,
    scalarExportsOf,
    validateDocumentModelsForHost,
  } = await import("@powerhousedao/reactor-api");
  const { registry } = buildScalarRegistry(
    new Map([[identity.name, scalarExportsOf(scalars)]]),
  );
  const { findings } = validateDocumentModelsForHost(
    project.artifacts.map(({ documentModel, definition, version }) => ({
      documentModel,
      definition,
      version,
    })),
    registry,
  );
  return { completed: true, findings };
}

/**
 * The release profile: the edit checks plus the release checks, over every
 * artifact, stored models included, with host validation as evidence.
 * Writes nothing.
 */
export async function checkForRelease(
  project: ProjectDefinitions,
  modules: PackageModules,
): Promise<ReleaseCheck> {
  const identity = packageIdentity(project.packageRoot);
  const host = await validateForHost(project, modules, identity);
  const report = await checkProjectDefinitions(
    { ...project, release: { host } },
    { checks: [...documentModelChecks, ...releaseChecks], profile: "release" },
  );
  return {
    report,
    host,
    scalars: scalarBindings(
      project.artifacts,
      identity,
      installedDocumentModelVersion(project.packageRoot),
    ),
  };
}
