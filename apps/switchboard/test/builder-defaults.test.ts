import type { ISigner } from "@powerhousedao/shared/document-model";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type FactorySpec,
} from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk/node";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applySwitchboardReactorDefaults } from "../src/builder-defaults.mjs";
import {
  getRenownSignerConfig,
  getRenownWorkerSignerSpec,
} from "../src/renown.js";

const USER = { address: "0xswitchboard", networkId: "eip155", chainId: 1 };

function stubRenown(user = USER): IRenown {
  const signer = {
    user,
    app: { name: "switchboard", key: "did:key:zSwitchboard" },
  } as unknown as ISigner;
  return { signer } as unknown as IRenown;
}

describe("applySwitchboardReactorDefaults", () => {
  it("gives the reactor the signer and its worker spec", () => {
    const reactorBuilder = new ReactorBuilder();
    const clientBuilder = new ReactorClientBuilder();
    const reactorWithSigner = vi.spyOn(reactorBuilder, "withSigner");
    const clientWithSigner = vi.spyOn(clientBuilder, "withSigner");
    const signer = getRenownSignerConfig(stubRenown(), false, ".ph/key.json");

    applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      includeBaseModels: false,
      signalHandlers: false,
      signer,
    });

    expect(clientWithSigner).toHaveBeenCalledWith(signer);
    expect(reactorWithSigner).toHaveBeenCalledWith(
      signer.signer,
      signer.workerSigner,
    );
    expect(reactorBuilder.hasSigner()).toBe(true);
  });
});

describe("getRenownWorkerSignerSpec", () => {
  it("points workers at createNodeRenownSigner over the stored key", () => {
    const spec: FactorySpec = getRenownWorkerSignerSpec(
      stubRenown(),
      ".ph/key.json",
    );

    expect(spec.module.exportName).toBe("createNodeRenownSigner");
    const filePath = "filePath" in spec.module ? spec.module.filePath : "";
    expect(existsSync(filePath)).toBe(true);
    expect(spec.initArgs).toEqual({
      appName: "switchboard",
      keypairPath: resolve(".ph/key.json"),
      did: "did:key:zSwitchboard",
      user: USER,
    });
  });

  it("leaves the user out when none is logged in", () => {
    const renown = stubRenown();
    (renown.signer as { user?: unknown }).user = undefined;

    const spec = getRenownWorkerSignerSpec(renown);

    expect(spec.initArgs).toEqual({
      appName: "switchboard",
      keypairPath: resolve(".ph/.keypair.json"),
      did: "did:key:zSwitchboard",
    });
  });
});
