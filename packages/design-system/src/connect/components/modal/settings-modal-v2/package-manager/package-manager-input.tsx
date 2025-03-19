import { Button } from "#powerhouse";
import { Input } from "#ui";
import { useCallback, useState } from "react";

export type PackageManagerInputProps = {
  onInstall: (value: string) => void | Promise<void>;
  className?: string;
};
export const PackageManagerInput: React.FC<PackageManagerInputProps> = (
  props: PackageManagerInputProps,
) => {
  const { onInstall, className } = props;

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

  return (
    <div className={className}>
      <h3 className="mb-4 font-semibold text-gray-900">Install Package</h3>
      <div className="flex items-center gap-4">
        <Input
          name="package"
          className="max-w-xs text-gray-700"
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          disabled={loading}
        />
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
