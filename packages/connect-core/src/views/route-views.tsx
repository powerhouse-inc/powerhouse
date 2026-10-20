import type { ErrorComponentProps } from "@tanstack/react-router";

/** A route's loader or render error. */
export function CoreRouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div role="alert" className="flex flex-col gap-2 p-6 text-core-fg">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <pre className="overflow-x-auto text-sm text-core-muted">
        {error instanceof Error ? error.message : JSON.stringify(error)}
      </pre>
      <button
        type="button"
        className="self-start rounded border border-core-border px-3 py-1 hover:bg-core-hover"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
