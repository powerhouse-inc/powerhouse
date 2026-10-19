import type {
  DocumentRegistry,
  AnyRegistry,
} from "../integrations/powerhouse/types.js";
import type { Trigger, TriggerOptions } from "./types.js";

/**
 * Define a trigger — a pluggable object that produces work items for the routine loop.
 *
 * Generics:
 * - `TState` — shape of `ctx.state`. Combine with `state: () => TState` to initialize.
 * - `TConfig` — shape of `ctx.context.config`. Use the binding from `createTypes()` to avoid repeating.
 * - `R` — DocumentRegistry, narrows `ctx.reactor()` and event payloads.
 */
export function defineTrigger<
  TState = Record<string, unknown>,
  TConfig = Record<string, unknown>,
  R extends DocumentRegistry = AnyRegistry,
>(options: TriggerOptions<TState, TConfig, R>): Trigger<TState, TConfig, R> {
  return options;
}
