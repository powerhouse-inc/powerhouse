import { deepEqual } from "@/scalars/lib/deep-equal";
import React, { useEffect } from "react";
import { useFormContext } from "react-hook-form";

export type ValueTransformer = (value?: any) => any;

export type TransformerTrigger = "blur" | "change" | "keyDown";

export type TransformerObject = {
  /**
   * The transformer function
   */
  transformer: ValueTransformer;
  options?: {
    /**
     * The event that triggers the transformer.
     * @default "blur"
     */
    trigger?: TransformerTrigger;
    /**
     * If true, the transformer will be applied.
     * @default true
     */
    if?: boolean;
  };
};

export type TransformerType = TransformerObject[] | ValueTransformer[];

interface ValueTransformerProps {
  transformers: TransformerType;
  children: React.ReactElement;
}

// Workaround to set the value of an input element
// following react core team recommendation
// https://github.com/facebook/react/issues/10135
function setNativeValue(element: HTMLInputElement, value: any) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value",
  )?.set;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter?.call(element, value);
  } else {
    valueSetter?.call(element, value);
  }
}

// apply transformers to the value
function _applyTransformers(
  transformers: TransformerType,
  value: unknown,
  filter: TransformerTrigger | "all" = "blur",
) {
  return transformers.reduce<unknown>((value, transformer) => {
    if (typeof transformer === "function") {
      if (filter === "blur" || filter === "all") {
        // array of transformers are only applied on blur
        return transformer(value);
      }
      return value;
    }

    // it is a transformer object
    if (
      (transformer.options?.trigger ?? "blur") !== filter &&
      filter !== "all"
    ) {
      return value;
    }
    // if no set, we assume true
    if (transformer.options?.if === undefined || transformer.options.if) {
      return transformer.transformer(value);
    }
    return value;
  }, value);
}

/**
 * Apply transformers to the value of the input element. A transformer is a function that
 * will be applied to the value of the input element modifying the value.
 *
 * @param transformers - An array of transformers. A transformer is an object with a
 * `transformer` property, which is a function that will be applied to the value of
 * the input element, and an optional `options` property. The `options` property can
 * have a `trigger` property, which is the event that triggers the transformer, and
 * an `if` property, which is a boolean that indicates if the transformer should be
 * applied.
 * @param children - The input element to apply the transformers to as children
 *
 * @example
 * <ValueTransformer transformers={[
 *   {
 *     transformer: (value) => value.toUpperCase(),
 *     options: {
 *       trigger: "change",
 *     },
 *   },
 * ]}>
 *   <Input />
 * </ValueTransformer>
 *
 * @example
 * <ValueTransformer transformers={[
 *   {
 *     // trim the value on blur
 *     transformer: (value) => (value as string).trim(),
 *   },
 * ]}>
 *   <Input />
 * </ValueTransformer>
 */
function ValueTransformer({ transformers, children }: ValueTransformerProps) {
  const { setValue } = useFormContext();

  useEffect(() => {
    // apply all the transformers on mount to prevent untransformed values
    // if the field is not touched by the user
    const value = (children.props as { value: unknown }).value;
    const transformedValue = _applyTransformers(transformers, value, "all");

    if (!deepEqual(transformedValue, value)) {
      setValue((children.props as { name: string }).name, transformedValue);
    }
  }, [transformers]);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return React.cloneElement(children, {
    ...children.props,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      // apply transformers on change
      const transformedValue = _applyTransformers(
        transformers,
        event.target.value,
        "change",
      );

      if (transformedValue !== event.target.value) {
        setValue((children.props as { name: string }).name, transformedValue);
        setNativeValue(event.target, transformedValue);
      }

      // call the original onChange
      (children.props as React.HTMLAttributes<HTMLInputElement>).onChange?.(
        event,
      );
    },
    // apply transformers on blur
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      // call the original onBlur
      (children.props as React.HTMLAttributes<HTMLInputElement>).onBlur?.(
        event,
      );

      // apply the transformers
      const target = event.target;
      const transformedValue = _applyTransformers(
        transformers,
        target.value,
        "blur",
      );

      if (!deepEqual(transformedValue, target.value)) {
        // only dispatch change if the value has changed
        setNativeValue(target, transformedValue);
        const changeEvent = new Event("change", { bubbles: true });
        target.dispatchEvent(changeEvent);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      // call the original onKeyDown
      (children.props as React.HTMLAttributes<HTMLInputElement>).onKeyDown?.(
        event,
      );

      // apply the transformers
      if (event.key === "Enter") {
        const target = event.target as HTMLInputElement;
        const transformedValue = _applyTransformers(
          transformers,
          target.value,
          "keyDown",
        );

        // only dispatch change if the value has changed
        if (!deepEqual(transformedValue, target.value)) {
          setNativeValue(target, transformedValue);
          const changeEvent = new Event("change", { bubbles: true });
          target.dispatchEvent(changeEvent);
        }
      }
    },
  });
}

export default ValueTransformer;
