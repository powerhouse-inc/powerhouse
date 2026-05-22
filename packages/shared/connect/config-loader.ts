// Environment-neutral config loader. Wraps a `ConfigAdapter` (the IO layer)
// with in-process caching and deep-merge-with-defaults reads.
//
// No validation. The loader trusts that whatever bytes the adapter returns
// can be merged into the default Connect config; missing or partial fields
// fall back to DEFAULT_CONNECT_CONFIG, so the SPA always sees a complete
// `connect.*` block.
//
// Top-level fields outside `connect.*` (e.g. `studio.port` in the source
// powerhouse.config.json) pass through untouched on both read and write.
// They're not Connect's concern, but a write-back round-trip preserves
// them so editing tools don't accidentally drop them.

import type { PHConnectRuntimeConfig } from "../clis/types.js";
import { DEFAULT_CONNECT_CONFIG } from "./runtime-config.js";

/** Recursive Partial. Arrays are leaves — `write({ packages: [...] })`
 * replaces the array, it doesn't merge. */
export type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<U>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/**
 * Shape returned by `ConfigLoader.read()`. The loader is Connect-scoped:
 * it guarantees `connect` is present and fully populated from
 * DEFAULT_CONNECT_CONFIG, but lets any other top-level fields pass
 * through unchanged so source-config-only fields (studio, reactor, auth,
 * documentModelsDir, etc.) survive a read+write round-trip.
 */
export type ConfigShape = Record<string, unknown> & {
  connect: PHConnectRuntimeConfig;
};

/**
 * Abstract IO layer for `powerhouse.config.json`.
 *
 * Implementations decide where bytes come from and go to. The shipped
 * adapter is `JsonConfigAdapter` (reads via fetch in the browser, fs in
 * Node; writes via fs in Node, throws in the browser). Future adapters
 * (remote-JSON, GraphQL) plug in without changing the loader or any
 * consumer.
 */
export interface ConfigAdapter {
  /** Read raw JSON-parsed payload from the backing store. */
  read(): Promise<unknown>;
  /** Persist a fully-formed config. */
  write(next: ConfigShape): Promise<void>;
  /** Human-readable description used in errors and logs. */
  readonly source: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep-merge `patch` into `base`. Object fields recurse; arrays and
 * primitives replace. `undefined` in patch leaves the base value
 * untouched (no unset). `null` in patch overwrites with null.
 *
 * Exported for unit tests; consumers use ConfigLoader.write() which
 * applies this internally.
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch as T;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      result[key] = deepMerge(
        baseValue,
        patchValue as DeepPartial<typeof baseValue>,
      );
    } else {
      result[key] = patchValue;
    }
  }
  return result as T;
}

/**
 * Pluggable loader on top of a `ConfigAdapter`.
 *
 * Responsibilities:
 *  - merge-with-defaults on read (so consumers never see a partial connect block)
 *  - in-process caching (call `invalidate()` to force re-read)
 *  - deep-merge for partial writes; writes the merged whole back through the adapter
 *
 * The cache is module-instance scoped — every `new ConfigLoader(...)` has
 * its own cache. The browser SPA constructs the loader once at boot; the
 * CLI typically constructs a fresh loader per command.
 */
export class ConfigLoader {
  private cache: ConfigShape | undefined;

  constructor(
    private readonly adapter: ConfigAdapter,
    private readonly defaults: PHConnectRuntimeConfig = DEFAULT_CONNECT_CONFIG,
  ) {}

  /** Returns the config with the default connect block merged in.
   * Cached after the first successful call. */
  async read(): Promise<ConfigShape> {
    if (this.cache) return this.cache;
    const raw = await this.adapter.read();
    const obj = isPlainObject(raw) ? raw : {};
    const connectRaw = isPlainObject(obj.connect) ? obj.connect : {};
    this.cache = {
      ...obj,
      connect: deepMerge(
        this.defaults,
        connectRaw as DeepPartial<PHConnectRuntimeConfig>,
      ),
    };
    return this.cache;
  }

  /**
   * Returns the cached config synchronously. Throws if `read()` has not
   * resolved yet — matches Connect's `getRuntimeConfig()` shape.
   */
  getCached(): ConfigShape {
    if (!this.cache) {
      throw new Error(
        `ConfigLoader (${this.adapter.source}): cache empty; call read() first.`,
      );
    }
    return this.cache;
  }

  /** Drop the in-memory cache. Next `read()` re-fetches from the adapter. */
  invalidate(): void {
    this.cache = undefined;
  }

  /**
   * Deep-merge `patch` into the current config and persist via the adapter.
   * Returns the new full config (also updates the cache). Arrays in `patch`
   * replace — they do NOT append.
   */
  async write(patch: DeepPartial<ConfigShape>): Promise<ConfigShape> {
    const current = await this.read();
    const next = deepMerge(current, patch);
    await this.adapter.write(next);
    this.cache = next;
    return next;
  }
}
