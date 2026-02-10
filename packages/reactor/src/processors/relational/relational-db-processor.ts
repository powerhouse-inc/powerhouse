import type {
  IRelationalDb,
  IRelationalDbProcessor,
  IRelationalQueryBuilder,
  OperationWithContext,
  ProcessorFilter,
  RelationalDbProcessorClass,
} from "@powerhousedao/reactor";
import { relationalDbToQueryBuilder } from "./utils.js";

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
    protected _filter: ProcessorFilter,
    protected relationalDb: IRelationalDb<TDatabaseSchema>,
  ) {}

  static [IS_RELATIONAL_DB_PROCESSOR] = true;

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
   * Processes a list of operations with context.
   * Called when operations match this processor's filter.
   */
  abstract onOperations(operations: OperationWithContext[]): Promise<void>;

  /**
   * Returns the filter for the processor.
   * This method can be overridden by derived classes to provide a custom filter.
   */
  get filter(): ProcessorFilter {
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
   * Called when the processor is disconnected.
   * This method is meant to be overridden by subclasses to clean up resources.
   */
  abstract onDisconnect(): Promise<void>;
}
