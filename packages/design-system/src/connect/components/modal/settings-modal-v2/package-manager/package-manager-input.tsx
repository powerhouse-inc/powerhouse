import type { SearchAutocompleteOption } from "@powerhousedao/design-system/ui";
import { SearchAutocomplete } from "@powerhousedao/design-system/ui";
import { useCallback, useMemo } from "react";
import type { RegistryPackageInfo } from "./types.js";

export type PackageManagerInputProps = {
  onInstall: (packageName: string) => void | Promise<void>;
  fetchPackages?: (query: string) => Promise<RegistryPackageInfo[]>;
  disabled?: boolean;
  className?: string;
};

export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props,
) => {
  const { onInstall, fetchPackages, disabled, className } = props;

  const fetchOptions = useMemo(() => {
    if (!fetchPackages) return undefined;
    return async (query: string): Promise<SearchAutocompleteOption[]> => {
      const packages = await fetchPackages(query);
      return packages.map((pkg) => ({
        value: pkg.name,
        label: pkg.name,
        description: pkg.description,
        meta: pkg.publisher,
      }));
    };
  }, [fetchPackages]);

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
        placeholder="Search packages..."
        disabled={disabled}
      />
    </div>
  );
};
