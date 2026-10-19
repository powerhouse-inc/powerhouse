/**
 * `createTypes({ configSchema, registry })` — per-CLI binding helper.
 *
 * Captures the `TConfig` (inferred from `configSchema`) and `R` (registry)
 * generics once and returns pre-typed `defineCommand` / `defineTrigger` /
 * `defineService` factories. Users don't have to repeat the generics at
 * every call site.
 *
 * Runtime is a thin pass-through: the returned factories are just the
 * original `defineX` identity wrappers cast to the typed shape. All
 * narrowing lives on `TypedFactory`.
 */
import type { z } from "zod";
import type {
  DocumentRegistry,
  AnyRegistry,
} from "../integrations/powerhouse/types.js";
import type {
  Command,
  CommandContext,
  PromptConfig,
  Trigger,
  TriggerOptions,
  ServiceDefinition,
} from "./types.js";
import type { DocumentChangeTriggerOptions } from "../integrations/powerhouse/change-trigger.js";
import { defineCommand as baseDefineCommand } from "./command.js";
import { defineTrigger as baseDefineTrigger } from "./trigger.js";
import { defineService as baseDefineService } from "./services.js";
import { createDocumentChangeTrigger as baseCreateDocumentChangeTrigger } from "../integrations/powerhouse/change-trigger.js";

/**
 * Options for `createTypes`.
 *
 * - `configSchema` — the CLI's Zod config schema (optionally merged with secrets).
 * - `registry` — optional DocumentRegistry produced by `defineRegistry(...)`.
 *   Omit to fall back to `AnyRegistry` everywhere.
 */
export interface CreateTypesOptions<
  TSchema extends z.ZodType,
  R extends DocumentRegistry,
> {
  configSchema: TSchema;
  registry?: R;
}

/**
 * Bundle of typed factories returned by `createTypes()`.
 *
 * Each factory pre-binds `TConfig` (inferred from `configSchema`) and `R`
 * (from `registry`) so impl call sites only need to declare per-call
 * generics such as `TState`.
 */
export interface TypedFactory<TConfig, R extends DocumentRegistry> {
  /**
   * Typed `defineCommand` — `ctx.config` is `TConfig`, `ctx.reactor()` is
   * `ReactorContext<R>`.
   */
  defineCommand<TInput extends z.ZodType, TOutput = unknown>(options: {
    id: string;
    description: string;
    inputSchema: TInput;
    outputSchema?: z.ZodType<TOutput>;
    prompt?: PromptConfig;
    execute: (
      input: z.output<TInput>,
      ctx: CommandContext<TConfig, R>,
    ) => Promise<TOutput>;
  }): Command<TInput, TOutput, TConfig, R>;

  /**
   * Typed `defineTrigger` — `ctx.state` is `TState`, `ctx.context.config`
   * is `TConfig`, `ctx.reactor()` is `ReactorContext<R>`, and event bus
   * payloads are narrowed by `R`.
   */
  defineTrigger<TState = Record<string, unknown>>(
    options: TriggerOptions<TState, TConfig, R>,
  ): Trigger<TState, TConfig, R>;

  /**
   * Typed `defineService` — `env` / `preflight` see the typed config.
   * The registry generic is intentionally not threaded through services
   * today: services don't access the reactor.
   */
  defineService(
    options: ServiceDefinition<TConfig>,
  ): ServiceDefinition<TConfig>;

  /**
   * Typed `createDocumentChangeTrigger` — `TConfig` and `R` are pre-bound
   * from `createTypes`. At the call site, only `T` (documentType key) and
   * optionally `TState` need to be declared.
   */
  createDocumentChangeTrigger<
    T extends keyof R & string,
    TState extends { pending: number } = { pending: number },
  >(
    options: DocumentChangeTriggerOptions<R, T, TConfig, TState>,
  ): Trigger<TState, TConfig, R>;
}

/**
 * Bind a CLI's config schema and optional registry once; reuse the returned
 * typed factories across every command/trigger/service in the impl.
 *
 * ```ts
 * // impl/src/framework.ts
 * import { z } from 'zod';
 * import { createTypes, defineRegistry } from '@powerhousedao/ph-clint';
 * import { PhClintProject } from '@powerhousedao/ph-clint-app/document-models/ph-clint-project';
 *
 * const configSchema = z.object({ projectDocumentId: z.string().optional() });
 * const registry = defineRegistry([PhClintProject] as const);
 *
 * export const {
 *   defineCommand,
 *   defineTrigger,
 *   defineService,
 *   createDocumentChangeTrigger,
 * } = createTypes({ configSchema, registry });
 * ```
 */
export function createTypes<
  TSchema extends z.ZodType,
  R extends DocumentRegistry = AnyRegistry,
>(_opts: CreateTypesOptions<TSchema, R>): TypedFactory<z.infer<TSchema>, R> {
  return {
    defineCommand: baseDefineCommand as unknown as TypedFactory<
      z.infer<TSchema>,
      R
    >["defineCommand"],
    defineTrigger: baseDefineTrigger as unknown as TypedFactory<
      z.infer<TSchema>,
      R
    >["defineTrigger"],
    defineService: baseDefineService,
    createDocumentChangeTrigger:
      baseCreateDocumentChangeTrigger as unknown as TypedFactory<
        z.infer<TSchema>,
        R
      >["createDocumentChangeTrigger"],
  };
}
