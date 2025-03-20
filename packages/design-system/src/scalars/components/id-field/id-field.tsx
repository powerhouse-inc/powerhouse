import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { nanoid } from "nanoid";

export type GeneratorFn = () => string;

export type BuiltInGenerator = "uuid" | "nanoid";

export interface IdFieldProps {
  name?: string;
  value?: string;
  generator?: BuiltInGenerator | GeneratorFn;
}

export const IdField: React.FC<IdFieldProps> = ({
  name = "id",
  value,
  generator = "nanoid",
  ...rest
}) => {
  const {
    register,
    formState: { submitCount },
  } = useFormContext();
  const actualValue = useMemo(
    () => {
      if (value !== undefined) return value;

      if (typeof generator === "function") return generator();

      switch (generator) {
        case "nanoid":
          return nanoid();
        case "uuid":
          return crypto.randomUUID();
      }
    },
    // We want to re-generate the ID on every submit

    [value, generator, submitCount],
  );

  return (
    <input type="hidden" value={actualValue} {...register(name)} {...rest} />
  );
};
