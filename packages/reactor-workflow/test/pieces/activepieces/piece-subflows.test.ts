// Spike S6b as a test: the design-time options channel, via the real adapter
// modules and published bundle. Fetched at runtime (CDN→npm, cached); skipped offline.
import { buildDescriptor } from "../../src/activepieces/descriptor.js";
import { loadPieceFromDir } from "../../src/activepieces/loader.js";
import { getActions, getTriggers } from "../../src/activepieces/types.js";
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

type Resolver = (...args: unknown[]) => unknown;

function asResolver(fn: unknown): Resolver {
  expect(typeof fn).toBe("function");
  return fn as Resolver;
}

// Minimal PropertyContext (spike S6b finding: `flows` is required, and list()
// must honor an `externalIds` filter param).
function propertyContext(flows: FlowFixture[]) {
  const listCalls: unknown[] = [];
  return {
    listCalls,
    searchValue: undefined,
    connections: { get: () => Promise.resolve(null) },
    flows: {
      list: (params?: { externalIds?: string[] }) => {
        listCalls.push(params);
        const data = params?.externalIds
          ? flows.filter((f) => params.externalIds?.includes(f.externalId))
          : flows;
        return Promise.resolve({ data });
      },
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

  it("resolves flowId.options() out-of-band, filtering to callable flows", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const flowId = getActions(piece).callFlow.props?.flowId;
    const ctx = propertyContext([
      flowFixture("ext-1", "Callable Flow", "@activepieces/piece-subflows"),
      flowFixture("ext-2", "Webhook Flow", "@activepieces/piece-webhook"),
    ]);

    const out = (await asResolver(flowId?.options)({}, ctx)) as {
      options: { value: string; label: string }[];
    };
    expect(out.options).toEqual([{ value: "ext-1", label: "Callable Flow" }]);
  });

  it("returns a well-formed empty state when no flows match", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const flowId = getActions(piece).callFlow.props?.flowId;
    const out = (await asResolver(flowId?.options)(
      {},
      propertyContext([]),
    )) as { options: unknown[] };
    expect(out.options).toEqual([]);
  });

  it("resolves flowProps.props() via a flows.list externalIds lookup", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const flowProps = getActions(piece).callFlow.props?.flowProps;
    const ctx = propertyContext([
      flowFixture("ext-1", "Callable Flow", "@activepieces/piece-subflows"),
    ]);

    const out = (await asResolver(flowProps?.props)(
      { flowId: "ext-1", mode: "simple" },
      ctx,
    )) as Record<string, { type?: string; required?: boolean }>;
    expect(out.payload).toMatchObject({ type: "OBJECT", required: true });
    expect(ctx.listCalls).toContainEqual({ externalIds: ["ext-1"] });
  });
});
