type Listener = (event: unknown) => void;

/**
 * Minimal XMLHttpRequest stand-in. Nothing is sent anywhere: the test drives
 * the lifecycle by hand, which is the only way to assert ordering (listeners
 * attached before `send`) and the status-0 cases a real server cannot produce.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  status = 0;
  statusText = "";
  responseText = "";
  responseTypeAssigned = false;

  readonly openArgs: unknown[] = [];
  readonly headers: Array<[string, string]> = [];
  sentBody: unknown;
  sentAt = -1;
  aborted = false;

  private readonly listeners = new Map<string, Listener[]>();
  private readonly uploadListeners = new Map<string, Listener[]>();
  private attachOrder: string[] = [];

  readonly upload = {
    addEventListener: (type: string, listener: Listener) => {
      this.attachOrder.push(`upload:${type}`);
      const existing = this.uploadListeners.get(type) ?? [];
      existing.push(listener);
      this.uploadListeners.set(type, existing);
    },
  };

  constructor() {
    FakeXhr.instances.push(this);
  }

  set responseType(_value: string) {
    this.responseTypeAssigned = true;
  }

  open(...args: unknown[]): void {
    this.openArgs.push(...args);
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.push([name, value]);
  }

  addEventListener(type: string, listener: Listener): void {
    this.attachOrder.push(type);
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(body: unknown): void {
    this.sentBody = body;
    this.sentAt = this.attachOrder.length;
  }

  abort(): void {
    this.aborted = true;
    this.emit("abort", {});
  }

  /** Listener types registered before `send` was called. */
  get listenersBeforeSend(): string[] {
    return this.attachOrder.slice(0, this.sentAt === -1 ? 0 : this.sentAt);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  emitUploadProgress(loaded: number, total: number, lengthComputable = true) {
    for (const listener of this.uploadListeners.get("progress") ?? []) {
      listener({ loaded, total, lengthComputable });
    }
  }

  complete(status: number, statusText: string, responseText = ""): void {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.emit("load", {});
  }
}

function installFakeXhr(): void {
  FakeXhr.instances = [];
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
}

export { FakeXhr, installFakeXhr };
