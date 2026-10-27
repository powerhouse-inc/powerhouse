import type { Axis } from "./schema.js";

export type CellKey = {
  /** `axis=value,…` in axis order: stable and readable. */
  id: string;
  /** Axis key → value key, in axis order. */
  values: Record<string, string>;
};

export function cellId(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([axis, value]) => `${axis}=${value}`)
    .join(",");
}

/** Every combination; the first axis varies slowest. */
export function expand(axes: readonly Axis[]): CellKey[] {
  let combos: Record<string, string>[] = [{}];
  for (const axis of axes) {
    combos = combos.flatMap((combo) =>
      axis.values.map((value) => ({ ...combo, [axis.key]: value.key })),
    );
  }
  if (axes.length === 0) return [];
  return combos.map((values) => ({ id: cellId(values), values }));
}
