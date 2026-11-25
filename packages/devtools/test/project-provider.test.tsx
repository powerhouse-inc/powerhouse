// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_POLL_MS,
  ProjectProvider,
  useDocumentModelDetail,
  useModuleKindBadge,
  useProject,
  useProjectFileList,
  useProjectModules,
  type ProjectResource,
  type ProjectView,
} from "../src/project/provider.js";
import { REQUEST_TIMEOUT_MS } from "../src/api-client.js";
import type { ProjectDocumentModelDetail, ProjectEditor } from "../src/api.js";
import {
  API,
  fileList,
  CUSTOMER_EDITOR,
  INVOICE_EDITOR,
  invoiceDetail,
  projectServer,
  requestsTo,
  serveProject,
  snapshot,
  type ProjectServer,
} from "./project.fixture.js";

let server: ProjectServer;
let fetchMock: ReturnType<typeof serveProject>;
let views: ProjectView[];
let visibility: DocumentVisibilityState;

function Probe() {
  views.push(useProject());
  return null;
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

async function mount(children = <Probe />) {
  const result = render(
    <ProjectProvider apiBase={API}>{children}</ProjectProvider>,
  );
  await advance(0);
  return result;
}

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

const view = () => views.at(-1);
const polls = () => requestsTo(fetchMock, "project").length;

beforeEach(() => {
  vi.useFakeTimers();
  views = [];
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  server = projectServer();
  fetchMock = serveProject(server);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.innerHTML = "";
});

describe("ProjectProvider", () => {
  it("is loading, then ready with the snapshot", async () => {
    await mount();
    expect(views[0]).toEqual({ state: "loading" });
    expect(view()).toEqual({ state: "ready", snapshot: snapshot() });
  });

  it("polls every 2 s and keeps the same snapshot while nothing changes", async () => {
    await mount();
    const first = view();
    await advance(PROJECT_POLL_MS - 1);
    expect(polls()).toBe(1);
    await advance(1);
    expect(polls()).toBe(2);
    await advance(PROJECT_POLL_MS);
    expect(polls()).toBe(3);
    expect(view()).toBe(first);
  });

  it("shows the new snapshot when the project changes", async () => {
    await mount();
    server.snapshot = snapshot({
      revision: "r2",
      editors: { ok: true, items: [INVOICE_EDITOR, CUSTOMER_EDITOR] },
    });
    await advance(PROJECT_POLL_MS);
    expect(view()).toEqual({ state: "ready", snapshot: server.snapshot });
  });

  it("keeps the last snapshot when a poll fails, and says why", async () => {
    await mount();
    server.failure = "network";
    await advance(PROJECT_POLL_MS);
    expect(view()).toEqual({
      state: "ready",
      snapshot: snapshot(),
      staleMessage: "Failed to fetch",
      staleCode: "unreachable",
    });

    server.failure = undefined;
    await advance(PROJECT_POLL_MS);
    expect(view()).toEqual({ state: "ready", snapshot: snapshot() });
  });

  it("is unavailable with the API's message when the first read fails, and retries", async () => {
    server.failure = { code: "internal", message: "EACCES: project root" };
    await mount();
    expect(view()).toEqual({
      state: "unavailable",
      code: "internal",
      message: "EACCES: project root",
    });

    server.failure = undefined;
    await advance(PROJECT_POLL_MS);
    expect(view()).toMatchObject({ state: "ready" });
  });

  it("stops asking a dev server that does not read the project", async () => {
    server.snapshot = undefined;
    await mount();
    expect(view()).toEqual({
      state: "unavailable",
      code: "not_found",
      message: "This dev server does not read the project's code.",
    });
    await advance(PROJECT_POLL_MS * 5);
    expect(polls()).toBe(1);
  });

  it.each(["bad_host", "bad_origin"] as const)(
    "stops asking a server that refuses the address the page was reached at (%s)",
    async (code) => {
      server.failure = { code, message: "Host is not loopback." };
      await mount();
      expect(view()).toMatchObject({ state: "unavailable", code });
      await advance(PROJECT_POLL_MS * 5);
      expect(polls()).toBe(1);
    },
  );

  it("stops asking once the server refuses the page's token", async () => {
    await mount();
    server.failure = {
      code: "bad_token",
      message: "The token does not match.",
    };
    await advance(PROJECT_POLL_MS);
    expect(view()).toMatchObject({ state: "ready", staleCode: "bad_token" });
    const asked = polls();
    await advance(PROJECT_POLL_MS * 5);
    setVisibility("hidden");
    setVisibility("visible");
    await advance(PROJECT_POLL_MS);
    expect(polls()).toBe(asked);
  });

  it("counts a server that never answers as a failed poll, and polls on", async () => {
    await mount();
    server.failure = "hang";
    await advance(PROJECT_POLL_MS);
    expect(polls()).toBe(2);
    await advance(REQUEST_TIMEOUT_MS);
    expect(view()).toEqual({
      state: "ready",
      snapshot: snapshot(),
      staleMessage: "The DevTools API did not answer in 45 s.",
      staleCode: "unreachable",
    });

    server.failure = undefined;
    await advance(PROJECT_POLL_MS);
    expect(polls()).toBe(3);
    expect(view()).toEqual({ state: "ready", snapshot: snapshot() });
  });

  it("pauses while the page is hidden and refreshes when it shows again", async () => {
    await mount();
    setVisibility("hidden");
    await advance(PROJECT_POLL_MS * 5);
    expect(polls()).toBe(1);

    server.snapshot = snapshot({ revision: "r2" });
    setVisibility("visible");
    await advance(0);
    expect(polls()).toBe(2);
    expect(view()).toMatchObject({ snapshot: { revision: "r2" } });
  });

  it("polls only while something reads the project", async () => {
    const { unmount } = await mount();
    unmount();
    await advance(PROJECT_POLL_MS * 5);
    expect(polls()).toBe(1);

    await mount(<p>no reader</p>);
    await advance(PROJECT_POLL_MS * 5);
    expect(polls()).toBe(1);
  });
});

describe("the project hooks", () => {
  it("gives the modules of one kind under their ids", async () => {
    const seen: unknown[] = [];
    function Modules() {
      seen.push(useProjectModules("processor"));
      return null;
    }
    await mount(<Modules />);
    expect(seen[0]).toBeUndefined();
    expect(seen.at(-1)).toMatchObject({
      ok: true,
      items: [
        { kind: "processor", id: "invoice-totals", name: "invoice-totals" },
      ],
    });
  });

  it("counts the modules with a check that did not pass", async () => {
    const badges: unknown[] = [];
    function Badge() {
      badges.push(useModuleKindBadge("editor"));
      return null;
    }
    await mount(<Badge />);
    expect(badges.at(-1)).toBeUndefined();

    server.snapshot = snapshot({
      revision: "r2",
      editors: { ok: true, items: [INVOICE_EDITOR, CUSTOMER_EDITOR] },
    });
    await advance(PROJECT_POLL_MS);
    expect(badges.at(-1)).toEqual({ count: 1, tone: "warn" });

    const broken: ProjectEditor = {
      ...CUSTOMER_EDITOR,
      id: "broken",
      checks: [
        { id: "definition", state: "fail", label: "module.ts not read" },
      ],
    };
    server.snapshot = snapshot({
      revision: "r3",
      editors: { ok: true, items: [INVOICE_EDITOR, CUSTOMER_EDITOR, broken] },
    });
    await advance(PROJECT_POLL_MS);
    expect(badges.at(-1)).toEqual({ count: 2, tone: "error" });
  });

  it("reads a model's detail, and again when the revision changes", async () => {
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/invoice"));
      return null;
    }
    await mount(<Detail />);
    const route = "project/document-models/acme%2Finvoice";
    expect(details[0]).toEqual({ state: "loading" });
    expect(details.at(-1)).toEqual({ state: "ready", data: invoiceDetail() });
    expect(requestsTo(fetchMock, route)).toHaveLength(1);

    await advance(PROJECT_POLL_MS * 2);
    expect(requestsTo(fetchMock, route)).toHaveLength(1);

    server.snapshot = snapshot({ revision: "r2" });
    server.details["acme/invoice"] = invoiceDetail({
      revision: "r2",
      description: "Edited.",
    });
    await advance(PROJECT_POLL_MS);
    expect(requestsTo(fetchMock, route)).toHaveLength(2);
    expect(details.at(-1)).toMatchObject({
      state: "ready",
      data: { description: "Edited." },
    });
    expect(details).not.toContainEqual({ state: "unavailable" });
  });

  it("keeps a model's detail when reading it again fails, and tries on every poll", async () => {
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/invoice"));
      return null;
    }
    await mount(<Detail />);
    const route = "project/document-models/acme%2Finvoice";

    server.snapshot = snapshot({ revision: "r2" });
    server.routeFailures = { [route]: { code: "internal", message: "EMFILE" } };
    await advance(PROJECT_POLL_MS);
    expect(details.at(-1)).toEqual({
      state: "ready",
      data: invoiceDetail(),
      staleMessage: "EMFILE",
    });
    expect(requestsTo(fetchMock, route)).toHaveLength(2);

    await advance(PROJECT_POLL_MS);
    expect(requestsTo(fetchMock, route)).toHaveLength(3);

    server.routeFailures = undefined;
    server.details["acme/invoice"] = invoiceDetail({ revision: "r2" });
    await advance(PROJECT_POLL_MS);
    expect(details.at(-1)).toEqual({
      state: "ready",
      data: invoiceDetail({ revision: "r2" }),
    });
    await advance(PROJECT_POLL_MS * 2);
    expect(requestsTo(fetchMock, route)).toHaveLength(4);
  });

  it("reads a detail that failed again once the poll gets through", async () => {
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/invoice"));
      return null;
    }
    const route = "project/document-models/acme%2Finvoice";
    server.routeFailures = { [route]: { code: "internal", message: "EMFILE" } };
    await mount(<Detail />);
    expect(details.at(-1)).toEqual({ state: "unavailable", message: "EMFILE" });

    server.routeFailures = undefined;
    await advance(PROJECT_POLL_MS);
    expect(details.at(-1)).toEqual({ state: "ready", data: invoiceDetail() });
  });

  it("stops reading a detail nothing shows any more", async () => {
    const route = "project/document-models/acme%2Finvoice";
    server.routeFailures = { [route]: { code: "internal", message: "EMFILE" } };
    function Detail() {
      useDocumentModelDetail("acme/invoice");
      return null;
    }
    const { rerender } = await mount(<Detail />);
    rerender(
      <ProjectProvider apiBase={API}>
        <Probe />
      </ProjectProvider>,
    );
    const asked = requestsTo(fetchMock, route).length;
    await advance(PROJECT_POLL_MS * 3);
    expect(requestsTo(fetchMock, route)).toHaveLength(asked);
  });

  it("lets go of a detail nothing shows, and reads it again when it shows", async () => {
    const route = "project/document-models/acme%2Finvoice";
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/invoice"));
      return null;
    }
    const { rerender } = await mount(<Detail />);
    expect(details.at(-1)).toEqual({ state: "ready", data: invoiceDetail() });
    rerender(
      <ProjectProvider apiBase={API}>
        <Probe />
      </ProjectProvider>,
    );
    await advance(PROJECT_POLL_MS);
    const asked = requestsTo(fetchMock, route).length;

    details.length = 0;
    rerender(
      <ProjectProvider apiBase={API}>
        <Detail />
      </ProjectProvider>,
    );
    await advance(0);

    expect(details[0]).toEqual({ state: "loading" });
    expect(details.at(-1)).toEqual({ state: "ready", data: invoiceDetail() });
    expect(requestsTo(fetchMock, route)).toHaveLength(asked + 1);
  });

  it("says why a detail is not read once the server refuses the page", async () => {
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/invoice"));
      return null;
    }
    const { rerender } = await mount();
    server.failure = {
      code: "bad_token",
      message: "The token does not match.",
    };
    await advance(PROJECT_POLL_MS);
    expect(view()).toMatchObject({ state: "ready", staleCode: "bad_token" });

    rerender(
      <ProjectProvider apiBase={API}>
        <Probe />
        <Detail />
      </ProjectProvider>,
    );
    await advance(0);

    expect(details.at(-1)).toEqual({
      state: "unavailable",
      message: "The token does not match.",
    });
  });

  it("gives the reason a model's detail could not be read", async () => {
    const details: ProjectResource<ProjectDocumentModelDetail>[] = [];
    function Detail() {
      details.push(useDocumentModelDetail("acme/missing"));
      return null;
    }
    await mount(<Detail />);
    expect(details.at(-1)).toEqual({
      state: "unavailable",
      message: 'No DevTools route "project/document-models/acme%2Fmissing".',
    });
  });

  it("asks once per revision for a model the project does not have", async () => {
    function Detail() {
      useDocumentModelDetail("acme/missing");
      return null;
    }
    await mount(<Detail />);
    const route = "project/document-models/acme%2Fmissing";
    await advance(PROJECT_POLL_MS * 3);
    expect(requestsTo(fetchMock, route)).toHaveLength(1);

    server.snapshot = snapshot({ revision: "r2" });
    await advance(PROJECT_POLL_MS);
    expect(requestsTo(fetchMock, route)).toHaveLength(2);
  });

  it("reads the file list once per revision", async () => {
    const seen: ProjectResource<unknown>[] = [];
    function Files() {
      seen.push(useProjectFileList());
      return null;
    }
    await mount(<Files />);
    expect(seen.at(-1)).toMatchObject({ state: "ready", data: fileList() });
    await advance(PROJECT_POLL_MS * 2);
    expect(requestsTo(fetchMock, "project/files")).toHaveLength(1);
  });
});
