// @vitest-environment happy-dom

import { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  InProcessReactorClientModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { PHStore, SetSearchParams } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  login,
  createDriveArrivals,
  createPHStore,
  createScopedPHStore,
  DocumentCache,
  getPHNavigation,
  getTargetHref,
  PHStoreProvider,
  setSelectedDrive,
  hideRevisionHistory,
  setRevisionHistoryPage,
  showRevisionHistory,
  useRevisionHistoryPage,
  useRevisionHistoryVisible,
  setSelectedNode,
  trackDriveArrival,
  untilDriveListed,
  useDocumentById,
  useLinkProps,
  useOpenNode,
  useSearchParams,
  useSelectedDriveId,
  useSelectedNode,
  useSetSearchParams,
  getPHStoreSubscribe,
  PREFETCH_WAIT_MS,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FileNode,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { IRenown } from "@renown/sdk";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import {
  Breadcrumbs,
  FileItem,
  FolderItem,
  HomeScreenItem,
  ToolbarCloseButton,
} from "@powerhousedao/design-system/connect";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  ErrorRouteComponent,
  RouteComponent,
} from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRoute,
  HeadContent,
  notFound,
  Outlet,
  RouterProvider,
  useMatch,
} from "@tanstack/react-router";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import type { ComponentType, ReactNode } from "react";
import {
  createContext,
  Profiler,
  Suspense,
  use,
  useEffect,
  useSyncExternalStore,
} from "react";
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
import {
  addConnectRoutes,
  bindConnectRouter,
  connectRoutes,
  CONTENT_VIEW_ID,
  createConnectRouter,
  HOME_ROUTE_ID,
  isDriveNotFound,
} from "@powerhousedao/connect-core/router";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { DriveNotFoundPage, NotFoundPage } from "@powerhousedao/connect-core";
import type * as RouteTreeModule from "@powerhousedao/connect/route-tree";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { setRouteComponents } from "../../test/route-components.js";
import { reportRouteError, setSentryModule } from "../services/sentry.js";
import { DrivePending, RouteError } from "../generic/layout/route-views.js";
import { PROGRESS_DELAY_MS, RouteProgressBar } from "./route-views.js";

let module: InProcessReactorClientModule;
let store: PHStore;
let gate: Gate;
let unbind: (() => void) | undefined;
let restore: (() => void) | undefined;
let routeTree: typeof RouteTreeModule.routeTree;
// Each content render, so a test can tell a blank or fallback ever showed.
let renders: string[] = [];

type Gate = ReturnType<typeof createGate>;

function createGate() {
  let release = () => {};
  let opened: Promise<void> | undefined;
  return {
    close: () => {
      opened = new Promise((resolve) => {
        release = resolve;
      });
    },
    open: () => {
      release();
      opened = undefined;
    },
    wait: () => opened ?? Promise.resolve(),
  };
}

// Holds the document reads the route loader and the view make while closed.
function gatedClient(client: IReactorClient, gate: Gate) {
  return new Proxy(client, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (key !== "get" || typeof value !== "function") return value;
      return async (...args: Parameters<IReactorClient["get"]>) => {
        await gate.wait();
        return target.get(...args);
      };
    },
  });
}

beforeAll(async () => {
  primeRuntimeConfig({ connect: DEFAULT_CONNECT_CONFIG } as never);
  // Connect's route views read the config, and a build-time define, as they evaluate.
  vi.stubGlobal("PH_CONNECT_SENTRY_RELEASE", "test");
  ({ routeTree } = await import("@powerhousedao/connect/route-tree"));
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
    .withSigner(new RenownCryptoSigner(crypto, "connect-test"))
    .buildModule();
  store = createPHStore();
  bindPHStoreToWindow(store);
  addPHEventHandlers();
}, 60_000);

afterAll(() => {
  module.reactor.kill();
});

beforeEach(() => {
  gate = createGate();
  const client = gatedClient(module.client, gate);
  store.reactorClient = client;
  store.documentCache = new DocumentCache(client);
  store.drives = [];
  store.selectedDriveId = undefined;
  store.selectedNodeId = undefined;
  renders = [];
});

let releases: Array<() => void> = [];

// A background drive addition that stays pending until released.
function holdArrivals() {
  let release = () => {};
  void trackDriveArrival(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  releases.push(release);
  return release;
}

afterEach(async () => {
  cleanup();
  unbind?.();
  unbind = undefined;
  restore?.();
  restore = undefined;
  gate.open();
  for (const release of releases) release();
  releases = [];
  await Promise.resolve();
});

let driveCount = 0;
async function createDrive(slug: string) {
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = `${slug}-${++driveCount}`;
  drive.header.name = slug;
  drive.state.global.name = slug;
  return module.client.create<DocumentDriveDocument>(drive);
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
  const current = await module.client.get<DocumentDriveDocument>(
    drive.header.id,
  );
  const node = current.state.global.nodes.find(
    (n): n is FileNode => n.id === created.header.id,
  )!;
  return { drive: current, node };
}

async function createFolder(drive: DocumentDriveDocument, name: string) {
  const id = crypto.randomUUID();
  const current = await module.client.execute<DocumentDriveDocument>(
    drive.header.id,
    "main",
    [driveDocumentModelModule.actions.addFolder({ id, name })],
  );
  const folder = current.state.global.nodes.find((n) => n.id === id)!;
  return { drive: current, folder };
}

function DocumentView({ id }: { id: string }) {
  const [document] = useDocumentById(id);
  renders.push(`document:${document?.header.name}`);
  return <p>document:{document?.header.name}</p>;
}

function ContentProbe() {
  const driveId = useSelectedDriveId();
  const nodeId = useSyncExternalStore(
    getPHStoreSubscribe(store, "selectedNodeId"),
    () => store.selectedNodeId,
  );
  const drive = store.drives?.find((d) => d.header.id === driveId);
  const isFolder = drive?.state.global.nodes.some(
    (n) => n.id === nodeId && n.kind === "folder",
  );
  const showsHome = !!useMatch({ from: HOME_ROUTE_ID, shouldThrow: false });
  const view = driveId
    ? `drive:${drive?.header.name}`
    : showsHome
      ? "home"
      : "blank";
  if (!nodeId) renders.push(view);
  return (
    <div>
      <Outlet />
      <p data-testid="selection">
        {driveId ?? "-"}/{nodeId ?? "-"}
      </p>
      {nodeId && !isFolder ? (
        <Suspense fallback={<FallbackProbe />}>
          <DocumentView id={nodeId} />
        </Suspense>
      ) : (
        <p>{view}</p>
      )}
    </div>
  );
}

function FallbackProbe() {
  renders.push("fallback");
  return <p>fallback</p>;
}

const urlState = {} as {
  params: Record<string, string>;
  set: SetSearchParams;
};

// Exposes the URL state hooks as the router provides them.
function UrlStateProbe() {
  const params = useSearchParams();
  const set = useSetSearchParams();
  useEffect(() => {
    Object.assign(urlState, { params, set });
  });
  return <p data-testid="params">{JSON.stringify(params)}</p>;
}

type Views = {
  root?: RouteComponent;
  layout?: RouteComponent;
  /** Home's and the drive's view; the node route shows nothing of its own. */
  content?: RouteComponent;
  notFound?: ComponentType;
  driveNotFound?: ComponentType<{ driveSlug: string }>;
  drivePending?: RouteComponent;
  error?: ErrorRouteComponent;
};

// Missing paths and loaders' notFound(): a missing drive's names the drive.
function notFoundView(
  NotFound: ComponentType,
  DriveNotFound: ComponentType<{ driveSlug: string }>,
) {
  return function NotFoundView({ data }: { data?: unknown }) {
    return isDriveNotFound(data) ? (
      <DriveNotFound driveSlug={data.driveSlug} />
    ) : (
      <NotFound />
    );
  };
}

// The root as Connect's renders it: the matched routes' head, then the page.
function HeadRoot() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}

function routerViews(views: Views = {}) {
  const content = views.content ?? ContentProbe;
  const notFound = views.notFound ?? NotFoundPage;
  restore = setRouteComponents(
    routeTree,
    {
      root: views.root ?? HeadRoot,
      layout: views.layout ?? Outlet,
      home: content,
      drive: content,
      node: () => null,
      splat: notFound as RouteComponent,
    },
    views.drivePending ?? DrivePending,
  );
  return {
    errorComponent: views.error ?? RouteError,
    notFoundComponent: notFoundView(
      notFound,
      views.driveNotFound ?? DriveNotFoundPage,
    ),
  };
}

function mount(
  path: string,
  basepath?: string,
  outsideRouter?: ReactNode,
  overrides?: Views,
) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const connectRouter = createConnectRouter({
    routeTree,
    store,
    onCatch: reportRouteError,
    arrivals: createDriveArrivals(store),
    basepath,
    history,
    ...routerViews(overrides),
  });
  unbind = bindConnectRouter(connectRouter, store);
  render(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
      {outsideRouter}
    </PHStoreProvider>,
  );
  return { ...connectRouter, history };
}

const selection = () => screen.getByTestId("selection").textContent;

// The _app layout as Connect's shell renders it: a sidebar beside the matches.
function SidebarLayout() {
  return (
    <>
      <nav data-testid="sidebar" />
      <Outlet />
    </>
  );
}

// The content view as Connect's shell renders it, around the matches.
function ScrollRoot() {
  return (
    <div id={CONTENT_VIEW_ID} data-scroll-restoration-id={CONTENT_VIEW_ID}>
      <Outlet />
    </div>
  );
}
const contentView = () => document.getElementById(CONTENT_VIEW_ID)!;
function scrollContent(top: number) {
  act(() => {
    contentView().scrollTop = top;
    contentView().dispatchEvent(new Event("scroll"));
  });
}

function HistoryProbe() {
  const visible = useRevisionHistoryVisible();
  const page = useRevisionHistoryPage();
  return <p data-testid="history">{visible ? `open ${page}` : "closed"}</p>;
}

async function settle(router: ReturnType<typeof mount>["router"]) {
  await vi.waitFor(() => expect(router.state.status).toBe("idle"));
}

describe("Connect router", () => {
  it("keeps the open view until the next document is ready", async () => {
    const created = await createDrive("Mixed-Case");
    const { drive, node } = await createFile(created, "Report");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`);
    await vi.waitFor(() => screen.getByText("drive:Mixed-Case"));

    gate.close();
    act(() => setSelectedNode(node));
    expect(router.history.location.pathname).toContain(node.id);
    // Past the pending delay the drive view stays and nothing is selected yet.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(screen.getByText("drive:Mixed-Case")).toBeDefined();
    expect(selection()).toBe(`${drive.header.id}/-`);

    act(() => gate.open());
    await vi.waitFor(() => screen.getByText("document:Report"));
    expect(selection()).toBe(`${drive.header.id}/${node.id}`);
    expect(renders).not.toContain("fallback");
    expect(renders.filter((view) => view === "home")).toEqual([]);
  });

  it("commits a document whose fetch never settles once the wait is over", async () => {
    const created = await createDrive("Stuck");
    const { drive, node } = await createFile(created, "Hung");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`);
    await settle(router);

    gate.close();
    const startedAt = Date.now();
    act(() => setSelectedNode(node));
    await vi.waitFor(
      () => expect(selection()).toBe(`${drive.header.id}/${node.id}`),
      { timeout: PREFETCH_WAIT_MS + 3_000 },
    );
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      PREFETCH_WAIT_MS - 100,
    );
  });

  it("does not commit a document whose navigation was superseded", async () => {
    const created = await createDrive("Superseded");
    const { drive, node } = await createFile(created, "Skipped");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`);
    await settle(router);
    const seen: string[] = [];
    const unsubscribe = getPHStoreSubscribe(
      store,
      "selectedNodeId",
    )(() => {
      if (store.selectedNodeId) seen.push(store.selectedNodeId);
    });

    gate.close();
    act(() => setSelectedNode(node));
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    act(() => setSelectedDrive(undefined));
    await vi.waitFor(() => expect(selection()).toBe("-/-"));
    await act(
      () =>
        new Promise((resolve) => setTimeout(resolve, PREFETCH_WAIT_MS + 500)),
    );
    unsubscribe();
    expect(selection()).toBe("-/-");
    expect(seen).toEqual([]);
  });

  it("commits a warm navigation as soon as its loader settles", async () => {
    const created = await createDrive("Warm-Commit");
    const { drive, node } = await createFile(created, "Quick");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`);
    await settle(router);

    // Past pendingMs; a pending minimum would hold the commit until ~500 ms.
    gate.close();
    const started = performance.now();
    setTimeout(() => gate.open(), 250);
    act(() => setSelectedNode(node));
    await vi.waitFor(
      () => expect(selection()).toBe(`${drive.header.id}/${node.id}`),
      { interval: 10 },
    );
    expect(performance.now() - started).toBeLessThan(420);
    expect(screen.queryByText("Loading drive")).toBeNull();
  });

  it("shows the progress bar only for a slow load, with no commit for a quick one", async () => {
    const created = await createDrive("Progress");
    const first = await createFile(created, "Slow");
    const { drive, node: quick } = await createFile(first.drive, "Quick");
    store.drives = [drive];
    let barCommits = 0;
    let barShownAt: number | undefined;
    const onBarRender = () => {
      barCommits++;
      if (barShownAt === undefined && screen.queryByRole("progressbar")) {
        barShownAt = performance.now();
      }
    };
    const root = () => (
      <>
        <Outlet />
        <Profiler id="bar" onRender={onBarRender}>
          <RouteProgressBar />
        </Profiler>
      </>
    );
    const { router } = mount(`/d/${drive.header.slug}`, undefined, undefined, {
      root,
    });
    await settle(router);
    barCommits = 0;

    act(() => setSelectedNode(quick));
    await settle(router);
    await vi.waitFor(() => screen.getByText("document:Quick"));
    expect(barCommits).toBe(0);

    gate.close();
    barShownAt = undefined;
    const slowStarted = performance.now();
    act(() => setSelectedNode(first.node));
    await vi.waitFor(() => screen.getByRole("progressbar"));
    // When the bar committed, not a wall-clock sleep: a slow runner only widens
    // the gap. The few ms of slack are timer granularity, far short of the delay.
    expect(barShownAt).toBeGreaterThanOrEqual(
      slowStarted + PROGRESS_DELAY_MS - 5,
    );
    act(() => gate.open());
    await vi.waitFor(() => screen.getByText("document:Slow"));
    await vi.waitFor(() =>
      expect(screen.queryByRole("progressbar")).toBeNull(),
    );
  });

  it("opens revision history as ?history: Back closes it, another document drops it", async () => {
    const created = await createDrive("History");
    const first = await createFile(created, "First");
    const { drive, node: second } = await createFile(first.drive, "Second");
    store.drives = [drive];
    const { router } = mount(
      `/d/${drive.header.slug}/first-${first.node.id}`,
      undefined,
      <HistoryProbe />,
    );
    await vi.waitFor(() => screen.getByText("document:First"));
    expect(screen.getByTestId("history").textContent).toBe("closed");

    // The toolbar button's handler.
    act(() => showRevisionHistory());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("open 1"),
    );
    expect(router.history.location.search).toBe("?history");

    act(() => setRevisionHistoryPage(2));
    await vi.waitFor(() =>
      expect(router.history.location.search).toBe("?history&historyPage=2"),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("open 2"),
    );

    act(() => router.history.back());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("open 1"),
    );
    act(() => router.history.back());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("closed"),
    );
    act(() => router.history.forward());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("open 1"),
    );

    act(() => setSelectedNode(second));
    await vi.waitFor(() => screen.getByText("document:Second"));
    expect(screen.getByTestId("history").textContent).toBe("closed");
    expect(router.history.location.search).toBe("");
  });

  it("opens revision history from a deep link, on the page it names", async () => {
    const created = await createDrive("Deep-History");
    const { drive, node } = await createFile(created, "Linked");
    const path = `/d/${drive.header.slug}/linked-${node.id}`;
    store.drives = [drive];
    mount(`${path}?history&historyPage=3`, undefined, <HistoryProbe />);
    await vi.waitFor(() => screen.getByText("document:Linked"));
    expect(screen.getByTestId("history").textContent).toBe("open 3");
    cleanup();
    unbind?.();

    // An invalid page is the first one.
    const { router } = mount(
      `${path}?history&historyPage=x`,
      undefined,
      <HistoryProbe />,
    );
    await vi.waitFor(() => screen.getByText("document:Linked"));
    expect(screen.getByTestId("history").textContent).toBe("open 1");
    // The drive route's search schema drops it.
    expect(router.state.matches.at(-1)?.search).toEqual({ history: "" });

    act(() => hideRevisionHistory());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("closed"),
    );
  });

  it("leaves a drive app's own page param to it", async () => {
    const created = await createDrive("Paged-App");
    const { drive, node } = await createFile(created, "Report");
    store.drives = [drive];
    const { router } = mount(
      `/d/${drive.header.slug}/report-${node.id}?page=3`,
      undefined,
      <HistoryProbe />,
    );
    await vi.waitFor(() => screen.getByText("document:Report"));

    act(() => showRevisionHistory());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("open 1"),
    );
    act(() => hideRevisionHistory());
    await vi.waitFor(() =>
      expect(screen.getByTestId("history").textContent).toBe("closed"),
    );
    expect(router.history.location.search).toBe("?page=3");
  });

  it("restores drive and document on back and forward", async () => {
    const created = await createDrive("Mixed-Case");
    const { drive, node } = await createFile(created, "Notes");
    store.drives = [drive];
    const { router, history } = mount("/");
    await settle(router);
    expect(selection()).toBe("-/-");

    act(() => setSelectedDrive(drive));
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Notes"));

    act(() => history.back());
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() => history.back());
    await vi.waitFor(() => expect(selection()).toBe("-/-"));
    act(() => history.forward());
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() => history.forward());
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(history.location.pathname).toBe(
      `/d/${drive.header.slug}/notes-${node.id}`,
    );
  });

  it("starts a new view at the top and restores the old one on back", async () => {
    const created = await createDrive("Scrolled");
    const { drive, node } = await createFile(created, "Long");
    store.drives = [drive];
    const { router, history } = mount(
      `/d/${drive.header.slug}`,
      undefined,
      undefined,
      { root: ScrollRoot },
    );
    await settle(router);
    scrollContent(300);

    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Long"));
    await settle(router);
    expect(contentView().scrollTop).toBe(0);

    scrollContent(120);
    act(() => history.back());
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    await settle(router);
    await vi.waitFor(() => expect(contentView().scrollTop).toBe(300));

    act(() => history.forward());
    await vi.waitFor(() => screen.getByText("document:Long"));
    await settle(router);
    await vi.waitFor(() => expect(contentView().scrollTop).toBe(120));
  });

  it("leaves an unscrolled view alone and keeps scroll on search changes", async () => {
    const created = await createDrive("Still");
    const { drive, node } = await createFile(created, "Short");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`, undefined, undefined, {
      root: ScrollRoot,
    });
    await settle(router);
    const scrollTo = vi.spyOn(contentView(), "scrollTo");

    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Short"));
    await settle(router);
    expect(scrollTo).not.toHaveBeenCalled();

    scrollContent(80);
    act(() => getPHNavigation().setSearch(() => ({ view: "raw" })));
    await vi.waitFor(() =>
      expect(router.state.location.search).toMatchObject({ view: "raw" }),
    );
    await settle(router);
    expect(contentView().scrollTop).toBe(80);
  });

  it("waits for a deep-linked drive that syncs in late", async () => {
    const created = await createDrive("Late");
    const { drive, node } = await createFile(created, "Plan");
    const arrive = holdArrivals();
    const { router } = mount(`/d/${drive.header.slug}/plan-${node.id}`);

    // The shell shows the pending view instead of a blank or the home screen.
    await vi.waitFor(() => screen.getByText("Loading drive"));
    expect(renders).not.toContain("home");
    expect(router.state.status).toBe("pending");

    act(() => {
      store.drives = [drive];
      arrive();
    });
    await vi.waitFor(() => screen.getByText("document:Plan"));
    expect(selection()).toBe(`${drive.header.id}/${node.id}`);
  });

  it("opens a node with a custom id by its slug or raw id", async () => {
    const created = await createDrive("Custom");
    const drive = await module.client.execute<DocumentDriveDocument>(
      created.header.id,
      "main",
      [
        driveDocumentModelModule.actions.addFolder({
          id: "folder-1",
          name: "Planning",
        }),
      ],
    );
    store.drives = [drive];
    const base = `/d/${drive.header.slug}`;
    const { router, history } = mount(`${base}/planning-folder-1`);
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/folder-1`),
    );

    act(() => getPHNavigation().open({ driveSlug: drive.header.slug }));
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() =>
      getPHNavigation().open({
        driveSlug: drive.header.slug,
        nodeSlug: "folder-1",
      }),
    );
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/folder-1`),
    );

    act(() =>
      getPHNavigation().open({
        driveSlug: drive.header.slug,
        nodeSlug: "no-such-node",
      }),
    );
    await vi.waitFor(() => expect(history.location.pathname).toBe(base));
    await settle(router);
    expect(selection()).toBe(`${drive.header.id}/-`);
  });

  it("waits for a deep-linked remote drive through the reactor's boot", async () => {
    const created = await createDrive("Remote");
    const { drive, node } = await createFile(created, "Booted");
    store.drives = undefined;
    const { router } = mount(`/d/${drive.header.slug}/booted-${node.id}`);
    await vi.waitFor(() => screen.getByText("Loading drive"));

    // As createReactor does: track the default drives, then list local ones.
    const arrive = holdArrivals();
    act(() => {
      store.drives = [];
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(router.state.status).toBe("pending");

    act(() => {
      store.drives = [drive];
      arrive();
    });
    await vi.waitFor(() => screen.getByText("document:Booted"));
    expect(renders).not.toContain("home");
  });

  it("keeps an added remote drive pending until it is listed", async () => {
    const created = await createDrive("Pulled");
    const { drive, node } = await createFile(created, "Listed");
    store.drives = undefined;
    const { router } = mount(`/d/${drive.header.slug}/listed-${node.id}`);
    await vi.waitFor(() => screen.getByText("Loading drive"));

    // The add and first pull are done, but the drive is not listed yet.
    void trackDriveArrival(untilDriveListed(store, drive.header.id));
    act(() => {
      store.drives = [];
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(router.state.status).toBe("pending");

    act(() => {
      store.drives = [drive];
    });
    await vi.waitFor(() => screen.getByText("document:Listed"));
  });

  it("opens a file of the shown drive while another drive is pending", async () => {
    const created = await createDrive("Shown");
    const { drive, node } = await createFile(created, "Clicked");
    const pending = await createDrive("Pending");
    store.drives = [drive];
    const { router, history } = mount(`/d/${drive.header.slug}`);
    await settle(router);

    holdArrivals();
    act(() => setSelectedDrive(pending.header.slug));
    await vi.waitFor(() => expect(router.state.status).toBe("pending"));
    expect(history.location.pathname).toBe(`/d/${pending.header.slug}`);

    act(() => setSelectedNode(node));
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(history.location.pathname).toBe(
      `/d/${drive.header.slug}/clicked-${node.id}`,
    );
  });

  it("shows the drive's 404 page, inside the layout, when the drive is missing", async () => {
    const drive = await createDrive("Shown");
    store.drives = [drive];
    const { router, history } = mount(
      `/d/${drive.header.slug}`,
      undefined,
      undefined,
      {
        layout: SidebarLayout,
      },
    );
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));

    act(() => {
      void router.navigate({
        to: "/d/$driveSlug/{-$nodeSlug}",
        params: { driveSlug: "no-such-drive", nodeSlug: "doc" },
      });
    });
    await vi.waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Drive no-such-drive not found",
      ),
    );
    await settle(router);
    expect(history.location.pathname).toBe("/d/no-such-drive/doc");
    expect(screen.getByTestId("not-found-path").textContent).toBe(
      "/d/no-such-drive/doc",
    );
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    // The content view and the drive it showed are gone.
    expect(screen.queryByTestId("selection")).toBeNull();
    expect(store.selectedDriveId).toBeUndefined();
    await vi.waitFor(() => expect(document.title).toBe("Not found · Connect"));
  });

  it("shows the drive's 404 page only once a deep-linked drive's arrivals settle", async () => {
    const release = holdArrivals();
    const { router } = mount("/d/late-drive");
    await vi.waitFor(() => screen.getByText("Loading drive"));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => release());
    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Drive late-drive not found",
      ),
    );
    await settle(router);
  });

  it("leads to the drive when the document is missing", async () => {
    const drive = await createDrive("Docless");
    store.drives = [drive];
    const missing = "11111111-2222-4333-8444-555555555555";
    const { router, history } = mount(
      `/d/${drive.header.slug}/gone-${missing}`,
    );
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe(`/d/${drive.header.slug}`),
    );
    await settle(router);
    expect(selection()).toBe(`${drive.header.id}/-`);
  });

  it("shows a 404 page for an unknown path, inside the layout, with a link home", async () => {
    const { router, history } = mount(
      "/no/such/path?theme=dark",
      undefined,
      undefined,
      {
        layout: SidebarLayout,
      },
    );
    await settle(router);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Page not found",
    );
    expect(screen.getByTestId("not-found-path").textContent).toBe(
      "/no/such/path",
    );
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(history.location.pathname).toBe("/no/such/path");
    await vi.waitFor(() => expect(document.title).toBe("Not found · Connect"));

    const home = screen.getByRole("link", { name: "Go to the home page" });
    expect(home.getAttribute("href")).toBe("/?theme=dark");
    click(home);
    await vi.waitFor(() => expect(history.location.pathname).toBe("/"));
    await vi.waitFor(() => expect(screen.getByText("home")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("unselects the drive on an unknown path", async () => {
    const drive = await createDrive("Lost");
    store.drives = [drive];
    const { router } = mount(`/d/${drive.header.slug}`);
    await settle(router);
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() => {
      void router.navigate({ to: "/no/such/path" as never });
    });
    await settle(router);
    await vi.waitFor(() => expect(store.selectedDriveId).toBeUndefined());
  });

  it("tells a missing drive from an unknown path", async () => {
    const views = {
      notFound: () => <p data-testid="missing">path</p>,
      driveNotFound: ({ driveSlug }: { driveSlug: string }) => (
        <p data-testid="missing">drive {driveSlug}</p>
      ),
    };
    const drive = mount("/d/no-such-drive", undefined, undefined, views);
    await settle(drive.router);
    expect(screen.getByTestId("missing").textContent).toBe(
      "drive no-such-drive",
    );
    cleanup();
    unbind?.();
    const path = mount("/no/such/path", undefined, undefined, views);
    await settle(path.router);
    expect(screen.getByTestId("missing").textContent).toBe("path");
  });

  it("keeps a route's own notFoundComponent for its loader's notFound()", async () => {
    const { rootRoute } = connectRoutes(routeTree);
    const reportRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "report/$driveSlug",
      loader: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- router control flow
        throw notFound();
      },
      component: () => <p>report</p>,
      notFoundComponent: () => <p data-testid="report-missing">no drive</p>,
    });
    addConnectRoutes([reportRoute]);
    const { router, history } = mount("/report/missing");
    await settle(router);
    expect(screen.getByTestId("report-missing")).toBeTruthy();
    expect(history.location.pathname).toBe("/report/missing");
  });

  it("preloads without waiting, navigating, or selecting", async () => {
    const created = await createDrive("Warm");
    const { drive, node } = await createFile(created, "Cached");
    const pending = await createDrive("Pending");
    store.drives = [drive];
    const { router, history } = mount(`/d/${drive.header.slug}`);
    await settle(router);
    holdArrivals();

    const preloadDrive = router.preloadRoute({
      to: "/d/$driveSlug/{-$nodeSlug}",
      params: { driveSlug: pending.header.slug },
    });
    await expect(
      Promise.race([
        preloadDrive.then(() => "settled"),
        new Promise((resolve) => setTimeout(() => resolve("waiting"), 1000)),
      ]),
    ).resolves.toBe("settled");

    act(() =>
      getPHNavigation().preload?.({
        driveSlug: drive.header.slug,
        nodeSlug: `cached-${node.id}`,
      }),
    );
    await vi.waitFor(async () => {
      const cached = store.documentCache?.get(node.id) as Promise<unknown> & {
        status?: string;
      };
      await cached;
      expect(cached.status).toBe("fulfilled");
    });
    expect(history.location.pathname).toBe(`/d/${drive.header.slug}`);
    expect(selection()).toBe(`${drive.header.id}/-`);
  });

  it("shows a loader error and reports it to Sentry", async () => {
    const created = await createDrive("Broken");
    const { drive, node } = await createFile(created, "Lost");
    // A drive without nodes makes the loader throw on the node lookup.
    const broken = { ...drive, state: { ...drive.state, global: {} } };
    store.drives = [broken as DocumentDriveDocument];
    const captureException = vi.fn();
    setSentryModule({ captureException } as never);
    try {
      mount(`/d/${drive.header.slug}/lost-${node.id}`);
      const message = await vi.waitFor(() =>
        screen.getByRole("heading", { name: /reading 'find'/ }),
      );
      expect(message.tagName).toBe("H3");
      expect(captureException).toHaveBeenCalledWith(
        expect.any(TypeError),
        expect.anything(),
      );
      expect(selection()).toBe("-/-");
    } finally {
      setSentryModule(undefined);
    }
  });

  it("closes back to the folder the document was opened from", async () => {
    const { drive: withFolder, folder } = await createFolder(
      await createDrive("Closing"),
      "Inbox",
    );
    const { drive, node } = await createFile(withFolder, "Memo", folder.id);
    store.drives = [drive];
    const document = await module.client.get<PHDocument>(node.id);
    const folderPath = `/d/${drive.header.slug}/inbox-${folder.id}`;
    const { router, history } = mount(
      folderPath,
      undefined,
      <ToolbarCloseButton document={document} />,
    );
    await settle(router);

    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Memo"));
    const index = history.location.state.__TSR_index;
    act(() => {
      fireEvent.click(screen.getByTestId("toolbar-close-button"));
    });
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${folder.id}`),
    );
    expect(history.location.pathname).toBe(folderPath);
    // Back, not a new entry on top of the document.
    expect(history.location.state.__TSR_index).toBe(index - 1);
  });

  it("closes back to the folder after opening a document by its raw id", async () => {
    const { drive: withFolder, folder } = await createFolder(
      await createDrive("RawClose"),
      "Inbox",
    );
    const { drive, node } = await createFile(withFolder, "Raw", folder.id);
    store.drives = [drive];
    const document = await module.client.get<PHDocument>(node.id);
    const folderPath = `/d/${drive.header.slug}/inbox-${folder.id}`;
    const { router, history } = mount(
      folderPath,
      undefined,
      <ToolbarCloseButton document={document} />,
    );
    await settle(router);
    const folderIndex = history.location.state.__TSR_index;

    act(() =>
      getPHNavigation().open({
        driveSlug: drive.header.slug,
        nodeSlug: node.id,
      }),
    );
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe(
        `/d/${drive.header.slug}/raw-${node.id}`,
      ),
    );
    await settle(router);
    act(() => {
      fireEvent.click(screen.getByTestId("toolbar-close-button"));
    });
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${folder.id}`),
    );
    expect(history.location.pathname).toBe(folderPath);
    expect(history.location.state.__TSR_index).toBe(folderIndex);
  });

  it("closes past the document's own entries, keeping it forward", async () => {
    const { drive: withFolder, folder } = await createFolder(
      await createDrive("Stepping"),
      "Inbox",
    );
    const { drive, node } = await createFile(withFolder, "Flow", folder.id);
    store.drives = [drive];
    const document = await module.client.get<PHDocument>(node.id);
    const folderPath = `/d/${drive.header.slug}/inbox-${folder.id}`;
    const { router, history } = mount(
      folderPath,
      undefined,
      <>
        <ToolbarCloseButton document={document} />
        <UrlStateProbe />
      </>,
    );
    await settle(router);
    const folderIndex = history.location.state.__TSR_index;

    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Flow"));
    const docPath = history.location.pathname;
    act(() => urlState.set({ step: "a" }));
    await vi.waitFor(() => expect(urlState.params.step).toBe("a"));
    act(() => urlState.set({ step: "b" }));
    await vi.waitFor(() => expect(urlState.params.step).toBe("b"));
    expect(history.location.state.__TSR_index).toBe(folderIndex + 3);

    act(() => {
      fireEvent.click(screen.getByTestId("toolbar-close-button"));
    });
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${folder.id}`),
    );
    expect(history.location.pathname).toBe(folderPath);
    expect(history.location.state.__TSR_index).toBe(folderIndex);

    act(() => history.forward());
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(history.location.pathname).toBe(docPath);
  });

  it("closes a deep-linked document to its parent folder in place", async () => {
    const { drive: withFolder, folder } = await createFolder(
      await createDrive("Deep"),
      "Archive",
    );
    const { drive, node } = await createFile(withFolder, "Old", folder.id);
    store.drives = [drive];
    const document = await module.client.get<PHDocument>(node.id);
    const { router, history } = mount(
      `/d/${drive.header.slug}/old-${node.id}?step=a`,
      undefined,
      <ToolbarCloseButton document={document} />,
    );
    await vi.waitFor(() => screen.getByText("document:Old"));
    await settle(router);
    const index = history.location.state.__TSR_index;

    act(() => {
      fireEvent.click(screen.getByTestId("toolbar-close-button"));
    });
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${folder.id}`),
    );
    expect(history.location.pathname).toBe(
      `/d/${drive.header.slug}/archive-${folder.id}`,
    );
    expect(history.location.search).toBe("");
    expect(history.location.state.__TSR_index).toBe(index);
  });

  it("goes back from a step pick to the document, not out of it", async () => {
    const created = await createDrive("Picking");
    const { drive, node } = await createFile(created, "Graph");
    store.drives = [drive];
    const { router, history } = mount(
      `/d/${drive.header.slug}`,
      undefined,
      <UrlStateProbe />,
    );
    await settle(router);

    act(() => setSelectedNode(node));
    await vi.waitFor(() => screen.getByText("document:Graph"));
    act(() => urlState.set({ step: "a" }));
    await vi.waitFor(() => expect(urlState.params.step).toBe("a"));

    act(() => history.back());
    await vi.waitFor(() => expect(urlState.params.step).toBeUndefined());
    await settle(router);
    expect(selection()).toBe(`${drive.header.id}/${node.id}`);
  });

  it("navigates under a base path", async () => {
    const drive = await createDrive("Based");
    store.drives = [drive];
    store.basePath = "/connect/";
    try {
      const { router, history } = mount("/connect/", "/connect/");
      await settle(router);
      act(() => setSelectedDrive(drive));
      await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
      expect(history.location.pathname).toBe(`/connect/d/${drive.header.slug}`);
    } finally {
      store.basePath = undefined;
    }
  });

  it("gives home's href with the global params, for a full page load", async () => {
    const drive = await createDrive("Reload");
    store.drives = [drive];
    const { router } = mount(
      `/connect/d/${drive.header.slug}?theme=dark&step=s1`,
      "/connect/",
    );
    await settle(router);
    expect(getTargetHref(undefined)).toBe("/connect/?theme=dark");
  });
});

const params = (history: { location: { search: string } }) =>
  Object.fromEntries(new URLSearchParams(history.location.search));

describe("Connect router query params", () => {
  it("keeps global params and drops a document's own across navigations", async () => {
    const created = await createDrive("Params");
    const { drive, node } = await createFile(created, "Doc");
    const other = await createFile(drive, "Other");
    store.drives = [other.drive];
    const { router, history } = mount(
      "/?theme=dark&FEATURE_X=true&driveUrl=http%3A%2F%2Fremote&item=stale",
    );
    await settle(router);

    act(() => setSelectedDrive(drive));
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    const globals = {
      theme: "dark",
      FEATURE_X: "true",
      driveUrl: "http://remote",
    };
    expect(params(history)).toEqual(globals);

    // One entry opens the document with its own params.
    const index = history.location.state.__TSR_index;
    // Including an editor's view state, e.g. the workflow editor's.
    const own = { item: "a", step: "s1", tab: "run", "runs.status": "FAILED" };
    act(() => setSelectedNode(node, { search: own }));
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(params(history)).toEqual({ ...globals, ...own });
    expect(history.location.state.__TSR_index).toBe(index + 1);

    act(() => setSelectedNode(other.node));
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${other.node.id}`),
    );
    expect(params(history)).toEqual(globals);

    // A redirect keeps them too.
    act(() =>
      getPHNavigation().open({
        driveSlug: drive.header.slug,
        nodeSlug: "gone-11111111-2222-4333-8444-555555555555",
      }),
    );
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe(`/d/${drive.header.slug}`),
    );
    expect(params(history)).toEqual(globals);
  });

  it("keeps the drive match on search-only navigations", async () => {
    const created = await createDrive("Reload");
    const first = await createFile(created, "First");
    const { drive, node: second } = await createFile(first.drive, "Second");
    store.drives = [drive];
    const { router, nodeRoute } = mount(
      `/d/${drive.header.slug}/first-${first.node.id}`,
    );
    await settle(router);
    const loadedAt = () =>
      router.state.matches.find((match) => match.routeId === nodeRoute.id)
        ?.updatedAt;
    const firstLoad = loadedAt();

    act(() => getPHNavigation().setSearch(() => ({ item: "a" })));
    await vi.waitFor(() =>
      expect(router.state.location.search).toEqual({ item: "a" }),
    );
    await settle(router);
    expect(loadedAt()).toBe(firstLoad);
    // Rewriting the same params, e.g. a filter keystroke that changes nothing.
    act(() => getPHNavigation().setSearch(() => ({ item: "a" })));
    await settle(router);
    expect(loadedAt()).toBe(firstLoad);

    act(() => setSelectedNode(second));
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${second.id}`),
    );
    expect(loadedAt()).toBeGreaterThan(firstLoad!);
  });

  it("opens and preloads targets with the given params", async () => {
    const created = await createDrive("Open");
    const { drive, node } = await createFile(created, "Target");
    store.drives = [drive];
    const { router, history } = mount("/?embed=1");
    await settle(router);

    act(() =>
      getPHNavigation().open(
        { driveSlug: drive.header.slug, nodeSlug: `target-${node.id}` },
        { search: { item: "x", dropped: undefined } },
      ),
    );
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(history.location.search).toBe("?item=x&embed=1");

    act(() => getPHNavigation().open(undefined, { replace: true }));
    await vi.waitFor(() => expect(selection()).toBe("-/-"));
    expect(history.location.search).toBe("?embed=1");
  });

  it("keeps ?user= removed after login and the next navigation", async () => {
    const drive = await createDrive("Login");
    store.drives = [drive];
    const did = "did:key:z6MkLoginTest";
    const { router, history } = mount(
      `/d/${drive.header.slug}?user=${encodeURIComponent(did)}&theme=dark`,
    );
    await settle(router);
    const key = history.location.state.__TSR_key;

    // Already signed in, so only the URL cleanup runs.
    const renown = { user: { did } } as unknown as IRenown;
    await act(() => login(undefined, renown));
    await vi.waitFor(() => expect(params(history)).toEqual({ theme: "dark" }));
    expect(history.location.state.__TSR_key).toBeDefined();
    expect(history.location.state.__TSR_key).not.toBe(key);

    act(() => setSelectedDrive(undefined));
    await vi.waitFor(() => expect(selection()).toBe("-/-"));
    expect(params(history)).toEqual({ theme: "dark" });
  });

  it("backs the URL state hooks with the router, outside its provider", async () => {
    const created = await createDrive("Hooks");
    const { drive, node } = await createFile(created, "Studio");
    store.drives = [drive];
    const path = `/d/${drive.header.slug}/studio-${node.id}`;
    const { router, history } = mount(
      `${path}?theme=dark`,
      undefined,
      <UrlStateProbe />,
    );
    await vi.waitFor(() => screen.getByText("document:Studio"));
    expect(urlState.params).toEqual({ theme: "dark" });

    const index = history.location.state.__TSR_index;
    act(() => urlState.set({ item: "a" }));
    await vi.waitFor(() =>
      expect(urlState.params).toEqual({ theme: "dark", item: "a" }),
    );
    expect(history.location.pathname).toBe(path);
    expect(history.location.state.__TSR_index).toBe(index + 1);

    act(() => urlState.set({ item: "b" }, { replace: true }));
    await vi.waitFor(() => expect(urlState.params.item).toBe("b"));
    expect(history.location.state.__TSR_index).toBe(index + 1);

    act(() => history.back());
    await vi.waitFor(() => expect(urlState.params).toEqual({ theme: "dark" }));
    await settle(router);
    expect(selection()).toBe(`${drive.header.id}/${node.id}`);
  });
});

function DriveLink({ drive }: { drive: DocumentDriveDocument }) {
  const link = useLinkProps({ driveSlug: drive.header.slug }, () =>
    setSelectedDrive(drive),
  );
  return (
    <HomeScreenItem
      title={`link:${drive.header.name}`}
      href={link.href}
      onClick={link.onClick}
    />
  );
}

// Whether the app took a click; the browser's own default is kept from running.
function click(element: Element, init?: MouseEventInit) {
  let prevented: boolean | undefined;
  const record = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", record, { once: true });
  act(() => {
    fireEvent.click(element, init);
  });
  return prevented;
}

describe("Connect router links", () => {
  it("renders real links that open in-app only on a plain click", async () => {
    const { drive: withFolder, folder } = await createFolder(
      await createDrive("Linked"),
      "Docs",
    );
    const { drive, node } = await createFile(withFolder, "Spec", folder.id);
    store.drives = [drive];
    store.basePath = "/connect/";
    try {
      const driveHref = `/connect/d/${drive.header.slug}`;
      const folderHref = `${driveHref}/docs-${folder.id}`;
      const { router, history } = mount(
        `${folderHref}?theme=dark`,
        "/connect/",
        <>
          <DriveLink drive={drive} />
          <Breadcrumbs />
          <FolderItem folderNode={folder as FolderNode} />
          <FileItem fileNode={node} />
        </>,
      );
      await settle(router);
      await vi.waitFor(() =>
        expect(selection()).toBe(`${drive.header.id}/${folder.id}`),
      );

      const hrefs = () =>
        screen.getAllByRole("link").map((a) => a.getAttribute("href"));
      const linkTo = (name: string) =>
        screen.getAllByRole("link").find((a) => a.textContent.includes(name));
      // Global params ride along, as an in-app navigation keeps them.
      expect(linkTo("link:Linked")?.getAttribute("href")).toBe(
        `${driveHref}?theme=dark`,
      );
      expect(linkTo("Spec")?.getAttribute("href")).toBe(
        `${driveHref}/spec-${node.id}?theme=dark`,
      );
      // The folder item and its breadcrumb.
      expect(
        hrefs().filter((href) => href === `${folderHref}?theme=dark`),
      ).toHaveLength(2);
      // Only links to what shows now are current: the folder, not its drive.
      const currentHrefs = () =>
        screen
          .getAllByRole("link")
          .filter((a) => a.getAttribute("aria-current") === "page")
          .map((a) => a.getAttribute("href"));
      expect(currentHrefs()).toEqual([
        `${folderHref}?theme=dark`,
        `${folderHref}?theme=dark`,
      ]);

      // Modified and other-button clicks are the browser's: new tab or window.
      const index = history.location.state.__TSR_index;
      for (const init of [
        { metaKey: true },
        { ctrlKey: true },
        { shiftKey: true },
        { button: 1 },
      ]) {
        expect(click(linkTo("Spec")!, init)).toBe(false);
      }
      await settle(router);
      expect(history.location.state.__TSR_index).toBe(index);
      expect(selection()).toBe(`${drive.header.id}/${folder.id}`);

      // A plain click navigates in-app instead of loading the page.
      expect(click(linkTo("Spec")!)).toBe(true);
      await vi.waitFor(() =>
        expect(selection()).toBe(`${drive.header.id}/${node.id}`),
      );
      expect(history.location.pathname).toBe(`${driveHref}/spec-${node.id}`);
      expect(history.location.state.__TSR_index).toBe(index + 1);
      await vi.waitFor(() =>
        expect(linkTo("Spec")?.getAttribute("aria-current")).toBe("page"),
      );
      expect(currentHrefs()).not.toContain(`${folderHref}?theme=dark`);

      expect(click(linkTo("link:Linked")!)).toBe(true);
      await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    } finally {
      store.basePath = undefined;
    }
  });
});

const ScopeName = createContext("");

// An editor that knows only the store in context.
function ScopedEditor({ name, nodes }: { name: string; nodes: FileNode[] }) {
  const driveId = useSelectedDriveId();
  const node = useSelectedNode();
  const openNode = useOpenNode();
  return (
    <section aria-label={name}>
      <p data-testid="selection">
        {driveId ?? "-"}/{node?.id ?? "-"}
      </p>
      {nodes.map((file) => (
        <button key={file.id} type="button" onClick={() => openNode(file)}>
          open {file.name}
        </button>
      ))}
      <FileItem fileNode={nodes[0]} />
    </section>
  );
}

describe("Connect routers in scoped stores", () => {
  it("keeps two side-by-side editors' selection and navigation apart", async () => {
    const created = await createDrive("Shared");
    const first = await createFile(created, "First");
    const { drive, node: second } = await createFile(first.drive, "Second");
    store.drives = [drive];
    const nodes = [first.node, second];
    const drivePath = `/d/${drive.header.slug}`;

    // One tree serves both routers; each names its editor through InnerWrap.
    function ScopedContent() {
      return <ScopedEditor name={use(ScopeName)} nodes={nodes} />;
    }
    const views = routerViews({ content: ScopedContent });
    const scopes = ["left", "right"].map((name) => {
      const scope = createScopedPHStore(store);
      const history = createMemoryHistory({ initialEntries: [drivePath] });
      const connectRouter = createConnectRouter({
        routeTree,
        store: scope,
        history,
        ...views,
        InnerWrap: ({ children }) => (
          <ScopeName value={name}>{children}</ScopeName>
        ),
      });
      const unbindScope = bindConnectRouter(connectRouter, scope);
      return { name, scope, history, ...connectRouter, unbindScope };
    });
    const [left, right] = scopes;
    const appNavigation = store.navigation;
    try {
      render(
        <PHStoreProvider store={store}>
          {scopes.map(({ name, scope, router }) => (
            <PHStoreProvider key={name} store={scope}>
              <RouterProvider router={router} />
            </PHStoreProvider>
          ))}
        </PHStoreProvider>,
      );
      const editor = (name: string) => within(screen.getByLabelText(name));
      const selectionOf = (name: string) =>
        editor(name).getByTestId("selection").textContent;
      await vi.waitFor(() => {
        expect(selectionOf("left")).toBe(`${drive.header.id}/-`);
        expect(selectionOf("right")).toBe(`${drive.header.id}/-`);
      });

      // Each scope's links come from its own router.
      expect(editor("left").getByRole("link").getAttribute("href")).toBe(
        `${drivePath}/first-${first.node.id}`,
      );

      act(() => {
        fireEvent.click(editor("left").getByText("open Second"));
      });
      await vi.waitFor(() =>
        expect(selectionOf("left")).toBe(`${drive.header.id}/${second.id}`),
      );
      act(() => {
        fireEvent.click(editor("right").getByRole("link"));
      });
      await vi.waitFor(() =>
        expect(selectionOf("right")).toBe(
          `${drive.header.id}/${first.node.id}`,
        ),
      );
      await settle(left.router);
      await settle(right.router);

      expect(selectionOf("left")).toBe(`${drive.header.id}/${second.id}`);
      expect(left.history.location.pathname).toBe(
        `${drivePath}/second-${second.id}`,
      );
      expect(right.history.location.pathname).toBe(
        `${drivePath}/first-${first.node.id}`,
      );
      // The app's selection and navigation are untouched.
      expect(store.selectedDriveId).toBeUndefined();
      expect(store.selectedNodeId).toBeUndefined();
      expect(store.navigation).toBe(appNavigation);
      // Each scope marks what its own router shows.
      const firstLink = (name: string) =>
        editor(name).getByRole("link").getAttribute("aria-current");
      expect(firstLink("right")).toBe("page");
      expect(firstLink("left")).toBeNull();
    } finally {
      for (const { unbindScope } of scopes) unbindScope();
    }
  });
});

describe("Connect routes added in code", () => {
  it("renders a code route beside the file routes and returns to it on back", async () => {
    const drive = await createDrive("Extra");
    store.drives = [drive];
    const { rootRoute } = connectRoutes(routeTree);
    const extraRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "extra",
      loader: ({ context }) => ({ drives: context.store.drives?.length ?? 0 }),
      component: function Extra() {
        const { drives } = extraRoute.useLoaderData();
        return <p data-testid="extra">extra {drives}</p>;
      },
    });
    addConnectRoutes([extraRoute]);
    addConnectRoutes([extraRoute]);
    expect(
      (rootRoute.children as unknown as unknown[]).filter(
        (r) => r === extraRoute,
      ),
    ).toHaveLength(1);

    const { router, history } = mount("/");
    await settle(router);
    act(() => {
      void router.navigate({ to: "/extra" as never });
    });
    await vi.waitFor(() =>
      expect(screen.getByTestId("extra").textContent).toBe("extra 1"),
    );
    act(() => setSelectedDrive(drive));
    await vi.waitFor(() => expect(selection()).toBe(`${drive.header.id}/-`));
    act(() => history.back());
    await vi.waitFor(() => expect(screen.getByTestId("extra")).toBeTruthy());
    expect(history.location.pathname).toBe("/extra");
    // A project's page shows no drive.
    await vi.waitFor(() => expect(store.selectedDriveId).toBeUndefined());
  });
});

describe("Connect route titles", () => {
  it("titles home, drive, folder and document, and follows a rename", async () => {
    const created = await createDrive("Titles");
    const { drive: withFolder, folder } = await createFolder(created, "Plans");
    const { drive, node } = await createFile(withFolder, "Notes");
    store.drives = [drive];
    const { router } = mount("/");
    await settle(router);
    await vi.waitFor(() => expect(document.title).toBe("Connect"));

    act(() => setSelectedDrive(drive));
    await vi.waitFor(() => expect(document.title).toBe("Titles · Connect"));
    act(() => setSelectedNode(folder));
    await vi.waitFor(() =>
      expect(document.title).toBe("Plans · Titles · Connect"),
    );
    act(() => setSelectedNode(node));
    await vi.waitFor(() =>
      expect(document.title).toBe("Notes · Titles · Connect"),
    );

    const renamed = await module.client.execute<DocumentDriveDocument>(
      drive.header.id,
      "main",
      [
        driveDocumentModelModule.actions.updateNode({
          id: node.id,
          name: "Minutes",
        }),
      ],
    );
    act(() => {
      store.drives = [renamed];
    });
    await vi.waitFor(() =>
      expect(document.title).toBe("Minutes · Titles · Connect"),
    );

    act(() => setSelectedDrive(undefined));
    await vi.waitFor(() => expect(document.title).toBe("Connect"));
  });
});

// A drive whose slug is empty or its id, as drives created without one have.
async function createUnsluggedDrive(name: string) {
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.slug = drive.header.id;
  drive.header.name = name;
  drive.state.global.name = name;
  return module.client.create<DocumentDriveDocument>(drive);
}

describe("Connect drive URLs", () => {
  it("links a drive without a slug as <name>-<id> and resolves both forms", async () => {
    const drive = await createUnsluggedDrive("Team Space");
    const id = drive.header.id;
    store.drives = [drive];
    const { router, history } = mount("/");
    await settle(router);

    expect(getPHNavigation().hrefFor?.({ driveSlug: drive.header.slug })).toBe(
      `/d/team-space-${id}`,
    );
    act(() => setSelectedDrive(drive));
    await vi.waitFor(() => expect(selection()).toBe(`${id}/-`));
    expect(history.location.pathname).toBe(`/d/team-space-${id}`);

    cleanup();
    unbind?.();
    const bare = mount(`/d/${id}`);
    await settle(bare.router);
    await vi.waitFor(() => expect(selection()).toBe(`${id}/-`));
  });

  it("leaves the open node of an unslugged drive alone when it is re-selected", async () => {
    const created = await createUnsluggedDrive("Plain Space");
    const { drive, node } = await createFile(created, "Note");
    const id = drive.header.id;
    store.drives = [drive];
    const path = `/d/plain-space-${id}/note-${node.id}?view=raw`;
    const { router, history } = mount(path);
    await settle(router);
    await vi.waitFor(() => expect(selection()).toBe(`${id}/${node.id}`));
    const push = vi.spyOn(history, "push");

    act(() => setSelectedNode(node));
    await settle(router);
    expect(push).not.toHaveBeenCalled();
    expect(`${history.location.pathname}${history.location.search}`).toBe(path);
  });

  it("opens a node of a drive with an empty slug", async () => {
    const created = await createUnsluggedDrive("Blank Slug");
    const { drive: stored, node } = await createFile(created, "Memo");
    // As a drive listed without a slug, e.g. from a remote, arrives.
    const drive = { ...stored, header: { ...stored.header, slug: "" } };
    const id = drive.header.id;
    store.drives = [drive];
    const { router, history } = mount(`/d/blank-slug-${id}`);
    await settle(router);
    await vi.waitFor(() => expect(selection()).toBe(`${id}/-`));

    act(() => setSelectedNode(node));
    await vi.waitFor(() => expect(selection()).toBe(`${id}/${node.id}`));
    expect(history.location.pathname).toBe(
      `/d/blank-slug-${id}/memo-${node.id}`,
    );
  });
});

describe("Connect canonical URLs", () => {
  it("replaces a bare document id with the document's slug, keeping the query", async () => {
    const created = await createDrive("Canon");
    const { drive, node } = await createFile(created, "Notes");
    store.drives = [drive];
    const { router, history } = mount(
      `/d/${drive.header.slug}/${node.id}?view=raw`,
    );
    await settle(router);
    await vi.waitFor(() =>
      expect(selection()).toBe(`${drive.header.id}/${node.id}`),
    );
    expect(history.location.pathname).toBe(
      `/d/${drive.header.slug}/notes-${node.id}`,
    );
    expect(history.location.search).toBe("?view=raw");
    // Replaced in place: no entry for the bare id to go back to.
    expect(history.length).toBe(1);
  });

  it("replaces a bare drive id with the drive's <name>-<id> slug", async () => {
    const drive = await createUnsluggedDrive("Team Space");
    store.drives = [drive];
    const { router, history } = mount(`/d/${drive.header.id}`);
    await settle(router);
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe(
        `/d/team-space-${drive.header.id}`,
      ),
    );
    expect(history.length).toBe(1);
  });

  it("keeps a readable drive id as the drive's URL, without a redirect", async () => {
    // Listed only: the reactor wants a derived id for a new drive.
    const drive = driveDocumentModelModule.utils.createDocument();
    const id = `vetra-${crypto.randomUUID().slice(0, 8)}`;
    drive.header.id = id;
    drive.header.slug = id;
    drive.header.name = "Vetra";
    drive.state.global.name = "Vetra";
    store.drives = [drive];
    const { router, history } = mount(`/d/${id}`);
    await settle(router);
    await vi.waitFor(() => expect(selection()).toBe(`${id}/-`));
    expect(history.location.pathname).toBe(`/d/${id}`);
    expect(history.length).toBe(1);
    expect(getPHNavigation().hrefFor?.({ driveSlug: id })).toBe(`/d/${id}`);
  });

  it("leaves a canonical URL as it is", async () => {
    const created = await createDrive("Steady");
    const { drive, node } = await createFile(created, "Plan");
    store.drives = [drive];
    const path = `/d/${drive.header.slug}/plan-${node.id}`;
    const { router, history } = mount(path);
    await settle(router);
    const replace = vi.spyOn(history, "replace");
    const push = vi.spyOn(history, "push");
    await act(() => router.invalidate());
    await settle(router);
    expect(history.location.pathname).toBe(path);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(history.length).toBe(1);
  });

  it("redirects a renamed document's old slug to its new one", async () => {
    const created = await createDrive("Renames");
    const { drive, node } = await createFile(created, "Draft");
    const renamed = await module.client.execute<DocumentDriveDocument>(
      drive.header.id,
      "main",
      [
        driveDocumentModelModule.actions.updateNode({
          id: node.id,
          name: "Final",
        }),
      ],
    );
    store.drives = [renamed];
    const { router, history } = mount(
      `/d/${drive.header.slug}/draft-${node.id}`,
    );
    await settle(router);
    await vi.waitFor(() =>
      expect(history.location.pathname).toBe(
        `/d/${drive.header.slug}/final-${node.id}`,
      ),
    );
    expect(selection()).toBe(`${drive.header.id}/${node.id}`);
  });
});
