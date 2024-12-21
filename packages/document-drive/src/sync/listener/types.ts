import { OperationScope } from "document-model/document";
import { IDuplicatedListenerIdError } from "./errors";
import { Optional } from "../../utils/types";
import { Subscribe } from "../../utils/observable-map";

export type ListenerFilter = {
  branch: string[];
  documentId: string[];
  documentType: string[];
  scope: (OperationScope | "*")[];
};

// TODO move to transmitter types?
export type TransmitterType =
  | "Internal"
  | "MatrixConnect"
  | "PullResponder"
  | "RESTWebhook"
  | "SecureConnect"
  | "SwitchboardPush";

export type ListenerCallInfo = {
  data?: string;
  name?: string;
  transmitterType: TransmitterType | `${TransmitterType}`;
};

export type Listener = {
  id: string;
  driveId: string;
  filter: ListenerFilter;
  label?: string;
  block?: boolean;
  system?: boolean;
  callInfo?: ListenerCallInfo;
};

// same as Type Listener but id is optional
export type ListenerInput = Omit<Listener, "id" | "filter"> & {
  id?: string | undefined;
  filter?: Optional<ListenerFilter> | undefined;
};

export interface SynchronizationUnitState {
  revision: number;
  lastUpdated: string;
}

export interface ListenerState {
  syncUnits: Record<string, SynchronizationUnitState>;
}

export interface StatefulListener extends Listener {
  state: ListenerState;
}

export type ListenerMap = Record<Listener["id"], StatefulListener>;

export interface IListenerAPI {
  /**
   * Adds a listener to monitor specific synchronization events.
   * @param input The input describing the listener configuration.
   * @returns The created listener.
   * @throws {IDuplicatedListenerIdError} If a listener with the same ID already exists.
   */
  addListener(input: ListenerInput): Promise<Listener>;

  /**
   * Removes a listener by its ID.
   * @param listenerId The ID of the listener to remove.
   * @returns A promise that resolves when the listener
   * is removed and returns true if it was removed.
   */
  removeListener(listenerId: string): Promise<boolean>;

  /**
   * Retrieves a listener by its ID.
   * @param listenerId The ID of the listener to retrieve.
   * @returns The listener if found, or undefined if not found.
   */
  getListener(listenerId: string): Promise<Listener | undefined>;

  /**
   * Retrieves all listeners.
   * @returns An array of all listeners.
   */
  getAllListeners(): Promise<Listener[]>;
}

export interface IListenerRegistry extends IListenerAPI {
  /**
   * Initializes the listener registry by loading listeners from provided storage
   */
  init(): Promise<void>;

  /**
   * Updates the revision of a synchronization unit for a listener.
   * @param listenerId The ID of the listener.
   * @param syncUnitId The ID of the synchronization unit.
   * @param revision The new revision number
   **/
  updateListenerRevision(
    listenerId: string,
    syncUnitId: string,
    revision: number,
    lastUpdated: string,
  ): Promise<void>;

  /**
   * Retrieves all listeners that are subscribed to a specific synchronization unit.
   * @param syncUnit The synchronization unit details to filter listeners by.
   * @returns An array of listeners subscribed to the synchronization unit.
   **/
  getSyncUnitListeners(syncUnit: {
    driveId: string;
    documentId: string;
    documentType: string;
    scope: string;
    branch: string;
  }): Promise<Listener[]>;

  on: Subscribe<Listener["id"], StatefulListener>;
}

export interface IListenerStorage {
  addListener(listener: Listener): Promise<void>;
  updateListener(
    listenerId: Listener["id"],
    update: Partial<StatefulListener>,
  ): Promise<void>;
  removeListener(listenerId: Listener["id"]): Promise<void>;
  getAllListeners(): Promise<ListenerMap>;
}
