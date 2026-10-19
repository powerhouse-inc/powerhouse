/**
 * DocumentRegistry construction + inference helpers.
 *
 * Impl projects build a registry with `defineRegistry([Module1, Module2] as const)`
 * to give the framework typed access to registered document models without
 * having to pass generic parameters at every call site.
 */

import type {
  DocumentModelModule,
  PHDocument,
  Action,
  PHBaseState,
} from "document-model";
import type { DocumentRegistry, RegistryEntry } from "./types.js";

/**
 * Extract the action union from a DocumentModelModule.
 *
 * `DocumentModelModule.actions` is `{ [actionName]: (input) => Action }` — the
 * return types of those creators form the module's action union.
 *
 * If a module's actions map isn't typed tightly enough (because the module
 * was annotated with `: DocumentModelModule<…>` instead of `satisfies`), the
 * union collapses to `Action`. Not a correctness problem — just a DX
 * degradation for that one module's execute/executeAsync narrowing.
 */
export type ActionOf<M> = M extends { actions: infer Actions }
  ? Actions extends Record<string, (...args: never[]) => infer A>
    ? A
    : Action
  : Action;

/**
 * Infer a DocumentRegistry from a readonly tuple of DocumentModelModule instances.
 *
 * Literal inference requires each module's `documentModel.id` to be a literal
 * type. Phase 4 changes codegen to emit modules with `as const satisfies
 * DocumentModelModule<…>` so inference produces a typed registry. Modules
 * typed with `:` annotations erase `id` to `string` and produce a
 * single-keyed `{ [x: string]: RegistryEntry<...> }` registry — narrowing
 * still works when callers pass a literal `T`, but `keyof R & string`
 * collapses to `string` (no autocomplete for documentTypes lists).
 */
export type InferRegistry<T extends ReadonlyArray<DocumentModelModule<any>>> = {
  [
    M in T[number] as Extract<M["documentModel"]["global"]["id"], string>
  ]: M extends DocumentModelModule<infer S>
    ? RegistryEntry<S, ActionOf<M>>
    : never;
};

/**
 * Build a DocumentRegistry from a tuple of DocumentModelModules.
 *
 * ```ts
 * const registry = defineRegistry([PhClintProject, DocumentDrive] as const);
 * // typeof registry:
 * // {
 * //   'powerhouse/ph-clint-project': RegistryEntry<PhClintProjectPHState, PhClintProjectAction>;
 * //   'powerhouse/document-drive':   RegistryEntry<DocumentDrivePHState, DocumentDriveAction>;
 * // }
 * ```
 *
 * Runtime value is a plain object keyed by `documentModel.id`. Consumers can
 * introspect it to list registered types; Phase 3's
 * `createDocumentChangeTrigger` also uses it for runtime lookup.
 */
export function defineRegistry<
  const T extends ReadonlyArray<DocumentModelModule<any>>,
>(modules: T): InferRegistry<T> {
  const out: Record<string, DocumentModelModule<any>> = {};
  for (const mod of modules) {
    out[mod.documentModel.global.id] = mod;
  }
  return out as unknown as InferRegistry<T>;
}

// Re-export for convenience so impl code can import from a single module.
export type { DocumentRegistry, RegistryEntry };
export type { PHDocument, Action, PHBaseState };
