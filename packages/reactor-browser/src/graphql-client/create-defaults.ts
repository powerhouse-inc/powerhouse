import type {
  CreateProtocolVersionsOptions,
  DocumentModelModule,
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  capSelection,
  isSignaturePolicy,
  localSupports,
  PEER_CAPABILITIES,
} from "@powerhousedao/shared/document-model";
import type { GetCreateDefaultsQuery } from "../graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../graphql/types.js";
import {
  GraphQLOperationNotSupportedError,
  queriesUnknownArgument,
  queriesUnknownField,
} from "./errors.js";

/** The queries a light client reads a new document's defaults with. */
export type CreateDefaultsSdk = Pick<
  ReactorGraphQLClient,
  "GetCreateDefaults" | "GetCreateProtocolVersions"
>;

/** The host's policy for a new document; a host without `createDefaults` is refused, as a guess could under-sign. */
export async function readCreateSignaturePolicy(
  sdk: CreateDefaultsSdk,
  signal?: AbortSignal,
): Promise<SignaturePolicy> {
  const defaults = await readCreateDefaults(sdk, undefined, signal);
  if (defaults === undefined) {
    throw new GraphQLOperationNotSupportedError(
      "getCreateSignaturePolicy",
      "the Switchboard predates the createDefaults query",
    );
  }
  const { signaturePolicy } = defaults;
  if (!isSignaturePolicy(signaturePolicy)) {
    throw new Error(
      `The Switchboard answered an unknown create signature policy: ${signaturePolicy}`,
    );
  }
  return signaturePolicy;
}

/** The host's per-type selection, capped at what this build runs and fitted to `modules`; baseline from an old host. */
export async function readCreateProtocolVersions(
  sdk: CreateDefaultsSdk,
  { documentType, parentIdentifier }: CreateProtocolVersionsOptions,
  modules: readonly DocumentModelModule[],
  signal?: AbortSignal,
): Promise<ProtocolVersions> {
  const host = await hostCreateProtocolVersions(
    sdk,
    documentType,
    parentIdentifier,
    signal,
  );
  // Pinned: this build runs base-reducer 2 only, so the cap is the fit.
  return capSelection(
    host,
    PEER_CAPABILITIES,
    localSupports(PEER_CAPABILITIES, {}),
  );
}

/** The Switchboard's selection; undefined from a host without `createDefaults`. */
async function hostCreateProtocolVersions(
  sdk: CreateDefaultsSdk,
  documentType: string | undefined,
  parentIdentifier: string | undefined,
  signal: AbortSignal | undefined,
): Promise<ProtocolVersions | undefined> {
  if (documentType !== undefined) {
    try {
      const result = await sdk.GetCreateProtocolVersions(
        { documentType, parentIdOrSlug: parentIdentifier },
        undefined,
        signal,
      );
      return protocolVersionsFrom(result.createDefaults.protocolVersions);
    } catch (error) {
      if (queriesUnknownField(error, "createDefaults")) return undefined;
      if (!queriesUnknownArgument(error, "documentType")) throw error;
    }
  }
  const defaults = await readCreateDefaults(sdk, parentIdentifier, signal);
  return defaults && protocolVersionsFrom(defaults.protocolVersions);
}

/** The reactor-wide `createDefaults`; undefined from a host without the query. */
async function readCreateDefaults(
  sdk: CreateDefaultsSdk,
  parentIdentifier: string | undefined,
  signal: AbortSignal | undefined,
): Promise<GetCreateDefaultsQuery["createDefaults"] | undefined> {
  try {
    const result = await sdk.GetCreateDefaults(
      { parentIdOrSlug: parentIdentifier },
      undefined,
      signal,
    );
    return result.createDefaults;
  } catch (error) {
    if (queriesUnknownField(error, "createDefaults")) {
      return undefined;
    }
    throw error;
  }
}

function protocolVersionsFrom(value: unknown): ProtocolVersions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "The Switchboard answered malformed create protocol versions",
    );
  }
  const versions: ProtocolVersions = {};
  for (const [protocol, version] of Object.entries(value)) {
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new Error(
        `The Switchboard answered a malformed version for protocol ${protocol}`,
      );
    }
    versions[protocol] = version;
  }
  return versions;
}
