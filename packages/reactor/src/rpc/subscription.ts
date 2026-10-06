import type { MessageRouter } from "./message-router.js";
import type { ClientMessage, CorrelationId, OwnerMessage } from "./protocol.js";

export class SubscriptionStore {
  private readonly map = new Map<CorrelationId, () => void>();

  set(id: CorrelationId, unsubscribe: () => void): void {
    this.map.set(id, unsubscribe);
  }

  get(id: CorrelationId): (() => void) | undefined {
    return this.map.get(id);
  }

  delete(id: CorrelationId): void {
    this.map.delete(id);
  }

  end(id: CorrelationId): void {
    const unsubscribe = this.map.get(id);
    if (unsubscribe) {
      this.map.delete(id);
      unsubscribe();
    }
  }

  drain(): void {
    for (const unsubscribe of this.map.values()) {
      unsubscribe();
    }
    this.map.clear();
  }
}

export interface ICorrelatedSubscriptions<Sub> {
  subscribe(sub: Sub, open: (id: CorrelationId) => ClientMessage): () => void;
}

export interface CorrelatedConfig<
  Sub,
  EK extends OwnerMessage["k"],
  ErrK extends OwnerMessage["k"],
> {
  idPrefix: string;
  eventKind: EK;
  errKind: ErrK;
  onEvent: (sub: Sub, message: Extract<OwnerMessage, { k: EK }>) => void;
  onError: (sub: Sub, message: Extract<OwnerMessage, { k: ErrK }>) => void;
  close: (id: CorrelationId) => ClientMessage;
}

export function createCorrelatedSubscriptions<
  Sub,
  EK extends OwnerMessage["k"],
  ErrK extends OwnerMessage["k"],
>(
  router: MessageRouter,
  config: CorrelatedConfig<Sub, EK, ErrK>,
): ICorrelatedSubscriptions<Sub> {
  let counter = 0;
  const subs = new Map<CorrelationId, Sub>();

  router.on(config.eventKind, (message) => {
    const sub = subs.get((message as { id: CorrelationId }).id);
    if (sub) {
      config.onEvent(sub, message);
    }
  });
  router.on(config.errKind, (message) => {
    const id = (message as { id: CorrelationId }).id;
    const sub = subs.get(id);
    if (sub) {
      subs.delete(id);
      router.post(config.close(id));
      config.onError(sub, message);
    }
  });

  return {
    subscribe(sub, open) {
      const id: CorrelationId = `${config.idPrefix}${++counter}`;
      subs.set(id, sub);
      router.post(open(id));
      return () => {
        subs.delete(id);
        router.post(config.close(id));
      };
    },
  };
}
