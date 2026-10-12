import { LOCAL_CHANNEL_TYPE } from "@powerhousedao/reactor";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor-browser";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkerConstruct,
  type WorkerReactorClientArgs,
} from "../src/reactor-worker-client.js";
import { createBrowserReactor } from "../src/utils/reactor.js";

vi.mock("../src/pglite.db.js", () => ({
  getReactorPGlite: () => Promise.resolve({}),
  discardReactorPGlite: () => Promise.resolve(),
}));

function stubRenown(): IRenown {
  const signer = {
    app: { name: "connect", key: "did:key:zDnaeTabKey" },
    user: undefined,
  } as unknown as ISigner;
  return { signer, user: undefined } as unknown as IRenown;
}

async function buildBrowserReactor(multiReactor?: boolean) {
  const withAdditional = vi.spyOn(
    ReactorBuilder.prototype,
    "withAdditionalChannelFactory",
  );
  vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
    {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
  );
  await createBrowserReactor(
    [],
    [],
    stubRenown(),
    {},
    undefined,
    undefined,
    {},
    undefined,
    multiReactor,
  );
  return withAdditional;
}

describe("main-thread reactor gates the local channel factory on the flag", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds the bare scheme when the flag is absent", async () => {
    const withAdditional = await buildBrowserReactor();
    expect(withAdditional).not.toHaveBeenCalled();
  });

  it("builds the bare scheme with the flag off", async () => {
    const withAdditional = await buildBrowserReactor(false);
    expect(withAdditional).not.toHaveBeenCalled();
  });

  it("composes the local channel factory with the flag on", async () => {
    const withAdditional = await buildBrowserReactor(true);
    expect(withAdditional).toHaveBeenCalledTimes(1);
    expect(withAdditional.mock.calls[0]?.[0]).toBe(LOCAL_CHANNEL_TYPE);
  });
});

describe("worker construct carries the multiReactor flag", () => {
  function args(multiReactor: boolean): WorkerReactorClientArgs {
    return {
      namespace: "ns",
      relationalNamespace: "rel",
      cdnUrl: "",
      packageSpecs: [],
      featureFlags: {},
      multiReactor,
      documentModelModules: [],
      upgradeManifests: [],
      documentModelLoader: {
        load: () => Promise.reject(new Error("unused")),
      },
      renown: stubRenown(),
      onReload: () => undefined,
    };
  }

  it("carries it off", () => {
    expect(buildWorkerConstruct(args(false)).multiReactor).toBe(false);
  });

  it("carries it on", () => {
    expect(buildWorkerConstruct(args(true)).multiReactor).toBe(true);
  });
});
