import { Icon } from "#design-system";

export type PackageRegistryErrorProps = {
  /**
   * `empty` — first load / search failed with nothing to show.
   * `refresh` — a later fetch failed but previously loaded packages remain.
   */
  variant: "empty" | "refresh";
  onRetry?: () => void;
};

/**
 * Friendly registry-error banner. Never surfaces raw API / network messages —
 * those stay in the console for debugging.
 */
export const PackageRegistryError: React.FC<PackageRegistryErrorProps> = ({
  variant,
  onRetry,
}) => {
  const isEmpty = variant === "empty";

  return (
    <div
      className={
        isEmpty
          ? "flex items-start gap-3 rounded-lg border border-destructive bg-destructive/10 p-4"
          : "flex items-start gap-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2.5"
      }
      role="alert"
    >
      <Icon
        name="Error"
        size={16}
        className="mt-0.5 shrink-0 text-destructive"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">
          {isEmpty ? "Couldn't load packages" : "Couldn't refresh packages"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isEmpty
            ? "We couldn't reach the package registry. Check your connection and try again."
            : "Showing previously loaded packages. Check your connection and try again."}
        </p>
        {isEmpty && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:hover-effect"
          >
            Try again
          </button>
        )}
      </div>
      {!isEmpty && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 self-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:hover-effect"
        >
          Try again
        </button>
      )}
    </div>
  );
};
