import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig } from "../../src/sync/types.js";
import { TestChannel } from "./channels/test-channel.js";

describe("sync admin exposure", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  it("exposes the in-process sync manager as the module's sync admin", async () => {
    const channelFactory: IChannelFactory = {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ) => new TestChannel(remoteId, remoteName, cursorStorage, () => {}),
    };

    module = await new ReactorBuilder()
      .withSync(new SyncBuilder().withChannelFactory(channelFactory))
      .buildModule();

    expect(module.syncModule?.syncAdmin).toBeDefined();
    expect(module.syncModule?.syncAdmin).toBe(module.syncModule?.syncManager);
  });
});
