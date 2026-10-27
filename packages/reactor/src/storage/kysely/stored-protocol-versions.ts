import { sql, type Kysely } from "kysely";

type ProtocolVersions = { [protocol: string]: number };

export type StoredProtocolVersions = {
  /** The (versions, model) pair's key, for countDocumentsCreatedWith. */
  hash: string;
  /** The created document type. */
  model: string;
  versions: ProtocolVersions;
};

// Reads idx_operation_created_model_protocol_versions; a marker at index 0 never counts.
const created = sql.raw(
  `scope = 'document' and "index" = 0 and (action->'input'->'protocolVersions') is not null and action->>'type' <> 'PURGE_DOCUMENT'`,
);
const key = sql.raw(
  `(md5((action->'input'->'protocolVersions')::text) || coalesce(action->'input'->>'model', ''))`,
);

/** Distinct creation (model, protocolVersions) pairs, one index probe per pair. */
export async function storedProtocolVersions(
  db: Kysely<any>,
  schema: string,
): Promise<StoredProtocolVersions[]> {
  const operation = sql.id(schema, "Operation");
  const result = await sql<{
    hash: string;
    model: string | null;
    versions: ProtocolVersions;
  }>`
    with recursive hashes(hash) as (
      select (select ${key} from ${operation} where ${created} order by 1 limit 1)
      union all
      select (
        select ${key} from ${operation}
        where ${created} and ${key} > hashes.hash
        order by 1 limit 1
      )
      from hashes where hashes.hash is not null
    ),
    pairs as (
      select hash, (
        select action->'input' from ${operation}
        where ${created} and ${key} = hashes.hash limit 1
      ) as input
      from hashes where hash is not null
    )
    select hash, input->>'model' as model, input->'protocolVersions' as versions
    from pairs
  `.execute(db);
  return result.rows.map(({ hash, model, versions }) => ({
    hash,
    model: model ?? "",
    versions,
  }));
}

/** Documents created with any of the (model, protocolVersions) pairs `hashes` name. */
export async function countDocumentsCreatedWith(
  db: Kysely<any>,
  schema: string,
  hashes: readonly string[],
): Promise<number> {
  if (hashes.length === 0) return 0;
  const operation = sql.id(schema, "Operation");
  const result = await sql<{ documents: string | number }>`
    select count(distinct "documentId") as documents from ${operation}
    where ${created} and ${key} in (${sql.join(hashes)})
  `.execute(db);
  return Number(result.rows[0]?.documents ?? 0);
}
