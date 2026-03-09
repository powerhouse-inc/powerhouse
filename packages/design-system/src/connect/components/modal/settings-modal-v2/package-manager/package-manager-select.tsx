import { SelectFieldRaw } from "@powerhousedao/design-system/ui";
import { Input } from "@powerhousedao/design-system/ui";
import { useCallback, useMemo } from "react";
import { twMerge } from "tailwind-merge";
import type { RegistryOption, RegistryStatus } from "./types.js";

export type PackageManagerRegistrySelectProps = {
  registries: RegistryOption[];
  selectedRegistryId: string;
  onRegistryChange: (registryId: string) => void;
  registryStatus: RegistryStatus;
  customRegistryUrl?: string;
  onCustomRegistryUrlChange?: (url: string) => void;
  className?: string;
};

const statusIndicator: Record<RegistryStatus, React.ReactNode> = {
  idle: <span className="size-2 rounded-full bg-gray-400" />,
  connecting: (
    <span className="size-2 animate-pulse rounded-full bg-yellow-400" />
  ),
  connected: <span className="size-2 rounded-full bg-green-500" />,
  error: <span className="size-2 rounded-full bg-red-500" />,
};

export const PackageManagerRegistrySelect: React.FC<
  PackageManagerRegistrySelectProps
> = (props) => {
  const {
    registries,
    selectedRegistryId,
    onRegistryChange,
    registryStatus,
    customRegistryUrl,
    onCustomRegistryUrlChange,
    className,
  } = props;

  const selectedRegistry = registries.find((r) => r.id === selectedRegistryId);

  const selectOptions = useMemo(
    () => registries.map((r) => ({ value: r.id, label: r.label })),
    [registries],
  );

  const handleChange = useCallback(
    (value: string | string[]) => {
      onRegistryChange(Array.isArray(value) ? value.at(-1)! : value);
    },
    [onRegistryChange],
  );

  const handleCustomUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCustomRegistryUrlChange?.(e.target.value);
    },
    [onCustomRegistryUrlChange],
  );

  return (
    <div className={twMerge("flex flex-col gap-3", className)}>
      <h3 className="font-semibold text-gray-900">Select Registry</h3>
      <div className="flex items-center gap-2">
        <SelectFieldRaw
          className="min-w-36 max-w-fit"
          name="registry"
          required
          value={selectedRegistryId}
          options={selectOptions}
          multiple={false}
          onChange={handleChange}
        />
        {statusIndicator[registryStatus]}
      </div>
      {selectedRegistry?.editable && (
        <Input
          name="custom-registry-url"
          className="max-w-xs text-gray-700"
          placeholder="https://registry.example.com/-/cdn/"
          value={customRegistryUrl ?? ""}
          onChange={handleCustomUrlChange}
        />
      )}
    </div>
  );
};
