import { CenteredErrorMessage } from "@powerhousedao/connect/components/shared";
import { useIsColdStart } from "@powerhousedao/connect-core/router";
import { DefaultEditorLoader } from "@powerhousedao/design-system/connect";
import type { ErrorComponentProps } from "@tanstack/react-router";

// Fades the cold-start loader in, so a load ending just past pendingMs doesn't flash.
const DRIVE_PENDING_FADE = "ph-drive-pending-in 200ms ease-in 100ms both";

/** A loader on a cold start; otherwise the open view stays while loading. */
export function DrivePending() {
  const isColdStart = useIsColdStart();
  if (!isColdStart) return null;
  return (
    <div
      className="flex size-full items-center justify-center"
      style={{ animation: DRIVE_PENDING_FADE }}
    >
      <style>
        {`@keyframes ph-drive-pending-in{from{opacity:0}to{opacity:1}}`}
      </style>
      <DefaultEditorLoader message="Loading drive" />
    </div>
  );
}

/** A route's loader or render error, as Connect's error boundaries show it. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  return <CenteredErrorMessage error={error} resetErrorBoundary={reset} />;
}
