// Spike S6b as a test: the design-time options channel, via the real adapter
// modules and published bundle. Fetched at runtime (CDN→npm, cached); skipped offline.
import { buildDescriptor } from "../../src/activepieces/descriptor.js";
import {
  buildPropertyContext,
  NotDynamicPropertyError,
  resolveByResolverId,
  resolveDynamicProperty,
} from "../../src/activepieces/context/props.js";
import { UnsupportedContextMemberError } from "../../src/activepieces/context/stubs.js";
import { loadPieceFromDir } from "../../src/activepieces/loader.js";
import { getTriggers } from "../../src/activepieces/types.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const bundleDir = await fetchBundleForTest(
  "@activepieces/piece-subflows",
  "0.6.4",
);

interface FlowFixture {
  id: string;
  externalId: string;
  status: string;
  version: {
    displayName: string;
    trigger: {
      type: string;
      settings: { pieceName: string; input: { exampleData: unknown } };
    };
  };
}

function flowFixture(
  externalId: string,
  displayName: string,
  pieceName: string,
): FlowFixture {
  return {
    id: `id-${externalId}`,
    externalId,
    status: "ENABLED",
    version: {
      displayName,
      trigger: {
        type: "PIECE_TRIGGER",
        settings: { pieceName, input: { exampleData: {} } },
      },
    },
  };
}

// FlowsProvider over fixtures (spike S6b: list() must honor externalIds).
function flowsProvider(flows: FlowFixture[]) {
  const listCalls: unknown[] = [];
  return {
    listCalls,
    list: (params?: { externalIds?: string[] }) => {
      listCalls.push(params);
      const data = params?.externalIds
        ? flows.filter((f) => params.externalIds?.includes(f.externalId))
        : flows;
      return Promise.resolve({ data });
    },
  };
}

describe.skipIf(!bundleDir)("piece-subflows (spike S6b)", () => {
  it("loads and exposes the callableFlow trigger", async () => {
    const loaded = await loadPieceFromDir(bundleDir);
    expect(loaded.check).toBe("constructor-name");
    expect(loaded.piece.displayName).toBe("Sub Flows");
    expect(Object.keys(getTriggers(loaded.piece))).toEqual(["callableFlow"]);
  });

  it("marks the dynamic dropdowns in the descriptor", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const descriptor = buildDescriptor(piece, {
      packageName: "@activepieces/piece-subflows",
      version: "0.6.4",
    });
    const props = Object.fromEntries(
      (descriptor.actions.find((a) => a.name === "callFlow")?.props ?? []).map(
        (p) => [p.name, p],
      ),
    );
    expect(props.flowId).toMatchObject({
      type: "DROPDOWN",
      required: true,
      hasDynamicResolver: true,
      dynamicResolverId:
        "activepieces:@activepieces/piece-subflows#callFlow.flowId",
    });
    expect(props.mode.staticOptions?.map((o) => o.value)).toEqual([
      "simple",
      "advanced",
    ]);
    expect(props.flowProps).toMatchObject({
      type: "DYNAMIC",
      hasDynamicResolver: true,
    });
  });

  it("resolves flowId.options() by resolver id, filtering to callable flows", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const { context, touched } = buildPropertyContext({
      flows: flowsProvider([
        flowFixture("ext-1", "Callable Flow", "@activepieces/piece-subflows"),
        flowFixture("ext-2", "Webhook Flow", "@activepieces/piece-webhook"),
      ]),
    });

    const out = (await resolveByResolverId(
      piece,
      "activepieces:@activepieces/piece-subflows#callFlow.flowId",
      {},
      context,
    )) as { options: { value: string; label: string }[] };
    expect(out.options).toEqual([{ value: "ext-1", label: "Callable Flow" }]);
    expect([...touched]).toEqual(["flows"]);
  });

  it("returns a well-formed empty state when no flows match", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const { context } = buildPropertyContext({ flows: flowsProvider([]) });
    const out = (await resolveDynamicProperty({
      piece,
      actionName: "callFlow",
      propName: "flowId",
      context,
    })) as { options: unknown[] };
    expect(out.options).toEqual([]);
  });

  it("resolves flowProps.props() via a flows.list externalIds lookup", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const flows = flowsProvider([
      flowFixture("ext-1", "Callable Flow", "@activepieces/piece-subflows"),
    ]);
    const { context } = buildPropertyContext({ flows });

    const out = (await resolveDynamicProperty({
      piece,
      actionName: "callFlow",
      propName: "flowProps",
      refresherValues: { flowId: "ext-1", mode: "simple" },
      context,
    })) as Record<string, { type?: string; required?: boolean }>;
    expect(out.payload).toMatchObject({ type: "OBJECT", required: true });
    expect(flows.listCalls).toContainEqual({ externalIds: ["ext-1"] });
  });

  it("fails loudly when the resolver needs an uninjected capability", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const { context } = buildPropertyContext();
    const error: unknown = await resolveDynamicProperty({
      piece,
      actionName: "callFlow",
      propName: "flowId",
      context,
    }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UnsupportedContextMemberError);
    expect((error as UnsupportedContextMemberError).member).toBe("flows.list");
  });

  it("rejects a non-dynamic prop", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const { context } = buildPropertyContext();
    await expect(
      resolveDynamicProperty({
        piece,
        actionName: "callFlow",
        propName: "mode",
        context,
      }),
    ).rejects.toBeInstanceOf(NotDynamicPropertyError);
  });
});
