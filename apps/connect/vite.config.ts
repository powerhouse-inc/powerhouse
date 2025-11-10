import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";

export default defineConfig(({ mode }) => {
  const dirname = import.meta.dirname;

  const baseConnectViteConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    localPackage: false,
  });

  const additionalViteConfig: UserConfig = {
    // add your own vite config here
    resolve: {
      conditions: ["source", "browser", "module", "jsnext:main", "jsnext"],
    },
    plugins: [process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            sentry_browser: ["@sentry/browser"],
            sentry_react: ["@sentry/react"],
            graphql_request: ["graphql-request"],
            graphql: ["graphql"],
            zod: ["zod"],
            document_model: ["document-model"],
            document_drive: ["document-drive"],
            drive_explorer: ["@powerhousedao/common/generic-drive-explorer"],
            document_model_editor: ["@powerhousedao/builder-tools/editor"],
            reactor_browser: ["@powerhousedao/reactor-browser"],
            common: ["@powerhousedao/common"],
            config: ["@powerhousedao/config"],
            design_system: ["@powerhousedao/design-system"],
            design_system_connect: ["@powerhousedao/design-system/connect"],
            document_engineering: ["@powerhousedao/document-engineering"],
          },
        },
      },
    },
    server: {
      watch: {},
    },
  };

  return mergeConfig(baseConnectViteConfig, additionalViteConfig);
});
