import type {
  DocumentModelModule,
  ProtocolRefusal,
  ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import {
  capabilitiesFor,
  refusalFor,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { ProtocolSupport } from "../protocol/support.js";
import { UnsupportedStoredProtocolError } from "../shared/errors.js";
import {
  countDocumentsCreatedWith,
  storedProtocolVersions,
} from "../storage/kysely/stored-protocol-versions.js";

export type UnsupportedStoredDocuments = "refuse" | "read-only";

/** The registered versions of a type; empty when none is. */
export type ModulesOf = (
  documentType: string,
) => readonly DocumentModelModule[];

/** Stored types judged only once their model loads. */
export type DeferredStoredModels = ReadonlyMap<string, ProtocolVersions[]>;

/**
 * Refuses to run what the store holds and this reactor cannot: a version it
 * does not run, or a registered model that cannot run its stored version.
 * Unless told read-only. Types not registered yet are returned, to judge on
 * load with {@link storedModelRefusals}.
 */
export async function checkStoredProtocols(
  db: Kysely<any>,
  schema: string,
  support: ProtocolSupport,
  mode: UnsupportedStoredDocuments,
  logger: ILogger,
  modulesOf: ModulesOf = () => [],
): Promise<DeferredStoredModels> {
  const unsupported = new Map<string, ProtocolRefusal>();
  const deferred = new Map<string, ProtocolVersions[]>();
  const hashes: string[] = [];
  for (const { hash, model, versions } of await storedProtocolVersions(
    db,
    schema,
  )) {
    const modules = modulesOf(model);
    let refused = false;
    for (const [protocol, version] of Object.entries(versions)) {
      const refusal = refusalFor(
        model,
        { [protocol]: version },
        support,
        modules,
      );
      if (!refusal) continue;
      unsupported.set(
        `${refusal.protocol}:${refusal.version}:${refusal.documentType ?? ""}`,
        refusal,
      );
      refused = true;
    }
    if (refused) {
      hashes.push(hash);
    } else if (
      modules.length === 0 &&
      capabilitiesFor(versions)?.needsStateReducer
    ) {
      deferred.set(model, [...(deferred.get(model) ?? []), versions]);
    }
  }
  if (hashes.length === 0) return deferred;

  const error = new UnsupportedStoredProtocolError(
    [...unsupported.values()],
    await countDocumentsCreatedWith(db, schema, hashes),
  );
  if (mode === "refuse") throw error;
  logger.warn("Starting with documents read-only: @message", error.message);
  return deferred;
}

/** Why a model loaded after boot cannot run the versions its stored documents carry. */
export function storedModelRefusals(
  documentType: string,
  deferred: DeferredStoredModels,
  support: ProtocolSupport,
  modules: readonly DocumentModelModule[],
): ProtocolRefusal[] {
  const refusals = new Map<string, ProtocolRefusal>();
  for (const versions of deferred.get(documentType) ?? []) {
    const refusal = refusalFor(documentType, versions, support, modules);
    if (refusal) {
      refusals.set(`${refusal.protocol}:${refusal.version}`, refusal);
    }
  }
  return [...refusals.values()];
}
