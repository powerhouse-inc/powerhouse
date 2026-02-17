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
    plugins: [process.env.PH_DEBUG_BUILD === "true" ? analyzer() : undefined],
    resolve: {
      conditions: ["source", "browser", "module", "jsnext:main", "jsnext"],
    },
    build: {
      sourcemap: true,
      minify: false,
      rollupOptions: {
        external(source) {
          return !!["react", "react-dom", "/index.ts", "/style.css"].find(
            (dep) => dep === source || source.startsWith(dep + "/"),
          );
        },
        output: {
          manualChunks: {
            // react: ["react"],
            // "react-dom": ["react-dom"],
            // "react-dom/client": ["react-dom/client"],
            // "react/jsx-runtime": ["react/jsx-runtime"],
            // sentry_browser: ["@sentry/browser"],
            // sentry_react: ["@sentry/react"],
            // graphql_request: ["graphql-request"],
            // graphql: ["graphql"],
            // zod: ["zod"],
            // document_model: ["document-model"],
            // document_drive: ["document-drive"],
            // drive_explorer: ["@powerhousedao/common/generic-drive-explorer"],
            // document_model_editor: [
            //   "@powerhousedao/builder-tools/editor-component",
            // ],
            // reactor_browser: ["@powerhousedao/reactor-browser"],
            // config: ["@powerhousedao/config"],
            // design_system: ["@powerhousedao/design-system"],
            // design_system_connect: ["@powerhousedao/design-system/connect"],
            // design_system_ui: ["@powerhousedao/design-system/ui"],
            // document_engineering: ["@powerhousedao/document-engineering"],
            // tailwind_merge: ["tailwind-merge"],
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
