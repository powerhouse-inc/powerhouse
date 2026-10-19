import type {
  LifecycleHandle,
  LifecycleHook,
  LifecycleInitContext,
  WrapRegistry,
} from "./types.js";
import { composeWraps, IDENTITY_WRAPS } from "./wraps.js";

export interface LifecycleResult {
  /** The composed wrap registry from all hook contributions. */
  wraps: WrapRegistry;
  /**
   * Runs each handle's shutdown() in reverse-init order. The framework
   * wires this into the existing `runtime.teardown()` chain — no new
   * signal listeners are registered.
   */
  shutdown: () => Promise<void>;
  /** The individual handles, exposed for tests and debugging. */
  handles: LifecycleHandle[];
}

/**
 * Run each registered lifecycle hook's `onInit` in declaration order with the
 * given context, then compose their contributions into a single wrap registry.
 *
 * Empty input → IDENTITY_WRAPS, no-op shutdown.
 *
 * Errors from a hook's onInit propagate — a failing plugin halts CLI startup
 * (a partial-init state is worse than failure).
 */
export async function initLifecycle(
  hooks: LifecycleHook[],
  ctx: LifecycleInitContext,
): Promise<LifecycleResult> {
  if (hooks.length === 0) {
    return {
      wraps: IDENTITY_WRAPS,
      shutdown: async () => {},
      handles: [],
    };
  }

  const handles: LifecycleHandle[] = [];
  for (const hook of hooks) {
    const handle = await hook.onInit(ctx);
    handles.push(handle);
  }

  return {
    wraps: composeWraps(handles),
    shutdown: async () => {
      // Reverse order — last initialized is first torn down, matching the
      // wrap composition order (outermost wrap is also outermost shutdown).
      for (let i = handles.length - 1; i >= 0; i--) {
        const handle = handles[i]!;
        if (handle.shutdown) {
          try {
            await handle.shutdown();
          } catch (err) {
            // Lifecycle shutdowns must not throw — they're invoked from the
            // teardown chain which has its own error handling. Log to stderr
            // as a last resort so the error isn't completely silent.
            process.stderr.write(
              `[lifecycle] shutdown error in ${hooks[i]?.name ?? "unknown"}: ${
                err instanceof Error ? err.message : String(err)
              }\n`,
            );
          }
        }
      }
    },
    handles,
  };
}
