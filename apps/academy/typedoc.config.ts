import type { PluginOptions } from "docusaurus-plugin-typedoc";
import type { TypeDocOptions } from "typedoc";
import type { PluginOptions as MarkdownPluginOptions } from "typedoc-plugin-markdown";

export type TypedocPackage = {
  name: string;
  label: string;
  entry: string;
  tsconfig?: string;
};

export const PH_PACKAGES: TypedocPackage[] = [
  {
    name: "document-model",
    label: "Document Model",
    entry: "../../packages/document-model/index.ts",
    tsconfig: "../../packages/document-model/tsconfig.json",
  },
  {
    name: "document-drive",
    label: "Document Drive",
    entry: "../../packages/document-drive/index.ts",
    tsconfig: "../../packages/document-drive/tsconfig.lib.json",
  },
  {
    name: "codegen",
    label: "Codegen",
    entry: "../../packages/codegen/index.ts",
    tsconfig: "../../packages/codegen/tsconfig.lib.json",
  },
  {
    name: "config",
    label: "Config",
    entry: "../../packages/config/src/index.ts",
    tsconfig: "../../packages/config/tsconfig.json",
  },
  {
    name: "common",
    label: "Common",
    entry: "../../packages/common/index.ts",
    tsconfig: "../../packages/common/tsconfig.json",
  },
  {
    name: "design-system",
    label: "Design System",
    entry: "../../packages/design-system/src/index.ts",
    tsconfig: "../../packages/design-system/tsconfig.lib.json",
  },
  {
    name: "reactor",
    label: "Reactor",
    entry: "../../packages/reactor/src/index.ts",
    tsconfig: "../../packages/reactor/tsconfig.json",
  },
  {
    name: "reactor-api",
    label: "Reactor API",
    entry: "../../packages/reactor-api/index.ts",
    tsconfig: "../../packages/reactor-api/tsconfig.lib.json",
  },
  {
    name: "reactor-browser",
    label: "Reactor Browser",
    entry: "../../packages/reactor-browser/src/index.ts",
    tsconfig: "../../packages/reactor-browser/tsconfig.lib.json",
  },
  {
    name: "reactor-local",
    label: "Reactor Local",
    entry: "../../packages/reactor-local/index.ts",
    tsconfig: "../../packages/reactor-local/tsconfig.json",
  },
  {
    name: "reactor-mcp",
    label: "Reactor MCP",
    entry: "../../packages/reactor-mcp/src/index.ts",
    tsconfig: "../../packages/reactor-mcp/tsconfig.lib.json",
  },
  {
    name: "renown",
    label: "Renown SDK",
    entry: "../../packages/renown/src/index.ts",
    tsconfig: "../../packages/renown/tsconfig.json",
  },
  {
    name: "vetra",
    label: "Vetra",
    entry: "../../packages/vetra/index.ts",
    tsconfig: "../../packages/vetra/tsconfig.json",
  },
];

function buildTypeDocConfig() {
  const options: PluginOptions & TypeDocOptions & MarkdownPluginOptions = {
    entryPointStrategy: "packages",
    entryPoints: ["../../packages/*"],
    packageOptions: {
      includeVersion: true,
      // entryPoints: ["src/index.ts", "index.ts"],
    },
    out: `docs/packages`,
    sidebar: {
      pretty: true,
      autoConfiguration: true,
      typescript: false,
      deprecatedItemClassName: "typedoc-sidebar-item-deprecated",
    },
    hideBreadcrumbs: true,
    useCodeBlocks: true,
    watch: process.env.TYPEDOC_WATCH === "true",
  };
  return [
    "docusaurus-plugin-typedoc",
    {
      // id: `typedoc-${name}`,
      ...options,
    },
  ];
}

export const typeDocConfig = buildTypeDocConfig(); // PH_PACKAGES.map(buildTypeDocConfig);
