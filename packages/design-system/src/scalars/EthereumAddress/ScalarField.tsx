import type { PHScalar } from "@powerhousedao/scalars";
import { type ComponentType, useCallback, useState } from "react";

export type BaseScalarFieldProps<T extends PHScalar> = {
  value: ReturnType<T["scalar"]["parseValue"]>;
  onChange: (value: ReturnType<T["scalar"]["parseValue"]>) => void;
  error: Error | undefined;
  onError?: (error: Error) => void;
};

export type ScalarFieldProps<T extends PHScalar> = {
  scalar: T;
  value: ReturnType<T["scalar"]["parseValue"]>;
  validate: T["schema"]["safeParse"];
  onChange: (value: unknown) => Error | undefined;
  error: Error | undefined;
};

export function withScalar<
  Scalar extends PHScalar,
  Props extends BaseScalarFieldProps<Scalar>,
>(scalar: Scalar, Component: ComponentType<Props>) {
  const validate = scalar.schema.safeParse.bind(scalar.schema);

  return (props: Props) => {
    const [error, setError] = useState<Error | undefined>(undefined);
    const { onChange, onError } = props;
    const onChangeScalar = useCallback(
      (input: unknown) => {
        const result = validate(input);
        if (result.success) {
          setError(undefined);
          onChange(
            // TODO fix this type
            result.data as unknown as ReturnType<
              Scalar["scalar"]["parseValue"]
            >,
          );
        } else {
          onError?.(result.error);
          setError(result.error);
          return error;
        }
      },
      [onChange],
    );

    return (
      <Component
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
        validate={validate}
        onChange={onChangeScalar}
        error={error}
      />
    );
  };
}
