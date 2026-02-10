import type { IProcessor, ProcessorFilter } from "@powerhousedao/reactor";
import type { Kysely, QueryCreator } from "kysely";
import type { RelationalDbProcessor } from "./relational-db-processor.js";
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

export interface IRelationalDbProcessor<TDatabaseSchema = unknown>
  extends IProcessor {
  namespace: string;
  query: IRelationalQueryBuilder<TDatabaseSchema>;
  filter: ProcessorFilter;
  initAndUpgrade(): Promise<void>;
}

export type ExtractProcessorSchemaOrSelf<TProcessor> =
  TProcessor extends RelationalDbProcessor<infer TSchema>
    ? TSchema
    : TProcessor;

export type RelationalDbProcessorClass<TSchema> =
  typeof RelationalDbProcessor<TSchema>;

export type HashAlgorithms = "fnv1a";
