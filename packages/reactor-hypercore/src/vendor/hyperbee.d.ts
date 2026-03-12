declare module "hyperbee" {
  interface HyperbeeOptions {
    keyEncoding?: string;
    valueEncoding?: string;
  }

  interface RangeOptions {
    gt?: string;
    gte?: string;
    lt?: string;
    lte?: string;
    limit?: number;
    reverse?: boolean;
  }

  interface HyperbeeEntry<V = unknown> {
    key: string;
    value: V;
    seq: number;
  }

  interface HyperbeeReadStream<V = unknown> {
    [Symbol.asyncIterator](): AsyncIterableIterator<HyperbeeEntry<V>>;
  }

  interface HyperbeeBatch {
    put(key: string, value: unknown): Promise<void>;
    del(key: string): Promise<void>;
    get(key: string): Promise<HyperbeeEntry | null>;
    flush(): Promise<void>;
  }

  class Hyperbee {
    constructor(core: unknown, options?: HyperbeeOptions);

    ready(): Promise<void>;
    close(): Promise<void>;

    get version(): number;
    get writable(): boolean;
    get readable(): boolean;

    put(key: string, value: unknown): Promise<void>;
    get(key: string): Promise<HyperbeeEntry | null>;
    del(key: string): Promise<void>;
    batch(): HyperbeeBatch;

    createReadStream(range?: RangeOptions): HyperbeeReadStream;
    peek(range?: RangeOptions): Promise<HyperbeeEntry | null>;

    sub(prefix: string, options?: HyperbeeOptions): Hyperbee;
  }

  export = Hyperbee;
}
