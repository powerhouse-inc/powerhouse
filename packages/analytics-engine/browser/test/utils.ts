export const passthroughProfiler = () => ({
  prefix: "",
  push: (_system: string) => {},
  pop: () => {},
  record: async (metric: string, fn: () => Promise<any>) => await fn(),
});
