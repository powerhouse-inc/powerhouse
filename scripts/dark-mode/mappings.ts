import { mapKeys, mapValues, mergeAll, pipe } from "remeda";
import { addPrefix, addSuffix } from "./utils.js";

/**
 * Light-to-dark mappings for text color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const text = {
  "text-black": "text-slate-50",
  "text-gray-900": "text-slate-50",
  "text-gray-800": "text-slate-100",
  "text-gray-700": "text-slate-200",
  "text-gray-600": "text-slate-300",
  "text-gray-400": "text-slate-400",
  "text-slate-100": "text-slate-800",
  "text-slate-200": "text-slate-700",
  "text-red-900": "text-red-400",
  "text-red-800": "text-red-400",
  "text-red-700": "text-red-400",
  "text-red-600": "text-red-400",
  "text-red-500": "text-red-400",
  "text-yellow-900": "text-yellow-400",
  "text-yellow-800": "text-yellow-400",
  "text-yellow-700": "text-yellow-400",
  "text-green-900": "text-green-400",
  "text-green-700": "text-green-400",
  "text-green-600": "text-green-400",
  "text-blue-900": "text-blue-400",
  "text-blue-700": "text-blue-400",
  "text-blue-600": "text-blue-400",
} as const;

/**
 * Light-to-dark mappings for background color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
export const bg = {
  "bg-white": "bg-slate-800",
  "bg-white/90": "bg-slate-900/90",
  "bg-gray-50": "bg-slate-700",
  "bg-gray-100": "bg-slate-600",
  "bg-gray-200": "bg-slate-500",
  "bg-slate-50": "bg-slate-700",
  "bg-slate-100": "bg-slate-600",
  "bg-red-50": "bg-red-800",
  "bg-red-100": "bg-red-700",
  "bg-yellow-50": "bg-yellow-800",
  "bg-yellow-100": "bg-yellow-700",
  "bg-yellow-400": "bg-yellow-400",
  "bg-blue-50": "bg-blue-800",
  "bg-blue-100": "bg-blue-700",
  "bg-blue-200": "bg-blue-600",
  "bg-blue-300": "bg-blue-500",
} as const;

/**
 * Light-to-dark mappings for border color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
export const border = {
  "border-gray-50": "border-slate-900",
  "border-gray-100": "border-slate-800",
  "border-gray-200": "border-slate-700",
  "border-gray-300": "border-slate-600",
  "border-gray-400": "border-slate-500",
  "border-gray-500": "border-slate-400",
  "border-gray-600": "border-slate-300",
  "border-gray-700": "border-slate-200",
  "border-gray-800": "border-slate-100",
  "border-gray-900": "border-slate-50",
  "border-slate-50": "border-slate-800",
  "border-slate-100": "border-slate-700",
  "border-slate-200": "border-slate-600",
  "border-red-300": "border-red-800",
  "border-yellow-300": "border-yellow-800",
  "border-yellow-400": "border-yellow-700",
  "border-blue-300": "border-blue-700",
  "border-blue-500": "border-blue-600",
} as const;

export const colorMappings = mergeAll([text, border, bg]);

export const hover = pipe(
  colorMappings,
  mapKeys(addPrefix("hover:")),
  mapValues(addPrefix("hover:")),
);
export const group = pipe(
  colorMappings,

  mapKeys(addPrefix("group-hover:")),
  mapValues(addPrefix("group-hover:")),
);

export const placeholder = pipe(
  colorMappings,

  mapKeys(addPrefix("placeholder:")),
  mapValues(addPrefix("placeholder:")),
);

export const focus = pipe(
  colorMappings,
  mapKeys(addPrefix("focus:")),
  mapValues(addPrefix("focus:")),
);

export const focusWithin = pipe(
  colorMappings,
  mapKeys(addPrefix("focus-within:")),
  mapValues(addPrefix("focus-within:")),
);

export const focusVisible = pipe(
  colorMappings,
  mapKeys(addPrefix("focus-visible:")),
  mapValues(addPrefix("focus-visible:")),
);

export const even = pipe(
  colorMappings,
  mapKeys(addPrefix("even:")),
  mapValues(addPrefix("even:")),
);

export const odd = pipe(
  colorMappings,
  mapKeys(addPrefix("odd:")),
  mapValues(addPrefix("odd:")),
);

export const exclamationMark: Record<string, string> = pipe(
  mergeAll([
    text,
    border,
    bg,
    hover,
    group,
    placeholder,
    focus,
    focusWithin,
    even,
    odd,
  ]),
  mapKeys(addSuffix("!")),
  mapValues(addSuffix("!")),
);

export const allMappings = mergeAll([
  text,
  border,
  bg,
  hover,
  group,
  placeholder,
  focus,
  focusWithin,
  even,
  odd,
]);
