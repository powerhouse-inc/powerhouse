// Fails tsc -p hosts/connect/routes/tsconfig.json if project routes lose their types, e.g. to any.
// The generator skips "-" files and nothing imports this one.
import { Route as HelloRoute } from "./hello.js";
import { Route as DriveReportRoute } from "./_app/reports/$driveSlug.js";
import { Route as ReportsRoute } from "./_app/reports.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

export function useRouteTypeChecks() {
  const hello = HelloRoute.useLoaderData();
  const reports = ReportsRoute.useLoaderData();
  const search = ReportsRoute.useSearch();
  const params = DriveReportRoute.useParams();
  const report = DriveReportRoute.useLoaderData();
  const context = ReportsRoute.useRouteContext();
  return [hello, reports, search, params, report, context] as unknown as [
    Expect<Equal<typeof hello, { driveCount: number }>>,
    Expect<
      Equal<
        (typeof reports)["drives"][number],
        { slug: string; name: string; count: number }
      >
    >,
    // Connect's root route passes every param through, as strings.
    Expect<
      Equal<
        typeof search,
        { [key: string]: string | undefined; sort: "name" | "count" }
      >
    >,
    Expect<Equal<typeof params, { driveSlug: string }>>,
    Expect<Equal<(typeof report)["byType"], [string, number][]>>,
    Expect<Equal<Equal<(typeof context)["store"], any>, false>>,
  ];
}
