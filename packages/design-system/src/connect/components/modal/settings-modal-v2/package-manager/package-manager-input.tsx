import type { IconName } from "@powerhousedao/design-system";
import { Icon, PowerhouseButton } from "@powerhousedao/design-system";

import type { PowerhousePackage } from "@powerhousedao/config";
import type { IdAutocompleteProps } from "@powerhousedao/design-system";
import { IdAutocomplete, Input } from "@powerhousedao/design-system";
import { useCallback, useMemo, useState } from "react";

export type PackageManagerInputProps = {
  onInstall: (value: string) => void | Promise<void>;
  packageOptions?: PowerhousePackage[];
  className?: string;
};

const ProviderIconMap: Record<
  Required<PowerhousePackage>["provider"],
  { icon: IconName; size?: string | number }
> = {
  npm: { icon: "Npm" },
  github: { icon: "Github", size: 28 },
  local: { icon: "Hdd" },
};

const PackageItem = ({ packageName, provider }: PowerhousePackage) => {
  const icon = provider && ProviderIconMap[provider];
  return (
    <div className="flex w-full items-center justify-between px-2 py-1">
      <p className="font-medium">{packageName}</p>
      {icon && <Icon name={icon.icon} size={icon.size} />}
    </div>
  );
};

export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props: PackageManagerInputProps,
) => {
  const { onInstall, packageOptions, className } = props;

  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>();

  const handleSubmit = useCallback(() => {
    const result = onInstall(value);
    if (result) {
      setLoading(true);
      result
        .then(() => setValue(""))
        .catch(setError)
        .finally(() => setLoading(false));
    } else {
      setValue("");
      setError(undefined);
    }
  }, [onInstall, value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const errorMessage = !error
    ? " "
    : typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as string);

  const autoCompleteOptions: IdAutocompleteProps = useMemo(() => {
    const initialOptions = packageOptions?.map((option) => ({
      ...option,
      value: option.packageName,
    }));

    return !packageOptions?.length
      ? {
          autoComplete: false,
        }
      : {
          autoComplete: true,
          initialOptions,
          fetchOptionsCallback: (userInput) =>
            initialOptions?.filter((o) =>
              o.packageName.toLowerCase().includes(userInput.toLowerCase()),
            ) ?? [],
          renderOption: (option) => (
            <PackageItem {...(option as unknown as PowerhousePackage)} />
          ),
        };
  }, [packageOptions]);

  return (
    <div className={className}>
      <h3 className="mb-4 font-semibold text-gray-900">Install Package</h3>
      <div className="flex items-center gap-4">
        {!packageOptions?.length ? (
          <Input
            name="package"
            className="max-w-xs text-gray-700"
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            disabled={loading}
          />
        ) : (
          <IdAutocomplete {...autoCompleteOptions} onChange={setValue} />
        )}
        <PowerhouseButton
          className="h-9 rounded-md text-sm"
          onClick={handleSubmit}
          disabled={loading}
        >
          Install
        </PowerhouseButton>
      </div>
      <p className="mb-3 ml-2 h-3 text-sm text-red-800">{errorMessage}</p>
    </div>
  );
};
