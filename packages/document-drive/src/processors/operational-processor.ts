import { type ListenerFilter } from "#drive-document-model/module";
import { type PHDocument } from "document-model";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import {
  type IOperationalQueryBuilder,
  type IOperationalStore,
  type IProcessor,
} from "./types.js";

export type OperationalProcessorFilter = ListenerFilter;
export interface IOperationalProcessor<TDatabaseSchema = unknown>
  extends IProcessor {
  namespace: string;
  query: IOperationalQueryBuilder<TDatabaseSchema>;
  filter: OperationalProcessorFilter;
  initAndUpgrade(): Promise<void>;
}

export type ExtractProcessorSchema<TProcessor extends OperationalProcessor> =
  TProcessor extends OperationalProcessor<infer TSchema> ? TSchema : never;

function operationalStoreToQueryBuilder<TSchema>(
  query: IOperationalStore<TSchema>,
): IOperationalQueryBuilder<TSchema> {
  return {
    selectFrom: query.selectFrom.bind(query),
    selectNoFrom: query.selectNoFrom.bind(query),
    with: query.with.bind(query),
    withRecursive: query.withRecursive.bind(query),
    withSchema: (schema: string) =>
      operationalStoreToQueryBuilder<TSchema>(query.withSchema(schema)),
  };
}

/**
 * Base class for operational processors that require a relational database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export abstract class OperationalProcessor<TDatabaseSchema = unknown>
  implements IOperationalProcessor<TDatabaseSchema>
{
  constructor(
    protected _namespace: string,
    protected operationalStore: IOperationalStore<TDatabaseSchema>,
  ) {}

  /**
   * Returns the namespace for a given drive id.
   * This method can be overridden by derived classes to provide a custom namespace.
   */
  static getNamespace(driveId: string): string {
    return `${this.name}-${driveId}`;
  }

  static query<TSchema>(
    this: (new (...args: any[]) => OperationalProcessor<TSchema>) &
      typeof OperationalProcessor<TSchema>,
    driveId: string,
    operationalStore: IOperationalStore<any>,
  ): IOperationalQueryBuilder<TSchema> {
    const namespace = this.getNamespace(driveId);
    const schemaStore = operationalStore.withSchema(
      namespace,
    ) as IOperationalStore<TSchema>;
    return operationalStoreToQueryBuilder(schemaStore);
  }

  /**
   * Builds a new instance of the processor.
   */
  static async build<TProcessor extends OperationalProcessor>(
    driveId: string,
    operationalStore: IOperationalStore,
  ): Promise<TProcessor> {
    // Creates a namespace for the provided drive id
    const namespace = this.getNamespace(driveId);

    // Creates the schema for the namespace if it doesn't exist
    await operationalStore.schema
      .createSchema(namespace)
      .ifNotExists()
      .execute();

    // This method is meant to be called on subclasses
    const ProcessorClass = this as unknown as {
      new (
        namespace: string,
        operationalStore: IOperationalStore<ExtractProcessorSchema<TProcessor>>,
      ): TProcessor;
    };

    // Instantiates the subclass with the namespace and schema operational store
    const schemaOperationalStore = operationalStore.withSchema(
      namespace,
    ) as IOperationalStore<ExtractProcessorSchema<TProcessor>>;
    return new ProcessorClass(namespace, schemaOperationalStore);
  }

  /**
   * Returns the filter for the processor.
   * This method can be overridden by derived classes to provide a custom filter.
   */
  get filter(): OperationalProcessorFilter {
    return {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    };
  }

  /**
   * Returns the namespace used by the processor.
   */
  get namespace(): string {
    return this._namespace;
  }

  get query(): IOperationalQueryBuilder<TDatabaseSchema> {
    return operationalStoreToQueryBuilder(this.operationalStore);
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
