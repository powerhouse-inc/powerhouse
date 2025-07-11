/* eslint-disable @typescript-eslint/require-await */
import { type IListenerStorage, type ListenerData } from "./types.js";

export class InMemoryListenerStorage implements IListenerStorage {
  private listeners = new Map<string, Map<string, ListenerData>>();

  async init(): Promise<void> {}

  async *getParents() {
    yield* this.listeners.keys();
  }

  async *getListeners(parentId: string): AsyncIterableIterator<string> {
    const map = this.listeners.get(parentId);
    yield* map ? map.keys() : [];
  }

  async getListener(
    parentId: string,
    listenerId: string,
  ): Promise<ListenerData | null> {
    const map = this.listeners.get(parentId);
    if (!map) return null;
    return map.get(listenerId) ?? null;
  }
  async hasListeners(parentId: string): Promise<boolean> {
    const map = this.listeners.get(parentId);
    return !!(map && map.size > 0);
  }

  async hasListener(parentId: string, listenerId: string): Promise<boolean> {
    const map = this.listeners.get(parentId);
    return !!map?.has(listenerId);
  }

  async addListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void> {
    let map = this.listeners.get(parentId);
    if (!map) {
      map = new Map();
      this.listeners.set(parentId, map);
    }
    map.set(listenerId, listenerState);
  }
  async updateListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void> {
    const map = this.listeners.get(parentId);
    if (!map?.has(listenerId)) {
      throw new Error(
        `Listener ${listenerId} not found for parent ${parentId}`,
      );
    }
    map.set(listenerId, listenerState);
  }

  async removeListeners(parentId: string): Promise<boolean> {
    return this.listeners.delete(parentId);
  }

  async removeListener(parentId: string, listenerId: string): Promise<boolean> {
    const map = this.listeners.get(parentId);
    if (!map) return false;
    const deleted = map.delete(listenerId);
    if (map.size === 0) {
      this.listeners.delete(parentId);
    }
    return deleted;
  }
}
