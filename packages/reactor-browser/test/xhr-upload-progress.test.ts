import { createXhrUploadTransport } from "@powerhousedao/reactor-attachments/client";
import { describe, expect, it } from "vitest";

/**
 * The one test that proves the feature is real rather than well-typed: it runs
 * in headless chromium (this project sets `browser.enabled`), so
 * `XMLHttpRequest` and `xhr.upload.onprogress` are the browser's own, not a
 * fake. Node has no XMLHttpRequest at all, so no amount of unit testing
 * elsewhere can establish this.
 *
 * The request goes to the Vite server backing the test run. Its status is
 * irrelevant — what matters is that bytes were counted on the way out.
 */
describe("XMLHttpRequest upload progress in a real browser", () => {
  it("runs in chromium with a real XMLHttpRequest", () => {
    expect(navigator.userAgent).toContain("Chrome");
    expect(typeof XMLHttpRequest).toBe("function");
  });

  it("counts upload bytes for a multi-megabyte body", async () => {
    const body = new Blob([new Uint8Array(4 * 1024 * 1024)]);
    const observed: Array<[number, number]> = [];

    const response = await createXhrUploadTransport()({
      url: new URL("/__attachment-upload-progress-probe", location.href).href,
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body,
      onProgress: (loaded, total) => observed.push([loaded, total]),
    });

    // A transport that could not observe its bytes would report nothing.
    expect(observed.length).toBeGreaterThan(0);
    const [, total] = observed[observed.length - 1];
    expect(total).toBe(body.size);
    expect(observed[observed.length - 1][0]).toBe(body.size);
    // Non-decreasing, and never over the total.
    for (let i = 1; i < observed.length; i++) {
      expect(observed[i][0]).toBeGreaterThanOrEqual(observed[i - 1][0]);
      expect(observed[i][0]).toBeLessThanOrEqual(body.size);
    }
    // Whatever the server said, it answered: status 0 would have rejected.
    expect(response.status).toBeGreaterThan(0);
  });

  it("rejects an aborted upload with an AbortError", async () => {
    const controller = new AbortController();
    const pending = createXhrUploadTransport()({
      url: new URL("/__attachment-upload-progress-probe", location.href).href,
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: new Blob([new Uint8Array(8 * 1024 * 1024)]),
      signal: controller.signal,
    });
    // Synchronous: the transport has issued send() and registered its abort
    // listener by the time it returns, and the response cannot have arrived
    // before we yield. Aborting from a progress callback would race a
    // localhost upload that finishes in one event.
    controller.abort();

    const error = await pending.then(
      () => null,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });
});
