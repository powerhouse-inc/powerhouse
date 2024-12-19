export type ValueCast = "BigInt" | "Number" | "URLTrim";

export const castFunctions: Record<ValueCast, (value: any) => any> = {
  BigInt: (value: string) => BigInt(value),
  Number: (value: string) => Number(value),
  URLTrim: (value?: string) => value?.trim(),
};

export function castValue(value: any, cast: ValueCast): any {
  return castFunctions[cast](value);
}
