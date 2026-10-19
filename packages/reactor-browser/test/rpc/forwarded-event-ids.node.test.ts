import {
  EventBus,
  JobExecutorEventTypes,
  QueueEventTypes,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorEventTypes,
  SyncEventTypes,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { MessageRouter, createPortTransport } from "@powerhousedao/reactor/rpc";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { afterEach, describe, expect, it } from "vitest";
import { createReactorEventBusProxy } from "../../src/rpc/event-bus-proxy.js";
import {
  FORWARDED_BUS_EVENT_TYPES,
  FORWARDED_EVENT_TYPES,
} from "../../src/rpc/forwarded-events.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import { createP256Signer } from "../utils/p256-signer.js";

function tick(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("worker -> tab forwarded event ids", () => {
  let module: InProcessReactorClientModule | undefined;
  const channels: MessageChannel[] = [];
  const disposers: Array<() => void> = [];

  afterEach(async () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    channels.length = 0;
    if (module) await module.reactor.kill().completed;
    module = undefined;
  });

  it("does not forward executor job events to tabs as sync events", async () => {
    const eventBus = new EventBus();
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withEventBus(eventBus)
          .withDocumentModelSources([driveDocumentModelModule]),
      )
      .withSigner(await createP256Signer())
      .buildModule();

    const host = new ReactorHost({ client: module.client });
    for (const type of FORWARDED_EVENT_TYPES) {
      eventBus.subscribe(type, (forwardedType, event) =>
        host.broadcastBusEvent(forwardedType, event),
      );
    }

    const channel = new MessageChannel();
    channels.push(channel);
    disposers.push(host.connect(createPortTransport(channel.port1)));
    const router = new MessageRouter();
    router.attach(createPortTransport(channel.port2));
    const tabBus = createReactorEventBusProxy(router);

    const received: Array<{ type: number; event: unknown }> = [];
    for (const type of [
      SyncEventTypes.SYNC_PENDING,
      SyncEventTypes.SYNC_SUCCEEDED,
      SyncEventTypes.SYNC_FAILED,
      SyncEventTypes.DEAD_LETTER_ADDED,
    ]) {
      tabBus.subscribe(type, (t, event) => {
        received.push({ type: t, event });
      });
    }

    let executorCompleted = 0;
    eventBus.subscribe(JobExecutorEventTypes.JOB_COMPLETED, () => {
      executorCompleted++;
    });

    await module.client.create(driveDocumentModelModule.utils.createDocument());
    await tick();

    expect(executorCompleted).toBeGreaterThan(0);
    expect(received).toEqual([]);
  });

  it("gives every bus event family a disjoint id", () => {
    const ids = [
      ...Object.values(QueueEventTypes),
      ...Object.values(ReactorEventTypes),
      ...Object.values(JobExecutorEventTypes),
      ...Object.values(SyncEventTypes),
      ...FORWARDED_BUS_EVENT_TYPES.filter(
        (id) => !(FORWARDED_EVENT_TYPES as readonly number[]).includes(id),
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
