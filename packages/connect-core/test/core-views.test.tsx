// @vitest-environment happy-dom

import { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { IPackageManager, PHStore } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  closePHModal,
  createDriveArrivals,
  createPHStore,
  DocumentCache,
  PHStoreProvider,
  showDeleteNodeModal,
  showPHModal,
  useSelectedDocument,
  useSelectedDriveId,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FileNode,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelDocument,
  DocumentModelLib,
  EditorModule,
  EditorProps,
} from "@powerhousedao/shared/document-model";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createFileRoute,
  createMemoryHistory,
  createRoute,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { documentModelDocumentModelModule } from "document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import type { ReactNode } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { routeTree } from "../src/routeTree.gen.js";
import type {
  ConnectRoutes,
  ModalFrameProps,
  PackageRoute,
} from "../src/router/index.js";
import {
  bindConnectRouter,
  connectRoutes,
  createConnectRouter,
  disposeConnectAppRouter,
  ModalDialog,
  registerConnectRoutes,
  holdConnectRoutes,
  registerPackageRoutes,
} from "../src/router/index.js";
import { getConnectRegistry } from "../src/registry.js";
import { ConnectCoreApp } from "../src/router/core-app.js";
import { HISTORY_PAGE_SIZE } from "../src/views/document-history.js";
import { primeRuntimeConfig } from "../src/runtime/runtime-config.js";

let module: InProcessReactorClientModule;
let store: PHStore;
let unbind: (() => void) | undefined;
let unregister: (() => void) | undefined;

beforeAll(async () => {
  const db = new Kysely<Database>({
    dialect: new PGliteDialect(new PGlite()),
  });
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
        ])
        .withKysely(db),
    )
    .withSigner(new RenownCryptoSigner(crypto, "connect-core-test"))
    .buildModule();
  primeRuntimeConfig({ connect: {} } as never);
  store = createPHStore();
  bindPHStoreToWindow(store);
  addPHEventHandlers();
});

afterAll(() => {
  module.reactor.kill();
});

beforeEach(() => {
  store.reactorClient = module.client;
  store.fullReactorClient = undefined;
  store.documentCache = new DocumentCache(module.client);
  store.drives = [];
  store.selectedDriveId = undefined;
  store.selectedNodeId = undefined;
  setPackages([]);
});

afterEach(() => {
  cleanup();
  unbind?.();
  unbind = undefined;
  unregister?.();
  unregister = undefined;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

// The package manager as the views read it: the loaded packages' editors.
function setPackages(editors: EditorModule[]) {
  const packages = [{ editors }] as unknown as DocumentModelLib[];
  store.vetraPackageManager = {
    packages,
    subscribe: () => () => {},
  } as unknown as IPackageManager;
}

let driveCount = 0;
async function createDrive(name: string, preferredEditor?: string) {
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = `${name.toLowerCase()}-${++driveCount}`;
  drive.header.name = name;
  drive.state.global.name = name;
  const created = await module.client.create<DocumentDriveDocument>(drive);
  return withMeta(created, preferredEditor);
}

function withMeta(drive: DocumentDriveDocument, preferredEditor?: string) {
  if (!preferredEditor) return drive;
  return { ...drive, header: { ...drive.header, meta: { preferredEditor } } };
}

async function createFolder(drive: DocumentDriveDocument, name: string) {
  const id = crypto.randomUUID();
  const current = await module.client.execute<DocumentDriveDocument>(
    drive.header.id,
    "main",
    [driveDocumentModelModule.actions.addFolder({ id, name })],
  );
  const folder = current.state.global.nodes.find(
    (n): n is FolderNode => n.id === id,
  )!;
  return {
    drive: withMeta(current, drive.header.meta?.preferredEditor),
    folder,
  };
}

async function createFile(
  drive: DocumentDriveDocument,
  name: string,
  parentFolder?: string,
) {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.name = name;
  const created = await module.client.createDocumentInDrive(
    drive.header.id,
    document,
    parentFolder,
  );
  await module.client.execute(created.header.id, "main", [
    documentModelDocumentModelModule.actions.setModelName({ name }),
  ]);
  const current = await module.client.get<DocumentDriveDocument>(
    drive.header.id,
  );
  const node = current.state.global.nodes.find(
    (n): n is FileNode => n.id === created.header.id,
  )!;
  return { drive: withMeta(current, drive.header.meta?.preferredEditor), node };
}

function mount(path: string, routes?: (routes: ConnectRoutes) => AnyRoute[]) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const connectRouter = createConnectRouter({
    store,
    arrivals: createDriveArrivals(store),
    routeTree,
    history,
    routes,
  });
  unbind = bindConnectRouter(connectRouter, store);
  render(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
    </PHStoreProvider>,
  );
  return { ...connectRouter, history };
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

const table = (name: string) => screen.getByRole("table", { name });
const rows = (name: string) =>
  within(table(name))
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll("td")).map((td) => td.textContent),
    );

describe("core's home", () => {
  it("indexes the drives with links, types and dates", async () => {
    const plain = await createDrive("Alpha");
    const withApp = await createDrive("Beta", "test-drive-app");
    setPackages([driveApp()]);
    store.drives = [plain, withApp];
    mount("/");

    await vi.waitFor(() => expect(table("Drives")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Index of /",
    );
    const [alpha, beta] = rows("Drives");
    expect(alpha.slice(0, 2)).toEqual(["Alpha/", "Drive"]);
    expect(beta.slice(0, 2)).toEqual(["Beta/", "Test drive app"]);
    expect(alpha[2]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const link = screen.getByRole("link", { name: "Alpha/" });
    expect(link.getAttribute("href")).toBe(`/d/${plain.header.slug}`);
  });
});

function driveApp(): EditorModule {
  return {
    Component: ({ children }: { children?: ReactNode }) => (
      <div data-testid="drive-app">{children ?? "no document"}</div>
    ),
    documentTypes: ["powerhouse/document-drive"],
    config: { id: "test-drive-app", name: "Test drive app" },
  };
}

function documentEditor(): EditorModule {
  return {
    Component: ({ documentId }: { documentId?: string }) => (
      <p data-testid="editor">editing {documentId}</p>
    ),
    documentTypes: ["powerhouse/document-model"],
    config: { id: "test-editor", name: "Test editor" },
  };
}

describe("core's drive view", () => {
  it("opens the drive app its preferredEditor names", async () => {
    const drive = await createDrive("Apped", "test-drive-app");
    setPackages([driveApp()]);
    store.drives = [drive];
    mount(`/d/${drive.header.slug}`);
    await vi.waitFor(() =>
      expect(screen.getByTestId("drive-app").textContent).toBe("no document"),
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("gives the drive app its route's selection, not the app's", async () => {
    const drive = await createDrive("Scoped", "test-drive-app");
    setPackages([
      {
        ...driveApp(),
        Component: () => <p data-testid="drive-app">{useSelectedDriveId()}</p>,
      },
    ]);
    store.drives = [drive];
    mount(`/d/${drive.header.slug}`);
    const app = await screen.findByTestId("drive-app");
    await vi.waitFor(() => expect(app.textContent).toBe(drive.header.id));
    // Another drive selected app-wide, e.g. by a widget beside the route.
    act(() => {
      store.selectedDriveId = "elsewhere";
    });
    expect(screen.getByTestId("drive-app").textContent).toBe(drive.header.id);
  });

  it("gives the drive app its drive as props, and the open node to its hooks", async () => {
    const { drive, node } = await createFile(
      await createDrive("Propped", "test-drive-app"),
      "Spec",
    );
    function DriveApp({
      document,
      dispatch,
      children,
    }: EditorProps<DocumentDriveDocument>) {
      return (
        <div data-testid="drive-app">
          {document.header.id}/{typeof dispatch}/{useSelectedNode()?.id ?? "-"}
          {children}
        </div>
      );
    }
    setPackages([{ ...driveApp(), Component: DriveApp }, documentEditor()]);
    store.drives = [drive];
    mount(`/d/${drive.header.slug}/spec-${node.id}`);
    await vi.waitFor(() =>
      expect(screen.getByTestId("drive-app").textContent).toBe(
        `${drive.header.id}/function/${node.id}editing ${node.id}`,
      ),
    );
  });

  it("lists the drive when its preferredEditor names no installed app", async () => {
    const created = await createDrive("Listed", "missing-app");
    const { drive: withFolder } = await createFolder(created, "Inbox");
    const { drive } = await createFile(withFolder, "Notes");
    store.drives = [drive];
    mount(`/d/${drive.header.slug}`);

    await vi.waitFor(() => expect(table("Directory listing")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Index of /Listed/",
    );
    expect(rows("Directory listing").map((row) => row.slice(0, 2))).toEqual([
      ["Parent Directory", "-"],
      ["Inbox/", "Folder"],
      ["Notes", "powerhouse/document-model"],
    ]);
    await vi.waitFor(() =>
      expect(rows("Directory listing")[2][2]).toMatch(/^\d{4}-/),
    );
  });

  it("navigates folders through the listing", async () => {
    const created = await createDrive("Nested");
    const { drive: withFolder, folder } = await createFolder(created, "Inbox");
    const { drive } = await createFile(withFolder, "Inner", folder.id);
    store.drives = [drive];
    const { history } = mount(`/d/${drive.header.slug}`);

    await vi.waitFor(() => expect(table("Directory listing")).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Inner" })).toBeNull();
    click(screen.getByRole("link", { name: "Inbox/" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("link", { name: "Inner" })).toBeTruthy(),
    );
    expect(history.location.pathname).toBe(
      `/d/${drive.header.slug}/inbox-${folder.id}`,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Index of /Nested/Inbox/",
    );

    click(screen.getByRole("link", { name: "Parent Directory" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Index of /Nested/",
      ),
    );
    expect(history.location.pathname).toBe(`/d/${drive.header.slug}`);
    click(screen.getByRole("link", { name: "Parent Directory" }));
    await vi.waitFor(() => expect(history.location.pathname).toBe("/"));
    await vi.waitFor(() => expect(table("Drives")).toBeTruthy());
  });
});

describe("core's document view", () => {
  it("opens the registered editor for the document type", async () => {
    const { drive, node } = await createFile(
      await createDrive("Edited"),
      "Spec",
    );
    setPackages([documentEditor()]);
    store.drives = [drive];
    mount(`/d/${drive.header.slug}/spec-${node.id}`);
    await vi.waitFor(() =>
      expect(screen.getByTestId("editor").textContent).toBe(
        `editing ${node.id}`,
      ),
    );
  });

  it("gives the editor its document and dispatch as props, and its hooks the same document", async () => {
    const { drive, node } = await createFile(
      await createDrive("Propped"),
      "Spec",
    );
    function Inner() {
      const [document] = useSelectedDocument();
      return <p data-testid="inner">{document.header.id}</p>;
    }
    function Editor({
      document,
      dispatch,
    }: EditorProps<DocumentModelDocument>) {
      return (
        <>
          <p data-testid="editor">{document.state.global.name}</p>
          <Inner />
          <button
            type="button"
            onClick={() =>
              dispatch(
                documentModelDocumentModelModule.actions.setModelName({
                  name: "Renamed",
                }),
              )
            }
          >
            rename
          </button>
        </>
      );
    }
    setPackages([{ ...documentEditor(), Component: Editor }]);
    store.drives = [drive];
    mount(`/d/${drive.header.slug}/spec-${node.id}`);
    await vi.waitFor(() =>
      expect(screen.getByTestId("editor").textContent).toBe("Spec"),
    );
    expect(screen.getByTestId("inner").textContent).toBe(node.id);
    // Another node selected app-wide, e.g. by a widget beside the route.
    act(() => {
      store.selectedNodeId = "elsewhere";
    });
    expect(screen.getByTestId("inner").textContent).toBe(node.id);
    click(screen.getByRole("button", { name: "rename" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("editor").textContent).toBe("Renamed"),
    );
  });

  it("opens the document's editor when its preferred editor edits another type", async () => {
    const drive = await createDrive("Preferred");
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.name = "Spec";
    document.header.meta = { preferredEditor: "other-type-editor" };
    const created = await module.client.createDocumentInDrive(
      drive.header.id,
      document,
    );
    setPackages([
      {
        Component: () => <p data-testid="editor">wrong editor</p>,
        documentTypes: ["other/type"],
        config: { id: "other-type-editor", name: "Other type editor" },
      },
      documentEditor(),
    ]);
    store.drives = [
      await module.client.get<DocumentDriveDocument>(drive.header.id),
    ];
    mount(`/d/${drive.header.slug}/spec-${created.header.id}`);
    await vi.waitFor(() =>
      expect(screen.getByTestId("editor").textContent).toBe(
        `editing ${created.header.id}`,
      ),
    );
  });

  it("shows the state as a read-only JSON tree without an editor", async () => {
    const { drive, node } = await createFile(await createDrive("Raw"), "Model");
    store.drives = [drive];
    mount(`/d/${drive.header.slug}/model-${node.id}`);

    const state = await screen.findByLabelText("Document state");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Model");
    expect(screen.getByTestId("operation-count").textContent).toMatch(
      /global 1/,
    );
    const scopes = Array.from(
      state.querySelectorAll(":scope > details > summary"),
    ).map((summary) => summary.textContent);
    expect(scopes).toEqual([
      expect.stringMatching(/^global: /),
      expect.stringMatching(/^local: /),
    ]);
    expect(state.textContent).toContain('"Model"');
  });
});

describe("core's revision history", () => {
  it("lists a page of operations newest first, pages through ?history&historyPage, and closes", async () => {
    const { drive, node } = await createFile(
      await createDrive("Hist"),
      "Model",
    );
    // 1 setModelName from createFile, plus 59: two pages of 50.
    await module.client.execute(
      node.id,
      "main",
      Array.from({ length: 59 }, (_, i) =>
        documentModelDocumentModelModule.actions.setModelName({
          name: `v${i}`,
        }),
      ),
    );
    store.drives = [drive];
    const { history } = mount(
      `/d/${drive.header.slug}/model-${node.id}?history`,
    );
    const table = await screen.findByRole("table", {
      name: "global operations",
    });
    const indexes = () =>
      within(screen.getByRole("table", { name: "global operations" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => Number(row.querySelector("td")?.textContent));
    await vi.waitFor(() => expect(indexes()).toHaveLength(HISTORY_PAGE_SIZE));
    expect(indexes()[0]).toBe(59);
    expect(within(table).getAllByText("SET_MODEL_NAME").length).toBeGreaterThan(
      0,
    );

    click(screen.getByRole("button", { name: "Older" }));
    await vi.waitFor(() =>
      expect(history.location.search).toBe("?history&historyPage=2"),
    );
    await vi.waitFor(() =>
      expect(indexes()).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    );
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();

    act(() => history.back());
    await vi.waitFor(() => expect(indexes()[0]).toBe(59));

    click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(history.location.search).toBe(""));
    await screen.findByLabelText("Document state");
  });
});

const inventoryTab = (routes: ConnectRoutes) => [
  createRoute({
    getParentRoute: () => routes.settingsRoute,
    path: "inventory",
    staticData: { settings: { label: "Inventory", order: 35 } },
    component: () => <p data-testid="inventory">inventory settings</p>,
  }) as AnyRoute,
];

describe("core's settings", () => {
  it("lists core's tabs and a package's by order, opening the first", async () => {
    const { history } = mount("/settings", inventoryTab);
    const nav = await screen.findByRole("navigation", { name: "Settings" });
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe("/settings/appearance"),
    );
    expect(
      Array.from(nav.querySelectorAll("a")).map((a) => a.textContent),
    ).toEqual(["Appearance", "Inventory", "Packages"]);
    expect(screen.getByRole("radio", { name: "System" })).toHaveProperty(
      "checked",
      true,
    );

    click(within(nav).getByRole("link", { name: "Inventory" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("inventory").textContent).toBe(
        "inventory settings",
      ),
    );
    expect(document.title).toBe("Settings · Inventory · Connect");
  });

  it("lists the loaded packages' models, editors and drive apps", async () => {
    store.vetraPackageManager = {
      packages: [
        {
          manifest: { name: "@acme/todo" },
          documentModels: [
            documentModelDocumentModelModule,
            { ...documentModelDocumentModelModule, version: 2 },
          ],
          editors: [documentEditor(), driveApp()],
        },
      ],
      subscribe: () => () => {},
      getPackageVersion: () => "1.2.3",
      getPackageSource: () => "registry-install",
    } as unknown as IPackageManager;
    mount("/settings/packages");
    const entry = await screen.findByRole("listitem", { name: "@acme/todo" });
    expect(within(entry).getByText("1.2.3")).toBeTruthy();
    expect(within(entry).getByText("registry")).toBeTruthy();
    const models = within(entry).getByRole("table", {
      name: "@acme/todo document models",
    });
    expect(within(models).getByText("powerhouse/document-model")).toBeTruthy();
    expect(within(models).getByText("v1, v2")).toBeTruthy();
    const editors = within(entry).getByRole("table", {
      name: "@acme/todo editors",
    });
    expect(within(editors).getByText(documentEditor().config.id)).toBeTruthy();
    const apps = within(entry).getByRole("table", {
      name: "@acme/todo drive apps",
    });
    expect(within(apps).getByText(driveApp().config.id)).toBeTruthy();
  });
});

describe("ConnectCoreApp", () => {
  afterEach(() => {
    disposeConnectAppRouter();
    window.history.replaceState(null, "", "/");
  });

  it("serves core under a base path, with a tab a package registers", async () => {
    unregister = registerConnectRoutes(inventoryTab);
    window.history.replaceState(null, "", "/app/settings/inventory");
    render(
      <ConnectCoreApp store={store} routeTree={routeTree} basepath="/app" />,
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("inventory")).toBeTruthy(),
    );
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(
      within(nav)
        .getByRole("link", { name: "Appearance" })
        .getAttribute("href"),
    ).toBe("/app/settings/appearance");
  });

  it("adds a package's file routes below the routes with their parents' ids", async () => {
    // As a package's generated connect-routes module lists them.
    const fileRoute = (id: string, render: () => ReactNode) =>
      createFileRoute(id as never)({
        component: render,
      } as never) as unknown as AnyRoute;
    const routes: PackageRoute[] = [
      {
        route: fileRoute("/_app/reports", () => (
          <section data-testid="reports">
            <Outlet />
          </section>
        )),
        id: "/_app/reports",
        path: "/reports",
        parentId: "/_app",
      },
      {
        route: fileRoute("/_app/reports/$driveSlug", () => (
          <p data-testid="drive-report" />
        )),
        id: "/_app/reports/$driveSlug",
        path: "/$driveSlug",
        parentId: "/_app/reports",
      },
      {
        route: fileRoute("/hello", () => <p data-testid="hello" />),
        id: "/hello",
        path: "/hello",
        parentId: "__root__",
      },
      {
        // Core's home: a package can't replace it in another Connect.
        route: fileRoute("/_app/", () => <p data-testid="their-home" />),
        id: "/_app/",
        path: "/",
        parentId: "/_app",
      },
    ];
    unregister = registerPackageRoutes(routes);
    window.history.replaceState(null, "", "/reports/acme");
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    const reports = await screen.findByTestId("reports");
    expect(within(reports).getByTestId("drive-report")).toBeTruthy();

    const { router } = getConnectRegistry().app!.bundle;
    await act(() => router.navigate({ to: "/hello" as never }));
    expect(await screen.findByTestId("hello")).toBeTruthy();
    await act(() => router.navigate({ to: "/" as never }));
    await screen.findByRole("table", { name: "Drives" });
    expect(screen.queryByTestId("their-home")).toBeNull();

    // Uninstalled from one of its pages: the app goes home, and its routes go.
    await act(() => router.navigate({ to: "/reports/acme" as never }));
    await screen.findByTestId("drive-report");
    act(() => unregister?.());
    unregister = undefined;
    await screen.findByRole("table", { name: "Drives" });
    expect(screen.queryByTestId("reports")).toBeNull();
    await act(() => router.navigate({ to: "/reports/acme" as never }));
    await vi.waitFor(() => expect(screen.queryByTestId("reports")).toBeNull());
  });

  it("waits for routes still loading before showing not found", async () => {
    const release = holdConnectRoutes();
    window.history.replaceState(null, "", "/reports");
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText("Page not found")).toBeNull();

    const reports = createFileRoute("/_app/reports" as never)({
      component: () => <p data-testid="reports" />,
    } as never) as unknown as AnyRoute;
    act(() => {
      unregister = registerPackageRoutes([
        {
          route: reports,
          id: "/_app/reports",
          path: "/reports",
          parentId: "/_app",
        },
      ]);
      release();
    });
    expect(await screen.findByTestId("reports")).toBeTruthy();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("shows not found once nothing is loading", async () => {
    const release = holdConnectRoutes();
    window.history.replaceState(null, "", "/nowhere");
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    act(() => release());
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });

  it("links a package's nav route once a running app takes it in", async () => {
    window.history.replaceState(null, "", "/");
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    await screen.findByRole("table", { name: "Drives" });
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();

    const reports = createFileRoute("/_app/reports" as never)({
      staticData: { nav: { label: "Reports" } },
      component: () => <p data-testid="reports" />,
    } as never) as unknown as AnyRoute;
    act(() => {
      unregister = registerPackageRoutes([
        {
          route: reports,
          id: "/_app/reports",
          path: "/reports",
          parentId: "/_app",
        },
      ]);
    });
    expect(await screen.findByRole("link", { name: "Reports" })).toBeTruthy();

    act(() => unregister?.());
    unregister = undefined;
    await vi.waitFor(() =>
      expect(screen.queryByRole("link", { name: "Reports" })).toBeNull(),
    );
  });

  it("shows core's modals, opened by a link", async () => {
    store.vetraPackageManager = {
      packages: [
        { documentModels: [documentModelDocumentModelModule], editors: [] },
      ],
      subscribe: () => () => {},
    } as unknown as IPackageManager;
    window.history.replaceState(
      null,
      "",
      "/?modal=create-document&type=powerhouse/document-model",
    );
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(store.modal?.type).toBe("createDocument");
  });

  it("takes in a tab a second copy of core registers once the router runs", async () => {
    window.history.replaceState(null, "", "/settings");
    render(<ConnectCoreApp store={store} routeTree={routeTree} />);
    const nav = await screen.findByRole("navigation", { name: "Settings" });
    expect(within(nav).queryByRole("link", { name: "Billing" })).toBeNull();

    vi.resetModules();
    const copy = await import("../src/router/index.js");
    unregister = copy.registerConnectRoutes(({ settingsRoute }) => [
      createRoute({
        getParentRoute: () => settingsRoute,
        path: "billing",
        staticData: { settings: { label: "Billing", order: 60 } },
        component: () => <p data-testid="billing" />,
      }) as AnyRoute,
    ]);
    const { router } = getConnectRegistry().app!.bundle;
    await act(() => router.navigate({ to: "/settings/billing" as never }));
    await vi.waitFor(() => expect(screen.getByTestId("billing")).toBeTruthy());

    // Removed from its own tab: once the app has left it.
    act(() => unregister?.());
    unregister = undefined;
    const { settingsRoute } = connectRoutes(routeTree);
    await vi.waitFor(() => {
      const tabs = settingsRoute.children as unknown as AnyRoute[];
      expect(tabs.map((tab) => tab.path as string)).not.toContain("billing");
    });
  });
});

describe("core's theme", () => {
  it("toggles light and dark from the header, and stores the choice", async () => {
    mount("/");
    const toggle = await screen.findByRole("button", {
      name: "Switch to dark theme",
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    click(toggle);
    await vi.waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    expect(localStorage.getItem("ph:theme")).toBe("dark");
    click(screen.getByRole("button", { name: "Switch to light theme" }));
    await vi.waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(false),
    );
  });

  it("follows the Appearance tab's choice", async () => {
    mount("/settings/appearance");
    click(await screen.findByRole("radio", { name: "Dark" }));
    await vi.waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    click(screen.getByRole("radio", { name: "System" }));
    await vi.waitFor(() =>
      expect(localStorage.getItem("ph:theme")).toBe("system"),
    );
  });
});

describe("core's modals", () => {
  beforeEach(() => {
    store.vetraPackageManager = {
      packages: [
        { documentModels: [documentModelDocumentModelModule], editors: [] },
      ],
      subscribe: () => () => {},
    } as unknown as IPackageManager;
  });

  it("opens a routed modal in the URL without a history entry", async () => {
    const { history } = mount("/");
    await screen.findByRole("table", { name: "Drives" });
    const entries = history.length;
    act(() =>
      showPHModal({
        type: "createDocument",
        documentType: "powerhouse/document-model",
      }),
    );
    await vi.waitFor(() =>
      expect(history.location.search).toContain("modal=create-document"),
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(store.modal?.type).toBe("createDocument");
    expect(history.length).toBe(entries);

    await act(() => Promise.resolve(closePHModal()));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(history.location.search).toBe("");
    expect(history.length).toBe(entries);
    expect(store.modal).toBeUndefined();
  });

  // Outside a drive the modal names one; it never closes without creating.
  it("creates outside a drive in the drive picked, or the modal's driveId", async () => {
    store.fullReactorClient = module.client;
    const alpha = await createDrive("Alpha");
    const beta = await createDrive("Beta");
    store.drives = [alpha, beta];
    const { history } = mount(
      "/?modal=create-document&documentType=powerhouse/document-model",
    );
    const dialog = await screen.findByRole("dialog");
    const create = within(dialog).getByRole("button", { name: "Create" });
    expect((create as HTMLButtonElement).disabled).toBe(true);

    const picker = within(dialog).getByRole("combobox", { name: "Drive" });
    act(() => {
      (picker as HTMLSelectElement).value = beta.header.id;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((create as HTMLButtonElement).disabled).toBe(false);
    click(create);
    await vi.waitFor(async () => {
      const current = await module.client.get<DocumentDriveDocument>(
        beta.header.id,
      );
      expect(current.state.global.nodes).toHaveLength(1);
    });
    // The new document opens in its drive, though the modal opened on home.
    await vi.waitFor(() =>
      expect(history.location.pathname).toMatch(
        new RegExp(`^/d/${beta.header.slug}/.+`),
      ),
    );

    cleanup();
    const { history: givenHistory } = mount(
      `/?modal=create-document&documentType=powerhouse/document-model&driveId=${alpha.header.id}`,
    );
    const given = await screen.findByRole("dialog");
    expect(within(given).queryByRole("combobox")).toBeNull();
    click(within(given).getByRole("button", { name: "Create" }));
    await vi.waitFor(async () => {
      const current = await module.client.get<DocumentDriveDocument>(
        alpha.header.id,
      );
      expect(current.state.global.nodes).toHaveLength(1);
    });
    // Its navigation follows the create; left pending, it lands in the next test.
    await vi.waitFor(() =>
      expect(givenHistory.location.pathname).toMatch(
        new RegExp(`^/d/${alpha.header.slug}/.+`),
      ),
    );
  });

  it("asks for a drive when there is none", async () => {
    mount("/?modal=create-document&documentType=powerhouse/document-model");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/no drive to create it in/)).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Create",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click(within(dialog).getByRole("button", { name: "Add a drive" }));
    await vi.waitFor(() => expect(store.modal?.type).toBe("addDrive"));
  });

  it("opens from a link, and closes in place", async () => {
    const { history } = mount("/?modal=login");
    expect(await screen.findByRole("dialog", { name: "Log in" })).toBeTruthy();
    const entries = history.length;
    await act(() => Promise.resolve(closePHModal()));
    await vi.waitFor(() => expect(history.location.search).toBe(""));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(history.length).toBe(entries);
  });

  it("keeps a confirmation out of the URL", async () => {
    const { drive, node } = await createFile(await createDrive("Docs"), "Plan");
    store.drives = [drive];
    const { history } = mount(`/d/${drive.header.slug}`);
    await screen.findByRole("table", { name: "Directory listing" });
    await act(() => Promise.resolve(showDeleteNodeModal(node)));
    expect(
      await screen.findByRole("dialog", { name: "Delete Plan?" }),
    ).toBeTruthy();
    expect(history.location.search).toBe("");
    act(() => closePHModal());
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes a confirmation opened over a routed modal with it", async () => {
    const { router, history } = mount("/?modal=login");
    await vi.waitFor(() => expect(store.modal?.type).toBe("login"));
    act(() => showPHModal({ type: "deleteDrive", driveId: "d1" }));
    expect(store.modal?.type).toBe("deleteDrive");

    // A navigation that resolves meanwhile leaves the confirmation open.
    await act(() => router.invalidate());
    expect(store.modal?.type).toBe("deleteDrive");

    await act(() => Promise.resolve(closePHModal()));
    await vi.waitFor(() => expect(history.location.search).toBe(""));
    expect(store.modal).toBeUndefined();
  });

  it("shows a route's own view of a modal while the route matches", async () => {
    const { appRoute } = connectRoutes(routeTree);
    const staticData = appRoute.options.staticData;
    appRoute.update({
      staticData: {
        ...staticData,
        modals: { login: () => <p data-testid="my-login">mine</p> },
      },
    } as never);
    try {
      mount("/?modal=login");
      expect(await screen.findByTestId("my-login")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      appRoute.update({ staticData } as never);
    }
  });

  it("frames every core modal in the routes' modal frame", async () => {
    const { appRoute } = connectRoutes(routeTree);
    const staticData = appRoute.options.staticData;
    appRoute.update({
      staticData: {
        ...staticData,
        modalFrame: ({
          title,
          titleId,
          actions,
          children,
        }: ModalFrameProps) => (
          <ModalDialog labelledBy={titleId}>
            <h2 id={titleId} data-testid="frame-title">
              {title}
            </h2>
            {children}
            <footer data-testid="frame-actions">{actions}</footer>
          </ModalDialog>
        ),
      },
    } as never);
    try {
      mount("/?modal=create-document&type=powerhouse/document-model");
      const dialog = await screen.findByRole("dialog");
      const title = within(dialog).getByTestId("frame-title");
      expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
      expect(title.textContent).toMatch(/^New /);
      const actions = within(dialog).getByTestId("frame-actions");
      expect(
        within(actions).getByRole("button", { name: "Create" }),
      ).toBeTruthy();
    } finally {
      appRoute.update({ staticData } as never);
    }
  });
});
