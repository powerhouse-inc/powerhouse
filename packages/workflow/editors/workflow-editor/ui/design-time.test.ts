import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { getResolvedDynamicProps } from "./design-time.js";
import type { BlockFormProp } from "./forms.js";
import { runtimeKeys, type ResolverKeyInput } from "./query-keys.js";

const SCOPE = "http://a/graphql/workflow-runtime";
const INPUT: ResolverKeyInput = {
  block: {
    pieceName: "@activepieces/piece-sheets",
    pieceVersion: "1.0.0",
    kind: "action",
    name: "insert_row",
  },
  propName: "values",
  refreshers: ["sheet-1"],
  connectionId: "c1",
};
const FIELDS: BlockFormProp[] = [
  { name: "A", displayName: "Column A", type: "SHORT_TEXT", required: true },
];

describe("getResolvedDynamicProps", () => {
  it("reads the fields a DYNAMIC prop resolved to", async () => {
    const queryClient = new QueryClient();
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.dynamic(SCOPE, INPUT),
      queryFn: () => FIELDS,
    });

    expect(getResolvedDynamicProps(queryClient, SCOPE, INPUT)).toEqual(FIELDS);
  });

  it("is undefined until that exact key has resolved", async () => {
    const queryClient = new QueryClient();
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.dynamic(SCOPE, INPUT),
      queryFn: () => FIELDS,
    });
    // Same prop, but the options answer or another refresher value.
    await queryClient.fetchQuery({
      queryKey: runtimeKeys.options(SCOPE, INPUT),
      queryFn: () => ({ options: [] }),
    });

    expect(
      getResolvedDynamicProps(queryClient, SCOPE, {
        ...INPUT,
        refreshers: ["sheet-2"],
      }),
    ).toBeUndefined();
    expect(
      getResolvedDynamicProps(queryClient, "http://b/rt", INPUT),
    ).toBeUndefined();
    expect(
      getResolvedDynamicProps(queryClient, SCOPE, {
        ...INPUT,
        connectionId: null,
      }),
    ).toBeUndefined();
  });
});
