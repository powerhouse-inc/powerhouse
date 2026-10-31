import { describe, expect, it } from "vitest";
import { coreSubgraphClasses } from "../src/config.js";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";

const base = {
  inspection: false,
  inspectionAdmin: false,
  documentPermissions: false,
};

describe("coreSubgraphClasses", () => {
  it("registers the system subgraph unless told not to", () => {
    expect(coreSubgraphClasses(base)).toEqual([
      AnalyticsSubgraph,
      SystemSubgraph,
      ReactorSubgraph,
    ]);
    expect(coreSubgraphClasses({ ...base, systemInfo: true })).toContain(
      SystemSubgraph,
    );
  });

  it("leaves the system subgraph out under systemInfo: false, keeping the rest", () => {
    expect(coreSubgraphClasses({ ...base, systemInfo: false })).toEqual([
      AnalyticsSubgraph,
      ReactorSubgraph,
    ]);
  });
});
