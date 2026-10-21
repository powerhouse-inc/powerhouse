import {
  logout,
  showPHModal,
  useDriveAuthRefused,
  useLinkProps,
  useUser,
} from "@powerhousedao/reactor-browser";
import { useRouterState } from "@tanstack/react-router";

/** The 404 page: what was asked for, and a way home. */
export function NotFoundPage({ driveSlug }: { driveSlug?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const home = useLinkProps(undefined);
  return (
    <div
      role="alert"
      className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-core-fg">
        {driveSlug ? `Drive ${driveSlug} not found` : "Page not found"}
      </h1>
      <p className="text-core-muted">
        Nothing is at{" "}
        <code data-testid="not-found-path" className="text-core-fg">
          {pathname}
        </code>
        .
      </p>
      <a {...home} className="text-core-fg underline">
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
 * instead of "not found" (the drive-auth modal may be dismissed). Logging in
 * goes through the shell's "login" modal, as core's drive-auth modal does. */
function DriveSignInPage() {
  const user = useUser();
  return (
    <div
      role="alert"
      className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-core-fg">
        {user ? "No access to this drive" : "Log in to access this drive"}
      </h1>
      <p className="text-core-muted">
        {user
          ? "The account you're signed in with can't open this drive."
          : "This drive is only open to signed-in users."}
      </p>
      {user ? (
        <button
          type="button"
          className="text-core-fg underline"
          onClick={() => void logout()}
        >
          Log out
        </button>
      ) : (
        <button
          type="button"
          className="text-core-fg underline"
          onClick={() => showPHModal({ type: "login" })}
        >
          Log in
        </button>
      )}
    </div>
  );
}
