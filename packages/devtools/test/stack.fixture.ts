import type { DevStackInfo } from "../src/api.js";

/** What the API's `info` route answers, with `over` in place of its parts. */
export const stackInfo = (over: Partial<DevStackInfo> = {}): DevStackInfo => ({
  project: { name: "test-package", version: "1.2.3" },
  ph: { version: "6.3.0" },
  app: { url: "http://localhost:3001/" },
  switchboard: { url: "http://localhost:4002/graphql" },
  mcp: { url: null },
  startedAt: null,
  ...over,
});
