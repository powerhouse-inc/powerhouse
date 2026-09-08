import {
  createState,
  defaultBaseState,
  type DocumentModelDefinitionV1,
  type DocumentModelModule,
  type DocumentModelSpecificationDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  DocumentModelDefinitionError,
  ph,
} from "document-model";
import {
  LegacyDocumentModelModuleAdapter,
  isSha256Digest,
  type LegacyGraphQLDocumentParserInterface,
} from "document-model/tooling";
import { parse } from "graphql";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Ajv, type AjvValidate } from "./ajv.js";
import {
  canonicalJson,
  compareCodeUnits,
  digestJson,
  firstDifference,
  normalizePath,
  readJson,
} from "./utils.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(packageRoot, "../..");

export const B1_ASSERTION_IDS = [
  "B1.schema",
  "B1.structured",
  "B1.stored-state",
  "B1.identity",
  "B1.order",
  "B1.field-options",
  "B1.state-root",
  "B1.repeat-import",
] as const;

export type B1AssertionId = (typeof B1_ASSERTION_IDS)[number];

type ModelParityCase = {
  readonly caseId: string;
  readonly rootId: string;
  readonly documentType: string;
  readonly version: number;
  readonly legacySource: string;
  readonly codeFirstSource: string;
  readonly codeFirstExport: string;
  readonly structuredGolden: string;
  readonly storedStateGolden: string;
  readonly identityVector: string;
  readonly definitionSchema: string;
};

export type ModelParityManifest = {
  readonly kind: "powerhouse.gate-fixture-manifest";
  readonly formatVersion: 1;
  readonly gate: "B1";
  readonly fixtureVersion: string;
  readonly caseCount: 10;
  readonly cases: readonly ModelParityCase[];
  readonly negativeCases: {
    readonly fieldOptions: readonly string[];
    readonly stateRoots: readonly string[];
  };
};

type IdentityVector = {
  readonly version: number;
  readonly entries: readonly {
    readonly path: readonly (string | number)[];
    readonly id: string;
  }[];
};

export type ModelParityCaseResult = {
  readonly caseId: string;
  readonly documentType: string;
  readonly version: number;
  readonly legacySource: string;
  readonly codeFirstSource: string;
  readonly structuredDigest: `sha256:${string}`;
  readonly storedStateDigest: `sha256:${string}`;
  readonly identityVectorDigest: `sha256:${string}`;
  readonly coldImportDigests: readonly [`sha256:${string}`, `sha256:${string}`];
  readonly schemaOutcome: "pass" | "fail";
  readonly firstDifference: string | null;
};

export type ModelParityAssertionResult = {
  readonly id: B1AssertionId;
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type ModelParityEvaluation = {
  readonly cases: readonly ModelParityCaseResult[];
  readonly assertions: readonly ModelParityAssertionResult[];
};

type StoredRoot = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly author: { readonly name: string; readonly website?: string | null };
  readonly specifications: readonly unknown[];
};

type StoredDocument = {
  readonly state?: { readonly global?: StoredRoot };
} & Partial<StoredRoot>;

export { canonicalJson, digestJson } from "./utils.js";

function packagePath(path: string): string {
  return resolve(packageRoot, path.replace(/^\.\//, ""));
}

function repositoryPath(path: string): string {
  return resolve(repositoryRoot, path);
}

function displayPath(path: string): string {
  return normalizePath(relative(repositoryRoot, path));
}

function atPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Readonly<Record<string | number, unknown>>)[segment];
  }
  return current;
}

function identityDifference(
  definition: DocumentModelDefinitionV1,
  vector: IdentityVector,
): string | null {
  const specification = definition.specifications.find(
    ({ version }) => version === vector.version,
  );
  if (!specification) return `$.specifications[v${vector.version}]`;
  for (const entry of vector.entries) {
    const candidate = atPath(specification, entry.path);
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      (candidate as { readonly id?: unknown }).id !== entry.id
    ) {
      return `$.specifications[v${vector.version}].${entry.path.join(".")}.id`;
    }
  }
  return null;
}

function arrayOrderProjection(
  value: unknown,
  path = "$",
  output: string[] = [],
) {
  if (Array.isArray(value)) {
    output.push(`${path}:${digestJson(value)}`);
    value.forEach((entry, index) =>
      arrayOrderProjection(entry, `${path}[${index}]`, output),
    );
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
      arrayOrderProjection(
        (value as Readonly<Record<string, unknown>>)[key],
        `${path}.${key}`,
        output,
      );
    }
  }
  return output;
}

async function coldImportDigest(
  sourcePath: string,
  exportName: string,
): Promise<`sha256:${string}`> {
  const childPath = resolve(packageRoot, "scripts/import-model-fixture.mts");
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--conditions=source",
      "--import",
      "tsx",
      childPath,
      sourcePath,
      exportName,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  const parsed = JSON.parse(stdout.trim()) as { readonly digest?: unknown };
  if (typeof parsed.digest !== "string" || !isSha256Digest(parsed.digest)) {
    throw new Error(
      `Cold import returned an invalid digest for ${exportName}.`,
    );
  }
  return parsed.digest as `sha256:${string}`;
}

function addFailure(
  failures: Map<B1AssertionId, string[]>,
  assertion: B1AssertionId,
  message: string | null,
): void {
  if (message) failures.get(assertion)?.push(message);
}

function diagnosticCode(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    typeof (error as { readonly code?: unknown }).code === "string"
  ) {
    return (error as { readonly code: string }).code;
  }
  if (error instanceof DocumentModelDefinitionError) {
    return error.diagnostics[0]?.code;
  }
  return undefined;
}

function runFieldOptionNegatives(options: readonly string[]): string[] {
  const failures: string[] = [];
  for (const option of options) {
    try {
      ph.String({ [option]: 1 } as never);
      failures.push(`${option}: accepted`);
    } catch (error) {
      const code = diagnosticCode(error);
      if (code !== "PH-DEF-FIELD-OPTION-UNSUPPORTED") {
        failures.push(`${option}: ${code ?? String(error)}`);
      }
    }
  }
  return failures;
}

function stateRootCandidate(id: string): unknown {
  const CorrectGlobal = ph.object("RootProbeState", { fields: {} });
  const WrongGlobal = ph.object("WrongState", { fields: {} });
  const WrongLocal = ph.object("WrongLocalState", { fields: {} });
  const ObjectMember = ph.object("ObjectMember", { fields: {} });
  const candidate =
    id === "missing-global"
      ? undefined
      : id === "input-global"
        ? ph.input("RootProbeState", { fields: {} })
        : id === "enum-global"
          ? ph.enum("RootProbeState", { values: ["VALUE"] as const })
          : id === "union-global"
            ? ph.union("RootProbeState", { members: [ObjectMember] })
            : id === "field-global"
              ? ph.String()
              : id === "wrong-global-name"
                ? WrongGlobal
                : CorrectGlobal;
  return {
    global: candidate,
    local: id === "wrong-local-name" ? WrongLocal : null,
  };
}

function runStateRootNegatives(caseIds: readonly string[]): string[] {
  const failures: string[] = [];
  for (const caseId of caseIds) {
    const candidate = stateRootCandidate(caseId) as {
      readonly global: unknown;
      readonly local: unknown;
    };
    try {
      const model = defineDocumentModel({
        id: `fixture/root-${caseId}`,
        name: "Root Probe",
        description: "B1 state-root negative",
        extension: "json",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: { schema: candidate.global, initialValue: {} },
          local:
            candidate.local === null
              ? { schema: null, initialValue: {} }
              : { schema: candidate.local, initialValue: {} },
        },
      } as never);
      model.finalize({ modules: [] });
      failures.push(`${caseId}: accepted`);
    } catch (error) {
      const code = diagnosticCode(error);
      if (code !== "PH-DM-STATE-ROOT-INVALID") {
        failures.push(`${caseId}: ${code ?? String(error)}`);
      }
    }
  }

  try {
    const Global = ph.object("EmptyLocalProbeState", { fields: {} });
    const model = defineDocumentModel({
      id: "fixture/empty-local",
      name: "Empty Local Probe",
      description: "B1 empty local positive",
      extension: "json",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: { schema: Global, initialValue: {} },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = model.finalize({ modules: [] });
    const specification = module.documentModel.global.specifications[0];
    const local = specification?.state.local;
    if (
      !local ||
      local.schema !== "" ||
      local.initialValue !== "{}" ||
      local.examples.length !== 0 ||
      module.definition?.specifications[0]?.state.local.root !== null
    ) {
      failures.push("empty-local: non-canonical materialization");
    }
  } catch (error) {
    failures.push(`empty-local: ${String(error)}`);
  }
  return failures;
}

function legacyModule(storedDocument: StoredDocument): DocumentModelModule {
  const global = (storedDocument.state?.global ?? storedDocument) as StoredRoot;
  const documentModel = createState(defaultBaseState(), global as never);
  return {
    version: 1,
    reducer: () => documentModel,
    actions: {},
    utils: {},
    documentModel,
  } as unknown as DocumentModelModule;
}

export async function readModelParityManifest(
  manifestPath = resolve(packageRoot, "fixtures/definitions/v1/manifest.json"),
): Promise<ModelParityManifest> {
  return (await readJson(manifestPath)) as ModelParityManifest;
}

export async function evaluateModelParity(
  manifestPath = resolve(packageRoot, "fixtures/definitions/v1/manifest.json"),
): Promise<ModelParityEvaluation> {
  const manifest = await readModelParityManifest(manifestPath);
  const failures = new Map<B1AssertionId, string[]>(
    B1_ASSERTION_IDS.map((id) => [id, []]),
  );
  if (manifest.cases.length !== manifest.caseCount) {
    failures
      .get("B1.structured")
      ?.push(`manifest: expected ${manifest.caseCount} cases`);
  }

  const parser: LegacyGraphQLDocumentParserInterface = { parse };
  const adapter = new LegacyDocumentModelModuleAdapter(parser);
  const schemaCache = new Map<string, AjvValidate>();
  const results: ModelParityCaseResult[] = [];

  for (const fixture of manifest.cases) {
    const sourcePath = packagePath(fixture.codeFirstSource);
    const legacyPath = repositoryPath(fixture.legacySource);
    const structuredGolden = (await readJson(
      packagePath(fixture.structuredGolden),
    )) as DocumentModelDefinitionV1;
    const storedStateGolden = await readJson(
      packagePath(fixture.storedStateGolden),
    );
    const vector = (await readJson(
      packagePath(fixture.identityVector),
    )) as IdentityVector;
    const schemaPath = packagePath(fixture.definitionSchema);
    let validate = schemaCache.get(schemaPath);
    if (!validate) {
      validate = new Ajv({ allErrors: true, strict: false }).compile(
        await readJson(schemaPath),
      );
      schemaCache.set(schemaPath, validate);
    }

    const imported = (await import(
      `${pathToFileURL(sourcePath).href}?b1=${encodeURIComponent(fixture.caseId)}`
    )) as Record<string, unknown>;
    const codeFirst = imported[fixture.codeFirstExport] as
      | (DocumentModelModule & {
          readonly definition?: DocumentModelDefinitionV1;
        })
      | undefined;
    if (!codeFirst?.definition) {
      throw new Error(
        `${fixture.codeFirstExport} is not a finalized code-first module.`,
      );
    }

    const storedDocument = (await readJson(legacyPath)) as StoredDocument;
    const legacy = adapter.adapt(legacyModule(storedDocument));
    const schemaValid =
      validate(structuredGolden) &&
      validate(legacy.definition) &&
      validate(codeFirst.definition);
    if (!schemaValid) {
      const errors = (validate.errors ?? [])
        .map(
          ({ instancePath, message }) =>
            `${instancePath || "/"} ${message ?? "invalid"}`,
        )
        .join("; ");
      addFailure(failures, "B1.schema", `${fixture.caseId}: ${errors}`);
    }

    const legacyStructuredDifference = firstDifference(
      legacy.definition,
      structuredGolden,
    );
    const codeFirstStructuredDifference = firstDifference(
      codeFirst.definition,
      structuredGolden,
    );
    addFailure(
      failures,
      "B1.structured",
      legacyStructuredDifference &&
        `${fixture.caseId}: legacy ${legacyStructuredDifference}`,
    );
    addFailure(
      failures,
      "B1.structured",
      codeFirstStructuredDifference &&
        `${fixture.caseId}: code-first ${codeFirstStructuredDifference}`,
    );

    const legacyStateDifference = firstDifference(
      legacy.module.documentModel,
      storedStateGolden,
    );
    const codeFirstStateDifference = firstDifference(
      codeFirst.documentModel,
      storedStateGolden,
    );
    addFailure(
      failures,
      "B1.stored-state",
      legacyStateDifference &&
        `${fixture.caseId}: legacy ${legacyStateDifference}`,
    );
    addFailure(
      failures,
      "B1.stored-state",
      codeFirstStateDifference &&
        `${fixture.caseId}: code-first ${codeFirstStateDifference}`,
    );

    const legacyIdentityDifference = identityDifference(
      legacy.definition,
      vector,
    );
    const codeFirstIdentityDifference = identityDifference(
      codeFirst.definition,
      vector,
    );
    addFailure(
      failures,
      "B1.identity",
      legacyIdentityDifference &&
        `${fixture.caseId}: legacy ${legacyIdentityDifference}`,
    );
    addFailure(
      failures,
      "B1.identity",
      codeFirstIdentityDifference &&
        `${fixture.caseId}: code-first ${codeFirstIdentityDifference}`,
    );

    const goldenOrder = arrayOrderProjection(structuredGolden);
    addFailure(
      failures,
      "B1.order",
      firstDifference(arrayOrderProjection(legacy.definition), goldenOrder) &&
        `${fixture.caseId}: legacy array order differs`,
    );
    addFailure(
      failures,
      "B1.order",
      firstDifference(
        arrayOrderProjection(codeFirst.definition),
        goldenOrder,
      ) && `${fixture.caseId}: code-first array order differs`,
    );

    const coldImportDigests = (await Promise.all([
      coldImportDigest(sourcePath, fixture.codeFirstExport),
      coldImportDigest(sourcePath, fixture.codeFirstExport),
    ])) as [`sha256:${string}`, `sha256:${string}`];
    if (coldImportDigests[0] !== coldImportDigests[1]) {
      addFailure(
        failures,
        "B1.repeat-import",
        `${fixture.caseId}: cold import digests differ`,
      );
    }

    const firstCaseDifference =
      legacyStructuredDifference ??
      codeFirstStructuredDifference ??
      legacyStateDifference ??
      codeFirstStateDifference ??
      legacyIdentityDifference ??
      codeFirstIdentityDifference;
    results.push({
      caseId: fixture.caseId,
      documentType: fixture.documentType,
      version: fixture.version,
      legacySource: displayPath(legacyPath),
      codeFirstSource: displayPath(sourcePath),
      structuredDigest: digestJson(structuredGolden),
      storedStateDigest: digestJson(storedStateGolden),
      identityVectorDigest: digestJson(vector),
      coldImportDigests,
      schemaOutcome: schemaValid ? "pass" : "fail",
      firstDifference: firstCaseDifference,
    });
  }

  const firstGolden = (await readJson(
    packagePath(manifest.cases[0]?.structuredGolden ?? ""),
  )) as Record<string, unknown>;
  const unknownTop = { ...firstGolden, unexpected: true };
  const unknownNested = structuredClone(firstGolden) as {
    specifications: { state: Record<string, unknown> }[];
  };
  unknownNested.specifications[0]!.state.unexpected = true;
  const definitionSchemaPath = packagePath(
    manifest.cases[0]?.definitionSchema ?? "",
  );
  const closedSchema = schemaCache.get(definitionSchemaPath);
  if (
    !closedSchema ||
    closedSchema(unknownTop) ||
    closedSchema(unknownNested)
  ) {
    addFailure(
      failures,
      "B1.schema",
      "document-model schema accepted an unknown property",
    );
  }

  for (const failure of runFieldOptionNegatives(
    manifest.negativeCases.fieldOptions,
  )) {
    addFailure(failures, "B1.field-options", failure);
  }
  for (const failure of runStateRootNegatives(
    manifest.negativeCases.stateRoots,
  )) {
    addFailure(failures, "B1.state-root", failure);
  }

  return {
    cases: results,
    assertions: B1_ASSERTION_IDS.map((id) => {
      const assertionFailures = failures.get(id) ?? [];
      return {
        id,
        outcome: assertionFailures.length === 0 ? "pass" : "fail",
        failures: assertionFailures,
      };
    }),
  };
}

export function specificationForVersion(
  definition: DocumentModelDefinitionV1,
  version: number,
): DocumentModelSpecificationDefinitionV1 | undefined {
  return definition.specifications.find(
    (specification) => specification.version === version,
  );
}
