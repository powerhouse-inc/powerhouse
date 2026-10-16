import type { ComponentProps, ComponentType } from "react";
import { lazy, Suspense } from "react";

/** A component that loads its implementation (and its heavy deps) on first render. */
export function lazyComponent<C extends ComponentType<any>>(
  load: () => Promise<C>,
): C {
  const Lazy = lazy(async () => ({ default: await load() }));
  function LazyComponent(props: ComponentProps<C>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return LazyComponent as unknown as C;
}
