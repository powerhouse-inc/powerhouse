import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import {
  type DefinitionInspectionEnvelope,
  type DefinitionInspectionRequest,
  DefinitionSourceLoader,
  formatDefinitionDiagnostic,
  inspectDefinition,
  inspectScalar,
  inspectSubgraph,
  parseModelSelector,
  type SubgraphInspectionEnvelope,
} from "document-model/tooling";
import { readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getVersion } from "../get-version.js";
import type {
  ModelInspectArgs,
  ScalarInspectArgs,
  SubgraphInspectArgs,
} from "../types.js";
import { ViteTypeScriptSourceImportAdapter } from "./definitions/import-adapters.js";
import { selectedPackageRoot } from "./definitions/selection.js";
import {
  type CheckStreams,
  definitionRequestFor,
  processStreams,
  unstartedCheckReport,
  withCapturedStdout,
  writeReport,
} from "./model-check.js";

type InspectOptions = { readonly streams?: CheckStreams };

const EXIT_CODES = { ok: 0, skipped: 0, invalid: 1, failed: 2 } as const;

function compilerVersionFor(packageRoot?: string): string {
  const bases = [
    ...(packageRoot === undefined
      ? []
      : [pathToFileURL(join(packageRoot, "package.json"))]),
    import.meta.url,
  ];
  for (const base of bases) {
    try {
      const manifest = findPackageJSON("document-model", base);
      if (manifest !== undefined) {
        return (
          JSON.parse(readFileSync(manifest, "utf8")) as { version: string }
        ).version;
      }
    } catch {
      continue;
    }
  }
  return getVersion();
}

type InspectionFailure = {
  readonly compilerVersion: string;
  readonly sourceSet: DefinitionCheckReport["sourceSet"];
  readonly status: "failed";
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

async function runInspection<
  Envelope extends { readonly status: keyof typeof EXIT_CODES },
>(
  args: ModelInspectArgs | SubgraphInspectArgs,
  streams: CheckStreams,
  inspect: (
    request: Omit<DefinitionInspectionRequest, "selection">,
  ) => Promise<Envelope>,
  failed: (failure: InspectionFailure) => Envelope,
  render: (envelope: Envelope) => string,
): Promise<number> {
  const packageRoot = selectedPackageRoot(args);
  const compilerVersion = compilerVersionFor(packageRoot);
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  let envelope: Envelope;
  try {
    envelope = await withCapturedStdout(streams.err, () =>
      inspect({
        ...definitionRequestFor(args, "dist", loader),
        compilerVersion,
      }),
    );
  } catch (error) {
    const report = unstartedCheckReport(args, "edit", error);
    envelope = failed({
      compilerVersion,
      sourceSet: report.sourceSet,
      status: "failed",
      diagnostics: report.diagnostics,
    });
  } finally {
    await loader.dispose();
  }
  writeReport(streams, envelope, args.json, render);
  return EXIT_CODES[envelope.status];
}

export async function runModelInspect(
  args: ModelInspectArgs,
  options: InspectOptions = {},
): Promise<number> {
  const streams = options.streams ?? processStreams;
  const selector = parseModelSelector(args.selector);
  if (!selector.ok) {
    streams.err(`${selector.message}\n`);
    return 2;
  }
  const selection = {
    kind: "document-model",
    key: selector.key,
    version: selector.version,
  } as const;
  return await runInspection<DefinitionInspectionEnvelope>(
    args,
    streams,
    (request) => inspectDefinition({ ...request, selection }),
    ({ compilerVersion, ...failure }) => ({
      kind: "powerhouse.definition-inspection",
      formatVersion: 1,
      compilerVersion,
      selection,
      ...failure,
    }),
    renderDefinition,
  );
}

function renderDefinition(envelope: DefinitionInspectionEnvelope): string {
  if (envelope.status !== "ok") {
    return [
      `${envelope.status}: ${envelope.selection.key}@${String(envelope.selection.version)}`,
      ...envelope.diagnostics.map(formatDefinitionDiagnostic),
    ].join("\n");
  }
  return [
    `${envelope.selection.key}@${String(envelope.selection.version)} ${envelope.digest}`,
    `compiler ${envelope.compilerVersion}`,
    `identity ${envelope.definition.compatibility.identity}, serialization ${envelope.definition.compatibility.serialization}`,
    `source ${envelope.source.specifier}${
      envelope.source.exportPath === undefined
        ? ""
        : `#/${envelope.source.exportPath.join("/")}`
    }`,
  ].join("\n");
}

export function runScalarInspect(
  args: ScalarInspectArgs,
  options: InspectOptions = {},
): number {
  const streams = options.streams ?? processStreams;
  const envelope = inspectScalar({
    name: args.name,
    compilerVersion: compilerVersionFor(),
  });
  writeReport(streams, envelope, args.json, (scalar) =>
    scalar.status === "ok"
      ? [
          `${scalar.definition.name} ${scalar.digest}`,
          `representation ${scalar.definition.representation}, persistable ${String(scalar.definition.persistable)}`,
          `coercion ${scalar.definition.coercion.source}`,
        ].join("\n")
      : scalar.diagnostics.map(formatDefinitionDiagnostic).join("\n"),
  );
  return EXIT_CODES[envelope.status];
}

export async function runSubgraphInspect(
  args: SubgraphInspectArgs,
  options: InspectOptions = {},
): Promise<number> {
  const streams = options.streams ?? processStreams;
  const name = args.selector.trim();
  if (name === "") {
    streams.err("Name the subgraph to inspect.\n");
    return 2;
  }
  const selection = { kind: "subgraph", key: name } as const;
  return await runInspection<SubgraphInspectionEnvelope>(
    args,
    streams,
    (request) => inspectSubgraph({ ...request, selection }),
    ({ compilerVersion, ...failure }) => ({
      kind: "powerhouse.subgraph-inspection",
      formatVersion: 1,
      compilerVersion,
      selection,
      ...failure,
    }),
    renderSubgraph,
  );
}

function renderSubgraph(envelope: SubgraphInspectionEnvelope): string {
  if (envelope.status !== "ok") {
    return [
      `${envelope.status}: ${envelope.selection.key}`,
      ...envelope.diagnostics.map(formatDefinitionDiagnostic),
    ].join("\n");
  }
  const definition = envelope.definition;
  return [
    `${definition.name} ${envelope.digest}`,
    `compiler ${envelope.compilerVersion}`,
    `schema ${definition.schemaKind}, subscriptions ${String(definition.hasSubscriptions)}`,
    definition.schemaKind === "typed"
      ? `${String(definition.types.length)} types, ${String(definition.entries.length)} entries`
      : `${String(definition.resolverCoordinates.length)} resolver coordinates`,
    `source ${envelope.source.specifier}${
      envelope.source.exportPath === undefined
        ? ""
        : `#/${envelope.source.exportPath.join("/")}`
    }`,
  ].join("\n");
}
