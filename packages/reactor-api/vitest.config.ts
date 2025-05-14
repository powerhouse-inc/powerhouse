import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "graphql-path-resolver",
      resolveId(source, importer) {
        if (source.endsWith(".graphql")) {
          // Resolve the path relative to the the file that imports the .graphql file
          return resolve(
            dirname(importer || ""),
            `${source.startsWith("/") ? `.${source}` : source}.graphql`,
          );
        }
        return null; // Let other resolvers handle other imports
      },
      load(id) {
        if (id.endsWith(".graphql")) {
          // Return the file path as a string, which Vite will use as the resolved module
          return `export default ${JSON.stringify(id)}`;
        }
        return null; // Let other loaders handle other files
      },
    },
  ],
  test: {
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
  },
});
