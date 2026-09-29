import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type QueryCreator } from "kysely";
import type { IProcessor, ProcessorFilter } from "../types.js";
import { namespaceSchemaOf, relationalDbToQueryBuilder } from "./utils.js";

/** Columns {@link RelationalDbProcessor.deleteDocumentRows} matches. */
export const DOCUMENT_ID_COLUMNS = ["document_id", "documentId"] as const;

export type IRelationalQueryMethods =
  | "selectFrom"
  | "selectNoFrom"
  | "with"
  | "withRecursive";

export type IRelationalQueryBuilder<Schema = unknown> = Pick<
  QueryCreator<Schema>,
  IRelationalQueryMethods
> & {
  withSchema: (schema: string) => IRelationalQueryBuilder<Schema>;
};

export type HashAlgorithms = "fnv1a";
export type IBaseRelationalDb<Schema = unknown> = Kysely<Schema>;

/**
 * The standardized relational database interface for relational db processors.
 * This abstraction provides type-safe database operations while hiding the underlying
 * database framework implementation details.
 **/
export type IRelationalDb<Schema = unknown> = IBaseRelationalDb<Schema> & {
  createNamespace<NamespaceSchema>(
    namespace: string,
  ): Promise<IRelationalDb<ExtractProcessorSchemaOrSelf<NamespaceSchema>>>;
  queryNamespace<NamespaceSchema>(
    namespace: string,
  ): IRelationalQueryBuilder<NamespaceSchema>;
};

export type ExtractProcessorSchemaOrSelf<TProcessor> =
  TProcessor extends RelationalDbProcessor<infer TSchema>
    ? TSchema
    : TProcessor;

export type RelationalDbProcessorClass<TSchema> =
  typeof RelationalDbProcessor<TSchema>;

export interface IRelationalDbProcessor<
  TDatabaseSchema = unknown,
> extends IProcessor {
  namespace: string;
  query: IRelationalQueryBuilder<TDatabaseSchema>;
  filter: ProcessorFilter;
  initAndUpgrade(): Promise<void>;
}

const IS_RELATIONAL_DB_PROCESSOR = Symbol.for("ph.IS_RELATIONAL_DB_PROCESSOR");

/**
 * Base class for relational db processors that require a relational database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class RelationalDbProcessor<
  TDatabaseSchema = unknown,
> implements IRelationalDbProcessor<TDatabaseSchema> {
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

  /** True when `driveId` is the drive this processor's namespace was made for. */
  protected isNamespaceDrive(driveId: string): boolean {
    const processorClass = this.constructor as typeof RelationalDbProcessor;
    return processorClass.getNamespace(driveId) === this._namespace;
  }

  /** Deletes a document's rows from every table with a document-id column. */
  protected async deleteDocumentRows(documentId: string): Promise<void> {
    const schema = this.namespaceSchema();
    const columns = await sql<{ table_name: string; column_name: string }>`
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = ${schema}
        and t.table_type = 'BASE TABLE'
        and c.column_name in (${sql.join([...DOCUMENT_ID_COLUMNS])})
      order by c.table_name, c.column_name
    `.execute(this.relationalDb);
    const db = this.relationalDb as unknown as Kysely<any>;
    for (const { table_name, column_name } of columns.rows) {
      await db
        .deleteFrom(table_name)
        .where(column_name, "=", documentId)
        .execute();
    }
  }

  /** Drops this processor's namespace and every table in it. */
  protected async dropNamespace(): Promise<void> {
    await this.relationalDb.schema
      .dropSchema(this.namespaceSchema())
      .ifExists()
      .cascade()
      .execute();
  }

  private namespaceSchema(): string {
    const schema = namespaceSchemaOf(this.relationalDb);
    if (schema === undefined) {
      throw new Error(
        `Namespace '${this._namespace}' was not opened with createNamespace`,
      );
    }
    return schema;
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
