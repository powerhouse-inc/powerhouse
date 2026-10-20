// The router's one edge to core's views: views never import this module, so
// loading them lazily makes no import cycle.
import type {
  ErrorRouteComponent,
  NotFoundRouteProps,
  RouteComponent,
} from "@tanstack/react-router";
import { lazyRouteComponent } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { isDriveNotFound } from "./drive-route-loader.js";
import type { ConnectModals } from "./modals.js";
import { CORE_MODAL_VIEWS } from "./modals.js";

// Core's views load only when a page shows one.
const views = () => import("@powerhousedao/connect-core/views");

const CORE_VIEW = Symbol.for("@powerhousedao/connect-core/core-view");

/** One of core's views, loaded with the route that shows it. */
export function coreView(name: keyof Awaited<ReturnType<typeof views>>) {
  return Object.assign(lazyRouteComponent(views, name), {
    [CORE_VIEW]: true,
  }) as RouteComponent;
}

/** Whether a route's component is one of core's views, which a plugin's UI replaces. */
export function isCoreView(component: unknown) {
  return (
    typeof component === "function" &&
    (component as { [CORE_VIEW]?: true })[CORE_VIEW] === true
  );
}

const NotFoundPage = coreView("NotFoundPage");
const DriveNotFoundPage = coreView("DriveNotFoundPage") as ComponentType<{
  driveSlug: string;
}>;

/** Core's not-found page; a missing drive's names the drive. */
export function CoreNotFound({ data }: Partial<NotFoundRouteProps>) {
  return isDriveNotFound(data) ? (
    <DriveNotFoundPage driveSlug={data.driveSlug} />
  ) : (
    <NotFoundPage />
  );
}

/** Core's view of a route's loader or render error. */
export const CoreError = coreView("CoreRouteError") as ErrorRouteComponent;

/** Core's modals, loaded when one opens. */
export const coreModals: ConnectModals = Object.fromEntries(
  Object.entries(CORE_MODAL_VIEWS).map(([type, name]) => [
    type,
    coreView(name),
  ]),
);
