import { OperationScope } from "document-model/document";
import { Optional } from "../utils/types";
import { IDuplicatedListenerIdError } from "./errors";

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
  listenerRev: number;
  lastUpdated: string;
}

export interface ListenerState {
  syncUnits: Record<string, SynchronizationUnitState>;
}

export interface StatefulListener extends Listener {
  state: ListenerState;
}

export type ListenerMap = Record<Listener["id"], StatefulListener>;

export interface IListenerManagerStorage {
  addListener(listener: Listener, listeners: ListenerMap): Promise<void>;
  updateListener(listener: Listener, listeners: ListenerMap): Promise<void>;
  removeListener(listener: Listener, listeners: ListenerMap): Promise<void>;
  getAllListeners(): Promise<ListenerMap>;
}

export interface IListenerManager {
  /**
   * Adds a listener to monitor specific synchronization events.
   * @param input The input describing the listener configuration.
   * @returns The created listener.
   * @throws {IDuplicatedListenerIdError} If a listener with the same ID already exists.
   */
  addListener(input: Listener): Promise<Listener>;

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
  getListeners(): Promise<Listener[]>;
}

export interface ISyncManager extends IListenerManager {}
