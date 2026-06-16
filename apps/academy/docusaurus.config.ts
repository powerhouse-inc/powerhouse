import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Powerhouse Academy",
  tagline: "Get started with the Powerhouse ecosystem",
  favicon: "img/ph-icon-light.svg",

  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: "https://academy.vetra.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "", // Usually your GitHub org/user name.
  projectName: "", // Usually your repo name.

  onBrokenLinks: "warn",
  deploymentBranch: "gh-pages",
  trailingSlash: false,
  onBrokenAnchors: "ignore",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/powerhouse-inc/powerhouse-docs/tree/dev",
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
        blog: {
          showReadingTime: false,
          editUrl: "https://github.com/powerhouse-inc/powerhouse-docs/tree/dev",
          onInlineAuthors: "ignore",
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          ignorePatterns: ["/tags/**"],
          filename: "sitemap.xml",
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        // Agent-first reorg: BuilderEnvironment became the new Get Started,
        // and the old manual Get Started moved into the Build track.
        redirects: [
          // BuilderEnvironment -> Get Started
          ...[
            "VetraStudio",
            "VetraCloud",
            "VetraDrive",
            "Prerequisites",
            "CreateAPackageWithVetra",
            "BuilderTools",
          ].map((slug) => ({
            from: `/academy/MasteryTrack/BuilderEnvironment/${slug}`,
            to: `/academy/GetStarted/${slug}`,
          })),
          // Old manual Get Started -> Build track (Manual Todo tutorial)
          ...[
            "ExploreDemoPackage",
            "CreateNewPowerhouseProject",
            "DefineToDoListDocumentModel",
            "ImplementOperationReducers",
            "WriteDocumentModelTests",
            "BuildToDoListEditor",
          ].map((slug) => ({
            from: `/academy/GetStarted/${slug}`,
            to: `/academy/MasteryTrack/ManualTodoTutorial/${slug}`,
          })),
        ],
        // Phase-2 sidebar cleanup: Reference grouping + Example use-cases folded into Build.
        createRedirects(existingPath: string) {
          if (existingPath.startsWith("/academy/Reference/APIReferences/"))
            return [
              existingPath.replace(
                "/academy/Reference/APIReferences/",
                "/academy/APIReferences/",
              ),
            ];
          if (existingPath.startsWith("/academy/Reference/ComponentLibrary/"))
            return [
              existingPath.replace(
                "/academy/Reference/ComponentLibrary/",
                "/academy/ComponentLibrary/",
              ),
            ];
          if (existingPath === "/academy/Reference/Cookbook")
            return ["/academy/Cookbook"];
          if (existingPath === "/academy/Reference/Glossary")
            return ["/academy/Glossary"];
          if (existingPath === "/academy/Reference/LLMDocs")
            return ["/academy/LLMDocs"];
          if (existingPath.startsWith("/academy/MasteryTrack/ExampleUsecases/"))
            return [
              existingPath.replace(
                "/academy/MasteryTrack/ExampleUsecases/",
                "/academy/ExampleUsecases/",
              ),
            ];
          return undefined;
        },
      },
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: "img/docusaurus-social-card.jpg",
    algolia: {
      appId: "2P4JJIQAAV",
      apiKey: "b5d796c3c48626f107dabdcb1cd77f29",
      indexName: "staging-powerhouse",
      contextualSearch: true,
    },
    navbar: {
      title: "",
      logo: {
        alt: "My Site Logo",
        src: "img/Vetra-logo-dark.svg",
        srcDark: "img/vetra-logo-light.svg",
        href: "/",
      },
      items: [
        {
          to: "/learn",
          label: "Learn",
          position: "left",
        },
        {
          href: "https://storybook.powerhouse.academy/",
          label: "Storybook",
          position: "right",
        },
        {
          href: "https://github.com/powerhouse-inc/powerhouse-docs",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Powerhouse Architecture",
              to: "academy/Architecture/PowerhouseArchitecture",
            },
            {
              label: "Cookbook",
              to: "academy/Cookbook",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "Discord",
              href: "https://discord.gg/pwQJwgaQKd",
            },
            {
              label: "X",
              href: "https://x.com/PowerhouseDAO",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/powerhouse-inc",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Powerhouse, Inc.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      magicComments: [
        // Default highlight
        {
          className: "theme-code-block-highlighted-line",
          line: "highlight-next-line",
          block: { start: "highlight-start", end: "highlight-end" },
        },
        // Green for additions
        {
          className: "code-block-added-line",
          line: "added-line",
          block: { start: "added-start", end: "added-end" },
        },
        // Red for deletions
        {
          className: "code-block-removed-line",
          line: "removed-line",
          block: { start: "removed-start", end: "removed-end" },
        },
      ],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 5,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
