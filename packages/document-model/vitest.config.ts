import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: [
      { find: "#utils/env", replacement: `${srcPath}/document/utils/node.ts` },
      { find: /^#(.*)$/, replacement: `${srcPath}/$1` },
    ],
  },
});
