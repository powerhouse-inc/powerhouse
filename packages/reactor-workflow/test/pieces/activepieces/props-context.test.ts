import {
  buildPropertyContext,
  parseDynamicResolverId,
} from "../../../src/pieces/activepieces/context/props.js";
import { UnsupportedContextMemberError } from "../../../src/pieces/activepieces/context/stubs.js";

describe("buildPropertyContext", () => {
  it("exposes searchValue, project identity, and injected providers", async () => {
    const { context } = buildPropertyContext({
      searchValue: "cal",
      projectId: "p1",
      flows: { list: () => Promise.resolve({ data: [] }) },
      connections: { get: () => Promise.resolve("secret") },
    });
    expect(context.searchValue).toBe("cal");
    expect(context.project.id).toBe("p1");
    expect(await context.project.externalId()).toBe("p1");
    expect(await context.flows.list()).toEqual({ data: [] });
    expect(await context.connections.get("k")).toBe("secret");
  });

  it("throws with full member paths for uninjected capabilities", () => {
    const { context } = buildPropertyContext();
    expect(() => context.server.apiUrl).toThrowError(
      UnsupportedContextMemberError,
    );
    expect(() => context.flows.list()).toThrowError(
      UnsupportedContextMemberError,
    );
    try {
      void context.connections.get("k");
      expect.unreachable();
    } catch (error) {
      expect((error as UnsupportedContextMemberError).member).toBe(
        "connections.get",
      );
    }
  });

  it("tracks touched members", () => {
    const { context, touched } = buildPropertyContext({ searchValue: "x" });
    void context.searchValue;
    void context.project;
    expect([...touched].sort()).toEqual(["project", "searchValue"]);
  });
});

describe("parseDynamicResolverId", () => {
  it("parses the descriptor id scheme", () => {
    expect(
      parseDynamicResolverId(
        "activepieces:@activepieces/piece-subflows#callFlow.flowId",
      ),
    ).toEqual({
      packageName: "@activepieces/piece-subflows",
      actionName: "callFlow",
      propName: "flowId",
    });
    expect(
      parseDynamicResolverId(
        "activepieces:@activepieces/piece-tables#tables-get-record.table_id",
      ),
    ).toEqual({
      packageName: "@activepieces/piece-tables",
      actionName: "tables-get-record",
      propName: "table_id",
    });
  });

  it("rejects malformed ids", () => {
    expect(() => parseDynamicResolverId("not-an-id")).toThrow(
      /Invalid dynamic resolver id/,
    );
  });
});
