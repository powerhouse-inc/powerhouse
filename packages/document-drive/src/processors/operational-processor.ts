import { type ListenerFilter } from "#drive-document-model/module";
import { type PHDocument } from "document-model";
import { type InternalTransmitterUpdate } from "../server/listener/transmitter/internal.js";
import { type IOperationalStore, type IProcessor } from "./types.js";
export * from "kysely";

export type OperationalProcessorFilter = ListenerFilter;
export interface IOperationalProcessor extends IProcessor {
  initAndUpgrade(): Promise<void>;
  filter: OperationalProcessorFilter;
}

/**
 * Base class for operational processors that require a relational database storage.
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
      .execute();
    const schemaOperationalStore = operationalStore.withSchema(namespace);
    return new this(namespace, schemaOperationalStore);
  }

  async initAndUpgrade(): Promise<void> {
    return Promise.resolve();
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
