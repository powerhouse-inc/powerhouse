import type { IAuthorizationService } from "@powerhousedao/reactor-api";
import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import { hostname } from "node:os";
import { describe, expect, it } from "vitest";
import { getResolvers } from "../../src/workflow/resolvers.js";

type Resolver = (...args: unknown[]) => unknown;

describe("the runtime's host", () => {
  it("is the switchboard on this machine, the id apps record as runner", () => {
    const resolvers = getResolvers(
      {} as WorkflowRuntimeService,
      {} as IAuthorizationService,
    ) as Record<string, Record<string, Resolver>>;
    expect(resolvers.WorkflowRuntimeQueries.host()).toEqual({
      id: `switchboard@${hostname()}`,
      label: hostname(),
    });
  });
});
