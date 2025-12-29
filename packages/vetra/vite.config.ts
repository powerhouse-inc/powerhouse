// import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import {
  createLogger,
  defineConfig,
  mergeConfig,
  type HotPayload,
  type Plugin,
  type UserConfig,
} from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function traceFullReload(): Plugin {
  return {
    name: "trace-full-reload",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      const originalSend = server.ws.send.bind(server.ws);

      server.ws.send = (payload: HotPayload) => {
        if (payload?.type === "full-reload") {
          const triggeredBy = payload.triggeredBy ?? payload.path;
          server.config.logger.warn(
            `[trace-full-reload] full-reload sent (path=${payload.path}) (triggeredBy=${triggeredBy})`,
          );

          // Print a stack trace to identify who called server.ws.send(...)
          const err = new Error("full-reload stack trace");
          // Trim noisy frames if you want; start simple
          console.warn(err.stack);
        }
        return originalSend(payload);
      };
    },
    handleHotUpdate(ctx) {
      // This shows you which file is causing hot-update processing.
      if (
        ctx.file.includes(
          "editors/vetra-drive-app/components/PackageInformationSection.tsx",
        )
      ) {
        ctx.server.config.logger.info(
          `[trace-full-reload] handleHotUpdate called for ${ctx.file}`,
        );
      }
    },
  };
}

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

export default defineConfig(({ mode }) => {
  const baseConnectViteConfig = {}; //getConnectBaseViteConfig({
  //   mode,
  //   dirname: import.meta.dirname,
  // });
  console.log(path.resolve(__dirname, "../.."));

  const monorepoRoot = path.resolve(__dirname, "../..");
  const designSystemDir = path.resolve(monorepoRoot, "packages/design-system");
  const connectDir = path.resolve(monorepoRoot, "apps/connect");

  const additionalViteConfig: UserConfig = {
    base: "/",
    customLogger,
    appType: "spa",
    optimizeDeps: {
      exclude: ["@electric-sql/pglite", "node_modules/.vite"],
    },
    server: {
      fs: {
        // critical: allow serving & watching workspace sources outside root
        allow: [monorepoRoot],
      },
    },
    resolve: {
      alias: {
        // adjust to wherever the source entry actually lives
        "@powerhousedao/design-system/style.css": path.resolve(
          __dirname,
          "../design-system/style.css",
        ),
        "@powerhousedao/design-system/theme.css": path.resolve(
          __dirname,
          "../design-system/theme.css",
        ),
        "@powerhousedao/design-system/assets": path.resolve(
          __dirname,
          "../design-system/assets",
        ),
        "@powerhousedao/design-system": path.resolve(
          __dirname,
          "../design-system/src/",
        ),
      },
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
      react({
        include: [
          /\.[tj]sx?$/,
          `${designSystemDir}/**/*`,
          `${connectDir}/**/*`,
        ],
      }),
      // tailwind(),
      nodePolyfills({
        include: ["events"],
        globals: {
          Buffer: false,
          global: false,
          process: true,
        },
      }),
    ],
    worker: {
      format: "es",
    },
  };

  const config = mergeConfig(baseConnectViteConfig, additionalViteConfig);

  return config;
});
