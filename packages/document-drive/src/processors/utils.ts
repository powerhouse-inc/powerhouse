import type { Options } from "@sindresorhus/fnv1a";
import fnv1a from "@sindresorhus/fnv1a";
import type {
  HashAlgorithmsLegacy,
  IBaseRelationalDbLegacy,
  IRelationalDbLegacy,
  IRelationalQueryBuilderLegacy,
} from "document-drive";

const SUPPORTED_SIZES: Options["size"][] = [32, 64, 128, 256, 512, 1024];
const LOG2_26 = Math.log2(26); //
/**
 * Hashes a string to a lowercase base-26 string.
 * @param str The string to hash.
 * @param length The length of the hash. Defaults to 10.
 * @param algorithm The hashing algorithm to use. Defaults to "fnv1a".
 * @returns The hashed string.
 */
export function hashNamespaceLegacy(
  str: string,
  length = 10,
  algorithm: HashAlgorithmsLegacy = "fnv1a",
) {
  if (algorithm === "fnv1a") {
    const requiredBits = Math.ceil(length * LOG2_26);
    const bitSize =
      SUPPORTED_SIZES.find((size) => size && size >= requiredBits) ?? 1024;
    const hash = fnv1a(str, { size: bitSize });
    return toBase26(hash, length);
  } else {
    throw new Error(`Unsupported hashing algorithm: ${algorithm}`);
  }
}

// converts hash to lowercase letters
function toBase26(num: bigint, length = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  while (num > 0n && out.length < length) {
    out = alphabet[Number(num % 26n)] + out;
    num /= 26n;
  }
  return out.padStart(length, "a"); // optional padding
}

/**
 * Creates a RelationalDb instance with namespace support.
 * @param baseDb The base RelationalDb instance to enhance.
 * @param baseOptions The default options for namespace creation. Hashes namespace by default.
 * @returns The enhanced RelationalDb instance.
 */
export function createRelationalDbLegacy<Schema>(
  baseDb: IBaseRelationalDbLegacy<Schema>,
  baseOptions?: NamespaceOptions,
): IRelationalDbLegacy<Schema> {
  const relationalDb = baseDb as IRelationalDbLegacy<Schema>;

  relationalDb.createNamespace = <NamespaceSchema>(
    namespace: string,
    options?: NamespaceOptions,
  ) =>
    createNamespacedDbLegacy<NamespaceSchema>(
      baseDb,
      namespace,
      options ?? baseOptions,
    );

  relationalDb.queryNamespace = <NamespaceSchema>(
    namespace: string,
    options?: NamespaceOptions,
  ) =>
    createNamespacedQueryBuilderLegacy<NamespaceSchema>(
      baseDb,
      namespace,
      options ?? baseOptions,
    );

  return relationalDb;
}

type NamespaceOptions = {
  hashNamespace?: boolean;
};

export async function createNamespacedDbLegacy<Schema>(
  db: IBaseRelationalDbLegacy<any>,
  namespace: string,
  options?: NamespaceOptions,
): Promise<IRelationalDbLegacy<Schema>> {
  // hash the namespace to avoid too long namespaces
  const shouldHash = options?.hashNamespace ?? true;
  const hashValue = shouldHash ? hashNamespaceLegacy(namespace) : namespace;
  await db.schema.createSchema(hashValue).ifNotExists().execute();
  const schemaRelationalDb = db.withSchema(hashValue);
  return schemaRelationalDb as IRelationalDbLegacy<Schema>;
}

export function createNamespacedQueryBuilderLegacy<Schema>(
  db: IBaseRelationalDbLegacy<any>,
  namespace: string,
  options?: NamespaceOptions,
): IRelationalQueryBuilderLegacy<Schema> {
  const shouldHash = options?.hashNamespace ?? true;
  const hashValue = shouldHash ? hashNamespaceLegacy(namespace) : namespace;
  const namespacedDb = db.withSchema(hashValue) as IRelationalDbLegacy<Schema>;
  return relationalDbToQueryBuilderLegacy(namespacedDb);
}

/**
 * Returns a query builder for a RelationalDb instance.
 * @param query The RelationalDb instance to convert.
 * @returns The IRelationalQueryBuilder instance.
 */
export function relationalDbToQueryBuilderLegacy<TSchema>(
  query: IBaseRelationalDbLegacy<TSchema>,
): IRelationalQueryBuilderLegacy<TSchema> {
  return {
    selectFrom: query.selectFrom.bind(query),
    selectNoFrom: query.selectNoFrom.bind(query),
    with: query.with.bind(query),
    withRecursive: query.withRecursive.bind(query),
    withSchema: (schema: string) =>
      relationalDbToQueryBuilderLegacy<TSchema>(query.withSchema(schema)),
  };
}
