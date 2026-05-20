import { mergeAll } from "remeda";

/**
 * Light-to-dark mappings for text color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const text = {
  "text-black": "text-slate-50",
  "text-gray-900": "text-slate-50",
  "text-gray-800": "text-slate-50",
  "text-gray-700": "text-slate-50",
  "text-gray-600": "text-slate-100",
  "text-gray-400": "text-slate-200",
  "text-slate-100": "text-gray-500",
  "text-slate-200": "text-gray-400",
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
  "bg-white": "bg-slate-900",
  "bg-white/90": "bg-slate-900/90",
  "bg-gray-50": "bg-slate-800",
  "bg-gray-100": "bg-slate-700",
  "bg-gray-200": "bg-slate-600",
  "bg-slate-50": "bg-slate-800",
  "bg-slate-100": "bg-slate-700",
  "bg-red-50": "bg-red-900/20",
  "bg-red-100": "bg-red-900/30",
  "bg-yellow-50": "bg-yellow-900/20",
  "bg-yellow-100": "bg-yellow-900/30",
  "bg-yellow-400": "bg-yellow-900",
  "bg-blue-50": "bg-blue-900/20",
  "bg-blue-100": "bg-blue-900/30",
  "bg-blue-200": "bg-blue-800",
  "bg-blue-300": "bg-blue-700",
} as const;

/**
 * Light-to-dark mappings for border color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
export const border = {
  "border-gray-100": "border-slate-700",
  "border-gray-200": "border-slate-700",
  "border-gray-300": "border-slate-600",
  "border-gray-400": "border-slate-500",
  "border-gray-500": "border-slate-400",
  "border-slate-50": "border-slate-700",
  "border-slate-100": "border-slate-700",
  "border-slate-200": "border-slate-600",
  "border-red-300": "border-red-800",
  "border-yellow-300": "border-yellow-800",
  "border-yellow-400": "border-yellow-700",
  "border-blue-300": "border-blue-700",
  "border-blue-500": "border-blue-600",
} as const;

/**
 * Light-to-dark mappings for hover variant text/background classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
export const hover = {
  "hover:bg-gray-50": "hover:bg-slate-800",
  "hover:bg-gray-100": "hover:bg-slate-700",
  "hover:bg-gray-200": "hover:bg-slate-600",
  "hover:bg-slate-50": "hover:bg-slate-800",
  "hover:bg-slate-100": "hover:bg-slate-700",
  "hover:text-gray-900": "hover:text-slate-50",
  "hover:text-gray-800": "hover:text-slate-50",
  "hover:text-gray-700": "hover:text-slate-100",
  "hover:text-gray-600": "hover:text-slate-100",
  "hover:text-gray-500": "hover:text-slate-100",
  "hover:bg-red-100": "hover:bg-red-900/30",
  "hover:bg-yellow-100": "hover:bg-yellow-900/30",
  "hover:bg-blue-50": "hover:bg-blue-900/20",
  "hover:bg-blue-100": "hover:bg-blue-900/30",
} as const;

const updatedMappings = {
  "text-black": "text-slate-50",
  "text-gray-900": "text-slate-50",
  "text-gray-800": "text-slate-50",
  "text-gray-700": "text-slate-50",
  "text-gray-600": "text-slate-100",
  "text-gray-400": "text-slate-200",
  "text-slate-100": "text-gray-500",
  "text-slate-200": "text-gray-400",
  "hover:text-gray-900": "hover:text-slate-50",
  "hover:text-gray-800": "hover:text-slate-50",
  "hover:text-gray-700": "hover:text-slate-100",
  "hover:text-gray-600": "hover:text-slate-100",
  "hover:text-gray-500": "hover:text-slate-100",
} as const;

export const allMappings = mergeAll([text, border, bg, hover]);
