import { describe, expect, it } from "vitest";
import {
  isWorkerBundleResponse,
  packagedReactorWorkerUrl,
} from "../../src/utils/reactor-worker-url.js";

describe("packagedReactorWorkerUrl", () => {
  it("joins the root base without doubling slashes", () => {
    expect(packagedReactorWorkerUrl("/", "https://example.test").href).toBe(
      "https://example.test/__reactor_worker__/reactor.worker.js",
    );
  });

  it("keeps a subpath deploy base", () => {
    expect(packagedReactorWorkerUrl("/app/", "https://example.test").href).toBe(
      "https://example.test/app/__reactor_worker__/reactor.worker.js",
    );
  });
});

describe("isWorkerBundleResponse", () => {
  it("accepts an ok JavaScript response", () => {
    expect(
      isWorkerBundleResponse({ ok: true, contentType: "text/javascript" }),
    ).toBe(true);
    expect(
      isWorkerBundleResponse({
        ok: true,
        contentType: "application/javascript; charset=utf-8",
      }),
    ).toBe(true);
  });

  it("rejects an SPA fallback: 200 with an HTML body", () => {
    expect(
      isWorkerBundleResponse({
        ok: true,
        contentType: "text/html; charset=utf-8",
      }),
    ).toBe(false);
  });

  it("rejects errors and missing content types", () => {
    expect(isWorkerBundleResponse({ ok: false, contentType: null })).toBe(
      false,
    );
    expect(isWorkerBundleResponse({ ok: true, contentType: null })).toBe(false);
  });
});
