import { useLinkProps } from "@powerhousedao/reactor-browser";
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
  return <NotFoundPage driveSlug={driveSlug} />;
}
