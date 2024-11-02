import { Maybe } from "../components/types";

export type Transformer<T> = (value: Maybe<T>) => Maybe<T>;

const transformersFns: Record<string, Transformer<any>> = {
  lowercase: (value: unknown) => {
    if (value === null || value === undefined) return value;
    return (value as string).toLowerCase();
  },
  uppercase: (value: unknown) => {
    if (value === null || value === undefined) return value;
    return (value as string).toUpperCase();
  },
  trim: (value: unknown) => {
    if (value === null || value === undefined) return value;
    return (value as string).trim();
  },
};

export function applyTransformers<T>(
  value: Maybe<T>,
  transformers: Record<keyof typeof transformersFns, boolean>,
): Maybe<T> {
  return Object.entries(transformers)
    .filter(([, enabled]) => enabled)
    .reduce((currentValue, [transformerName]) => {
      const transformer = transformersFns[transformerName];
      return transformer(currentValue) as Maybe<T>;
    }, value);
}
