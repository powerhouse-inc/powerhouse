import {
  REACTOR_SCHEMA,
  type Database,
  type StorageDatabase,
} from "@powerhousedao/reactor";
import { sql, type Kysely } from "kysely";
import type { ReactorPrivacyDatabase, SubjectRole } from "../schema/tables.js";
import {
  assertDeploymentSecret,
  subjectHash,
  type DeploymentSecret,
} from "../subject-hash.js";

/** One row outside the reactor schema that names the address. */
export type PermissionRow = {
  table: string;
  column: string;
  documentId: string | null;
  detail?: Record<string, unknown>;
};

/** Implemented over reactor-api's DocumentPermissionService by the host. */
export interface IPermissionRowsLookup {
  rowsForAddress(address: string): Promise<PermissionRow[]>;
}

export type SubjectDocument = {
  documentId: string;
  role: SubjectRole;
  firstOrdinal: number;
  lastOrdinal: number;
};

export type BoundSyncRemote = {
  name: string;
  collectionId: string;
  channelType: string;
};

export type PeerManifestAppKey = {
  remoteName: string;
  appKey: string;
  heardAtUtcMs: number | null;
};

export type Disclosure = {
  subjectHash: string;
  documents: SubjectDocument[];
  boundSyncRemotes: BoundSyncRemote[];
  peerManifests: PeerManifestAppKey[];
  permissions: PermissionRow[];
  notCovered: string[];
};

export const DISCLOSURE_NOT_COVERED: readonly string[] = [
  "personal data inside document-model state and action inputs beyond signer, app key, header key, auth creator, grant principals, grant condition literals and reactor-group members",
  "PHDocumentState.deletedBy, a type that is never written",
  "header keys that are not P-256 JWKs",
  "processor, relational, analytics and other add-on read model tables",
  "attachment bytes, which are content-addressed with no owner",
  "erasure audit rows, which hold only keyed hashes",
  "copies held by peers, and Connect's IndexedDB and browser backups",
  "database backups, WAL and point-in-time recovery",
];

const NO_PERMISSION_LOOKUP =
  "reactor-api permission rows: no permission lookup is configured";

type DisclosureDb = Kysely<ReactorPrivacyDatabase & StorageDatabase>;

/** Lists what is held about one identifier. Read-only. */
export class DisclosureService {
  private readonly db: DisclosureDb;

  constructor(
    reactorDb: Kysely<Database>,
    private readonly deploymentSecret: DeploymentSecret,
    private readonly permissions?: IPermissionRowsLookup,
    schema: string = REACTOR_SCHEMA,
  ) {
    assertDeploymentSecret(deploymentSecret);
    this.db = reactorDb.withSchema(schema) as unknown as DisclosureDb;
  }

  async disclose(identifier: string): Promise<Disclosure> {
    const hash = subjectHash(this.deploymentSecret, identifier);
    const lowered = identifier.toLowerCase();

    const documents = await this.db
      .selectFrom("subject_documents")
      .select(["documentId", "role", "firstOrdinal", "lastOrdinal"])
      .where("subjectHash", "=", hash)
      .orderBy("documentId")
      .orderBy("role")
      .execute();

    const bound = await this.db
      .selectFrom("sync_remotes")
      .select(["name", "collection_id", "channel_type"])
      .where(sql<string>`lower(bound_address)`, "=", lowered)
      .orderBy("name")
      .execute();

    const manifests = await this.db
      .selectFrom("sync_remotes")
      .select(["name", "peer_manifest", "peer_manifest_at_utc_ms"])
      .where("peer_manifest", "is not", null)
      .orderBy("name")
      .execute();

    const notCovered = [...DISCLOSURE_NOT_COVERED];
    let permissions: PermissionRow[] = [];
    if (this.permissions === undefined) {
      notCovered.push(NO_PERMISSION_LOOKUP);
    } else {
      permissions = await this.permissions.rowsForAddress(identifier);
    }

    return {
      subjectHash: hash,
      documents: documents.map((row) => ({
        documentId: row.documentId,
        role: row.role,
        firstOrdinal: Number(row.firstOrdinal),
        lastOrdinal: Number(row.lastOrdinal),
      })),
      boundSyncRemotes: bound.map((row) => ({
        name: row.name,
        collectionId: row.collection_id,
        channelType: row.channel_type,
      })),
      peerManifests: manifests.flatMap((row) => {
        const appKey = appKeyOf(row.peer_manifest);
        if (appKey === undefined || appKey.toLowerCase() !== lowered) return [];
        const at = row.peer_manifest_at_utc_ms;
        return [
          {
            remoteName: row.name,
            appKey,
            heardAtUtcMs: at === null ? null : Number(at),
          },
        ];
      }),
      permissions,
      notCovered,
    };
  }
}

/** A malformed manifest names no one; it must not fail the disclosure. */
function appKeyOf(manifest: string | null): string | undefined {
  if (manifest === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    return undefined;
  }
  const appKey = (parsed as { appKey?: unknown } | null)?.appKey;
  return typeof appKey === "string" ? appKey : undefined;
}
