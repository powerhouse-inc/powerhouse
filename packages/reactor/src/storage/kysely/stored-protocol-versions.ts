import { sql, type Kysely } from "kysely";

type ProtocolVersions = { [protocol: string]: number };

export type StoredProtocolVersions = {
  hash: string;
  versions: ProtocolVersions;
};

// Reads idx_operation_created_protocol_versions; a marker at index 0 never counts.
const created = sql.raw(
  `scope = 'document' and "index" = 0 and (action->'input'->'protocolVersions') is not null and action->>'type' <> 'PURGE_DOCUMENT'`,
);
const key = sql.raw(`md5((action->'input'->'protocolVersions')::text)`);

/** Distinct creation protocolVersions, one index probe per value. */
export async function storedProtocolVersions(
  db: Kysely<any>,
  schema: string,
): Promise<StoredProtocolVersions[]> {
  const operation = sql.id(schema, "Operation");
  const result = await sql<{ hash: string; versions: ProtocolVersions }>`
    with recursive hashes(hash) as (
      select (select ${key} from ${operation} where ${created} order by 1 limit 1)
      union all
      select (
        select ${key} from ${operation}
        where ${created} and ${key} > hashes.hash
        order by 1 limit 1
      )
      from hashes where hashes.hash is not null
    )
    select hash, (
      select action->'input'->'protocolVersions' from ${operation}
      where ${created} and ${key} = hashes.hash limit 1
    ) as versions
    from hashes where hash is not null
  `.execute(db);
  return result.rows;
}

/** Documents created with any of the protocolVersions `hashes` name. */
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
