import { TransformerObject } from "../components/fragments/value-transformer/value-transformer";

export const sharedValueTransformers: Record<
  string,
  (ifParam?: boolean) => TransformerObject
> = {
  trimOnBlur: (ifParam = true) => ({
    transformer: (value?: string) => value?.trim(),
    options: {
      trigger: "blur",
      if: ifParam,
    },
  }),
  lowercaseOnChange: (ifParam = true) => ({
    transformer: (value?: string) => value?.toLowerCase(),
    options: {
      trigger: "change",
      if: ifParam,
    },
  }),
  uppercaseOnChange: (ifParam = true) => ({
    transformer: (value?: string) => value?.toUpperCase(),
    options: {
      trigger: "change",
      if: ifParam,
    },
  }),
};
