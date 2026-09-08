import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  DocumentModelDefinitionV1,
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { Kind, parse, print, version as graphQLVersion } from "graphql";
import {
  generateDocumentModelSchemaFromDefinition,
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
  setLegacySchemaPipelineObserverForTests,
} from "../../../../packages/reactor-api/src/utils/create-schema.js";
import {
  canonicalJson,
  compareCodeUnits,
  firstDifference,
  sha256,
} from "./utils.js";

export type ModelSdlManifestCase = {
  readonly caseId: string;
  readonly definition: string;
  readonly expectedSdl: string;
  readonly expectedAst: string;
  readonly legacyComparison: {
    readonly sdlDigest: `sha256:${string}`;
    readonly astDigest: `sha256:${string}`;
  } | null;
  readonly coveredVariants: readonly string[];
};

type ModelSdlManifest = {
  readonly cases: readonly ModelSdlManifestCase[];
  readonly scalarInventory: string;
};

export type ModelSdlCaseResult = {
  readonly caseId: string;
  readonly definitionDigest: `sha256:${string}`;
  readonly sdlDigest: `sha256:${string}`;
  readonly astDigest: `sha256:${string}`;
  readonly scalarCatalogDigest: `sha256:${string}`;
  readonly parserVersionDigest: `sha256:${string}`;
  readonly parseMs: number;
  readonly printMs: number;
  readonly regexAdapterCallCount: number;
  readonly regexAdapterCallSites: readonly string[];
  readonly coveredVariants: readonly string[];
  readonly firstDifference: string | null;
};

export type ModelSdlEvaluation = {
  readonly assertions: readonly {
    readonly id:
      | "B6.parse"
      | "B6.ast"
      | "B6.print"
      | "B6.scalar"
      | "B6.no-regex";
    readonly outcome: "pass" | "fail";
    readonly failures: readonly string[];
  }[];
  readonly cases: readonly ModelSdlCaseResult[];
};

function locationFree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(locationFree);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key !== "loc" && item !== undefined)
      .map(([key, item]) => [key, locationFree(item)]),
  );
}

function moduleForDefinition(
  definition: DocumentModelDefinitionV1,
): DocumentModelModule {
  return {
    version: definition.specifications.at(-1)?.version ?? 1,
    definition,
    documentModel: {
      global: {
        id: definition.model.documentType,
        name: definition.model.name,
        description: definition.model.description,
        extension: definition.model.extension,
        author: {
          name: definition.model.author.name,
          website: definition.model.author.website ?? "",
        },
        specifications: [],
      },
    },
  } as unknown as DocumentModelModule;
}

export function projectStructuredModelSdl(
  definition: DocumentModelDefinitionV1,
): {
  readonly sdl: string;
  readonly ast: unknown;
  readonly scalarNames: readonly string[];
  readonly scalarCatalogDigest: `sha256:${string}`;
  readonly parseMs: number;
  readonly printMs: number;
  readonly regexAdapterCallSites: readonly string[];
} {
  const calls: string[] = [];
  setLegacySchemaPipelineObserverForTests((event) => calls.push(event));
  let projected;
  try {
    const api = generateDocumentModelSchemaFromDefinition(definition, {
      useNewApi: true,
    });
    projected = getDocumentModelTypeDefs(
      [moduleForDefinition(definition)],
      api,
    );
  } finally {
    setLegacySchemaPipelineObserverForTests();
  }

  const beforePrint = performance.now();
  const emitted = print(projected);
  const printMs = performance.now() - beforePrint;
  const beforeParse = performance.now();
  const parsed = parse(emitted, { noLocation: true });
  const parseMs = performance.now() - beforeParse;
  const sdl = print(parsed);
  const ast = locationFree(parsed);
  const scalarNames = parsed.definitions
    .filter((definition) => definition.kind === Kind.SCALAR_TYPE_DEFINITION)
    .map((definition) => definition.name.value)
    .sort(compareCodeUnits);
  return {
    sdl,
    ast,
    scalarNames,
    scalarCatalogDigest: sha256(canonicalJson(scalarNames)),
    parseMs,
    printMs,
    regexAdapterCallSites: calls,
  };
}

export function projectLegacyModelSdl(
  documentModel: DocumentModelGlobalState,
): {
  readonly sdl: string;
  readonly ast: unknown;
  readonly sdlDigest: `sha256:${string}`;
  readonly astDigest: `sha256:${string}`;
} {
  setLegacySchemaPipelineObserverForTests();
  const api = generateDocumentModelSchema(documentModel, { useNewApi: true });
  const projected = getDocumentModelTypeDefs(
    [
      {
        version: documentModel.specifications.at(-1)?.version ?? 1,
        documentModel: { global: documentModel },
      } as unknown as DocumentModelModule,
    ],
    api,
  );
  const sdl = print(parse(print(projected), { noLocation: true }));
  const ast = locationFree(parse(sdl, { noLocation: true }));
  return {
    sdl,
    ast,
    sdlDigest: sha256(sdl),
    astDigest: sha256(canonicalJson(ast)),
  };
}

export async function evaluateModelSdl(
  manifestPath: string,
): Promise<ModelSdlEvaluation> {
  const manifestDirectory = dirname(resolve(manifestPath));
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as ModelSdlManifest;
  const scalarInventory = JSON.parse(
    await readFile(
      resolve(manifestDirectory, manifest.scalarInventory),
      "utf8",
    ),
  ) as {
    readonly names: readonly string[];
    readonly digest: `sha256:${string}`;
  };
  const failures = new Map<string, string[]>([
    ["B6.parse", []],
    ["B6.ast", []],
    ["B6.print", []],
    ["B6.scalar", []],
    ["B6.no-regex", []],
  ]);
  const cases: ModelSdlCaseResult[] = [];
  const observedScalarNames: string[] = [];

  for (const fixture of manifest.cases) {
    const definitionBytes = await readFile(
      resolve(manifestDirectory, fixture.definition),
    );
    const definition = JSON.parse(
      definitionBytes.toString("utf8"),
    ) as DocumentModelDefinitionV1;
    const expectedSdl = await readFile(
      resolve(manifestDirectory, fixture.expectedSdl),
      "utf8",
    );
    const expectedAst = JSON.parse(
      await readFile(resolve(manifestDirectory, fixture.expectedAst), "utf8"),
    ) as unknown;
    let projection: ReturnType<typeof projectStructuredModelSdl> | undefined;
    let parseFailure: string | null = null;
    try {
      projection = projectStructuredModelSdl(definition);
    } catch (error) {
      parseFailure = error instanceof Error ? error.message : String(error);
      failures.get("B6.parse")!.push(`${fixture.caseId}: ${parseFailure}`);
    }

    if (!projection) {
      cases.push({
        caseId: fixture.caseId,
        definitionDigest: sha256(definitionBytes),
        sdlDigest: sha256(""),
        astDigest: sha256("null"),
        scalarCatalogDigest: sha256("[]"),
        parserVersionDigest: sha256(graphQLVersion),
        parseMs: 0,
        printMs: 0,
        regexAdapterCallCount: 0,
        regexAdapterCallSites: [],
        coveredVariants: fixture.coveredVariants,
        firstDifference: parseFailure,
      });
      continue;
    }

    const astDifference = firstDifference(expectedAst, projection.ast);
    if (astDifference) {
      failures.get("B6.ast")!.push(`${fixture.caseId}: ${astDifference}`);
    }
    if (expectedSdl !== projection.sdl) {
      failures
        .get("B6.print")!
        .push(`${fixture.caseId}: canonical SDL bytes differ`);
    }
    for (const name of projection.scalarNames) {
      if (!observedScalarNames.includes(name)) observedScalarNames.push(name);
    }
    if (
      projection.scalarNames.some(
        (name) => !scalarInventory.names.includes(name),
      )
    ) {
      failures
        .get("B6.scalar")!
        .push(`${fixture.caseId}: projection declares an unknown scalar`);
    }
    if (projection.regexAdapterCallSites.length !== 0) {
      failures
        .get("B6.no-regex")!
        .push(
          `${fixture.caseId}: ${projection.regexAdapterCallSites.join(", ")}`,
        );
    }
    const first =
      parseFailure ??
      astDifference ??
      (expectedSdl === projection.sdl ? null : "canonical SDL bytes differ") ??
      (projection.scalarNames.every((name) =>
        scalarInventory.names.includes(name),
      )
        ? null
        : "scalar inventory differs") ??
      (projection.regexAdapterCallSites.length === 0
        ? null
        : "legacy regex adapter was called");
    cases.push({
      caseId: fixture.caseId,
      definitionDigest: sha256(definitionBytes),
      sdlDigest: sha256(projection.sdl),
      astDigest: sha256(canonicalJson(projection.ast)),
      scalarCatalogDigest: scalarInventory.digest,
      parserVersionDigest: sha256(graphQLVersion),
      parseMs: projection.parseMs,
      printMs: projection.printMs,
      regexAdapterCallCount: projection.regexAdapterCallSites.length,
      regexAdapterCallSites: projection.regexAdapterCallSites,
      coveredVariants: fixture.coveredVariants,
      firstDifference: first,
    });
  }

  if (
    canonicalJson(observedScalarNames.sort(compareCodeUnits)) !==
    canonicalJson(scalarInventory.names)
  ) {
    failures
      .get("B6.scalar")!
      .push("the union of projected scalar names differs from the inventory");
  }

  return {
    assertions: [
      "B6.parse",
      "B6.ast",
      "B6.print",
      "B6.scalar",
      "B6.no-regex",
    ].map((id) => ({
      id: id as ModelSdlEvaluation["assertions"][number]["id"],
      outcome: failures.get(id)!.length === 0 ? "pass" : "fail",
      failures: failures.get(id)!,
    })),
    cases,
  };
}
