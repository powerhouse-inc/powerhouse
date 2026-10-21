import type { PHDocument } from "./documents.js";
import { withSignaturePolicy } from "./documents.js";
import type { ProtocolVersions, SignaturePolicy } from "./signature-policy.js";
import { requestedSignaturePolicy } from "./signature-policy.js";
import type { PHBaseState } from "./state.js";
import type { DocumentModelModule } from "./types.js";
import { normalizeDocumentModelVersion } from "./version.js";

/** What a new document takes besides the client's selected versions. */
export type NewDocumentHeaderOptions = {
  /** Merged over the selected versions; `signature: 2` makes it v2-required. */
  protocolVersions?: ProtocolVersions;
  /** Overrides the client's creation default. */
  signaturePolicy?: SignaturePolicy;
  /** Passed to the model's createDocument, which fills what it leaves out. */
  initialState?: Partial<PHBaseState>;
  name?: string;
  /** Kept only under the legacy policy; any other policy derives the id. */
  id?: string;
};

/** A new, uncreated document of `module`, headed with `baseVersions` under `options`. */
export function headNewDocument(
  module: DocumentModelModule,
  options: NewDocumentHeaderOptions | undefined,
  defaultPolicy: SignaturePolicy,
  baseVersions: ProtocolVersions,
): PHDocument {
  const document = withSignaturePolicy(
    module.utils.createDocument(options?.initialState),
    requestedSignaturePolicy(options, defaultPolicy),
    {
      id: options?.id,
      protocolVersions: { ...baseVersions, ...options?.protocolVersions },
    },
  );
  document.state.document.version = normalizeDocumentModelVersion(
    module.version,
  );
  if (options?.name !== undefined) {
    document.header.name = options.name;
  }
  return document;
}

/** The registered module for a type: the requested version, else the latest. */
export function selectDocumentModelModule(
  modules: readonly DocumentModelModule[],
  documentModelType: string,
  documentModelVersion?: number,
): DocumentModelModule {
  const matching = modules.filter(
    (m) => m.documentModel.global.id === documentModelType,
  );

  if (documentModelVersion !== undefined) {
    const requested = normalizeDocumentModelVersion(documentModelVersion);
    const module = matching.find(
      (m) => normalizeDocumentModelVersion(m.version) === requested,
    );
    if (!module) {
      throw new Error(
        `Document model not found for type: ${documentModelType} with version: ${documentModelVersion}`,
      );
    }
    return module;
  }

  const latest = matching.reduce<DocumentModelModule | undefined>(
    (best, current) => {
      if (best === undefined) return current;
      const currentVersion = normalizeDocumentModelVersion(current.version);
      const bestVersion = normalizeDocumentModelVersion(best.version);
      return currentVersion > bestVersion ? current : best;
    },
    undefined,
  );
  if (!latest) {
    throw new Error(`Document model not found for type: ${documentModelType}`);
  }
  return latest;
}
