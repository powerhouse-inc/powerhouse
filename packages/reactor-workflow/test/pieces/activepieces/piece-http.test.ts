// Spike S6a as a test, over the real adapter modules and published bundle.
// The bundle is fetched at runtime (CDN→npm, cached); skipped when offline.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildDescriptor } from "../../src/activepieces/descriptor.js";
import { buildActionContext } from "../../src/activepieces/context/action.js";
import { loadPieceFromDir } from "../../src/activepieces/loader.js";
import { getActions } from "../../src/activepieces/types.js";
import { fetchBundleForTest } from "./bundle-cache.js";

const bundleDir = await fetchBundleForTest(
  "@activepieces/piece-http",
  "0.11.19",
);

function requestProps(url: string, overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url,
    headers: {},
    queryParams: {},
    authType: "NONE",
    timeout: 10,
    failureMode: "continue_none",
    ...overrides,
  };
}

async function runSendRequest(propsValue: Record<string, unknown>) {
  const { piece } = await loadPieceFromDir(bundleDir);
  const { context, touched } = buildActionContext({ propsValue });
  const result = getActions(piece).send_request.run(context);
  return { result, touched };
}

describe.skipIf(!bundleDir)("piece-http (spike S6a)", () => {
  // The bundle pollutes NODE_TLS_REJECT_UNAUTHORIZED (spike finding) — restore it.
  const tlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", baseUrl);
      const respond = () => {
        res.writeHead(url.pathname === "/missing" ? 404 : 200, {
          "content-type": "application/json",
        });
        res.end(
          JSON.stringify({ query: Object.fromEntries(url.searchParams) }),
        );
      };
      if (url.pathname === "/slow") setTimeout(respond, 3_000);
      else respond();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (tlsEnv === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsEnv;
  });

  it("loads via the constructor-name duck-type check", async () => {
    const loaded = await loadPieceFromDir(bundleDir);
    expect(loaded.check).toBe("constructor-name");
    expect(loaded.piece.displayName).toBe("HTTP");
  });

  it("builds a serializable descriptor with resolver ids for dynamic props", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const descriptor = buildDescriptor(piece, {
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
    });

    expect(descriptor.id).toBe("activepieces:@activepieces/piece-http");
    expect(descriptor.triggerNames).toEqual([]);
    expect(descriptor.actions.map((a) => a.name).sort()).toEqual([
      "parse_url",
      "send_request",
    ]);

    const props = Object.fromEntries(
      (
        descriptor.actions.find((a) => a.name === "send_request")?.props ?? []
      ).map((p) => [p.name, p]),
    );
    expect(props.url).toMatchObject({ type: "SHORT_TEXT", required: true });
    // Spike correction to doc 09 §5.1: timeout is a NUMBER in seconds.
    expect(props.timeout).toMatchObject({ type: "NUMBER", required: false });
    expect(props.method.staticOptions?.map((o) => o.value)).toContain("GET");
    expect(props.authFields).toMatchObject({
      type: "DYNAMIC",
      hasDynamicResolver: true,
      dynamicResolverId:
        "activepieces:@activepieces/piece-http#send_request.authFields",
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it("executes end-to-end, touching only propsValue", async () => {
    const { result, touched } = await runSendRequest(
      requestProps(`${baseUrl}/echo`, { queryParams: { spike: "s6a" } }),
    );
    const output = (await result) as { status: number; body: unknown };
    expect(output.status).toBe(200);
    expect(output.body).toEqual({ query: { spike: "s6a" } });
    expect([...touched]).toEqual(["propsValue"]);
  });

  it("throws an HttpError-shaped error on HTTP failure", async () => {
    const { result } = await runSendRequest(requestProps(`${baseUrl}/missing`));
    const error: unknown = await result.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ status: 404 });
    expect((error as Error).constructor.name).toBe("HttpError");
  });

  it("throws a DOMException AbortError on timeout", async () => {
    const { result } = await runSendRequest(
      requestProps(`${baseUrl}/slow`, { timeout: 1 }),
    );
    const error: unknown = await result.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect((error as Error).constructor.name).toBe("DOMException");
    expect((error as Error).message).toMatch(/aborted/i);
  }, 15_000);

  it("converts failure into normal output under failureMode continue_all", async () => {
    const { result } = await runSendRequest(
      requestProps(`${baseUrl}/missing`, { failureMode: "continue_all" }),
    );
    const output = (await result) as { response: { status: number } };
    expect(output.response.status).toBe(404);
  });

  it("resolves DYNAMIC prop schemas out-of-band (S6b-lite)", async () => {
    const { piece } = await loadPieceFromDir(bundleDir);
    const authFields = getActions(piece).send_request.props?.authFields;
    const propertyContext = {
      searchValue: undefined,
      connections: { get: () => Promise.resolve(null) },
    };
    const resolve = (authType: string) =>
      authFields?.props?.({ authType }, propertyContext) as Promise<
        Record<string, unknown>
      >;

    await expect(resolve("NONE")).resolves.toEqual({});
    expect(Object.keys(await resolve("BASIC")).sort()).toEqual([
      "password",
      "username",
    ]);
    expect(Object.keys(await resolve("BEARER_TOKEN"))).toEqual(["token"]);
  });

  it("documents the TLS finding: the bundle disables verification process-wide", async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const { result } = await runSendRequest(requestProps(`${baseUrl}/echo`));
    await result;
    // If this stops holding, the bundles fixed it — revisit doc 08 §10 hardening.
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
  });
});
