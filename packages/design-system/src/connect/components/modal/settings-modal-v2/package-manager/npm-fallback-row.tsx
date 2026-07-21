import { useState } from "react";
import { buildPackageSpec, parsePackageSpec } from "./parse-package-spec.js";

export type NpmFallbackRowProps = {
  /** Raw search query — may carry an `@tag` / `@version` suffix. */
  query: string;
  onInstall: (packageSpec: string) => Promise<void>;
  disabled?: boolean;
};

/**
 * Shown in the Available tab when the search query matches nothing in the
 * registry but looks like a valid npm package name: the registry's verdaccio
 * backend proxies npmjs.org, so the install can still succeed. Replaces the
 * old SearchAutocomplete fallback option. The button label is "Install from
 * npm" (not "Install") so it doesn't collide with the row-kebab menu item.
 */
export const NpmFallbackRow: React.FC<NpmFallbackRowProps> = (props) => {
  const { query, onInstall, disabled } = props;
  const [isInstalling, setIsInstalling] = useState(false);

  const { name, tag } = parsePackageSpec(query);
  const spec = buildPackageSpec(name, tag);

  function handleInstall() {
    setIsInstalling(true);
    onInstall(spec)
      .catch(console.error)
      .finally(() => setIsInstalling(false));
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-dashed border-border bg-background p-3 text-sm/5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">
          {tag ? `${name} @ ${tag}` : name}
        </p>
        <p className="text-xs text-foreground">
          Not published to this registry. Install via the npmjs.org uplink.
        </p>
        <p className="text-xs text-muted-foreground">npm fallback</p>
      </div>
      <div className="shrink-0 self-center">
        <button
          onClick={handleInstall}
          disabled={disabled || isInstalling}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:hover-effect disabled:disabled-effect"
        >
          {isInstalling ? "Installing..." : "Install from npm"}
        </button>
      </div>
    </div>
  );
};
