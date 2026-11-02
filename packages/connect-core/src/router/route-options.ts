import type { AnyRoute } from "@tanstack/react-router";

type RouteOptionKey = keyof AnyRoute["options"];

/** A core route's `options`: what it sets, as it sets it, and every other
 * route option, unset. */
export type CoreRouteOptions<T extends object> = T & {
  [K in Exclude<RouteOptionKey, keyof T>]?: undefined;
};

/** Types a core route file's exported `options` as {@link CoreRouteOptions}. */
export function coreRouteOptions<T extends object>(
  options: T,
): CoreRouteOptions<T> {
  return options as CoreRouteOptions<T>;
}
