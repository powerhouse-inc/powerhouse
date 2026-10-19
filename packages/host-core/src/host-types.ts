/**
 * The type-level specifier → host map (typed-host-configs 1.4). Runner and
 * plugin packages augment these global interfaces; nothing reads them at
 * runtime (there is deliberately no runner registry). A host file annotated
 * with JSDoc `@satisfies {PHHost}` is then checked against its runner's input.
 */

declare global {
  /** `"<runner specifier>": { host: <z.input of its hostSchema>; outputs:
   * <z.infer of its outputsSchema> }`, one entry per runner module. */
  // oxlint-disable-next-line typescript/no-empty-object-type -- augmented by runner packages
  interface PHHostRunners {}
  /** `"<plugin specifier>": <z.input of its configSchema>`. */
  // oxlint-disable-next-line typescript/no-empty-object-type -- augmented by plugin packages
  interface PHPluginConfigs {}
}

// The maps are empty until a package augments them, so inside host-core
// these key sets are `never`; that is the design, not a redundant constituent.
// oxlint-disable-next-line typescript/no-redundant-type-constituents
type RunnerSpecifier = keyof PHHostRunners & string;
// oxlint-disable-next-line typescript/no-redundant-type-constituents
type PluginSpecifier = keyof PHPluginConfigs & string;

/** Any host file, discriminated by `runner.module`. `never` until a runner
 * package augments PHHostRunners. */
export type PHHost = {
  [M in RunnerSpecifier]: PHHostRunners[M] extends { host: infer H }
    ? H & { runner: { module: M } }
    : never;
}[RunnerSpecifier];

/** The outputs a runner's creation produces, by specifier. */
export type PHHostOutputs<M extends RunnerSpecifier> =
  PHHostRunners[M] extends { outputs: infer O } ? O : never;

interface PluginEntryObject<M extends string, C> {
  module: M;
  /** Presence is activation by default; false is the explicit off-switch. */
  enabled?: boolean;
  /** "*" (default) or the run verbs this entry is active for. */
  verbs?: "*" | string[];
  config?: C;
}

type KnownPluginEntry = {
  [M in PluginSpecifier]: M | PluginEntryObject<M, PHPluginConfigs[M]>;
}[PluginSpecifier];

/** A `runner.plugins` entry as an author writes it: known specifiers carry
 * their plugin's config type. Unknown (third-party) specifiers fall back to
 * an untyped config; that fallback also admits a known specifier with a
 * wrong config, a TS limit on string-keyed unions. */
export type PluginEntry =
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  | KnownPluginEntry
  | string
  | PluginEntryObject<string, Record<string, unknown>>;
