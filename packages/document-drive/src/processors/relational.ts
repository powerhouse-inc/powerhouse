import type { ListenerFilter } from "#drive-document-model/module";
import type { InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import type {
  IProcessor,
  IRelationalDb,
  IRelationalQueryBuilder,
} from "./types.js";
import { relationalDbToQueryBuilder } from "./utils.js";

export type { IRelationalQueryBuilder } from "./types.js";

export type RelationalDbProcessorFilter = ListenerFilter;
export interface IRelationalDbProcessor<TDatabaseSchema = unknown>
  extends IProcessor {
  namespace: string;
  query: IRelationalQueryBuilder<TDatabaseSchema>;
  filter: RelationalDbProcessorFilter;
  initAndUpgrade(): Promise<void>;
}

export function isRelationalDbProcessor(
  p: IProcessor,
): p is IRelationalDbProcessor {
  return RelationalDbProcessor.is(p);
}

export type ExtractProcessorSchema<TProcessor> =
  TProcessor extends RelationalDbProcessor<infer TSchema> ? TSchema : never;

export type ExtractProcessorSchemaOrSelf<TProcessor> =
  TProcessor extends RelationalDbProcessor<infer TSchema>
    ? TSchema
    : TProcessor;

export type RelationalDbProcessorClass<TSchema> =
  typeof RelationalDbProcessor<TSchema>;

const IS_RELATIONAL_DB_PROCESSOR = Symbol.for("ph.IS_RELATIONAL_DB_PROCESSOR");

/**
 * Base class for relational db processors that require a relational database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class RelationalDbProcessor<TDatabaseSchema = unknown>
  implements IRelationalDbProcessor<TDatabaseSchema>
{
  constructor(
    protected _namespace: string,
    protected _filter: RelationalDbProcessorFilter,
    protected relationalDb: IRelationalDb<TDatabaseSchema>,
  ) {}

  static [IS_RELATIONAL_DB_PROCESSOR] = true;

  static is(p: unknown): p is RelationalDbProcessor {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let proto = Object.getPrototypeOf(p);
    while (proto) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (proto.constructor?.[IS_RELATIONAL_DB_PROCESSOR]) return true;
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

  static query<Schema>(
    this: RelationalDbProcessorClass<Schema>,
    driveId: string,
    db: IRelationalDb<any>,
  ): IRelationalQueryBuilder<Schema> {
    return db.queryNamespace(this.getNamespace(driveId));
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

  get query(): IRelationalQueryBuilder<TDatabaseSchema> {
    return relationalDbToQueryBuilder(this.relationalDb);
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
  abstract onStrands(strands: InternalTransmitterUpdate[]): Promise<void>;

  /**
   * Called when the processor is disconnected.
   * This method is meant to be overridden by subclasses to clean up resources.
   */
  abstract onDisconnect(): Promise<void>;
}
