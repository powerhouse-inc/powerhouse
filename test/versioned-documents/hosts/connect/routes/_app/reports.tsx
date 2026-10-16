import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

type Sort = "name" | "count";

// In _app/, so it renders in Connect's layout and links itself in the sidebar.
// A project layout route with a validated search param and a nested child.
export const Route = createFileRoute("/_app/reports")({
  staticData: { nav: { label: "Reports", order: 10 } },
  validateSearch: (search: Record<string, unknown>): { sort: Sort } => ({
    sort: search.sort === "count" ? "count" : "name",
  }),
  loaderDeps: ({ search }) => ({ sort: search.sort }),
  loader: ({ context, deps }) => {
    const drives = (context.store.drives ?? []).map((drive) => ({
      slug: drive.header.slug,
      name: drive.header.name,
      count: drive.state.global.nodes.length,
    }));
    drives.sort((a, b) =>
      deps.sort === "count" ? b.count - a.count : a.name.localeCompare(b.name),
    );
    return { drives };
  },
  // A project route titles the page through its head, like Connect's routes.
  head: ({ match }) => ({
    meta: [{ title: `Reports · ${match.context.appName ?? "Connect"}` }],
  }),
  component: Reports,
});

function Reports() {
  const { drives } = Route.useLoaderData();
  const { sort } = Route.useSearch();
  return (
    <div className="flex gap-6 p-6">
      <div className="flex w-64 flex-col gap-2">
        <h1 className="text-lg font-semibold">Reports</h1>
        <div className="flex gap-2 text-sm">
          Sort:
          <Link
            to="/reports"
            search={{ sort: "name" }}
            activeOptions={{ includeSearch: true }}
            activeProps={{ className: "font-semibold" }}
          >
            name
          </Link>
          <Link
            to="/reports"
            search={{ sort: "count" }}
            activeOptions={{ includeSearch: true }}
            activeProps={{ className: "font-semibold" }}
          >
            count
          </Link>
        </div>
        <ul data-testid="reports-drives" className="flex flex-col gap-1">
          {drives.map((drive) => (
            <li key={drive.slug}>
              <Link
                to="/reports/$driveSlug"
                params={{ driveSlug: drive.slug }}
                search={{ sort }}
                className="aria-[current=page]:font-semibold"
              >
                {drive.name} ({drive.count})
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/" className="text-blue-600 underline">
          Home
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
