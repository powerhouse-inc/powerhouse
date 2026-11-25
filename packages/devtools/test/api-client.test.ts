// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchProjectFileList,
  fetchProjectDocumentModel,
  fetchProjectSnapshot,
  REQUEST_TIMEOUT_MS,
} from "../src/api-client.js";
import {
  addToken,
  API,
  fileList,
  invoiceDetail,
  projectServer,
  requestsTo,
  serveProject,
  snapshot,
} from "./project.fixture.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

const headersOf = (call: Parameters<typeof fetch>) =>
  new Headers(call[1]?.headers);

describe("the project client", () => {
  it("reads the snapshot with the page's token", async () => {
    const fetchMock = serveProject(projectServer());

    const result = await fetchProjectSnapshot(API);

    expect(result).toEqual({
      ok: true,
      data: { modified: true, snapshot: snapshot() },
    });
    const [request] = requestsTo(fetchMock, "project");
    expect(headersOf(request).get("x-ph-devtools-token")).toBe("token");
    expect(headersOf(request).has("if-none-match")).toBe(false);
  });

  it("sends the revision it holds and reports that nothing changed", async () => {
    const fetchMock = serveProject(projectServer());

    const result = await fetchProjectSnapshot(API, "r1");

    expect(result).toEqual({ ok: true, data: { modified: false } });
    const [request] = requestsTo(fetchMock, "project");
    expect(headersOf(request).get("if-none-match")).toBe('"r1"');
  });

  it("returns the new snapshot when the revision it holds is old", async () => {
    serveProject(projectServer({ snapshot: snapshot({ revision: "r2" }) }));

    const result = await fetchProjectSnapshot(API, "r1");

    expect(result).toMatchObject({
      ok: true,
      data: { modified: true, snapshot: { revision: "r2" } },
    });
  });

  it("reads one document model by its escaped document type", async () => {
    const fetchMock = serveProject(projectServer());

    const result = await fetchProjectDocumentModel(API, "acme/invoice");

    expect(result).toEqual({ ok: true, data: invoiceDetail() });
    expect(
      requestsTo(fetchMock, "project/document-models/acme%2Finvoice"),
    ).toHaveLength(1);
  });

  it("reads each module's files", async () => {
    serveProject(projectServer());
    expect(await fetchProjectFileList(API)).toEqual({
      ok: true,
      data: fileList(),
    });
  });

  it("returns the API's error code and message", async () => {
    serveProject(projectServer());
    expect(await fetchProjectDocumentModel(API, "acme/missing")).toEqual({
      ok: false,
      code: "not_found",
      message: 'No DevTools route "project/document-models/acme%2Fmissing".',
    });

    serveProject(
      projectServer({ failure: { code: "internal", message: "EACCES" } }),
    );
    expect(await fetchProjectSnapshot(API, "r1")).toEqual({
      ok: false,
      code: "internal",
      message: "EACCES",
    });
  });

  it("says the API is unreachable when the request fails", async () => {
    serveProject(projectServer({ failure: "network" }));
    expect(await fetchProjectSnapshot(API)).toEqual({
      ok: false,
      code: "unreachable",
      message: "Failed to fetch",
    });
  });

  it("says so when something other than the API answers", async () => {
    addToken();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<!doctype html>"))),
    );
    expect(await fetchProjectFileList(API)).toEqual({
      ok: false,
      code: "unreachable",
      message: "The DevTools API answered HTTP 200 without JSON.",
    });
  });

  it.each([
    ["the snapshot", () => fetchProjectSnapshot(API, "r1")],
    ["a document model", () => fetchProjectDocumentModel(API, "acme/invoice")],
    ["the file list", () => fetchProjectFileList(API)],
  ])("gives up on %s when the server does not answer", async (_name, ask) => {
    vi.useFakeTimers();
    serveProject(projectServer({ failure: "hang" }));
    const settled = vi.fn();
    const asked = ask().then((result) => {
      settled();
      return result;
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await asked).toEqual({
      ok: false,
      code: "unreachable",
      message: "The DevTools API did not answer in 45 s.",
    });
  });

  it("gives up at once when the caller aborts", async () => {
    serveProject(projectServer({ failure: "hang" }));
    const controller = new AbortController();
    const asked = fetchProjectSnapshot(API, undefined, controller.signal);
    controller.abort();
    expect(await asked).toMatchObject({ ok: false, code: "unreachable" });
  });

  it("asks nothing without the page's token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchProjectSnapshot(API)).toMatchObject({
      ok: false,
      code: "no_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
