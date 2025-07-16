import { type ListenerFilter } from "#drive-document-model/module";
import { type PHDocument } from "document-model";
import { type QueryCreator } from "kysely";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import { type IProcessor, type IRelationalDb } from "./types.js";
import { hashNamespace } from "./utils.js";

export type IOperationalQueryMethods =
  | "selectFrom"
  | "selectNoFrom"
  | "with"
  | "withRecursive";

export type IOperationalQueryBuilder<Schema = unknown> = Pick<
  QueryCreator<Schema>,
  IOperationalQueryMethods
> & {
  withSchema: (schema: string) => IOperationalQueryBuilder<Schema>;
};

export type RelationalDbProcessorFilter = ListenerFilter;
export interface IRelationalDbProcessor<TDatabaseSchema = unknown>
  extends IProcessor {
  namespace: string;
  query: IOperationalQueryBuilder<TDatabaseSchema>;
  filter: RelationalDbProcessorFilter;
  initAndUpgrade(): Promise<void>;
}

export async function createNamespacedDb<T>(
  namespace: string,
  db: IRelationalDb,
  options?: {
    hashNamespace?: boolean; // defaults to true
  },
): Promise<IRelationalDb<ExtractProcessorSchema<T>>> {
  // hash the namespace to avoid too long namespaces
  const shouldHash = options?.hashNamespace ?? true;
  const hashValue = shouldHash ? hashNamespace(namespace) : namespace;
  await db.schema.createSchema(hashValue).ifNotExists().execute();
  const schemaRelationalDb = db.withSchema(hashValue);
  return schemaRelationalDb as IRelationalDb<ExtractProcessorSchema<T>>;
}

export function createNamespacedQueryBuilder<Schema>(
  processor: RelationalDbProcessorClass<Schema>,
  driveId: string,
  db: IRelationalDb,
  options?: {
    hashNamespace?: boolean; // defaults to true
  },
): IOperationalQueryBuilder<Schema> {
  const namespace = processor.getNamespace(driveId);
  const shouldHash = options?.hashNamespace ?? true;
  const hashValue = shouldHash ? hashNamespace(namespace) : namespace;
  const namespacedDb = db.withSchema(hashValue) as IRelationalDb<Schema>;
  return RelationalDbToQueryBuilder(namespacedDb);
}

export function isRelationalDbProcessor(
  p: IProcessor,
): p is IRelationalDbProcessor {
  return RelationalDbProcessor.is(p);
}

export type ExtractProcessorSchema<TProcessor> =
  TProcessor extends RelationalDbProcessor<infer TSchema> ? TSchema : never;

function RelationalDbToQueryBuilder<TSchema>(
  query: IRelationalDb<TSchema>,
): IOperationalQueryBuilder<TSchema> {
  return {
    selectFrom: query.selectFrom.bind(query),
    selectNoFrom: query.selectNoFrom.bind(query),
    with: query.with.bind(query),
    withRecursive: query.withRecursive.bind(query),
    withSchema: (schema: string) =>
      RelationalDbToQueryBuilder<TSchema>(query.withSchema(schema)),
  };
}

export type RelationalDbProcessorClass<TSchema> = (new (
  ...args: any[]
) => RelationalDbProcessor<TSchema>) &
  typeof RelationalDbProcessor<TSchema>;

const IS_OPERATIONAL_PROCESSOR = Symbol.for("ph.IS_OPERATIONAL_PROCESSOR");

/**
 * Base class for operational processors that require a relational database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class RelationalDbProcessor<TDatabaseSchema = unknown>
  implements IRelationalDbProcessor<TDatabaseSchema>
{
  constructor(
    protected _namespace: string,
    protected _filter: RelationalDbProcessorFilter,
    protected RelationalDb: IRelationalDb<TDatabaseSchema>,
  ) {}

  static [IS_OPERATIONAL_PROCESSOR] = true;

  static is(p: unknown): p is RelationalDbProcessor {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let proto = Object.getPrototypeOf(p);
    while (proto) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (proto.constructor?.[IS_OPERATIONAL_PROCESSOR]) return true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  }

  /**
   * Returns the namespace for a given drive id.
   * This method can be overridden by derived classes to provide a custom namespace.
   */
  static getNamespace(driveId: string): string {
    return `${this.name}_${driveId.replaceAll("-", "_")}`;
  }

  static query<TSchema>(
    this: RelationalDbProcessorClass<TSchema>,
    driveId: string,
    db: IRelationalDb<any>,
  ): IOperationalQueryBuilder<TSchema> {
    return createNamespacedQueryBuilder(this, driveId, db);
  }

  /**
   * Returns the filter for the processor.
   * This method can be overridden by derived classes to provide a custom filter.
   */
  get filter(): RelationalDbProcessorFilter {
    return this._filter;
  }

  /**
   * Returns the namespace used by the processor.
   */
  get namespace(): string {
    return this._namespace;
  }

  get query(): IOperationalQueryBuilder<TDatabaseSchema> {
    return RelationalDbToQueryBuilder(this.RelationalDb);
  }

  /**
   * Abstract method that derived classes must implement.
   * This method is meant to be called on subclasses to initialize and upgrade the database.
   */
  abstract initAndUpgrade(): Promise<void>;

  /**
   * Abstract method that derived classes must implement.
   * This is where the business logic for processing document operations should be implemented.
   */
  abstract onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void>;

  /**
   * Called when the processor is disconnected.
   * This method is meant to be overridden by subclasses to clean up resources.
   */
  abstract onDisconnect(): Promise<void>;
}
