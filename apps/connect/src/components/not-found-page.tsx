import { DriveAuthGate } from "@powerhousedao/design-system/connect";
import {
  logout,
  useDriveAuthRefused,
  useLinkProps,
  useUser,
} from "@powerhousedao/reactor-browser";
import { useRouterState } from "@tanstack/react-router";
import { useOpenRenownLogin } from "../hooks/use-renown-login.js";

/** The 404 page: what was asked for, and a way home. */
export function NotFoundPage({ driveSlug }: { driveSlug?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const home = useLinkProps(undefined);
  return (
    <div
      role="alert"
      className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-foreground">
        {driveSlug ? `Drive ${driveSlug} not found` : "Page not found"}
      </h1>
      <p className="text-muted-foreground">
        Nothing is at{" "}
        <code data-testid="not-found-path" className="text-foreground">
          {pathname}
        </code>
        .
      </p>
      <a {...home} className="text-foreground underline">
        Go to the home page
      </a>
    </div>
  );
}

export function DriveNotFoundPage({ driveSlug }: { driveSlug: string }) {
  const refused = useDriveAuthRefused(driveSlug);
  if (refused) return <DriveSignInPage />;
  return <NotFoundPage driveSlug={driveSlug} />;
}

/** A drive the switchboard refused as an auth error. Its discovery 404 looks
 * like a missing drive, so the route ends here; say what would open it
 * instead of "not found" (the drive-auth modal may be dismissed). */
function DriveSignInPage() {
  const user = useUser();
  const openLogin = useOpenRenownLogin();
  return (
    <div className="flex size-full items-center justify-center p-4">
      <DriveAuthGate
        mode={user ? "unauthorized" : "login"}
        onLogin={openLogin}
        onLogout={() => void logout()}
      />
    </div>
  );
}
