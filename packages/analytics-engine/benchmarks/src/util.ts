interface FnOptions {
  beforeAll?: () => void | Promise<void>;
  beforeEach?: () => void | Promise<void>;
  afterAll?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

export const logs = (name: string, opts?: FnOptions) => ({
  beforeEach: () => {
    console.log(`Starting run of ${name}...`);

    if (opts?.beforeEach) {
      return opts.beforeEach();
    }
  },
  afterAll: () => {
    console.log(`Finished all runs of ${name}.`);

    if (opts?.afterAll) {
      return opts.afterAll();
    }
  },
});
