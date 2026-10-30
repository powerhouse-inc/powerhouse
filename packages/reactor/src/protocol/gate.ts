import type {
  BaseReducerCapabilities,
  BaseReducerVersion,
  CreateDocumentActionInput,
  DocumentModelModule,
  PHDocumentHeader,
  ProtocolRefusal,
  ProtocolSupport,
  ProtocolVersions,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseReducerVersionsFor,
  capabilitiesOf,
  isBaseReducerVersion,
  MissingStateReducerError,
  modelRunsBaseReducer,
  needsTaggedModel,
  refusalFor,
  requireStateReducer,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { resolveFeatureFlags } from "../core/feature-flags.js";
import { ModuleNotFoundError } from "../registry/errors.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { UnsupportedProtocolVersionError } from "../shared/errors.js";

/** The base-reducer capabilities a document's versions run under on this reactor. */
export interface BaseReducerResolver {
  /**
   * Undefined only without a base-reducer number. A number this build does
   * not know runs as the highest version this reactor runs.
   */
  capabilities(
    versions: ProtocolVersions | undefined,
  ): BaseReducerCapabilities | undefined;
  /** `capabilities` of a header; throws when it carries no base-reducer number. */
  headerCapabilities(header: PHDocumentHeader): BaseReducerCapabilities;
}

/**
 * Resolves against the highest known version `support` lists; without one,
 * the highest the default feature flags run.
 */
export function baseReducerResolver(
  support?: ProtocolSupport,
): BaseReducerResolver {
  const listed = (support?.["base-reducer"] ?? []).filter(isBaseReducerVersion);
  const runs =
    listed.length > 0 ? listed : baseReducerVersionsFor(resolveFeatureFlags());
  const highest = capabilitiesOf(Math.max(...runs) as BaseReducerVersion);
  const capabilities: BaseReducerResolver["capabilities"] = (versions) => {
    const version = versions?.["base-reducer"];
    if (isBaseReducerVersion(version)) return capabilitiesOf(version);
    return typeof version === "number" ? highest : undefined;
  };
  return {
    capabilities,
    headerCapabilities(header) {
      const caps = capabilities(header.protocolVersions);
      if (caps === undefined) {
        throw new Error(
          `Document ${header.id} carries no base-reducer protocol version`,
        );
      }
      return caps;
    },
  };
}

/** For a reader built without a gate: the highest version the default flags run. */
export const UNGATED: BaseReducerResolver = baseReducerResolver();

/** Why the model cannot run the base-reducer version `versions` resolves to; names the stored number. */
function modelRefusal(
  resolver: BaseReducerResolver,
  versions: ProtocolVersions | undefined,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
): ProtocolRefusal | undefined {
  const caps = resolver.capabilities(versions);
  if (
    documentType === undefined ||
    caps === undefined ||
    modelRunsBaseReducer(caps, documentType, modules) !== false
  ) {
    return undefined;
  }
  return {
    protocol: "base-reducer",
    version: versions?.["base-reducer"] ?? caps.version,
    documentType,
  };
}

/** Why `versions` cannot run here: a version `support` does not list, or `modelRefusal`. */
export function protocolRefusal(
  support: ProtocolSupport,
  resolver: BaseReducerResolver,
  versions: ProtocolVersions | undefined,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
): ProtocolRefusal | undefined {
  return (
    refusalFor(undefined, versions, support, []) ??
    modelRefusal(resolver, versions, documentType, modules)
  );
}

/** The one place a reactor decides whether it can run a document's protocol versions. */
export interface IProtocolGate extends BaseReducerResolver {
  readonly support: ProtocolSupport;
  /** Why this reactor cannot run the document; with `documentType`, also per model. */
  refusal(
    documentId: string,
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): UnsupportedProtocolVersionError | undefined;
  /** `refusal` without the error, for callers that report it their own way. */
  refusalOf(
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): ProtocolRefusal | undefined;
  /**
   * `refusal` of the base-reducer version alone: reads serve what writes
   * refuse for other protocols, and a number this build does not know.
   */
  readRefusal(
    documentId: string,
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): UnsupportedProtocolVersionError | undefined;
  assertReadable(
    documentId: string,
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): void;
  /** The registered versions of `documentType`; empty when none is. */
  registeredModules(documentType: string): DocumentModelModule[];
}

/** Whether running a create at `versions` needs its model registered first. */
export function createNeedsModel(
  resolver: BaseReducerResolver,
  versions: ProtocolVersions | undefined,
): boolean {
  return needsTaggedModel(resolver.capabilities(versions));
}

/** A create whose model cannot load: refused when its versions need the model. */
export function modelUnavailableRefusal(
  resolver: BaseReducerResolver,
  input: Pick<CreateDocumentActionInput, "documentId" | "model"> & {
    protocolVersions?: ProtocolVersions;
  },
): UnsupportedProtocolVersionError | undefined {
  const caps = resolver.capabilities(input.protocolVersions);
  if (caps === undefined || !needsTaggedModel(caps)) return undefined;
  return new UnsupportedProtocolVersionError(
    input.documentId,
    "base-reducer",
    input.protocolVersions?.["base-reducer"] ?? caps.version,
    input.model,
  );
}

/** Maps a missing state reducer to the typed refusal read models skip, naming the stored number. */
export function stateReducerOrRefusal(
  reducer: DocumentModelModule<any>["reducer"],
  documentId: string,
  documentType: string,
  version: number,
  versions: ProtocolVersions | undefined,
): StateReducer {
  try {
    return requireStateReducer(reducer, documentType, version) as StateReducer;
  } catch (error) {
    if (!MissingStateReducerError.isError(error)) throw error;
    throw new UnsupportedProtocolVersionError(
      documentId,
      "base-reducer",
      versions?.["base-reducer"] ?? 0,
      documentType,
    );
  }
}

/** Without a logger, an admitted unregistered protocol goes unreported. */
export function createProtocolGate(
  support: ProtocolSupport,
  registry: IDocumentModelRegistry,
  logger?: Pick<ILogger, "info">,
): IProtocolGate {
  const loggedUnregistered = new Set<string>();

  const registeredModules = (documentType: string): DocumentModelModule[] => {
    try {
      return registry
        .getSupportedVersions(documentType)
        .map((version) => registry.getModule(documentType, version));
    } catch (error) {
      if (ModuleNotFoundError.isError(error)) return [];
      throw error;
    }
  };

  const resolver = baseReducerResolver(support);

  // Only a version that needs tagged reducers reads the registry.
  const modulesFor = (
    versions: ProtocolVersions | undefined,
    documentType: string | undefined,
  ): DocumentModelModule[] =>
    documentType !== undefined &&
    needsTaggedModel(resolver.capabilities(versions))
      ? registeredModules(documentType)
      : [];

  const refusalOf: IProtocolGate["refusalOf"] = (versions, documentType) =>
    protocolRefusal(
      support,
      resolver,
      versions,
      documentType,
      modulesFor(versions, documentType),
    );

  const typed = (
    documentId: string,
    refused: ProtocolRefusal | undefined,
  ): UnsupportedProtocolVersionError | undefined =>
    refused &&
    new UnsupportedProtocolVersionError(
      documentId,
      refused.protocol,
      refused.version,
      refused.documentType,
    );

  const refusal: IProtocolGate["refusal"] = (
    documentId,
    versions,
    documentType,
  ) => {
    for (const [protocol, version] of Object.entries(versions ?? {})) {
      if (support[protocol] !== undefined || loggedUnregistered.has(protocol)) {
        continue;
      }
      loggedUnregistered.add(protocol);
      logger?.info(
        "Admitting document @documentId with unregistered protocol @protocol @version",
        documentId,
        protocol,
        version,
      );
    }
    return typed(documentId, refusalOf(versions, documentType));
  };

  const readRefusal: IProtocolGate["readRefusal"] = (
    documentId,
    versions,
    documentType,
  ) => {
    const version = versions?.["base-reducer"];
    if (version === undefined) return undefined;
    const read = { "base-reducer": version };
    // A number this build does not know reads as the version it resolves to.
    return typed(
      documentId,
      isBaseReducerVersion(version)
        ? refusalOf(read, documentType)
        : modelRefusal(
            resolver,
            read,
            documentType,
            modulesFor(read, documentType),
          ),
    );
  };

  return {
    ...resolver,
    support,
    refusal,
    refusalOf,
    readRefusal,
    assertReadable(documentId, versions, documentType) {
      const refused = readRefusal(documentId, versions, documentType);
      if (refused) throw refused;
    },
    registeredModules,
  };
}
