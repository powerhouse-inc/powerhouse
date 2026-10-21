import type {
  CreateDocumentActionInput,
  DocumentModelModule,
  ProtocolSupport,
  ProtocolVersions,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  capabilitiesFor,
  MissingStateReducerError,
  refusalFor,
  requireStateReducer,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { ModuleNotFoundError } from "../registry/errors.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { UnsupportedProtocolVersionError } from "../shared/errors.js";

/** The one place a reactor decides whether it can run a document's protocol versions. */
export interface IProtocolGate {
  readonly support: ProtocolSupport;
  /** Why this reactor cannot run the document; with `documentType`, also per model. */
  refusal(
    documentId: string,
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): UnsupportedProtocolVersionError | undefined;
  assertRunnable(
    documentId: string,
    versions: ProtocolVersions | undefined,
    documentType?: string,
  ): void;
  /** The registered versions of `documentType`; empty when none is. */
  registeredModules(documentType: string): DocumentModelModule[];
}

/** Whether running a create at `versions` needs its model registered first. */
export function createNeedsModel(
  versions: ProtocolVersions | undefined,
): boolean {
  return capabilitiesFor(versions)?.needsStateReducer === true;
}

/** A create whose model cannot load: refused when its versions need the model. */
export function modelUnavailableRefusal(
  input: Pick<CreateDocumentActionInput, "documentId" | "model"> & {
    protocolVersions?: ProtocolVersions;
  },
  documentId: string = input.documentId,
): UnsupportedProtocolVersionError | undefined {
  const caps = capabilitiesFor(input.protocolVersions);
  if (!caps?.needsStateReducer) return undefined;
  return new UnsupportedProtocolVersionError(
    documentId,
    "base-reducer",
    caps.version,
    input.model,
  );
}

/** Maps a missing state reducer to the typed refusal read models skip. */
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
      capabilitiesFor(versions)?.version ?? 0,
      documentType,
    );
  }
}

export function createProtocolGate(
  support: ProtocolSupport,
  registry: IDocumentModelRegistry,
  logger: ILogger,
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
      logger.info(
        "Admitting document @documentId with unregistered protocol @protocol @version",
        documentId,
        protocol,
        version,
      );
    }
    const refused = refusalFor(
      documentType,
      versions,
      support,
      // Only a version that needs tagged reducers reads the registry.
      documentType !== undefined && capabilitiesFor(versions)?.needsStateReducer
        ? registeredModules(documentType)
        : [],
    );
    return refused
      ? new UnsupportedProtocolVersionError(
          documentId,
          refused.protocol,
          refused.version,
          refused.documentType,
        )
      : undefined;
  };

  return {
    support,
    refusal,
    assertRunnable(documentId, versions, documentType) {
      const refused = refusal(documentId, versions, documentType);
      if (refused) throw refused;
    },
    registeredModules,
  };
}
