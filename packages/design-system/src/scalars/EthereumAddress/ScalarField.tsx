import type { PHScalar } from "@powerhousedao/scalars";
import { type ComponentType, useCallback, useEffect, useState } from "react";

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
    const { onChange, onError } = props;

    const [error, setError] = useState<Error | undefined>(undefined);
    const [value, setValue] = useState<
      ReturnType<Scalar["scalar"]["parseValue"]>
    >(props.value);

    const processValidation = useCallback(
      (validationReslut: ReturnType<typeof validate>) => {
        if (validationReslut.success) {
          setError(undefined);
        } else {
          onError?.(validationReslut.error);
          setError(validationReslut.error);
        }
      },
      [onError, setError],
    );

    useEffect(() => {
      const res = validate(props.value);
      processValidation(res);
    }, []);

    const onChangeScalar = useCallback(
      (input: ReturnType<Scalar["scalar"]["parseValue"]>) => {
        setValue(input);
        const result = validate(input);
        processValidation(result);
      },
      [onChange],
    );

    return (
      <Component
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
        value={value}
        validate={validate}
        onChange={onChangeScalar}
        error={error}
      />
    );
  };
}
