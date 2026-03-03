export const passthroughProfiler = () => ({
  prefix: "",
  push: (system: string) => {},
  pop: () => {},
  record: async (metric: string, fn: () => Promise<any>) => await fn(),
});
