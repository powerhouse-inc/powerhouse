import { createFileRoute, Link, notFound } from "@tanstack/react-router";

// A nested project route with a path param; it links back into Connect's drive.
export const Route = createFileRoute("/_app/reports/$driveSlug")({
  loader: ({ context, params }) => {
    const drive = context.store.drives?.find(
      (d) => d.header.slug === params.driveSlug,
    );
    if (!drive) throw notFound();
    const byType = new Map<string, number>();
    for (const node of drive.state.global.nodes) {
      const type = "documentType" in node ? node.documentType : "folder";
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }
    return { name: drive.state.global.name, byType: [...byType] };
  },
  notFoundComponent: () => <p className="p-6">No such drive.</p>,
  component: DriveReport,
});

function DriveReport() {
  const { name, byType } = Route.useLoaderData() as {
    name: string;
    byType: [string, number][];
  };
  const { driveSlug } = Route.useParams();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{name}</h2>
      <table data-testid="drive-report" className="text-sm">
        <tbody>
          {byType.map(([type, count]) => (
            <tr key={type}>
              <td className="pr-4">{type}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link
        to="/d/$driveSlug/{-$nodeSlug}"
        params={{ driveSlug }}
        className="text-blue-600 underline"
      >
        Open in Connect
      </Link>
    </div>
  );
}
