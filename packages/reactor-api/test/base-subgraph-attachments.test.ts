import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import type { IAttachmentClientProvider } from "../src/services/authorized-attachment.service.js";

function makeProvider() {
  const forSubject = vi.fn(
    (_subject: AuthSubject) => ({}) as IAttachmentClient,
  );
  const provider: IAttachmentClientProvider = { forSubject };
  return { provider, forSubject };
}

function subgraph(attachments?: IAttachmentClientProvider): BaseSubgraph {
  return new BaseSubgraph({
    reactorClient: {},
    attachments,
  } as unknown as SubgraphArgs);
}

function anonymous(): Context {
  return { headers: {}, db: undefined };
}

function signedIn(address: string, appKey: string): Context {
  return {
    headers: {},
    db: undefined,
    user: { address, appKey, chainId: 1, networkId: "eip155" },
  };
}

describe("BaseSubgraph.attachmentsFor", () => {
  it("returns the same client for one request", () => {
    const { provider, forSubject } = makeProvider();
    const sg = subgraph(provider);
    const ctx = anonymous();

    expect(sg.attachmentsFor(ctx)).toBe(sg.attachmentsFor(ctx));
    expect(forSubject).toHaveBeenCalledOnce();
  });

  it("returns a different client for each request", () => {
    const { provider, forSubject } = makeProvider();
    const sg = subgraph(provider);

    expect(sg.attachmentsFor(anonymous())).not.toBe(
      sg.attachmentsFor(anonymous()),
    );
    expect(forSubject).toHaveBeenCalledTimes(2);
  });

  it("binds an anonymous request to the empty subject", () => {
    const { provider, forSubject } = makeProvider();

    subgraph(provider).attachmentsFor(anonymous());

    expect(forSubject).toHaveBeenCalledWith({
      address: undefined,
      key: undefined,
    });
  });

  it("binds a signed-in request to its address and app key", () => {
    const { provider, forSubject } = makeProvider();

    subgraph(provider).attachmentsFor(signedIn("0xabc", "did:key:app"));

    expect(forSubject).toHaveBeenCalledWith({
      address: "0xabc",
      key: "did:key:app",
    });
  });

  it("throws when the host provides no attachment client", () => {
    expect(() => subgraph().attachmentsFor(anonymous())).toThrow(
      "This host provides no attachment client to subgraphs",
    );
  });
});
