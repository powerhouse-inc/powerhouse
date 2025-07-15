import { type ListenerFilter } from "#drive-document-model/module";
import { hash } from "#utils/hash";
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

export async function createNamespacedDb<T>(
  namespace: string,
  db: IOperationalStore,
): Promise<IOperationalStore<ExtractProcessorSchema<T>>> {
  await db.schema.createSchema(namespace).ifNotExists().execute();

  // hash the namespace to avoid too long namespaces
  const hashValue = await hash(namespace);
  const schemaOperationalStore = db.withSchema(hashValue);
  return schemaOperationalStore as IOperationalStore<ExtractProcessorSchema<T>>;
}

export function isOperationalProcessor(
  p: IProcessor,
): p is IOperationalProcessor {
  return OperationalProcessor.is(p);
}

export type ExtractProcessorSchema<TProcessor> =
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

export type OperationalProcessorClass<TSchema> = (new (
  ...args: any[]
) => OperationalProcessor<TSchema>) &
  typeof OperationalProcessor<TSchema>;

const IS_OPERATIONAL_PROCESSOR = Symbol.for("ph.IS_OPERATIONAL_PROCESSOR");

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
    protected _filter: OperationalProcessorFilter,
    protected operationalStore: IOperationalStore<TDatabaseSchema>,
  ) {}

  static [IS_OPERATIONAL_PROCESSOR] = true;

  static is(p: unknown): p is OperationalProcessor {
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
   * Returns the filter for the processor.
   * This method can be overridden by derived classes to provide a custom filter.
   */
  get filter(): OperationalProcessorFilter {
    return this._filter;
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
