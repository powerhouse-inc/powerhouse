import { Button, Icon, type IconName } from "#powerhouse";

import { Input } from "#ui";
import type { PowerhousePackage } from "@powerhousedao/config";
import { useCallback, useMemo, useState } from "react";
import {
  IdAutocomplete,
  type IdAutocompleteProps,
} from "../../../../../scalars/components/fragments/id-autocomplete/index.js";

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
            // eslint-disable-next-line react/jsx-props-no-spreading
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
          // eslint-disable-next-line react/jsx-props-no-spreading
          <IdAutocomplete {...autoCompleteOptions} onChange={setValue} />
        )}
        <Button
          className="h-9 rounded-md text-sm"
          onClick={handleSubmit}
          disabled={loading}
        >
          Install
        </Button>
      </div>
      <p className="mb-3 ml-2 h-3 text-sm text-red-800">{errorMessage}</p>
    </div>
  );
};
