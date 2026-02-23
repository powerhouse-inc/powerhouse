import type {
  InternalTransmitterUpdate,
  IProcessorLegacy,
  IRelationalDbLegacy,
  IRelationalDbProcessorLegacy,
  IRelationalQueryBuilderLegacy,
  RelationalDbProcessorClassLegacy,
  RelationalDbProcessorFilterLegacy,
} from "document-drive";
import { relationalDbToQueryBuilderLegacy } from "./utils.js";

const IS_RELATIONAL_DB_PROCESSOR = Symbol.for("ph.IS_RELATIONAL_DB_PROCESSOR");

/**
 * Base class for relational db processors that require a relational database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class RelationalDbProcessorLegacy<
  TDatabaseSchema = unknown,
> implements IRelationalDbProcessorLegacy<TDatabaseSchema> {
  constructor(
    protected _namespace: string,
    protected _filter: RelationalDbProcessorFilterLegacy,
    protected relationalDb: IRelationalDbLegacy<TDatabaseSchema>,
  ) {}

  static [IS_RELATIONAL_DB_PROCESSOR] = true;

  static is(p: unknown): p is RelationalDbProcessorLegacy {
    let proto = Object.getPrototypeOf(p);
    while (proto) {
      if (proto.constructor?.[IS_RELATIONAL_DB_PROCESSOR]) return true;

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
    this: RelationalDbProcessorClassLegacy<Schema>,
    driveId: string,
    db: IRelationalDbLegacy<any>,
  ): IRelationalQueryBuilderLegacy<Schema> {
    return db.queryNamespace(this.getNamespace(driveId));
  }

  /**
   * Returns the filter for the processor.
   * This method can be overridden by derived classes to provide a custom filter.
   */
  get filter(): RelationalDbProcessorFilterLegacy {
    return this._filter;
  }

  /**
   * Returns the namespace used by the processor.
   */
  get namespace(): string {
    return this._namespace;
  }

  get query(): IRelationalQueryBuilderLegacy<TDatabaseSchema> {
    return relationalDbToQueryBuilderLegacy(this.relationalDb);
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

export function isRelationalDbProcessor(
  p: IProcessorLegacy,
): p is IRelationalDbProcessorLegacy {
  return RelationalDbProcessorLegacy.is(p);
}
