// Fails tsc -p hosts/connect/routes/tsconfig.json if project routes lose their types, e.g. to any.
// The generator skips "-" files and nothing imports this one.
import type { DriveRouteData } from "@powerhousedao/connect/router";
import { options } from "@powerhousedao/connect/routes/_app/d/$driveSlug/{-$nodeSlug}";
import { createFileRoute } from "@tanstack/react-router";
import { Route as HelloRoute } from "./hello.js";
import { Route as DriveReportRoute } from "./_app/reports/$driveSlug.js";
import { Route as ReportsRoute } from "./_app/reports.js";

// An override of Connect's node route, as a project file at its path writes it.
const DriveOverride = createFileRoute("/_app/d/$driveSlug/{-$nodeSlug}")({
  ...options,
  component: () => null,
});

export function useDriveOverrideTypeChecks() {
  const params = DriveOverride.useParams();
  const search = DriveOverride.useSearch();
  const data = DriveOverride.useLoaderData();
  return [params, search, data] as unknown as [
    Expect<Equal<typeof params, { driveSlug: string; nodeSlug?: string }>>,
    Expect<Equal<typeof search, { [key: string]: string | undefined }>>,
    Expect<Equal<typeof data, DriveRouteData>>,
  ];
}

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
