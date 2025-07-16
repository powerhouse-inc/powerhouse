import { type ListenerFilter } from "#drive-document-model/module";
import { type PHDocument } from "document-model";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import {
  type IProcessor,
  type IRelationalDb,
  type IRelationalQueryBuilder,
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
    protected relationalDb: IRelationalDb<TDatabaseSchema>,
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
    db: IRelationalDb<TSchema>,
  ): IRelationalQueryBuilder<TSchema> {
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
  abstract onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void>;

  /**
   * Called when the processor is disconnected.
   * This method is meant to be overridden by subclasses to clean up resources.
   */
  abstract onDisconnect(): Promise<void>;
}
