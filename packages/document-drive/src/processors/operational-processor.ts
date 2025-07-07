import { type ListenerFilter } from "#drive-document-model/module";
import { type PHDocument } from "document-model";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import { type IOperationalStore, type IProcessor } from "./types.js";

/**
 * PowerhouseDB is the standardized database interface for operational processors.
 * This abstraction provides type-safe database operations while hiding the underlying
 * database framework implementation details.
 */
export type OperationalProcessorFilter = ListenerFilter;
export interface IOperationalProcessor extends IProcessor {
  initAndUpgrade(namespace: string): Promise<void>;
  filter: OperationalProcessorFilter;
}

/**
 * Base class for operational processors that require persistent database storage.
 * This class abstracts database initialization, migration management, and resource cleanup,
 * allowing derived classes to focus on business logic.
 */
export class OperationalProcessor<TDatabaseSchema = unknown>
  implements IOperationalProcessor
{
  constructor(
    protected _namespace: string,
    protected _operationalStore: IOperationalStore<TDatabaseSchema>,
  ) {}

  get filter(): OperationalProcessorFilter {
    return {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    };
  }

  get namespace(): string {
    return this.namespace;
  }

  get operationalStore(): IOperationalStore<TDatabaseSchema> {
    return this._operationalStore;
  }

  static async build(
    namespace: string,
    operationalStore: IOperationalStore,
  ): Promise<OperationalProcessor> {
    await operationalStore.schema
      .createSchema(namespace)
      .ifNotExists()
      .execute(); // TODO is this needed?
    const schemaOperationalStore = operationalStore.withSchema(namespace);
    return new this(namespace, schemaOperationalStore);
  }

  async initAndUpgrade(): Promise<void> {
    // Initializes tables
    await this.operationalStore.schema
      .createTable(" TODO ") // TODO
      .ifNotExists()
      .execute();
  }

  /**
   * Abstract method that derived classes must implement.
   * This is where the business logic for processing document operations should be implemented.
   */
  onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    return Promise.reject(new Error("Method not implemented"));
  }

  /**
   * Called when the processor is disconnected. This method cleans up resources
   * and can be overridden by derived classes for additional cleanup.
   */
  async onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}

/*
  TODO:
  - How does the kysely codegen fit into our flow
    - ph generate processor --operational
    - Implement initAndUpgrade with table creation
    - ph generate processor --operational --types ?????
      - This uses a InMemory pglite instance and runs the processor with an empty namespace 
      - runs kysely-codegen to instrospect the db and generate the types to a ./types.ts file
 */
// import { type schema } from "./types.js";

// class AtlasProcessor extends OperationalProcessor<schema> {
//   async initAndUpgrade(): Promise<void> {}
// }
