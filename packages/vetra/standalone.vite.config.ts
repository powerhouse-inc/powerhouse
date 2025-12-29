import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createLogger, defineConfig, type UserConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function viteLogger({
  silence,
}: {
  silence?: { warnings?: string[]; errors?: string[] };
}) {
  const logger = createLogger();
  const loggerWarn = logger.warn.bind(logger);
  const loggerError = logger.error.bind(logger);

  logger.warn = (msg, options) => {
    if (silence?.warnings?.some((warning) => msg.includes(warning))) {
      return;
    }
    loggerWarn(msg, options);
  };

  logger.error = (msg, options) => {
    if (silence?.errors?.some((error) => msg.includes(error))) {
      return;
    }
    loggerError(msg, options);
  };

  return logger;
}

const customLogger = viteLogger({
  silence: {
    warnings: [
      "@import must precede all other statements (besides @charset or empty @layer)", // tailwindcss error when importing font file
    ],
    errors: ["Unterminated string literal"],
  },
});

export default defineConfig(() => {
  const config: UserConfig = {
    base: "/",
    customLogger,
    appType: "spa",
    optimizeDeps: {
      exclude: ["@electric-sql/pglite", "node_modules/.vite"],
    },
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
      conditions: [
        "source",
        "development",
        "browser",
        "module",
        "jsnext:main",
        "jsnext",
      ],
    },
    plugins: [
      react(),
      nodePolyfills({
        include: ["events"],
        globals: {
          Buffer: false,
          global: false,
          process: true,
        },
      }),
      tailwindcss(),
    ],
    worker: {
      format: "es",
    },
  };

  return config;
});
