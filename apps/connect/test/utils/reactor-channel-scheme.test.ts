import {
  channelFactoryTypes,
  CompositeChannelFactory,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
  ReactorBuilder,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import { ConsoleLogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureConnectChannelScheme } from "../../src/utils/reactor-channel-scheme.js";

const logger = new ConsoleLogger(["reactor-channel-scheme-test"]);

async function buildWith(multiReactor: boolean): Promise<{
  module: InProcessReactorModule;
  createLocalChannelFactory: ReturnType<typeof vi.fn>;
}> {
  const builder = new ReactorBuilder();
  const createLocalChannelFactory = vi.fn(
    () => new LocalChannelFactory(logger, () => undefined),
  );
  configureConnectChannelScheme(builder, {
    multiReactor,
    createLocalChannelFactory,
  });
  const module = await builder.buildModule();
  return { module, createLocalChannelFactory };
}

describe("configureConnectChannelScheme gates the local channel factory on the flag", () => {
  const built: InProcessReactorModule[] = [];

  afterEach(async () => {
    for (const module of built.splice(0)) {
      // kill() stops the executor, catch-up sweep and read models; await its
      // completion before destroying the store so no sweep queries a dead db.
      await module.reactor.kill().completed;
      await module.database.destroy();
    }
  });

  it("flag OFF builds the bare gql scheme: factory types [gql], no composite", async () => {
    const { module, createLocalChannelFactory } = await buildWith(false);
    built.push(module);

    const syncModule = module.syncModule;
    if (!syncModule) {
      throw new Error("expected a sync module on a CONNECT-scheme reactor");
    }
    expect(channelFactoryTypes(syncModule.channelFactory)).toEqual([
      GQL_CHANNEL_TYPE,
    ]);
    expect(syncModule.channelFactory).not.toBeInstanceOf(
      CompositeChannelFactory,
    );
    // No factory was even constructed on the flag-off path.
    expect(createLocalChannelFactory).not.toHaveBeenCalled();
  });

  it("flag ON composes the local factory: factory types [gql, local], composite", async () => {
    const { module, createLocalChannelFactory } = await buildWith(true);
    built.push(module);

    const syncModule = module.syncModule;
    if (!syncModule) {
      throw new Error("expected a sync module on a CONNECT-scheme reactor");
    }
    expect(syncModule.channelFactory).toBeInstanceOf(CompositeChannelFactory);
    const types = channelFactoryTypes(syncModule.channelFactory);
    expect(types).toContain(GQL_CHANNEL_TYPE);
    expect(types).toContain(LOCAL_CHANNEL_TYPE);
    expect(createLocalChannelFactory).toHaveBeenCalledTimes(1);
  });
});
