import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { ProtocolSupport } from "../executor/types.js";
import { UnsupportedStoredProtocolError } from "../shared/errors.js";
import {
  countDocumentsCreatedWith,
  storedProtocolVersions,
} from "../storage/kysely/stored-protocol-versions.js";

export type UnsupportedStoredDocuments = "refuse" | "read-only";

/** Refuses to run below a version the store holds, unless told read-only. */
export async function checkStoredProtocols(
  db: Kysely<any>,
  schema: string,
  support: ProtocolSupport,
  mode: UnsupportedStoredDocuments,
  logger: ILogger,
): Promise<void> {
  const unsupported = new Map<string, { protocol: string; version: number }>();
  const hashes: string[] = [];
  for (const { hash, versions } of await storedProtocolVersions(db, schema)) {
    let refused = false;
    for (const [protocol, version] of Object.entries(versions)) {
      const supported = support[protocol] as readonly number[] | undefined;
      if (supported === undefined || supported.includes(version)) continue;
      unsupported.set(`${protocol}:${version}`, { protocol, version });
      refused = true;
    }
    if (refused) hashes.push(hash);
  }
  if (hashes.length === 0) return;

  const error = new UnsupportedStoredProtocolError(
    [...unsupported.values()],
    await countDocumentsCreatedWith(db, schema, hashes),
  );
  if (mode === "refuse") throw error;
  logger.warn("Starting with documents read-only: @message", error.message);
}
