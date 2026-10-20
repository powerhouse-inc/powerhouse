/**
 * The type-level specifier → host map (typed-host-configs 1.4). Runner and
 * plugin packages augment these global interfaces; nothing reads them at
 * runtime (there is deliberately no runner registry). A host file annotated
 * with JSDoc `@satisfies {PHHost}` is then checked against its runner's input.
 */

import type { z } from "zod";
import type { declaredGenericCompoundHostSchema } from "./host-schemas.js";

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

/** A runner's host input with `runner.plugins` typed as authoring
 * {@link PluginEntry}s (the zod input type only knows the untyped data
 * shape), so a known plugin's config is checked against its own type. */
type WithTypedPlugins<H, M extends string> = H extends { runner: infer R }
  ? Omit<H, "runner"> & {
      runner: Omit<R, "module" | "plugins"> & {
        module: M;
        plugins?: PluginEntry[];
      };
    }
  : never;

/** Any host file, discriminated by `runner.module`. `never` until a runner
 * package augments PHHostRunners. */
export type PHHost = {
  [M in RunnerSpecifier]: PHHostRunners[M] extends { host: infer H }
    ? WithTypedPlugins<H, M>
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

/** A `runner.plugins` entry as an author writes it. A known specifier (one
 * a package augments PHPluginConfigs with) carries its plugin's config type,
 * and only that: the object fallback for other specifiers takes no config,
 * because TS cannot express "any string but the known ones" and a
 * `Record<string, unknown>` fallback would admit a known specifier with a
 * wrong config. Any specifier may still be named bare, or as an object
 * without config; a third-party plugin that takes config augments
 * PHPluginConfigs (in its package, or in the project's hosts/types.d.ts). */
export type PluginEntry =
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  KnownPluginEntry | string | PluginEntryObject<string, undefined>;

/* The generic compound runner ships in host-core, so host-core augments the
 * map for it (`@powerhousedao/host-core/runners/compound`). It produces no
 * outputs of its own: consumers address its members' hosts. */
declare global {
  interface PHHostRunners {
    "@powerhousedao/host-core/runners/compound": {
      host: z.input<typeof declaredGenericCompoundHostSchema>;
      outputs: Record<string, never>;
    };
  }
}
