export interface IAnalyticsProfiler {
  get prefix(): string;

  push: (system: string) => void;
  pop: () => void;
  popAndReturn: (result: any) => any;

  record: <T>(metric: string, fn: () => Promise<T>) => Promise<T>;
  recordSync: <T>(metric: string, fn: () => T) => T;
}

export class AnalyticsProfiler implements IAnalyticsProfiler {
  private readonly _stack: string[] = [];
  private _prefix: string = "";

  constructor(
    private readonly _ns: string,
    private readonly _logger: (metricName: string, ms: number) => void,
  ) {
    this._prefix = _ns;
  }

  get prefix(): string {
    return this._prefix;
  }

  push(system: string): void {
    this._stack.push(system);

    this.updatePrefix();
  }

  pop(): void {
    if (this._stack.pop()) {
      this.updatePrefix();
    }
  }

  popAndReturn(result: any): any {
    this.pop();

    return result;
  }

  async record<T>(metric: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const fullMetric = `${this.prefix}.${metric}`;

    try {
      return await fn();
    } finally {
      this._logger(fullMetric, performance.now() - start);
    }
  }

  recordSync<T>(metric: string, fn: () => T): T {
    const start = performance.now();
    const fullMetric = `${this.prefix}.${metric}`;

    try {
      return fn();
    } finally {
      this._logger(fullMetric, performance.now() - start);
    }
  }

  updatePrefix(): void {
    if (this._stack.length > 0) {
      this._prefix = `${this._ns}.${this._stack.join(".")}`;
    } else {
      this._prefix = this._ns;
    }
  }
}

export class PassthroughAnalyticsProfiler implements IAnalyticsProfiler {
  get prefix(): string {
    return "";
  }

  push(system: string) {
    //
  }

  pop() {
    //
  }

  popAndReturn(result: any) {
    return result;
  }

  async record<T>(metric: string, fn: () => Promise<T>) {
    return await fn();
  }

  recordSync<T>(metric: string, fn: () => T) {
    return fn();
  }
}
