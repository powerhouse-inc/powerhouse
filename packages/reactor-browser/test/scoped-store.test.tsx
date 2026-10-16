import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { PropsWithChildren } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook } from "vitest-browser-react";
import {
  bindPHStoreToWindow,
  createPHStore,
  createScopedPHStore,
  isScopedPHStore,
  PHStoreProvider,
  subscribePHStore,
} from "../src/hooks/ph-store.js";
import { useSelectedDriveId } from "../src/hooks/selected-drive.js";
import {
  setSelectedNode,
  useSetSelectedNode,
} from "../src/hooks/selected-node.js";
import { useSetSelectedDrive } from "../src/hooks/selected-drive.js";
import { useSelectedNodeId } from "../src/hooks/set-selected-node.js";
import type { PHNavigation } from "../src/types/global.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function drive(slug: string, nodes: { id: string; name: string }[] = []) {
  return {
    header: { id: `${slug}-id`, slug, name: slug },
    state: {
      global: {
        name: slug,
        nodes: nodes.map((node) => ({
          ...node,
          kind: "file",
          documentType: "test/doc",
          parentFolder: null,
        })),
      },
    },
  } as unknown as DocumentDriveDocument;
}

const DOC_ID = "11111111-2222-4333-8444-555555555555";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scoped PH stores", () => {
  it("own selection and navigation and read the rest through", () => {
    const parent = createPHStore({ selectedDriveId: "app", loading: true });
    const scope = createScopedPHStore(parent, { selectedDriveId: "mine" });
    expect(isScopedPHStore(scope)).toBe(true);
    expect(isScopedPHStore(parent)).toBe(false);
    expect(scope.selectedDriveId).toBe("mine");
    expect(scope.loading).toBe(true);
    expect(scope.navigation).toBeUndefined();

    const heard: string[] = [];
    subscribePHStore(scope, () => heard.push("scope:loading"), "loading");
    subscribePHStore(scope, () => heard.push("scope:node"), "selectedNodeId");
    subscribePHStore(parent, () => heard.push("app:node"), "selectedNodeId");

    // Shared keys write the parent; owned keys stay in the scope.
    scope.loading = false;
    expect(parent.loading).toBe(false);
    scope.selectedNodeId = "n1";
    expect(parent.selectedNodeId).toBeUndefined();
    parent.selectedNodeId = "n2";
    expect(scope.selectedNodeId).toBe("n1");
    expect(heard).toEqual(["scope:loading", "scope:node", "app:node"]);
  });

  it("select in the scope in context, apart from the app and other scopes", async () => {
    const app = createPHStore({
      drives: [drive("a", [{ id: DOC_ID, name: "One" }]), drive("b")],
    });
    bindPHStoreToWindow(app);
    const left = createScopedPHStore(app);
    const right = createScopedPHStore(app);
    const wrap = (store: typeof app) =>
      function Wrapper({ children }: PropsWithChildren) {
        return <PHStoreProvider store={store}>{children}</PHStoreProvider>;
      };
    const useScope = () => ({
      driveId: useSelectedDriveId(),
      nodeId: useSelectedNodeId(),
      selectDrive: useSetSelectedDrive(),
      selectNode: useSetSelectedNode(),
    });
    const l = await renderHook(useScope, { wrapper: wrap(left) });
    const r = await renderHook(useScope, { wrapper: wrap(right) });

    act(() => l.result.current.selectDrive("a"));
    act(() => l.result.current.selectNode(`one-${DOC_ID}`));
    act(() => r.result.current.selectDrive("b"));
    expect([l.result.current.driveId, l.result.current.nodeId]).toEqual([
      "a-id",
      DOC_ID,
    ]);
    expect([r.result.current.driveId, r.result.current.nodeId]).toEqual([
      "b-id",
      undefined,
    ]);
    expect(app.selectedDriveId).toBeUndefined();
    expect(app.selectedNodeId).toBeUndefined();
  });

  it("open through the scope's own navigation", async () => {
    const app = createPHStore({ drives: [drive("a")] });
    bindPHStoreToWindow(app);
    const open = vi.fn<PHNavigation["open"]>();
    const navigation: PHNavigation = {
      location: () => ({ pathname: "/d/a", search: "" }),
      open,
      setSearch: () => {},
      useSearchParams: () => ({}),
      useSetSearchParams: () => () => {},
    };
    const scope = createScopedPHStore(app, { navigation });
    const { result } = await renderHook(() => useSetSelectedNode(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <PHStoreProvider store={scope}>{children}</PHStoreProvider>
      ),
    });
    act(() => result.current("doc-1"));
    expect(open).toHaveBeenCalledWith(
      { driveSlug: "a", nodeSlug: "doc-1" },
      undefined,
    );
    expect(app.navigation).toBeUndefined();
  });

  it("warns once when a plain setter runs while a scope is mounted", async () => {
    const app = createPHStore({ drives: [] });
    bindPHStoreToWindow(app);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setSelectedNode(undefined);
    expect(warn).not.toHaveBeenCalled();

    const scope = createScopedPHStore(app);
    const screen = await render(
      <PHStoreProvider store={scope}>
        <p>scoped</p>
      </PHStoreProvider>,
    );
    setSelectedNode(undefined);
    setSelectedNode(undefined);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("useSetSelectedNode");

    await screen.unmount();
  });
});
