import { LOCAL_CHANNEL_TYPE } from "@powerhousedao/reactor";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor-browser";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserReactor } from "../src/utils/reactor.js";
import * as multiReactorFlag from "../src/utils/multi-reactor-flag.js";
import {
  buildWorkerConstruct,
  type WorkerReactorClientArgs,
} from "../src/reactor-worker-client.js";

vi.mock("../src/pglite.db.js", () => ({
  getReactorPGlite: () => Promise.resolve({}),
  recreateReactorPGlite: () => Promise.resolve({}),
}));

function stubRenown(): IRenown {
  const signer = {
    app: { name: "connect", key: "did:key:zDnaeTabKey" },
    user: undefined,
  } as unknown as ISigner;
  return { signer, user: undefined } as unknown as IRenown;
}

function buildBrowserReactor() {
  return createBrowserReactor(
    [],
    [],
    stubRenown(),
    {},
    undefined,
    undefined,
    {},
    undefined,
  );
}

describe("default (main-thread) path gates the local channel factory on the flag", () => {
  afterEach(() => vi.restoreAllMocks());

  it("flag OFF: builds the bare gql scheme, no additional local factory", async () => {
    vi.spyOn(multiReactorFlag, "isMultiReactorEnabled").mockReturnValue(false);
    const withAdditional = vi.spyOn(
      ReactorBuilder.prototype,
      "withAdditionalChannelFactory",
    );
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );

    await buildBrowserReactor();

    expect(withAdditional).not.toHaveBeenCalled();
  });

  it("flag ON: composes the local channel factory", async () => {
    vi.spyOn(multiReactorFlag, "isMultiReactorEnabled").mockReturnValue(true);
    const withAdditional = vi.spyOn(
      ReactorBuilder.prototype,
      "withAdditionalChannelFactory",
    );
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockResolvedValue(
      {} as Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>,
    );

    await buildBrowserReactor();

    expect(withAdditional).toHaveBeenCalledTimes(1);
    expect(withAdditional.mock.calls[0]?.[0]).toBe(LOCAL_CHANNEL_TYPE);
  });
});

describe("worker path threads the multiReactor flag into the construct", () => {
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

  it("carries multiReactor:false so the worker builds the bare gql scheme", () => {
    expect(buildWorkerConstruct(args(false)).multiReactor).toBe(false);
  });

  it("carries multiReactor:true so the worker composes the local factory", () => {
    expect(buildWorkerConstruct(args(true)).multiReactor).toBe(true);
  });
});
