import { PackageAnimation } from "#design-system";
import type { SearchAutocompleteOption } from "#design-system/ui";
import { SearchAutocomplete } from "#design-system/ui";
import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { useCallback } from "react";
import { buildPackageSpec, parsePackageSpec } from "./parse-package-spec.js";

export type PackageManagerInputProps = {
  registryPackageList: RegistryPackageList;
  onInstall: (packageSpec: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

// Minimum viable package name: an npm-style identifier (scoped or unscoped).
// Used to gate the npm-fallback option so we don't show an "Install from
// npm" card for whitespace-only queries or while the user is still typing
// a single character.
const NPM_NAME_RE =
  /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$|^[a-z0-9][a-z0-9._-]*$/i;

function isPlausiblePackageName(name: string): boolean {
  return name.length >= 2 && NPM_NAME_RE.test(name);
}

export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props,
) => {
  const { registryPackageList, onInstall, disabled, className } = props;

  const fetchOptions = async (
    query: string,
  ): Promise<SearchAutocompleteOption[]> => {
    // Users can type "@scope/pkg@dev" or "pkg@1.2.3" to target a specific
    // dist-tag or version. We match on the bare name and carry the tag
    // through into the option's `value` so `onSelect` receives the full
    // install spec.
    const { name: namePart, tag } = parsePackageSpec(query);
    const needle = namePart.toLowerCase();

    const localOptions: SearchAutocompleteOption[] = registryPackageList
      .filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(needle) ||
          pkg.manifest?.description?.toLowerCase().includes(needle),
      )
      .map((pkg) => {
        const isInstalled =
          pkg.status === "local-install" || pkg.status === "registry-install";
        const installSpec = buildPackageSpec(pkg.name, tag);
        const label = tag ? `${pkg.name} @ ${tag}` : pkg.name;
        const displayVersion = tag ?? pkg.version;
        return {
          value: installSpec,
          label,
          version: displayVersion,
          description: pkg.manifest?.description,
          meta: pkg.manifest?.publisher?.name,
          disabled: isInstalled,
          disabledLabel: isInstalled ? "Installed" : undefined,
        };
      });

    // The custom registry's /packages endpoint only returns locally-published
    // packages, so anything that exists only on npmjs.org won't appear in the
    // local list. When the user's query looks like a real package name, we
    // append a single synthetic "install from npm" option at the bottom. The
    // registry's uplink handles the actual fetch when the user picks this —
    // if the name doesn't exist on npm either, the install call errors and
    // the consumer's toast surfaces the failure.
    if (!isPlausiblePackageName(namePart)) {
      return Promise.resolve(localOptions);
    }

    const npmAlreadyInLocal = localOptions.some(
      (opt) => opt.label === namePart || opt.label === `${namePart} @ ${tag}`,
    );
    if (npmAlreadyInLocal) {
      return Promise.resolve(localOptions);
    }

    const fallbackSpec = buildPackageSpec(namePart, tag);
    const fallbackLabel = tag ? `${namePart} @ ${tag}` : namePart;
    const fallbackOption: SearchAutocompleteOption = {
      value: fallbackSpec,
      label: fallbackLabel,
      version: tag,
      description:
        "Not published to this registry. Install via the npmjs.org uplink.",
      meta: "npm fallback",
    };
    return Promise.resolve([...localOptions, fallbackOption]);
  };

  const handleSelect = useCallback(
    (value: string) => {
      return onInstall(value);
    },
    [onInstall],
  );

  return (
    <div className={className}>
      <h3 className="mb-4 font-semibold text-gray-900">Install Package</h3>
      <SearchAutocomplete
        fetchOptions={fetchOptions}
        onSelect={handleSelect}
        selectLabel="Install"
        selectingContent={
          <PackageAnimation animate loop color="#6b7280" size={48} />
        }
        placeholder="Search packages (e.g. my-pkg, my-pkg@dev, my-pkg@1.2.3)..."
        disabled={disabled}
      />
    </div>
  );
};
