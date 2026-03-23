import type { SearchAutocompleteOption } from "@powerhousedao/design-system/ui";
import { SearchAutocomplete } from "@powerhousedao/design-system/ui";
import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { useCallback } from "react";

export type PackageManagerInputProps = {
  registryPackageList: RegistryPackageList;
  onInstall: (packageName: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props,
) => {
  const { registryPackageList, onInstall, disabled, className } = props;

  const fetchOptions = async (
    query: string,
  ): Promise<SearchAutocompleteOption[]> =>
    Promise.resolve(
      registryPackageList
        .filter(
          (pkg) =>
            pkg.name.toLowerCase().includes(query.toLowerCase()) ||
            pkg.manifest?.description
              ?.toLowerCase()
              .includes(query.toLowerCase()),
        )
        .map((pkg) => ({
          value: pkg.name,
          label: pkg.name,
          description: pkg.manifest?.description,
          meta: pkg.manifest?.publisher?.name,
        })),
    );

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
