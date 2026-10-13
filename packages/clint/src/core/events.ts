import { EventEmitter } from "node:events";
import type { EventBus } from "./types.js";
import type {
  AnyRegistry,
  DocumentRegistry,
} from "../integrations/powerhouse/types.js";

/**
 * Create an event bus — a central EventEmitter-based bus for decoupled communication.
 *
 * The runtime is untyped (plain EventEmitter under the hood). The `R` generic
 * only shapes the static typing of `emit` / `on` / `off` for framework events.
 */
export function createEventBus<
  R extends DocumentRegistry = AnyRegistry,
>(): EventBus<R> {
  const emitter = new EventEmitter();

  return {
    emit: ((event: string, data?: unknown): void => {
      emitter.emit(event, data);
    }) as EventBus<R>["emit"],
    on: ((event: string, handler: (data?: unknown) => void): void => {
      emitter.on(event, handler);
    }) as EventBus<R>["on"],
    off: ((event: string, handler: (data?: unknown) => void): void => {
      emitter.off(event, handler);
    }) as EventBus<R>["off"],
  };
}
