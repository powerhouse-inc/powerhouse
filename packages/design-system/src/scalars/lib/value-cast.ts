export type ValueCast = "BigInt" | "Number";

export const castFunctions: Record<ValueCast, (value: any) => any> = {
  BigInt: (value) => BigInt(value as string),
  Number: (value) => Number(value as string),
};

export function castValue(value: any, cast: ValueCast): any {
  return castFunctions[cast](value);
}
