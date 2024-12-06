import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

export type GeneratorFn = () => string;

export type BuiltInGenerator = "UUID";

export interface IdFieldProps {
  name?: string;
  value?: string;
  generator?: BuiltInGenerator | GeneratorFn;
}

export const IdField: React.FC<IdFieldProps> = ({
  name = "id",
  value,
  generator = "UUID",
  ...rest
}) => {
  const {
    register,
    formState: { submitCount },
  } = useFormContext();
  const actualValue = useMemo(
    () =>
      value !== undefined
        ? value
        : typeof generator === "function"
          ? generator()
          : crypto.randomUUID(),
    // We want to re-generate the ID on every submit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, generator, submitCount],
  );

  return (
    <input type="hidden" value={actualValue} {...register(name)} {...rest} />
  );
};
