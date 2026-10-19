import { createFileRoute, Link } from "@tanstack/react-router";

// Outside _app/: a full page without Connect's sidebar. Its loader reads the PH store.
export const Route = createFileRoute("/hello")({
  loader: ({ context }) => ({ driveCount: context.store.drives?.length ?? 0 }),
  component: Hello,
});

function Hello() {
  const { driveCount } = Route.useLoaderData();
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-lg font-semibold">Hello from a project route</h1>
      <p data-testid="hello-drive-count">Drives: {driveCount}</p>
      <Link to="/" className="text-blue-600 underline">
        Home
      </Link>
    </div>
  );
}
