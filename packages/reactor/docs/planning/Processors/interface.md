# Interface

```tsx

type DocumentUpdateEvent = {
  operations: Operation[];
}

/**
 * Describes an object that can respond to operation updates.
 */
export interface IProcessor {
  /**
   * Processes a list of updates.
   */
  update(
    updates: DocumentUpdateEvent[],
  ): Promise<void>;

  /**
   * Called when the processor is starting up. This is generally meant to
   * initialize any resources that were allocated when the processor was created.
   */
  startup(): Promise<void>;

  /**
   * Called when the processor is shutting down. This is meant to clean up any
   * resources that were allocated when the processor was created.
   */
  shutdown(): IShutdownStatus;
}

type ProcessorFilter = {
  /** Array of document types to include, use ["*"] for all */
  documentType: string[];

  /** Array of document IDs to include, use ["*"] for all */
  documentId: string[];

  /** Array of parent document IDs to include, use ["*"] for all */
  parentId: string[];

  /** Array of operation scopes to include, use ["*"] for all */
  scope: string[];

  /** Array of branches to include, use ["*"] for all */
  branch: string[];
};

/**
 * Relates a processor to a filter.
 */
export type ProcessorRecord = {
  processor: IProcessor;
  filter: ProcessorFilter;
};

/**
 * A factory function that returns a list of processor records.
 *
 * @returns A list of processor records.
 */
export type ProcessorFactory = () => ProcessorRecord[];

/**
 * Manages processor creation and destruction.
 */
export interface IProcessorManager {
  /**
   * Registers a processor factory for a given identifier.
   *
   * @param identifier Any identifier to associate with the factory.
   * @param factory The factory to register.
   */
  registerFactory(identifier: string, factory: ProcessorFactory): Promise<void>;

  /**
   * Unregisters a processor factory for a given identifier. This will remove
   * all processors that were created by the factory.
   *
   * @param identifier The identifier to unregister.
   */
  unregisterFactory(identifier: string): Promise<void>;
}
```
