import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "graphql-ws/lib/use/ws": resolve(
        __dirname,
        "../../node_modules/graphql-ws/lib/use/ws.mjs",
      ),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/test/fault-injection-sync.test.js",
    ],
    deps: {
      optimizer: {
        web: {
          include: ["graphql-ws"],
        },
      },
    },
  },
  plugins: [
    {
      name: "graphql-path-resolver",
      resolveId(source, importer) {
        if (source.endsWith(".graphql")) {
          return resolve(dirname(importer || ""), source);
        }
        return null;
      },
      load(id) {
        if (id.endsWith(".graphql")) {
          const content = readFileSync(id, "utf-8");
          return `export default ${JSON.stringify(content)}`;
        }
        return null;
      },
    },
  ],
});
