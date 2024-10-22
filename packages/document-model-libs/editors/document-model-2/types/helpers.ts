export type SnakeCase = `${string}_${string}`;
export type LowercaseSnakeCase = Lowercase<SnakeCase>;
export type ConstantCase = Uppercase<SnakeCase>;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
