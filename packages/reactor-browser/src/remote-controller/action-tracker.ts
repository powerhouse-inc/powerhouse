import type { Action } from "document-model";
import type { TrackedAction } from "./types.js";

/**
 * Tracks pending actions with their operation context (prevOpHash, prevOpIndex).
 * Actions are accumulated until flushed (on push).
 */
export class ActionTracker {
  private pending: TrackedAction[] = [];

  /** Track a new action with its operation context. */
  track(action: Action, prevOpHash: string, prevOpIndex: number): void {
    this.pending.push({ action, prevOpHash, prevOpIndex });
  }

  /** Flush all pending actions and return them. Clears the internal queue. */
  flush(): TrackedAction[] {
    const actions = this.pending;
    this.pending = [];
    return actions;
  }

  /** Number of pending actions. */
  get count(): number {
    return this.pending.length;
  }

  /** Prepend previously flushed actions back to the queue (for retry on failure). */
  restore(actions: TrackedAction[]): void {
    this.pending = [...actions, ...this.pending];
  }

  /** Clear all pending actions without returning them. */
  clear(): void {
    this.pending = [];
  }
}
