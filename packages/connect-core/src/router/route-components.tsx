import type {
  AnyRoute,
  AnyRouter,
  ErrorRouteComponent,
  NotFoundRouteProps,
  RouteComponent,
} from "@tanstack/react-router";
import {
  lazyRouteComponent,
  Outlet,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import type {
  DocumentDriveDocument,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { useIsColdStart } from "./cold-start.js";
import { isDriveNotFound } from "./drive-route-loader.js";

/** A drive view's props: drive apps and core's directory listing get the same. */
export type DriveViewProps = {
  drive: DocumentDriveDocument;
  /** The open folder; undefined at the drive's root. */
  folder?: FolderNode;
  /** The open document's view, when one is open. */
  children?: ReactNode;
};

/** A document view's props, e.g. core's JSON view or revision history. */
export type DocumentViewProps = { document: PHDocument };

// Open views stay while a navigation loads; the pending view only after this.
export const DRIVE_PENDING_MS = 200;

/** The scroll container of the content view. */
export const CONTENT_VIEW_ID = "content-view";

/** A layout's content area: the matched route, in the container whose scroll
 * Connect resets on new views and restores on back and forward. */
export function ContentOutlet(props: { className?: string }) {
  return (
    <div
      className={props.className ?? "flex h-full flex-col overflow-auto"}
      id={CONTENT_VIEW_ID}
      data-scroll-restoration-id={CONTENT_VIEW_ID}
    >
      {useRouter().options.context.shell ? <LayoutPending /> : <Outlet />}
    </div>
  );
}

// The loading shell: the layout's own pendingComponent stands in for its page.
function LayoutPending() {
  const router = useRouter<AnyRouter>();
  const routeId = useMatch({ strict: false, select: (match) => match.routeId });
  const routesById = router.routesById as Partial<Record<string, AnyRoute>>;
  const route = routeId ? routesById[routeId] : undefined;
  const Pending = route?.options.pendingComponent as RouteComponent | undefined;
  return Pending ? <Pending /> : null;
}

/** A note on a cold start; otherwise the open view stays while loading. */
export function DrivePending() {
  const isColdStart = useIsColdStart();
  if (!isColdStart) return null;
  return (
    <p role="status" className="p-6 text-core-muted">
      Loading drive…
    </p>
  );
}

// Core's views load only when a page shows one.
const views = () => import("@powerhousedao/connect-core/views");

/** One of core's views, loaded with the route that shows it. */
export function coreView(name: keyof Awaited<ReturnType<typeof views>>) {
  return lazyRouteComponent(views, name) as RouteComponent;
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
