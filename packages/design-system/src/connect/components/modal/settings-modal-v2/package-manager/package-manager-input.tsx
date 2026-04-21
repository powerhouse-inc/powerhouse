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

    return Promise.resolve(
      registryPackageList
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
        }),
    );
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
