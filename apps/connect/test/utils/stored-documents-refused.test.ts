import { UnsupportedStoredProtocolError } from "@powerhousedao/reactor";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor-browser";
import { fromErrorInfo, toErrorInfo } from "@powerhousedao/reactor-browser/rpc";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserReactor } from "../../src/utils/reactor.js";
import {
  isStoredDocumentsRefused,
  StoredDocumentsRefusedError,
  toStoredDocumentsRefused,
} from "../../src/utils/stored-documents-refused.js";

vi.mock("../../src/pglite.db.js", () => ({
  getReactorPGlite: () => Promise.resolve({}),
  discardReactorPGlite: () => Promise.resolve(),
}));

const REFUSAL = new UnsupportedStoredProtocolError(
  [{ protocol: "base-reducer", version: 7 }],
  3,
);

function stubRenown(): IRenown {
  const signer = {
    app: { name: "connect", key: "did:key:zDnaeTabKey" },
    user: undefined,
  } as unknown as ISigner;
  return { signer, user: undefined } as unknown as IRenown;
}

function build(mode?: "refuse" | "read-only") {
  return createBrowserReactor(
    [],
    [],
    stubRenown(),
    {},
    undefined,
    undefined,
    {},
    mode,
  );
}

describe("a refused boot", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names the versions, the count and both ways forward", () => {
    const error = toStoredDocumentsRefused(REFUSAL);

    expect(error).toBeInstanceOf(StoredDocumentsRefusedError);
    expect((error as Error).message).toBe(
      "This browser holds 3 document(s) that require base-reducer 7, which this version of Connect does not run. " +
        'Open them with a Connect build that runs base-reducer 7, or set connect.reactor.unsupportedStoredDocuments to "read-only" in powerhouse.config.json to open them read-only.',
    );
    expect((error as Error).cause).toBe(REFUSAL);
  });

  it("passes other errors through", () => {
    const other = new Error("boom");

    expect(toStoredDocumentsRefused(other)).toBe(other);
    expect(isStoredDocumentsRefused(other)).toBe(false);
  });

  it("is still recognised after crossing the worker boundary", () => {
    const crossed = fromErrorInfo(
      toErrorInfo(toStoredDocumentsRefused(REFUSAL)),
    );

    expect(isStoredDocumentsRefused(crossed)).toBe(true);
    expect(crossed.message).toContain("base-reducer 7");
  });

  it("reaches the main-thread reactor's builder", async () => {
    const withMode = vi.spyOn(
      ReactorBuilder.prototype,
      "withUnsupportedStoredDocuments",
    );
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );

    await build("read-only");

    expect(withMode).toHaveBeenCalledWith("read-only");
  });

  it("leaves the reactor's default when unset", async () => {
    const withMode = vi.spyOn(
      ReactorBuilder.prototype,
      "withUnsupportedStoredDocuments",
    );
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );

    await build();

    expect(withMode).not.toHaveBeenCalled();
  });

  it("fails the main-thread boot with the rewritten refusal", async () => {
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockRejectedValue(
      REFUSAL,
    );

    await expect(build()).rejects.toBeInstanceOf(StoredDocumentsRefusedError);
  });
});
