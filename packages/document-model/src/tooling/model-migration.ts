import {
  hashDocumentStateForScope,
  type Action,
  type DocumentModelModule,
  type JsonValue,
  type PHBaseState,
  type PHDocument,
  type Signal,
} from "@powerhousedao/shared/document-model";
import {
  CodeFirstDocumentModelSourceAdapter,
  LegacyDocumentModelModuleAdapter,
  type LegacyGraphQLDocumentParserInterface,
} from "../definition/adapters/index.js";
import {
  canonicalJson,
  canonicalJsonFromUnknown,
  compareCodeUnits,
  isRecord,
  sha256,
} from "../definition/primitives.js";

export type MigrationHistoryV1 = {
  readonly historyId: string;
  readonly version: number;
  readonly initialDocument: PHDocument;
  readonly actions: readonly Action[];
};

export type MigrationFamily = {
  readonly documentType: string;
  readonly modules: readonly DocumentModelModule[];
};

export interface DocumentModelMigrationAdapter {
  readonly kind: "legacy-generated" | "code-first";
  normalize(): MigrationFamily;
  definition(): JsonValue;
}

function orderedModules(
  modules: readonly DocumentModelModule[],
): readonly DocumentModelModule[] {
  return [...modules].sort(
    (left, right) => (left.version ?? 1) - (right.version ?? 1),
  );
}

function assertFamily(modules: readonly DocumentModelModule[]): string {
  if (modules.length === 0) {
    throw new Error("PH-MIGRATE-FAMILY-EMPTY");
  }
  const documentTypes = new Set(
    modules.map((module) => module.documentModel.global.id),
  );
  if (documentTypes.size !== 1) {
    throw new Error("PH-MIGRATE-FAMILY-MIXED-DOCUMENT-TYPES");
  }
  const versions = modules.map((module) => module.version ?? 1);
  if (
    versions.some(
      (version) => !Number.isSafeInteger(version) || Number(version) <= 0,
    )
  ) {
    throw new Error("PH-MIGRATE-FAMILY-VERSION-INVALID");
  }
  if (new Set(versions).size !== versions.length) {
    throw new Error("PH-MIGRATE-FAMILY-DUPLICATE-VERSION");
  }
  if (
    versions.some(
      (version, index) =>
        index > 0 && version !== (versions[index - 1] as number) + 1,
    )
  ) {
    throw new Error("PH-MIGRATE-FAMILY-VERSION-GAP");
  }
  return modules[0]!.documentModel.global.id;
}

export class LegacyGeneratedModelAdapter implements DocumentModelMigrationAdapter {
  readonly kind = "legacy-generated" as const;
  readonly #modules: readonly DocumentModelModule[];
  readonly #adapter: LegacyDocumentModelModuleAdapter;

  constructor(
    modules: readonly DocumentModelModule[],
    parser: LegacyGraphQLDocumentParserInterface,
  ) {
    this.#modules = orderedModules(modules);
    this.#adapter = new LegacyDocumentModelModuleAdapter(parser);
  }

  normalize(): MigrationFamily {
    return {
      documentType: assertFamily(this.#modules),
      modules: this.#modules,
    };
  }

  definition(): JsonValue {
    return this.#adapter.adapt(this.#modules[0])
      .definition as unknown as JsonValue;
  }
}

export class CodeFirstModelAdapter implements DocumentModelMigrationAdapter {
  readonly kind = "code-first" as const;
  readonly #modules: readonly DocumentModelModule[];
  readonly #adapter = new CodeFirstDocumentModelSourceAdapter();

  constructor(modules: readonly DocumentModelModule[]) {
    this.#modules = orderedModules(modules);
  }

  normalize(): MigrationFamily {
    return {
      documentType: assertFamily(this.#modules),
      modules: this.#modules,
    };
  }

  definition(): JsonValue {
    return this.#adapter.adapt(this.#modules[0])
      .definition as unknown as JsonValue;
  }
}

type MigrationCheckV1 = {
  readonly id:
    | "definition"
    | "stored-specification"
    | "creators"
    | "initial-state"
    | "replay";
  readonly outcome: "pass" | "fail";
  readonly legacyDigest: `sha256:${string}`;
  readonly candidateDigest: `sha256:${string}`;
  readonly firstDifference: string | null;
};

export type MigrationPrefixResultV1 = {
  readonly historyId: string;
  readonly prefix: number;
  readonly legacyDigest: `sha256:${string}`;
  readonly candidateDigest: `sha256:${string}`;
  readonly legacyScopeHashes: Readonly<Record<string, string>>;
  readonly candidateScopeHashes: Readonly<Record<string, string>>;
  readonly dispatchDigest: `sha256:${string}`;
  readonly firstDifference: string | null;
};

export type EquivalenceReportV1 = {
  readonly kind: "powerhouse.migration-equivalence";
  readonly formatVersion: 1;
  readonly status: "equivalent" | "diverged";
  readonly family: {
    readonly documentType: string;
    readonly versions: readonly number[];
    readonly digest: `sha256:${string}`;
  };
  readonly checks: readonly MigrationCheckV1[];
  readonly histories: readonly MigrationPrefixResultV1[];
  readonly diagnostics: readonly {
    readonly code: `PH-MIGRATE-${string}`;
    readonly path: readonly (string | number)[];
    readonly message: string;
  }[];
  readonly digest: `sha256:${string}`;
};

function digest(value: unknown): `sha256:${string}` {
  return sha256(canonicalJsonFromUnknown(value));
}

function firstDifference(
  left: unknown,
  right: unknown,
  path = "$",
): string | null {
  if (Object.is(left, right)) return null;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return `${path}: ${canonicalJsonFromUnknown(left)} !== ${canonicalJsonFromUnknown(right)}`;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return `${path}: shape`;
    if (left.length !== right.length) {
      return `${path}.length: ${left.length} !== ${right.length}`;
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(
        left[index],
        right[index],
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = [
    ...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
  ].sort(compareCodeUnits);
  for (const key of keys) {
    const difference = firstDifference(
      leftRecord[key],
      rightRecord[key],
      `${path}.${key}`,
    );
    if (difference) return difference;
  }
  return null;
}

function actionError(error: unknown): unknown {
  if (error === undefined || error === null) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...("errorCode" in error
        ? { errorCode: String((error as { errorCode: unknown }).errorCode) }
        : {}),
    };
  }
  return error;
}

function documentProjection(document: PHDocument): JsonValue {
  return {
    header: document.header as unknown as JsonValue,
    state: document.state as unknown as JsonValue,
    initialState: document.initialState as unknown as JsonValue,
    operations: Object.fromEntries(
      Object.entries(document.operations)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([scope, operations]) => [
          scope,
          operations.map((operation) => ({
            ...operation,
            hash: "",
            error: actionError(operation.error),
            resultingState: undefined,
          })),
        ]),
    ) as unknown as JsonValue,
    clipboard: document.clipboard.map((operation) => ({
      ...operation,
      hash: "",
      error: actionError(operation.error),
      resultingState: undefined,
    })) as unknown as JsonValue,
  };
}

function scopeHashes(document: PHDocument): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.keys(document.state)
      .sort(compareCodeUnits)
      .map((scope) => [scope, hashDocumentStateForScope(document, scope)]),
  );
}

function moduleAt(
  family: MigrationFamily,
  version: number,
): DocumentModelModule {
  const module = family.modules.find(
    (candidate) => (candidate.version ?? 1) === version,
  );
  if (!module) throw new Error(`PH-MIGRATE-VERSION-NOT-FOUND: ${version}`);
  return module;
}

function check(
  id: MigrationCheckV1["id"],
  legacy: unknown,
  candidate: unknown,
): MigrationCheckV1 {
  const difference = firstDifference(legacy, candidate);
  return {
    id,
    outcome: difference === null ? "pass" : "fail",
    legacyDigest: digest(legacy),
    candidateDigest: digest(candidate),
    firstDifference: difference,
  };
}

function familyVersions(family: MigrationFamily): readonly number[] {
  return family.modules.map((module) => module.version ?? 1);
}

function assertNormalizedFamily(family: MigrationFamily): void {
  const documentType = assertFamily(family.modules);
  if (family.documentType !== documentType) {
    throw new Error("PH-MIGRATE-FAMILY-DOCUMENT-TYPE-MISMATCH");
  }
}

function assertHistories(
  histories: readonly MigrationHistoryV1[],
  documentType: string,
): void {
  if (!Array.isArray(histories)) {
    throw new Error("PH-MIGRATE-HISTORIES-INVALID");
  }
  const ids = new Set<string>();
  histories.forEach((history) => {
    if (!isRecord(history) || typeof history.historyId !== "string") {
      throw new Error("PH-MIGRATE-HISTORY-INVALID");
    }
    if (history.historyId === "" || ids.has(history.historyId)) {
      throw new Error("PH-MIGRATE-HISTORY-ID-DUPLICATE");
    }
    ids.add(history.historyId);
    if (
      !Number.isSafeInteger(history.version) ||
      Number(history.version) <= 0
    ) {
      throw new Error("PH-MIGRATE-HISTORY-VERSION-INVALID");
    }
    if (
      !isRecord(history.initialDocument) ||
      !isRecord(history.initialDocument.header) ||
      history.initialDocument.header.documentType !== documentType
    ) {
      throw new Error("PH-MIGRATE-HISTORY-DOCUMENT-TYPE-MISMATCH");
    }
    if (!Array.isArray(history.actions)) {
      throw new Error("PH-MIGRATE-HISTORY-ACTIONS-INVALID");
    }
  });
}

function familyStoredSpecifications(family: MigrationFamily): JsonValue {
  return family.modules.map((module) => ({
    version: module.version ?? 1,
    documentModel: module.documentModel,
  })) as unknown as JsonValue;
}

function familyCreators(family: MigrationFamily): JsonValue {
  return family.modules.map((module) => ({
    version: module.version ?? 1,
    actions: Object.keys(module.actions).sort(compareCodeUnits),
  })) as unknown as JsonValue;
}

function familyInitialStates(family: MigrationFamily): JsonValue {
  return family.modules.map((module) => ({
    version: module.version ?? 1,
    state: module.utils.createState(),
  })) as unknown as JsonValue;
}

function reducePrefix(request: {
  readonly module: DocumentModelModule;
  readonly history: MigrationHistoryV1;
  readonly prefix: number;
}): { readonly document: PHDocument; readonly dispatches: readonly Signal[] } {
  const dispatches: Signal[] = [];
  let document = structuredClone(request.history.initialDocument);
  for (const action of request.history.actions.slice(0, request.prefix)) {
    document = request.module.reducer(
      document,
      structuredClone(action),
      (signal) => dispatches.push(signal),
      { protocolVersion: 1 },
    ) as PHDocument<PHBaseState>;
  }
  return { document, dispatches };
}

/**
 * Compares a legacy generated family and a code-first candidate without
 * activating either one. Every history prefix starts from the same document.
 */
export function verifyDocumentModelMigration(request: {
  readonly legacy: DocumentModelMigrationAdapter;
  readonly candidate: DocumentModelMigrationAdapter;
  readonly histories: readonly MigrationHistoryV1[];
}): Promise<EquivalenceReportV1> {
  const legacy = request.legacy.normalize();
  const candidate = request.candidate.normalize();
  assertNormalizedFamily(legacy);
  assertNormalizedFamily(candidate);
  if (legacy.documentType !== candidate.documentType) {
    throw new Error("PH-MIGRATE-DOCUMENT-TYPE-MISMATCH");
  }
  const versions = familyVersions(legacy);
  if (firstDifference(versions, familyVersions(candidate)) !== null) {
    throw new Error("PH-MIGRATE-VERSION-SET-MISMATCH");
  }
  assertHistories(request.histories, legacy.documentType);
  const legacyDefinition = request.legacy.definition();
  const candidateDefinition = request.candidate.definition();
  const definitionCheck = check(
    "definition",
    legacyDefinition,
    candidateDefinition,
  );
  const storedCheck = check(
    "stored-specification",
    familyStoredSpecifications(legacy),
    familyStoredSpecifications(candidate),
  );
  const creatorCheck = check(
    "creators",
    familyCreators(legacy),
    familyCreators(candidate),
  );
  const initialStateCheck = check(
    "initial-state",
    familyInitialStates(legacy),
    familyInitialStates(candidate),
  );
  const histories: MigrationPrefixResultV1[] = [];
  for (const history of request.histories) {
    const legacyModule = moduleAt(legacy, history.version);
    const candidateModule = moduleAt(candidate, history.version);
    for (let prefix = 0; prefix <= history.actions.length; prefix += 1) {
      const legacyResult = reducePrefix({
        module: legacyModule,
        history,
        prefix,
      });
      const candidateResult = reducePrefix({
        module: candidateModule,
        history,
        prefix,
      });
      const legacyProjection = documentProjection(legacyResult.document);
      const candidateProjection = documentProjection(candidateResult.document);
      const dispatchDifference = firstDifference(
        legacyResult.dispatches,
        candidateResult.dispatches,
      );
      const documentDifference = firstDifference(
        legacyProjection,
        candidateProjection,
      );
      const hashDifference = firstDifference(
        scopeHashes(legacyResult.document),
        scopeHashes(candidateResult.document),
      );
      histories.push({
        historyId: history.historyId,
        prefix,
        legacyDigest: digest(legacyProjection),
        candidateDigest: digest(candidateProjection),
        legacyScopeHashes: scopeHashes(legacyResult.document),
        candidateScopeHashes: scopeHashes(candidateResult.document),
        dispatchDigest: digest({
          legacy: legacyResult.dispatches,
          candidate: candidateResult.dispatches,
        }),
        firstDifference:
          documentDifference ?? dispatchDifference ?? hashDifference,
      });
    }
  }
  const replayProjection = histories.map(
    ({
      historyId,
      prefix,
      legacyDigest,
      candidateDigest,
      firstDifference,
    }) => ({
      historyId,
      prefix,
      legacyDigest,
      candidateDigest,
      firstDifference,
    }),
  );
  const replayCheck = check(
    "replay",
    replayProjection.map((entry) => ({
      historyId: entry.historyId,
      prefix: entry.prefix,
      digest: entry.legacyDigest,
      firstDifference: null,
    })),
    replayProjection.map((entry) => ({
      historyId: entry.historyId,
      prefix: entry.prefix,
      digest: entry.candidateDigest,
      firstDifference: entry.firstDifference,
    })),
  );
  const checks = [
    definitionCheck,
    storedCheck,
    creatorCheck,
    initialStateCheck,
    replayCheck,
  ];
  const diagnostics = checks.flatMap((entry) =>
    entry.firstDifference === null
      ? []
      : [
          {
            code: `PH-MIGRATE-${entry.id.toUpperCase()}-DIVERGENCE` as const,
            path: [entry.id],
            message: entry.firstDifference,
          },
        ],
  );
  const familyDigest = sha256(canonicalJson(legacyDefinition as JsonValue));
  const reportWithoutDigest = {
    kind: "powerhouse.migration-equivalence" as const,
    formatVersion: 1 as const,
    status: checks.every((entry) => entry.outcome === "pass")
      ? ("equivalent" as const)
      : ("diverged" as const),
    family: {
      documentType: legacy.documentType,
      versions,
      digest: familyDigest,
    },
    checks,
    histories,
    diagnostics,
  };
  return Promise.resolve({
    ...reportWithoutDigest,
    digest: digest(reportWithoutDigest),
  });
}
