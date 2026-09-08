import {
  customScalars,
  typeDefs as installedTypeDefs,
  validationSchema as installedValidationSources,
} from "@powerhousedao/document-engineering/graphql";
import {
  getScalarCatalogConformanceEntries,
  inspectScalarCatalogConformance,
  type ScalarCatalogConformanceEntry,
  type ScalarLiteralNode,
} from "document-model/tooling";
import {
  buildSubgraphSchemaModule,
  getDocumentModelTypeDefs,
} from "../../../../packages/reactor-api/src/utils/create-schema.js";
import type {
  DocumentModelModule,
  JsonValue,
  ScalarVectorValueV1,
} from "@powerhousedao/shared/document-model";
import { Kind, parse, print, type ValueNode } from "graphql";
import { compareCodeUnits, digestJson, firstDifference } from "./utils.js";

export const B14_ASSERTION_IDS = [
  "B14.schema",
  "B14.inventory",
  "B14.validation",
  "B14.coercion",
  "B14.exemptions",
  "B14.graphql-profile",
  "B14.fresh-process",
] as const;

export type B14AssertionId = (typeof B14_ASSERTION_IDS)[number];

type EncodedValue =
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "undefined" }
  | { readonly kind: "bigint"; readonly decimal: string }
  | { readonly kind: "date"; readonly iso: string }
  | {
      readonly kind: "map";
      readonly entries: readonly (readonly [EncodedValue, EncodedValue])[];
    };

type Outcome =
  | { readonly accepted: true; readonly value: EncodedValue }
  | { readonly accepted: false };

export type ScalarDifference = {
  readonly scalarName: string;
  readonly path: string;
  readonly caseId: string;
};

export type ScalarOutcomeGolden = {
  readonly scalarName: string;
  readonly validationOutcomeDigest: `sha256:${string}`;
  readonly installedCoercionOutcomeDigest: `sha256:${string}`;
  readonly graphQLOutcomeDigest: `sha256:${string}`;
  readonly differences: readonly ScalarDifference[];
};

export type ScalarConformanceCaseResult = {
  readonly caseId: string;
  readonly scalarName: string;
  readonly profile: "document-engineering-1.40" | "legacy-graphql-default-v1";
  readonly validationOutcomeDigest: `sha256:${string}`;
  readonly graphQLOutcomeDigest: `sha256:${string}`;
  readonly catalogDigest: `sha256:${string}`;
  readonly knownDifferences: readonly ScalarDifference[];
  readonly constructionMs: number;
  readonly firstMismatch: string | null;
};

export type ScalarConformanceEvaluation = {
  readonly cases: readonly ScalarConformanceCaseResult[];
  readonly assertions: readonly {
    readonly id: B14AssertionId;
    readonly outcome: "pass" | "fail";
    readonly failures: readonly string[];
  }[];
  readonly definitions: readonly ScalarCatalogConformanceEntry["definition"][];
  readonly goldens: readonly ScalarOutcomeGolden[];
  readonly differences: readonly ScalarDifference[];
};

type InstalledScalarModule = {
  readonly scalar?: {
    readonly name: string;
    parseValue(value: unknown): unknown;
    serialize(value: unknown): unknown;
    parseLiteral(node: ValueNode): unknown;
  };
  readonly schema?: {
    safeParse(value: unknown): { success: boolean; data?: unknown };
  };
  readonly stringSchema: string;
  readonly type: string;
};

const installedModules = Object.fromEntries(
  Object.values(customScalars as Record<string, InstalledScalarModule>).map(
    (module) => [module.scalar?.name, module],
  ),
) as Readonly<Record<string, InstalledScalarModule | undefined>>;

function encodeValue(value: unknown): EncodedValue {
  if (value === undefined) return { kind: "undefined" };
  if (typeof value === "bigint") {
    return { kind: "bigint", decimal: value.toString(10) };
  }
  if (value instanceof Date) return { kind: "date", iso: value.toISOString() };
  if (value instanceof Map) {
    return {
      kind: "map",
      entries: [...value.entries()].map(([key, item]) => [
        encodeValue(key),
        encodeValue(item),
      ]),
    };
  }
  return { kind: "json", value: value as JsonValue };
}

function outcome(run: () => unknown): Outcome {
  try {
    return { accepted: true, value: encodeValue(run()) };
  } catch {
    return { accepted: false };
  }
}

function materialize(value: ScalarVectorValueV1): unknown {
  if (value.kind === "json") return value.value;
  switch (value.tag) {
    case "undefined":
      return undefined;
    case "bigint":
      return BigInt(value.decimal);
    case "date":
      return new Date(value.iso);
    case "map":
      return new Map(value.entries);
    case "upload":
      return Object.freeze({ fixtureId: value.fixtureId, kind: "upload" });
  }
}

function scalarLiteral(value: unknown): ScalarLiteralNode | undefined {
  if (value === null) return { kind: "null" };
  if (typeof value === "string") return { kind: "string", value };
  if (typeof value === "number") {
    return {
      kind: Number.isInteger(value) ? "int" : "float",
      value: String(value),
    };
  }
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (Array.isArray(value)) {
    const values = value.map(scalarLiteral);
    if (values.some((entry) => entry === undefined)) return undefined;
    return { kind: "list", values: values as ScalarLiteralNode[] };
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(([name, item]) => ({
      name,
      value: scalarLiteral(item),
    }));
    if (fields.some((field) => field.value === undefined)) return undefined;
    return {
      kind: "object",
      fields: fields as readonly {
        readonly name: string;
        readonly value: ScalarLiteralNode;
      }[],
    };
  }
  return undefined;
}

function graphQLLiteral(node: ScalarLiteralNode): ValueNode {
  switch (node.kind) {
    case "string":
      return { kind: Kind.STRING, value: node.value };
    case "int":
      return { kind: Kind.INT, value: node.value };
    case "float":
      return { kind: Kind.FLOAT, value: node.value };
    case "boolean":
      return { kind: Kind.BOOLEAN, value: node.value };
    case "null":
      return { kind: Kind.NULL };
    case "enum":
      return { kind: Kind.ENUM, value: node.value };
    case "list":
      return { kind: Kind.LIST, values: node.values.map(graphQLLiteral) };
    case "object":
      return {
        kind: Kind.OBJECT,
        fields: node.fields.map((field) => ({
          kind: Kind.OBJECT_FIELD,
          name: { kind: Kind.NAME, value: field.name },
          value: graphQLLiteral(field.value),
        })),
      };
    case "variable":
      return {
        kind: Kind.VARIABLE,
        name: { kind: Kind.NAME, value: node.name },
      };
  }
}

function referenceValidation(
  name: string,
  value: unknown,
): { success: boolean; data?: unknown } {
  const installed = installedModules[name];
  if (installed?.schema) return installed.schema.safeParse(value);
  if (name === "Upload" || name === "Unknown") {
    return { success: true, data: value };
  }
  if (name === "Address") {
    return {
      success:
        typeof value === "string" &&
        /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(value),
      data: value,
    };
  }
  if (name === "AttachmentRef") {
    return {
      success:
        typeof value === "string" && /^attachment:\/\/v\d+:.+$/.test(value),
      data: value,
    };
  }
  if (name === "JSONObject") {
    return {
      success:
        value !== null && typeof value === "object" && !Array.isArray(value),
      data: value,
    };
  }
  return { success: false };
}

function validationOutcomes(entry: ScalarCatalogConformanceEntry) {
  return [
    ...entry.definition.vector.accepts,
    ...entry.definition.vector.rejects,
  ].map((vector) => {
    const input = materialize(vector.input);
    const candidate = entry.validator.safeParse(input);
    const reference = referenceValidation(entry.name, input);
    return {
      caseId: vector.id,
      candidate: candidate.success
        ? ({ accepted: true, value: encodeValue(candidate.data) } as const)
        : ({ accepted: false } as const),
      reference: reference.success
        ? ({ accepted: true, value: encodeValue(reference.data) } as const)
        : ({ accepted: false } as const),
    };
  });
}

function installedCoercionOutcomes(entry: ScalarCatalogConformanceEntry) {
  const installed = installedModules[entry.name]?.scalar;
  return [
    ...entry.definition.vector.accepts,
    ...entry.definition.vector.rejects,
  ].map((vector) => {
    const input = materialize(vector.input);
    const literal = scalarLiteral(input);
    return {
      caseId: vector.id,
      parseValue: outcome(() => entry.installedCoercion.parseValue(input)),
      installedParseValue: installed
        ? outcome(() => installed.parseValue(input))
        : null,
      serialize: outcome(() => entry.installedCoercion.serialize(input)),
      installedSerialize: installed
        ? outcome(() => installed.serialize(input))
        : null,
      parseLiteral:
        literal === undefined
          ? null
          : outcome(() => entry.installedCoercion.parseLiteral(literal)),
      installedParseLiteral:
        installed && literal !== undefined
          ? outcome(() => installed.parseLiteral(graphQLLiteral(literal)))
          : null,
    };
  });
}

function collectDifferences(
  entry: ScalarCatalogConformanceEntry,
): ScalarDifference[] {
  const output: ScalarDifference[] = [];
  const vectors = [
    ...entry.definition.vector.accepts,
    ...entry.definition.vector.rejects,
  ];
  for (const vector of vectors) {
    const input = materialize(vector.input);
    const validated = entry.validator.safeParse(input);
    const literal = scalarLiteral(input);
    const literalOutcome =
      literal === undefined
        ? ({ accepted: false } as const)
        : outcome(() => entry.installedCoercion.parseLiteral(literal));
    if (
      literal !== undefined &&
      entry.name !== "Unknown" &&
      !(entry.name === "Upload" && vector.id === "upload") &&
      validated.success !== literalOutcome.accepted
    ) {
      output.push({
        scalarName: entry.name,
        path: "validator.acceptance/installed.parseLiteral.acceptance",
        caseId: vector.id,
      });
    }
    if (
      validated.success &&
      digestJson(encodeValue(input)) !== digestJson(encodeValue(validated.data))
    ) {
      output.push({
        scalarName: entry.name,
        path: "reducer.raw/validator.output",
        caseId: vector.id,
      });
    }
    if (
      entry.name === "Unknown" &&
      validated.success &&
      vector.input.kind === "non-json" &&
      vector.id !== "graphql-variable-literal"
    ) {
      output.push({
        scalarName: entry.name,
        path: "validator.acceptance/persistence.json",
        caseId: vector.id,
      });
    }
    if (entry.name === "Unknown" && vector.id === "graphql-variable-literal") {
      output.push({
        scalarName: entry.name,
        path: "validator.acceptance/parseLiteral.acceptance",
        caseId: vector.id,
      });
    }
    if (
      entry.name === "Amount" &&
      vector.id === "missing-value" &&
      entry.typescriptType.includes("value?:") &&
      !validated.success
    ) {
      output.push({
        scalarName: entry.name,
        path: "typescript.source/validator.acceptance",
        caseId: vector.id,
      });
    }
  }
  if (entry.name === "Upload") {
    output.push({
      scalarName: entry.name,
      path: "validator.acceptance/installed.parseLiteral.acceptance",
      caseId: "upload",
    });
  }
  return output.sort((left, right) =>
    compareCodeUnits(
      `${left.scalarName}\0${left.path}\0${left.caseId}`,
      `${right.scalarName}\0${right.path}\0${right.caseId}`,
    ),
  );
}

function hostGraphQLSnapshot(entry: ScalarCatalogConformanceEntry) {
  const marker = Object.freeze({ marker: "authored-scalar" });
  const shadow = Object.freeze({ marker: "shadow-json-object" });
  const schemaModule = buildSubgraphSchemaModule(
    [],
    { [entry.name]: marker, JSONObject: shadow } as never,
    parse("type Query { scalarProbe: String }"),
  );
  const resolvers = schemaModule.resolvers as Record<string, unknown>;
  const withoutAuthoredResolvers = buildSubgraphSchemaModule(
    [],
    {} as never,
    parse("type Query { scalarProbe: String }"),
  ).resolvers as Record<string, unknown>;
  return {
    binding: entry.graphQLBinding.kind,
    ordinaryWithoutAuthor:
      entry.name === "JSONObject"
        ? withoutAuthoredResolvers.JSONObject === undefined
          ? "missing"
          : "host-owned"
        : withoutAuthoredResolvers[entry.name] === undefined
          ? "omitted"
          : "unexpected",
    authoredPreserved:
      entry.name === "JSONObject" ? null : resolvers[entry.name] === marker,
    jsonObjectLastWrite: resolvers.JSONObject !== shadow,
  };
}

function scalarInventorySnapshot(): readonly string[] {
  const synthetic = {
    documentModel: {
      global: {
        name: "Scalar Probe",
        specifications: [
          {
            state: {
              global: {
                schema:
                  "scalar Unknown\nscalar Address\ntype ScalarProbeState { value: Unknown address: Address }",
              },
              local: { schema: "" },
            },
            modules: [],
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
  const document = getDocumentModelTypeDefs(
    [synthetic],
    parse("type ScalarProbeQuery { ok: Boolean }"),
  );
  return document.definitions.flatMap((definition) =>
    definition.kind === Kind.SCALAR_TYPE_DEFINITION
      ? [definition.name.value]
      : [],
  );
}

export function collectScalarConformanceActual(): {
  readonly catalogDigest: `sha256:${string}`;
  readonly definitions: readonly ScalarCatalogConformanceEntry["definition"][];
  readonly goldens: readonly ScalarOutcomeGolden[];
  readonly differences: readonly ScalarDifference[];
  readonly catalogNames: readonly string[];
  readonly installedTypedefs: readonly string[];
  readonly hostScalarInventory: readonly string[];
  readonly validationSources: Readonly<Record<string, string>>;
} {
  const entries = getScalarCatalogConformanceEntries();
  const catalog = inspectScalarCatalogConformance();
  const goldens = entries.map((entry) => {
    const validation = validationOutcomes(entry);
    const installedCoercion = installedCoercionOutcomes(entry);
    const graphQL = hostGraphQLSnapshot(entry);
    return {
      scalarName: entry.name,
      validationOutcomeDigest: digestJson(validation),
      installedCoercionOutcomeDigest: digestJson(installedCoercion),
      graphQLOutcomeDigest: digestJson(graphQL),
      differences: collectDifferences(entry),
    };
  });
  return {
    catalogDigest: catalog.catalogDigest,
    definitions: entries.map((entry) => entry.definition),
    goldens,
    differences: goldens.flatMap(({ differences }) => differences),
    catalogNames: catalog.names,
    installedTypedefs,
    hostScalarInventory: scalarInventorySnapshot(),
    validationSources: installedValidationSources as Record<string, string>,
  };
}

export function evaluateScalarConformance(request: {
  readonly expectedGoldens: readonly ScalarOutcomeGolden[];
  readonly expectedDefinitions: readonly ScalarCatalogConformanceEntry["definition"][];
  readonly expectedDifferences: readonly ScalarDifference[];
  readonly freshProcessDigests: readonly `sha256:${string}`[];
  readonly definitionSchemaValid: boolean;
  readonly unknownPropertyRejected: boolean;
  readonly expectedInventory: {
    readonly names: readonly string[];
    readonly digest: `sha256:${string}`;
  };
}): ScalarConformanceEvaluation {
  const started = performance.now();
  const actual = collectScalarConformanceActual();
  const constructionMs = Math.max(0, performance.now() - started);
  const goldenByName = new Map(
    request.expectedGoldens.map((entry) => [entry.scalarName, entry]),
  );
  const definitionByName = new Map<
    string,
    ScalarCatalogConformanceEntry["definition"]
  >(request.expectedDefinitions.map((entry) => [entry.name, entry]));
  const cases = actual.goldens.flatMap((entry) => {
    const golden = goldenByName.get(entry.scalarName);
    const definition = actual.definitions.find(
      (candidate) => candidate.name === entry.scalarName,
    );
    const definitionMismatch = firstDifference(
      definition,
      definitionByName.get(entry.scalarName),
    );
    const validationMismatch = firstDifference(
      entry.validationOutcomeDigest,
      golden?.validationOutcomeDigest,
    );
    const graphQLMismatch = firstDifference(
      entry.graphQLOutcomeDigest,
      golden?.graphQLOutcomeDigest,
    );
    const coercionMismatch = firstDifference(
      entry.installedCoercionOutcomeDigest,
      golden?.installedCoercionOutcomeDigest,
    );
    const common = {
      scalarName: entry.scalarName,
      validationOutcomeDigest: entry.validationOutcomeDigest,
      graphQLOutcomeDigest: entry.graphQLOutcomeDigest,
      catalogDigest: actual.catalogDigest,
      knownDifferences: entry.differences,
      constructionMs,
    };
    return [
      {
        caseId: `${entry.scalarName}:document-engineering-1.40`,
        profile: "document-engineering-1.40" as const,
        ...common,
        firstMismatch:
          definitionMismatch ?? validationMismatch ?? coercionMismatch,
      },
      {
        caseId: `${entry.scalarName}:legacy-graphql-default-v1`,
        profile: "legacy-graphql-default-v1" as const,
        ...common,
        firstMismatch: definitionMismatch ?? graphQLMismatch,
      },
    ];
  });

  const definitionFailures = actual.definitions.flatMap((entry) => {
    const mismatch = firstDifference(entry, definitionByName.get(entry.name));
    return mismatch ? [`${entry.name}: ${mismatch}`] : [];
  });
  const validationFailures = actual.goldens.flatMap((entry) => {
    const mismatch = firstDifference(
      entry.validationOutcomeDigest,
      goldenByName.get(entry.scalarName)?.validationOutcomeDigest,
    );
    return mismatch ? [`${entry.scalarName}: ${mismatch}`] : [];
  });
  const coercionFailures = actual.goldens.flatMap((entry) => {
    const mismatch = firstDifference(
      entry.installedCoercionOutcomeDigest,
      goldenByName.get(entry.scalarName)?.installedCoercionOutcomeDigest,
    );
    return mismatch ? [`${entry.scalarName}: ${mismatch}`] : [];
  });
  const graphQLFailures = actual.goldens.flatMap((entry) => {
    const mismatch = firstDifference(
      entry.graphQLOutcomeDigest,
      goldenByName.get(entry.scalarName)?.graphQLOutcomeDigest,
    );
    return mismatch ? [`${entry.scalarName}: ${mismatch}`] : [];
  });
  const exemptionFailures = firstDifference(
    actual.differences,
    request.expectedDifferences,
  );
  const exemptionCoverageFailures: string[] = [];
  for (const entry of getScalarCatalogConformanceEntries()) {
    const exemption = entry.definition.coercion.exemption;
    const differences = actual.differences.filter(
      ({ scalarName }) => scalarName === entry.name,
    );
    if (!exemption && differences.length > 0) {
      exemptionCoverageFailures.push(`${entry.name}: unrecorded difference`);
      continue;
    }
    if (!exemption) continue;
    for (const difference of differences) {
      if (
        !exemption.paths.includes(difference.path) ||
        !exemption.caseIds.includes(difference.caseId)
      ) {
        exemptionCoverageFailures.push(
          `${entry.name}: unrecorded ${difference.path}/${difference.caseId}`,
        );
      }
    }
    for (const path of exemption.paths) {
      if (!differences.some((difference) => difference.path === path)) {
        exemptionCoverageFailures.push(`${entry.name}: stale path ${path}`);
      }
    }
    for (const caseId of exemption.caseIds) {
      if (!differences.some((difference) => difference.caseId === caseId)) {
        exemptionCoverageFailures.push(`${entry.name}: stale case ${caseId}`);
      }
    }
  }
  const inventoryFailures: string[] = [];
  if (actual.catalogNames.length !== 21)
    inventoryFailures.push("catalog names");
  if (new Set(actual.catalogNames).size !== 21) {
    inventoryFailures.push("catalog name uniqueness");
  }
  if (actual.installedTypedefs.length !== 17) {
    inventoryFailures.push("installed typedef count");
  }
  if (
    new Set(actual.hostScalarInventory).size !== 21 ||
    actual.hostScalarInventory.length !== 21
  ) {
    inventoryFailures.push("host scalar inventory");
  }
  const actualCatalogNames = [...actual.catalogNames].sort(compareCodeUnits);
  const actualHostNames = [...actual.hostScalarInventory].sort(
    compareCodeUnits,
  );
  if (
    firstDifference(actualCatalogNames, request.expectedInventory.names) ||
    firstDifference(actualHostNames, request.expectedInventory.names) ||
    digestJson(request.expectedInventory.names) !==
      request.expectedInventory.digest
  ) {
    inventoryFailures.push("B6 scalar inventory digest");
  }
  const sourceFailures = Object.entries(actual.validationSources).flatMap(
    ([name, source]) => {
      const entry = getScalarCatalogConformanceEntries().find(
        (candidate) => candidate.name === name,
      );
      return entry?.zodSource === source ? [] : [`${name}.zodSource`];
    },
  );
  const processFailures =
    request.freshProcessDigests.length === 2 &&
    new Set(request.freshProcessDigests).size === 1
      ? []
      : ["Node and browser-condition metadata digests differ"];
  const failures = new Map<B14AssertionId, readonly string[]>([
    [
      "B14.schema",
      [
        ...(request.definitionSchemaValid
          ? []
          : ["a scalar definition failed the closed schema"]),
        ...(request.unknownPropertyRejected
          ? []
          : ["the scalar schema accepted an unknown property"]),
        ...definitionFailures,
      ],
    ],
    ["B14.inventory", inventoryFailures],
    ["B14.validation", [...sourceFailures, ...validationFailures]],
    ["B14.coercion", coercionFailures],
    [
      "B14.exemptions",
      [
        ...(exemptionFailures ? [exemptionFailures] : []),
        ...exemptionCoverageFailures,
      ],
    ],
    ["B14.graphql-profile", graphQLFailures],
    ["B14.fresh-process", processFailures],
  ]);

  return {
    cases,
    assertions: B14_ASSERTION_IDS.map((id) => ({
      id,
      outcome: failures.get(id)?.length === 0 ? "pass" : "fail",
      failures: failures.get(id) ?? [],
    })),
    definitions: actual.definitions,
    goldens: actual.goldens,
    differences: actual.differences,
  };
}

export function scalarMetadataDigest(): `sha256:${string}` {
  const catalog = inspectScalarCatalogConformance();
  return digestJson({
    names: catalog.names,
    validationProfiles: catalog.validationProfiles,
    graphQLProfiles: catalog.graphQLProfiles,
    catalogDigest: catalog.catalogDigest,
    definitions: getScalarCatalogConformanceEntries().map(
      ({ definition }) => definition,
    ),
  });
}

export const installedTypedefs = [...installedTypeDefs];
