import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: [
      ...defaultExclude, 
      "test/__screenshots__/**",
      // Exclude browser-specific tests that need DOM/browser APIs
      "test/analytics.test.tsx", // Uses vitest-browser-react
      "test/reactor.test.ts", // Uses browser APIs (localforage)
    ],
    globals: true,
    environment: "node",
  },
  define: {
    "process.env": {},
  },
}); 