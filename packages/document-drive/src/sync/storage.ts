import { writeFile, readFile } from "fs/promises";
import { Listener, ListenerMap, IListenerManagerStorage } from "./types";
import { debounce } from "../utils";

export interface IOptions {
  debounce?: number;
}

export class FileListenerManagerStorage implements IListenerManagerStorage {
  private debounceTime: number;
  private debouncedSave: (immediate: boolean) => Promise<void>;
  private filePath: string;
  private writeQueue: ListenerMap | null = null;

  constructor(filePath: string, options?: IOptions) {
    this.filePath = filePath;
    this.debounceTime = options?.debounce ?? 300;
    this.debouncedSave = debounce(this.#save.bind(this), this.debounceTime);
  }

  // Debounced method to save the listener map to the file
  async #save() {
    if (!this.writeQueue) {
      return;
    }
    await writeFile(this.filePath, JSON.stringify(this.writeQueue), {
      encoding: "utf8",
    });
  }

  private async loadListeners(): Promise<ListenerMap> {
    try {
      const fileContent = await readFile(this.filePath, { encoding: "utf8" });
      return JSON.parse(fileContent) as ListenerMap;
    } catch (error: unknown) {
      // If the file doesn't exist or is corrupted, return an empty map
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {};
      }
      throw error;
    }
  }

  async addListener(listener: Listener, listeners: ListenerMap): Promise<void> {
    this.writeQueue = { ...Object.fromEntries(Object.entries(listeners)) };
    return this.debouncedSave(false);
  }

  async updateListener(
    listener: Listener,
    listeners: ListenerMap,
  ): Promise<void> {
    this.writeQueue = { ...Object.fromEntries(Object.entries(listeners)) };
    return this.debouncedSave(false);
  }

  async removeListener(
    listener: Listener,
    listeners: ListenerMap,
  ): Promise<void> {
    this.writeQueue = { ...Object.fromEntries(Object.entries(listeners)) };
    return this.debouncedSave(false);
  }

  /**
   * Retrieves all listeners from the file.
   * Useful for initializing the listener manager.
   */
  async getAllListeners(): Promise<ListenerMap> {
    return this.loadListeners();
  }
}
